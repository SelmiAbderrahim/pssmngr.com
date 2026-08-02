// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Device Key Pair Manager
 *
 * Manages X25519 key pair lifecycle for the current device:
 *  1. Generates X25519 key pair on device enrollment
 *  2. Encrypts private key with vault key (XChaCha20-Poly1305) before storage
 *  3. Stores encrypted private key in IndexedDB
 *  4. Registers public key with server via device.register
 *  5. Provides decrypted private key for sharing operations
 *
 * The private key is NEVER stored in plaintext — only the vault-key-encrypted
 * form persists in IndexedDB. Decryption requires the vault to be unlocked.
 */

import {
  getDeviceId,
  setDeviceId,
  getDevicePrivateKey,
  removeDevicePrivateKey,
  getEncryptedDevicePrivateKey,
  setEncryptedDevicePrivateKey,
  getEncryptedSigningKey,
  setEncryptedSigningKey,
  type EncryptedDeviceKey,
} from "@/lib/device-keys";
import { getVaultKey } from "@/lib/vault-keys";
import { generateX25519KeyPair, uint8ToBase64 } from "@/lib/vault-crypto";
import { generateEd25519KeyPair } from "@pssmngr/crypto";
import { trpcMutation, trpcQuery } from "@/lib/api/trpc";

// ── Types ──────────────────────────────────────────────────────────

export interface DeviceEnrollmentResult {
  deviceId: string;
  publicKey: string; // base64-encoded X25519 public key
  signingPublicKey: string; // base64-encoded Ed25519 public key
}

export interface UserPublicKeyResult {
  deviceId: string;
  publicKey: string;
  signingPublicKey?: string | null;
  deviceName: string;
  trusted: boolean;
}

// ── Sodium loader ──────────────────────────────────────────────────

async function loadSodium() {
  const mod = await import("libsodium-wrappers-sumo");
  const sodium = mod.default ?? mod;
  await sodium.ready;
  return sodium;
}

// ── Private key encryption ─────────────────────────────────────────

/**
 * Encrypt a private key with the vault key using XChaCha20-Poly1305.
 * Returns the encrypted components for IndexedDB storage.
 */
async function encryptPrivateKey(
  privateKey: Uint8Array,
  vaultKey: Uint8Array,
): Promise<EncryptedDeviceKey> {
  const sodium = await loadSodium();

  const nonce = sodium.randombytes_buf(
    sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES, // 24
  );

  const combined = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    privateKey,
    null, // no additional data
    null, // nsec unused
    nonce,
    vaultKey,
  );

  const tagLen = sodium.crypto_aead_xchacha20poly1305_ietf_ABYTES; // 16
  const ciphertext = combined.slice(0, -tagLen);
  const authTag = combined.slice(-tagLen);

  return {
    ciphertext: Array.from(new Uint8Array(ciphertext)),
    nonce: Array.from(new Uint8Array(nonce)),
    authTag: Array.from(new Uint8Array(authTag)),
  };
}

/**
 * Decrypt a private key from its encrypted storage form.
 * Requires the vault key to be available in memory.
 */
async function decryptPrivateKey(
  encrypted: EncryptedDeviceKey,
  vaultKey: Uint8Array,
): Promise<Uint8Array> {
  const sodium = await loadSodium();

  const ct = new Uint8Array(encrypted.ciphertext);
  const nonce = new Uint8Array(encrypted.nonce);
  const tag = new Uint8Array(encrypted.authTag);

  // libsodium expects ciphertext || authTag
  const combined = new Uint8Array(ct.length + tag.length);
  combined.set(ct, 0);
  combined.set(tag, ct.length);

  try {
    const privateKey = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
      null, // nsec unused
      combined,
      null, // no additional data
      nonce,
      vaultKey,
    );
    return new Uint8Array(privateKey);
  } catch {
    throw new Error(
      "Failed to decrypt device private key — wrong vault key or corrupted data",
    );
  }
}

// ── Public API ─────────────────────────────────────────────────────

/**
 * Enroll this device: generate X25519 key pair, encrypt private key,
 * store locally, and register public key with the server.
 *
 * Must be called when the vault is unlocked (vault key in memory).
 */
export async function enrollDevice(
  deviceName: string,
  deviceType: "browser",
): Promise<DeviceEnrollmentResult> {
  const vaultKey = getVaultKey();
  if (!vaultKey) {
    throw new Error("Vault must be unlocked to enroll a device");
  }

  // 1. Generate X25519 (ECDH) + Ed25519 (signing) key pairs
  const keyPair = await generateX25519KeyPair();
  const signingKeyPair = await generateEd25519KeyPair();

  // 2. Encrypt both private keys with the vault key
  const encryptedPrivateKey = await encryptPrivateKey(
    keyPair.privateKey,
    vaultKey,
  );
  const encryptedSigningKey = await encryptPrivateKey(
    signingKeyPair.privateKey,
    vaultKey,
  );

  // 3. Zero raw private keys from memory
  keyPair.privateKey.fill(0);
  signingKeyPair.privateKey.fill(0);

  // 4. Store encrypted private keys in IndexedDB
  await setEncryptedDevicePrivateKey(encryptedPrivateKey);
  await setEncryptedSigningKey(encryptedSigningKey);

  // 5. Register with server: public keys + vault-key-encrypted private-key
  //    escrow blobs (opaque ciphertext — lets a browser that later loses
  //    IndexedDB recover this device identity after unlocking the vault).
  const publicKeyB64 = uint8ToBase64(keyPair.publicKey);
  const signingPublicKeyB64 = uint8ToBase64(signingKeyPair.publicKey);
  const result = await trpcMutation<{ id: string }>("device", "register", {
    deviceName,
    deviceType,
    publicKey: publicKeyB64,
    signingPublicKey: signingPublicKeyB64,
    escrowedPrivateKey: JSON.stringify(encryptedPrivateKey),
    escrowedSigningPrivateKey: JSON.stringify(encryptedSigningKey),
  });

  // 6. Store server-assigned device ID
  await setDeviceId(result.id);

  return {
    deviceId: result.id,
    publicKey: publicKeyB64,
    signingPublicKey: signingPublicKeyB64,
  };
}

/**
 * Get the decrypted X25519 private key for this device.
 * Used in sharing flows to derive ECDH shared secrets.
 *
 * Caller is responsible for zeroing the returned key when done.
 */
export async function getDecryptedPrivateKey(): Promise<Uint8Array> {
  const vaultKey = getVaultKey();
  if (!vaultKey) {
    throw new Error("Vault must be unlocked to access device private key");
  }

  const encrypted = await getEncryptedDevicePrivateKey();
  if (encrypted) {
    return decryptPrivateKey(encrypted, vaultKey);
  }

  const legacyPrivateKey = await getDevicePrivateKey();
  if (legacyPrivateKey) {
    const migrated = await encryptPrivateKey(legacyPrivateKey, vaultKey);
    await setEncryptedDevicePrivateKey(migrated);
    await removeDevicePrivateKey();

    const privateKey = new Uint8Array(legacyPrivateKey);
    legacyPrivateKey.fill(0);
    return privateKey;
  }

  throw new Error(
    "No encrypted device key found — device may not be enrolled",
  );
}

/**
 * Get the decrypted Ed25519 signing private key for this device.
 * Used to sign share envelopes when wrapping a shared-vault key for a member.
 *
 * Caller is responsible for zeroing the returned key when done.
 */
export async function getDecryptedSigningKey(): Promise<Uint8Array> {
  const vaultKey = getVaultKey();
  if (!vaultKey) {
    throw new Error("Vault must be unlocked to access device signing key");
  }

  const encrypted = await getEncryptedSigningKey();
  if (!encrypted) {
    throw new Error(
      "No encrypted signing key found — device may need a signing-key upgrade",
    );
  }

  return decryptPrivateKey(encrypted, vaultKey);
}

/**
 * Ensure this device has an Ed25519 signing key, generating + registering one
 * lazily for devices enrolled before signing keys existed. Idempotent.
 *
 * Requires the vault to be unlocked (to encrypt the new private key) and the
 * device to already be enrolled (has a server-assigned deviceId).
 */
export async function ensureDeviceSigningKey(): Promise<void> {
  const existing = await getEncryptedSigningKey();
  if (existing) return; // already upgraded

  const deviceId = await getDeviceId();
  if (!deviceId) return; // not enrolled yet; enrollDevice will create one

  const vaultKey = getVaultKey();
  if (!vaultKey) {
    throw new Error("Vault must be unlocked to upgrade the device signing key");
  }

  const signingKeyPair = await generateEd25519KeyPair();
  const encryptedSigningKey = await encryptPrivateKey(
    signingKeyPair.privateKey,
    vaultKey,
  );
  signingKeyPair.privateKey.fill(0);

  await setEncryptedSigningKey(encryptedSigningKey);

  await trpcMutation("device", "updateSigningKey", {
    deviceId,
    signingPublicKey: uint8ToBase64(signingKeyPair.publicKey),
  });
}

/**
 * Check if this device has been enrolled (has stored encrypted key pair).
 */
export async function isDeviceEnrolled(): Promise<boolean> {
  const deviceId = await getDeviceId();
  const encrypted = await getEncryptedDevicePrivateKey();
  const legacyPrivateKey = await getDevicePrivateKey();
  return deviceId !== null && (encrypted !== null || legacyPrivateKey !== null);
}

/** Best-effort browser label used when enrolling a fresh device. */
function defaultBrowserDeviceName(): string {
  if (typeof navigator === "undefined") return "Browser";
  const ua = navigator.userAgent;
  if (/firefox/i.test(ua)) return "Firefox";
  if (/edg/i.test(ua)) return "Edge";
  if (/chrome/i.test(ua)) return "Chrome";
  if (/safari/i.test(ua)) return "Safari";
  return "Browser";
}

/**
 * Ensure this browser is enrolled with an X25519 + Ed25519 key pair, enrolling
 * lazily if it signed in without going through the device-enrollment step (in
 * which case there is no local key to sign/wrap with). Also upgrades older
 * enrolled devices that lack a signing key. Idempotent; requires the vault to
 * be unlocked so the new private keys can be encrypted before storage.
 */
export async function ensureDeviceEnrolled(): Promise<void> {
  if (await isDeviceEnrolled()) {
    await ensureDeviceSigningKey();
    return;
  }
  await enrollDevice(defaultBrowserDeviceName(), "browser");
}

/**
 * Fetch a user's public key from the server (for sharing).
 * Returns the public key of the user's most trusted/recent device.
 */
export async function getUserPublicKey(
  userId: string,
): Promise<UserPublicKeyResult> {
  return trpcQuery<UserPublicKeyResult>("device", "getPublicKey", { userId });
}

// ── Device-key escrow (self-healing shared-vault access) ──────────

export interface EscrowedDevice {
  id: string;
  deviceName: string;
  deviceType: "browser";
  publicKey: string;
  signingPublicKey: string | null;
  escrowedPrivateKey: string | null;
  escrowedSigningPrivateKey: string | null;
  trusted: boolean;
  lastSeen: string | null;
}

/**
 * Decrypt a JSON escrow blob (as stored server-side) with the vault key.
 * Caller is responsible for zeroing the returned key.
 */
export async function decryptEscrowBlob(
  blob: string,
  vaultKey: Uint8Array,
): Promise<Uint8Array> {
  const encrypted = JSON.parse(blob) as EncryptedDeviceKey;
  return decryptPrivateKey(encrypted, vaultKey);
}

/** List the caller's own devices including escrow blobs. */
export async function fetchMyDevicesWithEscrow(): Promise<EscrowedDevice[]> {
  return trpcQuery<EscrowedDevice[]>("device", "myDevicesWithEscrow");
}

let escrowBackfillDone = false;

/**
 * One-time (per page life) backfill: if this browser is enrolled but its
 * server device row predates escrow, upload the locally stored encrypted
 * private keys. Best-effort; requires the vault unlocked.
 */
export async function backfillEscrowIfNeeded(): Promise<void> {
  if (escrowBackfillDone) return;
  escrowBackfillDone = true;

  try {
    const deviceId = await getDeviceId();
    const encrypted = await getEncryptedDevicePrivateKey();
    if (!deviceId || !encrypted) return;

    const devices = await fetchMyDevicesWithEscrow();
    const mine = devices.find((d) => d.id === deviceId);
    if (!mine || mine.escrowedPrivateKey) return;

    const encryptedSigning = await getEncryptedSigningKey();
    await trpcMutation("device", "updateEscrowedKeys", {
      deviceId,
      escrowedPrivateKey: JSON.stringify(encrypted),
      ...(encryptedSigning
        ? { escrowedSigningPrivateKey: JSON.stringify(encryptedSigning) }
        : {}),
    });
  } catch (error) {
    escrowBackfillDone = false; // retry on a later resolve
    console.warn("[keypairManager] escrow backfill failed:", error);
  }
}

/**
 * Adopt an escrowed device identity as this browser's own: store its
 * encrypted private keys locally and take over its deviceId. Used after
 * escrow recovery proves the keys can unwrap an existing grant.
 */
export async function adoptEscrowedDevice(dev: EscrowedDevice): Promise<void> {
  await setEncryptedDevicePrivateKey(
    JSON.parse(dev.escrowedPrivateKey!) as EncryptedDeviceKey,
  );
  if (dev.escrowedSigningPrivateKey) {
    await setEncryptedSigningKey(
      JSON.parse(dev.escrowedSigningPrivateKey) as EncryptedDeviceKey,
    );
  }
  await setDeviceId(dev.id);
}

// ── Background enrollment (login/first-run) ────────────────────────

const DEFERRED_FLAG_KEY = "pssmngr_device_enrollment_deferred";

/**
 * Persistent flag consumed by the Settings retry card when a background
 * enrollment attempt gave up. Presence-only marker; wiped on successful
 * enroll.
 */
export function markEnrollmentDeferred(): void {
  try { localStorage.setItem(DEFERRED_FLAG_KEY, "1"); } catch { /* best-effort */ }
}
export function clearEnrollmentDeferred(): void {
  try { localStorage.removeItem(DEFERRED_FLAG_KEY); } catch { /* best-effort */ }
}
export function isEnrollmentDeferred(): boolean {
  try { return localStorage.getItem(DEFERRED_FLAG_KEY) === "1"; } catch { return false; }
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Fire-and-forget device enrollment used after login/register. Idempotent:
 * skips silently if already enrolled (then refreshes escrow). Requires the
 * vault to be unlocked. 3 attempts with backoff; final failure calls
 * `onFailure` and persists a flag the Settings retry card reads.
 */
export async function enrollDeviceInBackground(opts?: {
  onFailure?: () => void;
  attempts?: number;
  backoffMs?: number;
}): Promise<boolean> {
  const attempts = opts?.attempts ?? 3;
  const backoffMs = opts?.backoffMs ?? 500;

  // Already enrolled → make sure escrow is up to date and go home.
  if (await isDeviceEnrolled()) {
    try { await ensureDeviceSigningKey(); } catch { /* non-fatal */ }
    try { await backfillEscrowIfNeeded(); } catch { /* non-fatal */ }
    clearEnrollmentDeferred();
    return true;
  }

  let lastError: unknown = null;
  for (let i = 0; i < attempts; i++) {
    try {
      await enrollDevice(defaultBrowserDeviceName(), "browser");
      clearEnrollmentDeferred();
      return true;
    } catch (err) {
      lastError = err;
      if (i < attempts - 1) await sleep(backoffMs * Math.pow(2, i));
    }
  }
  console.warn("[keypairManager] background enrollment failed:", lastError);
  markEnrollmentDeferred();
  opts?.onFailure?.();
  return false;
}

/**
 * Re-encrypt the device private key with a new vault key.
 * Called when the user changes their master password.
 */
export async function reEncryptDeviceKey(
  oldVaultKey: Uint8Array,
  newVaultKey: Uint8Array,
): Promise<void> {
  const encrypted = await getEncryptedDevicePrivateKey();
  if (encrypted) {
    const privateKey = await decryptPrivateKey(encrypted, oldVaultKey);
    const newEncrypted = await encryptPrivateKey(privateKey, newVaultKey);
    privateKey.fill(0);
    await setEncryptedDevicePrivateKey(newEncrypted);
  }

  // Re-encrypt the Ed25519 signing key too, if present.
  const encryptedSigning = await getEncryptedSigningKey();
  if (encryptedSigning) {
    const signingKey = await decryptPrivateKey(encryptedSigning, oldVaultKey);
    const newEncryptedSigning = await encryptPrivateKey(signingKey, newVaultKey);
    signingKey.fill(0);
    await setEncryptedSigningKey(newEncryptedSigning);
  }
}
