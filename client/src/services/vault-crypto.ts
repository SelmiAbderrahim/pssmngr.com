// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Vault Crypto Service
 *
 * Integrates client-side encryption with the tRPC API layer.
 * Encrypts item data before sending to the server and decrypts
 * after receiving — the server never sees plaintext.
 *
 * Uses XChaCha20-Poly1305 with envelope encryption (per-item data keys
 * wrapped by the vault key). All crypto operations use libsodium-wrappers-sumo
 * via dynamic import (resolved by Vite alias to @pssmngr/crypto's node_modules).
 */

import {
  getVaultKey,
  setVaultKey,
  clearVaultKey,
  hasVaultKey,
} from "@/lib/vault-keys";
import {
  deriveVaultKey,
  uint8ToBase64,
  base64ToUint8,
} from "@/lib/vault-crypto";
import { getSecretKey, getDeviceId } from "@/lib/device-keys";
import {
  enablePersistence as pu_enablePersistence,
  clearPersistence as pu_clearPersistence,
} from "@/lib/persistent-unlock";

/**
 * Mirror the persistent-unlock expiry to the server's device row
 * (`device.persistentUnlockExpiresAt`). Only a timestamp travels — never key
 * material. The column is what makes server-side revocation real: the
 * bootstrap check (`auth/persistent-unlock-bootstrap.ts`) refuses a silent
 * restore when it is null/past. Best-effort: offline or unenrolled devices
 * skip silently (local envelope expiry still bounds the grant).
 */
async function syncServerUnlockExpiry(expiresAt: Date | null): Promise<void> {
  try {
    const deviceId = await getDeviceId();
    if (!deviceId) return;
    const { trpcMutation } = await import("@/lib/api/trpc");
    await trpcMutation("device", "setPersistentUnlockExpiry", {
      deviceId,
      expiresAt,
    });
  } catch {
    /* best-effort — never block unlock/lock on network */
  }
}

// ── Persistence-preference bridge (localStorage-backed setting) ────
//
// Only the DURATION preference is stored here (a small integer). The vault
// key itself is wrapped inside `lib/persistent-unlock.ts`, IndexedDB-only.
const PU_DAYS_KEY = "pssmngr-persistent-unlock-days";

function readPersistenceDays(): 0 | 7 | 30 {
  try {
    const raw = localStorage.getItem(PU_DAYS_KEY);
    if (raw === "0" || raw === "7" || raw === "30") return Number(raw) as 0 | 7 | 30;
  } catch {
    /* localStorage disabled — treat as default */
  }
  return 30; // default: on, 30 days
}

export function getPersistentUnlockDays(): 0 | 7 | 30 {
  return readPersistenceDays();
}

/** Update the setting. `0` disables (and clears any existing wrap). */
export async function setPersistentUnlockDays(days: 0 | 7 | 30): Promise<void> {
  try {
    localStorage.setItem(PU_DAYS_KEY, String(days));
  } catch {
    /* ignore */
  }
  if (days === 0) {
    await pu_clearPersistence();
    // Also null the server column so the revocation state is authoritative.
    void syncServerUnlockExpiry(null);
  }
}

// ── Types ──────────────────────────────────────────────────────────

/** Base64-encoded encrypted item payload for tRPC transport. */
export interface EncryptedItemPayload {
  ciphertext: string;
  nonce: string;
  authTag: string;
  wrappedDataKey: string;
  wrappedDataKeyNonce: string;
  wrappedDataKeyAuthTag: string;
}

/** Result of re-wrapping a single item's data key with a new vault key. */
export interface ReWrappedItem {
  itemId: string;
  wrappedDataKey: string;
  wrappedDataKeyNonce: string;
  wrappedDataKeyAuthTag: string;
}

/** Server item record containing encrypted fields. */
export interface ServerItemRecord {
  id: string;
  vaultId: string;
  itemType: string;
  ciphertext: string;
  nonce: string;
  authTag: string;
  wrappedDataKey: string;
  wrappedDataKeyNonce: string;
  wrappedDataKeyAuthTag: string;
  version: number;
  isFavorite: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

type VaultStateListener = (isUnlocked: boolean) => void;

// ── Libsodium loader ───────────────────────────────────────────────

/** Cached loading promise — ensures sodium.ready is awaited only once. */
let _sodiumPromise: Promise<typeof import("libsodium-wrappers-sumo")> | null =
  null;

async function loadSodium() {
  if (!_sodiumPromise) {
    _sodiumPromise = (async () => {
      try {
        const mod = await import("libsodium-wrappers-sumo");
        const sodium = mod.default ?? mod;
        await sodium.ready;
        return sodium;
      } catch (err) {
        _sodiumPromise = null; // Allow retry on failure
        throw err;
      }
    })();
  }
  return _sodiumPromise;
}

// ── Constants ─────────────────────────────────────────────────────

/** Fixed sentinel plaintext used for master password verification. */
const VERIFICATION_SENTINEL = new TextEncoder().encode("pssmngr-vault-ok");

// ── Service ────────────────────────────────────────────────────────

class VaultCryptoService {
  private autoLockTimer: ReturnType<typeof setTimeout> | null = null;
  private autoLockMs = 15 * 60 * 1000; // 15 minutes default
  private listeners = new Set<VaultStateListener>();

  /**
   * Subscribe to vault lock/unlock state changes.
   * Returns an unsubscribe function.
   */
  subscribe(listener: VaultStateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    const unlocked = this.isUnlocked();
    for (const fn of this.listeners) fn(unlocked);
  }

  // ── Lock / Unlock ──────────────────────────────────────────────

  /**
   * Derive vault key from master password and store in memory.
   * Secret key is read from IndexedDB unless explicitly provided
   * (e.g. recovery flow or new device enrollment).
   *
   * If a verification blob is provided, the derived key is validated
   * against it before the vault is marked as unlocked. This catches
   * wrong master passwords immediately instead of deferring to item
   * decryption failures.
   */
  async unlock(
    masterPassword: string,
    salt: Uint8Array,
    secretKey?: Uint8Array,
    verificationBlob?: string | null,
  ): Promise<void> {
    const sk = secretKey ?? (await getSecretKey());
    if (!sk) {
      throw new Error(
        "Secret key not found. Please enter your recovery key.",
      );
    }

    const { vaultKey } = await deriveVaultKey({
      masterPassword,
      secretKey: sk,
      salt,
    });

    // Temporarily store the key so verify/encrypt helpers can use it
    setVaultKey(vaultKey);

    // Verify the derived key is correct before proceeding
    if (verificationBlob) {
      try {
        await this.verifyVaultKey(verificationBlob);
      } catch {
        // Wrong master password — clear the bad key immediately
        clearVaultKey();
        throw new Error("Wrong master password");
      }
    }

    this.startAutoLock();
    this.notify();
    void this.enablePersistenceIfConfigured(vaultKey);
  }

  /**
   * Store an already-derived vault key (used during login/register
   * when key derivation happens in the auth flow).
   */
  setKey(vaultKey: Uint8Array): void {
    setVaultKey(vaultKey);
    this.startAutoLock();
    this.notify();
    void this.enablePersistenceIfConfigured(vaultKey);
  }

  private async enablePersistenceIfConfigured(vaultKey: Uint8Array): Promise<void> {
    const days = readPersistenceDays();
    if (days === 0) return;
    try {
      await pu_enablePersistence(vaultKey, { days });
      // Mirror the grant window server-side (timestamp only, no key material)
      // so "revoke on all devices" and per-device revocation can cut it short.
      void syncServerUnlockExpiry(new Date(Date.now() + days * 86_400_000));
    } catch {
      /* silently stay off — persistence is best-effort */
    }
  }

  /**
   * Drop the in-memory key. Optionally also drop the at-rest wrap so silent
   * restore stops working ("Lock & forget device").
   *
   * With persistence on and `forget: false`, downstream code can call
   * `tryRestore()` to get back in without prompting.
   */
  lock(options?: { forget?: boolean }): void {
    clearVaultKey();
    this.stopAutoLock();
    this.notify();
    if (options?.forget) {
      void pu_clearPersistence();
      void syncServerUnlockExpiry(null);
    }
  }

  isUnlocked(): boolean {
    return hasVaultKey();
  }

  // ── Verification ───────────────────────────────────────────────

  /**
   * Encrypt the fixed sentinel value with the current vault key.
   * The resulting blob is stored in the vault record so that future
   * unlock attempts can verify the derived key is correct.
   */
  async createVerificationBlob(): Promise<string> {
    return this.encryptBlob(VERIFICATION_SENTINEL);
  }

  /**
   * Decrypt a verification blob and confirm it matches the sentinel.
   * Throws if the vault key is wrong (auth tag mismatch) or the
   * decrypted content doesn't match the expected sentinel.
   */
  /**
   * Verify a candidate key (NOT the in-memory one) against a stored blob.
   * Used during silent restore so we never trust an unverified key. Returns
   * true on match, false on any failure (never throws). Constant-time compare.
   */
  async verifyVaultKeyWithKey(
    candidate: Uint8Array,
    verificationBlob: string,
  ): Promise<boolean> {
    try {
      const sodium = await loadSodium();
      const packed = base64ToUint8(verificationBlob);
      const nonceLen = sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES;
      const nonce = packed.slice(0, nonceLen);
      const combined = packed.slice(nonceLen);
      const decrypted = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
        null,
        combined,
        null,
        nonce,
        candidate,
      );
      let mismatch = decrypted.length ^ VERIFICATION_SENTINEL.length;
      const len = Math.max(decrypted.length, VERIFICATION_SENTINEL.length);
      for (let i = 0; i < len; i++) {
        mismatch |= (decrypted[i] ?? 0) ^ (VERIFICATION_SENTINEL[i] ?? 0);
      }
      return mismatch === 0;
    } catch {
      return false;
    }
  }

  async verifyVaultKey(verificationBlob: string): Promise<void> {
    const decrypted = await this.decryptBlob(verificationBlob, {
      logFailure: false,
    });

    // Belt-and-suspenders: confirm the decrypted content matches.
    // Constant-time comparison — an early-exit compare would leak how
    // many sentinel bytes matched through timing.
    let mismatch = decrypted.length ^ VERIFICATION_SENTINEL.length;
    const len = Math.max(decrypted.length, VERIFICATION_SENTINEL.length);
    for (let i = 0; i < len; i++) {
      mismatch |= (decrypted[i] ?? 0) ^ (VERIFICATION_SENTINEL[i] ?? 0);
    }
    if (mismatch !== 0) {
      throw new Error("Verification blob content mismatch");
    }
  }

  // ── Auto-lock ──────────────────────────────────────────────────

  /** Reset the auto-lock countdown (call on user activity). */
  resetAutoLock(): void {
    if (this.isUnlocked()) this.startAutoLock();
  }

  /** Change the auto-lock timeout. Pass 0 to disable. */
  setAutoLockTimeout(ms: number): void {
    this.autoLockMs = ms;
    if (this.isUnlocked()) this.startAutoLock();
  }

  private startAutoLock(): void {
    this.stopAutoLock();
    if (this.autoLockMs > 0) {
      this.autoLockTimer = setTimeout(() => this.lock(), this.autoLockMs);
    }
  }

  private stopAutoLock(): void {
    if (this.autoLockTimer) {
      clearTimeout(this.autoLockTimer);
      this.autoLockTimer = null;
    }
  }

  // ── Encrypt ────────────────────────────────────────────────────

  /**
   * Encrypt a plaintext object for server storage.
   *
   * Flow: generate data key → wrap with vault key → encrypt plaintext
   * with data key → zero data key → return base64 payload.
   */
  async encryptItem(
    plaintext: Record<string, unknown>,
  ): Promise<EncryptedItemPayload> {
    const vaultKey = getVaultKey();
    if (!vaultKey) throw new Error("Vault is locked");

    const sodium = await loadSodium();

    // 1. Generate per-item data key (256-bit)
    const dataKey = sodium.crypto_aead_xchacha20poly1305_ietf_keygen();

    // 2. Wrap data key with vault key (XChaCha20-Poly1305)
    const wrapNonce = sodium.randombytes_buf(
      sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES,
    );
    const wrapCombined = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
      dataKey,
      null,
      null,
      wrapNonce,
      vaultKey,
    );
    const tagLen = sodium.crypto_aead_xchacha20poly1305_ietf_ABYTES;
    const wrappedDataKey = wrapCombined.slice(0, -tagLen);
    const wrappedDataKeyAuthTag = wrapCombined.slice(-tagLen);

    // 3. Encrypt plaintext with data key
    const plaintextBytes = new TextEncoder().encode(JSON.stringify(plaintext));
    const itemNonce = sodium.randombytes_buf(
      sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES,
    );
    const encCombined = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
      plaintextBytes,
      null,
      null,
      itemNonce,
      dataKey,
    );
    const ciphertext = encCombined.slice(0, -tagLen);
    const authTag = encCombined.slice(-tagLen);

    // 4. Zero data key from memory
    dataKey.fill(0);

    this.resetAutoLock();

    // 5. Return base64-encoded payload for tRPC
    return {
      ciphertext: uint8ToBase64(new Uint8Array(ciphertext)),
      nonce: uint8ToBase64(new Uint8Array(itemNonce)),
      authTag: uint8ToBase64(new Uint8Array(authTag)),
      wrappedDataKey: uint8ToBase64(new Uint8Array(wrappedDataKey)),
      wrappedDataKeyNonce: uint8ToBase64(new Uint8Array(wrapNonce)),
      wrappedDataKeyAuthTag: uint8ToBase64(
        new Uint8Array(wrappedDataKeyAuthTag),
      ),
    };
  }

  // ── Decrypt ────────────────────────────────────────────────────

  /**
   * Decrypt an encrypted item from the server.
   *
   * Flow: unwrap data key with vault key → decrypt ciphertext with
   * data key → zero data key → parse JSON.
   */
  async decryptItem(
    payload: EncryptedItemPayload,
  ): Promise<Record<string, unknown>> {
    const vaultKey = getVaultKey();
    if (!vaultKey) throw new Error("Vault is locked");

    const sodium = await loadSodium();

    // 1. Unwrap data key
    const wrappedDK = base64ToUint8(payload.wrappedDataKey);
    const wrapNonce = base64ToUint8(payload.wrappedDataKeyNonce);
    const wrapTag = base64ToUint8(payload.wrappedDataKeyAuthTag);

    const wrapCombined = new Uint8Array(wrappedDK.length + wrapTag.length);
    wrapCombined.set(wrappedDK, 0);
    wrapCombined.set(wrapTag, wrappedDK.length);

    let dataKey: Uint8Array;
    try {
      dataKey = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
        null,
        wrapCombined,
        null,
        wrapNonce,
        vaultKey,
      );
    } catch {
      throw new Error(
        "Failed to unwrap data key — wrong vault key or tampered data",
      );
    }

    // 2. Decrypt item
    const ct = base64ToUint8(payload.ciphertext);
    const itemNonce = base64ToUint8(payload.nonce);
    const itemTag = base64ToUint8(payload.authTag);

    const encCombined = new Uint8Array(ct.length + itemTag.length);
    encCombined.set(ct, 0);
    encCombined.set(itemTag, ct.length);

    let plaintext: Uint8Array;
    try {
      plaintext = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
        null,
        encCombined,
        null,
        itemNonce,
        dataKey,
      );
    } catch {
      throw new Error("Decryption failed — data may be corrupted");
    }

    // 3. Zero data key
    dataKey.fill(0);

    this.resetAutoLock();

    // 4. Parse and return
    return JSON.parse(new TextDecoder().decode(plaintext));
  }

  /**
   * Encrypt a plaintext object using an EXPLICIT key (e.g. a shared vault key)
   * instead of the in-memory personal vault key. Same envelope shape as
   * encryptItem so the result is interchangeable for storage/decryption.
   */
  async encryptItemWithKey(
    plaintext: Record<string, unknown>,
    key: Uint8Array,
  ): Promise<EncryptedItemPayload> {
    const sodium = await loadSodium();
    const tagLen = sodium.crypto_aead_xchacha20poly1305_ietf_ABYTES;

    const dataKey = sodium.crypto_aead_xchacha20poly1305_ietf_keygen();
    const wrapNonce = sodium.randombytes_buf(
      sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES,
    );
    const wrapCombined = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
      dataKey,
      null,
      null,
      wrapNonce,
      key,
    );
    const wrappedDataKey = wrapCombined.slice(0, -tagLen);
    const wrappedDataKeyAuthTag = wrapCombined.slice(-tagLen);

    const plaintextBytes = new TextEncoder().encode(JSON.stringify(plaintext));
    const itemNonce = sodium.randombytes_buf(
      sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES,
    );
    const encCombined = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
      plaintextBytes,
      null,
      null,
      itemNonce,
      dataKey,
    );
    const ciphertext = encCombined.slice(0, -tagLen);
    const authTag = encCombined.slice(-tagLen);

    dataKey.fill(0);

    return {
      ciphertext: uint8ToBase64(new Uint8Array(ciphertext)),
      nonce: uint8ToBase64(new Uint8Array(itemNonce)),
      authTag: uint8ToBase64(new Uint8Array(authTag)),
      wrappedDataKey: uint8ToBase64(new Uint8Array(wrappedDataKey)),
      wrappedDataKeyNonce: uint8ToBase64(new Uint8Array(wrapNonce)),
      wrappedDataKeyAuthTag: uint8ToBase64(new Uint8Array(wrappedDataKeyAuthTag)),
    };
  }

  /**
   * Decrypt an item using an EXPLICIT key (e.g. a shared vault key).
   */
  async decryptItemWithKey(
    payload: EncryptedItemPayload,
    key: Uint8Array,
  ): Promise<Record<string, unknown>> {
    const sodium = await loadSodium();

    const wrappedDK = base64ToUint8(payload.wrappedDataKey);
    const wrapNonce = base64ToUint8(payload.wrappedDataKeyNonce);
    const wrapTag = base64ToUint8(payload.wrappedDataKeyAuthTag);

    const wrapCombined = new Uint8Array(wrappedDK.length + wrapTag.length);
    wrapCombined.set(wrappedDK, 0);
    wrapCombined.set(wrapTag, wrappedDK.length);

    let dataKey: Uint8Array;
    try {
      dataKey = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
        null,
        wrapCombined,
        null,
        wrapNonce,
        key,
      );
    } catch {
      throw new Error(
        "Failed to unwrap data key — wrong shared key or tampered data",
      );
    }

    const ct = base64ToUint8(payload.ciphertext);
    const itemNonce = base64ToUint8(payload.nonce);
    const itemTag = base64ToUint8(payload.authTag);

    const encCombined = new Uint8Array(ct.length + itemTag.length);
    encCombined.set(ct, 0);
    encCombined.set(itemTag, ct.length);

    let plaintext: Uint8Array;
    try {
      plaintext = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
        null,
        encCombined,
        null,
        itemNonce,
        dataKey,
      );
    } catch {
      throw new Error("Decryption failed — data may be corrupted");
    }

    dataKey.fill(0);

    return JSON.parse(new TextDecoder().decode(plaintext));
  }

  /**
   * Convenience: extract encrypted fields from a server item record
   * and decrypt to plaintext.
   */
  async decryptServerItem(
    record: ServerItemRecord,
  ): Promise<Record<string, unknown>> {
    return this.decryptItem({
      ciphertext: record.ciphertext,
      nonce: record.nonce,
      authTag: record.authTag,
      wrappedDataKey: record.wrappedDataKey,
      wrappedDataKeyNonce: record.wrappedDataKeyNonce,
      wrappedDataKeyAuthTag: record.wrappedDataKeyAuthTag,
    });
  }

  /** Decrypt multiple items in parallel. */
  async decryptItems(
    payloads: EncryptedItemPayload[],
  ): Promise<Record<string, unknown>[]> {
    return Promise.all(payloads.map((p) => this.decryptItem(p)));
  }

  // ── Vault Recovery (re-wrap) ─────────────────────────────────

  /**
   * Re-wrap all items' data keys from an old vault key to a new vault key.
   *
   * Used when the user's auth password changed without vault re-encryption.
   * Only the wrapping fields change — the actual item ciphertext is untouched
   * because the per-item data key remains the same.
   */
  async reWrapAllItems(
    oldVaultKey: Uint8Array,
    newVaultKey: Uint8Array,
    items: ServerItemRecord[],
  ): Promise<ReWrappedItem[]> {
    const sodium = await loadSodium();
    const tagLen = sodium.crypto_aead_xchacha20poly1305_ietf_ABYTES;

    const results: ReWrappedItem[] = [];

    for (const item of items) {
      // 1. Unwrap data key with OLD vault key
      const wrappedDK = base64ToUint8(item.wrappedDataKey);
      const wrapNonce = base64ToUint8(item.wrappedDataKeyNonce);
      const wrapTag = base64ToUint8(item.wrappedDataKeyAuthTag);

      const oldCombined = new Uint8Array(wrappedDK.length + wrapTag.length);
      oldCombined.set(wrappedDK, 0);
      oldCombined.set(wrapTag, wrappedDK.length);

      let dataKey: Uint8Array;
      try {
        dataKey = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
          null,
          oldCombined,
          null,
          wrapNonce,
          oldVaultKey,
        );
      } catch {
        throw new Error(
          `Failed to unwrap data key for item ${item.id} — old vault key is incorrect`,
        );
      }

      // 2. Re-wrap data key with NEW vault key
      const newNonce = sodium.randombytes_buf(
        sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES,
      );
      const newCombined = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
        dataKey,
        null,
        null,
        newNonce,
        newVaultKey,
      );

      // 3. Zero data key from memory
      dataKey.fill(0);

      const newWrappedDK = newCombined.slice(0, -tagLen);
      const newWrapTag = newCombined.slice(-tagLen);

      results.push({
        itemId: item.id,
        wrappedDataKey: uint8ToBase64(new Uint8Array(newWrappedDK)),
        wrappedDataKeyNonce: uint8ToBase64(new Uint8Array(newNonce)),
        wrappedDataKeyAuthTag: uint8ToBase64(new Uint8Array(newWrapTag)),
      });
    }

    return results;
  }

  /**
   * Create a verification blob using a specific vault key (not the in-memory one).
   * Used during recovery to create a blob with the new vault key.
   */
  async createVerificationBlobWithKey(vaultKey: Uint8Array): Promise<string> {
    const sodium = await loadSodium();

    const nonce = sodium.randombytes_buf(
      sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES,
    );
    const combined = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
      VERIFICATION_SENTINEL,
      null,
      null,
      nonce,
      vaultKey,
    );

    const packed = new Uint8Array(nonce.length + combined.length);
    packed.set(nonce, 0);
    packed.set(combined, nonce.length);

    return uint8ToBase64(packed);
  }

  // ── Generic blob encrypt / decrypt ───────────────────────────

  /**
   * Encrypt arbitrary bytes (e.g. search index) directly with the
   * vault key. Returns a base64-encoded string for server storage.
   */
  async encryptBlob(data: Uint8Array): Promise<string> {
    const vaultKey = getVaultKey();
    if (!vaultKey) throw new Error("Vault is locked");

    const sodium = await loadSodium();

    const nonce = sodium.randombytes_buf(
      sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES,
    );
    const combined = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
      data,
      null,
      null,
      nonce,
      vaultKey,
    );

    // Pack: [nonce (24 bytes)][ciphertext+tag]
    const packed = new Uint8Array(nonce.length + combined.length);
    packed.set(nonce, 0);
    packed.set(combined, nonce.length);

    this.resetAutoLock();
    return uint8ToBase64(packed);
  }

  /**
   * Decrypt a base64-encoded blob back to bytes.
   */
  async decryptBlob(
    b64: string,
    options: { logFailure?: boolean } = {},
  ): Promise<Uint8Array> {
    const vaultKey = getVaultKey();
    if (!vaultKey) throw new Error("Vault is locked");

    const sodium = await loadSodium();
    const packed = base64ToUint8(b64);

    const nonceLen = sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES;
    const nonce = packed.slice(0, nonceLen);
    const combined = packed.slice(nonceLen);

    try {
      const plaintext = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
        null,
        combined,
        null,
        nonce,
        vaultKey,
      );
      this.resetAutoLock();
      return new Uint8Array(plaintext);
    } catch (err) {
      // Dev-only diagnostics; production surfaces only the generic error.
      if ((options.logFailure ?? true) && import.meta.env.DEV) {
        console.error("[VaultCrypto] Failed to decrypt blob:", err);
      }
      throw new Error("Failed to decrypt blob — wrong key or corrupted data");
    }
  }
}

/** Singleton — import and use directly. */
export const vaultCrypto = new VaultCryptoService();
