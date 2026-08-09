// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Pending Vault Setup Storage
 *
 * When cloud signup completes without auto-sign-in (token: null), vault setup
 * data must survive until the user verifies their email and is auto-signed-in
 * (which opens a fresh page). The email-verification link can land minutes
 * later, so the data is persisted with a TTL.
 *
 * SECURITY: this bundle contains the user's high-entropy Secret Key, the KDF
 * salt, and the encrypted verification blob. Co-locating all three in plaintext
 * `localStorage` would collapse the zero-knowledge guarantee to the master
 * password's strength alone and hand an attacker (XSS, malicious extension,
 * forensic/disk access, profile sync) an offline verification oracle.
 *
 * We therefore encrypt the sensitive fields with AES-256-GCM under a
 * NON-EXTRACTABLE key that lives only in IndexedDB. `localStorage` holds only a
 * non-secret presence marker (email + timestamp) so the synchronous UI guards
 * keep working. A naive `localStorage` dump now yields nothing useful, and the
 * wrapping key cannot be exported even by code running in the page.
 */

const MARKER_KEY = "pssmngr_pending_vault_setup_marker";
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const IDB_NAME = "pssmngr-pending-vault-setup";
const IDB_VERSION = 1;
const IDB_STORE = "kv";
const KEY_ID = "wrap-key";
const BUNDLE_ID = "bundle";

export interface PendingVaultData {
  kdfSalt: string;
  encryptedVerificationBlob: string;
  secretKeyBase32: string;
  email: string;
  timestamp: number;
}

interface PresenceMarker {
  email: string;
  timestamp: number;
}

interface EncryptedBundle {
  iv: number[];
  ciphertext: number[];
}

// ── IndexedDB key/value helpers ──────────────────────────────────────

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, IDB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idbGet<T>(key: string): Promise<T | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readonly");
    const req = tx.objectStore(IDB_STORE).get(key);
    req.onsuccess = () => resolve((req.result as T) ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    const req = tx.objectStore(IDB_STORE).put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function idbDelete(key: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    const req = tx.objectStore(IDB_STORE).delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ── Wrapping key (non-extractable, IndexedDB-resident) ────────────────

async function getOrCreateWrapKey(): Promise<CryptoKey> {
  const existing = await idbGet<CryptoKey>(KEY_ID);
  if (existing) return existing;
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    // extractable: false — the key can never be read out of the browser.
    false,
    ["encrypt", "decrypt"],
  );
  await idbSet(KEY_ID, key);
  return key;
}

// ── Public API ───────────────────────────────────────────────────────

export async function storePendingVaultSetup(
  data: Omit<PendingVaultData, "timestamp">,
): Promise<void> {
  const entry: PendingVaultData = { ...data, timestamp: Date.now() };
  try {
    const key = await getOrCreateWrapKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = new TextEncoder().encode(JSON.stringify(entry));
    const ciphertext = new Uint8Array(
      await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext),
    );
    const bundle: EncryptedBundle = {
      iv: Array.from(iv),
      ciphertext: Array.from(ciphertext),
    };
    await idbSet(BUNDLE_ID, bundle);

    const marker: PresenceMarker = { email: entry.email, timestamp: entry.timestamp };
    localStorage.setItem(MARKER_KEY, JSON.stringify(marker));
  } catch {
    // Storage unavailable — best-effort; the user can re-enter their Secret Key.
    await clearPendingVaultSetup();
  }
}

export async function getPendingVaultSetup(): Promise<PendingVaultData | null> {
  const marker = readMarker();
  if (!marker) return null;

  if (Date.now() - marker.timestamp > TTL_MS) {
    await clearPendingVaultSetup();
    return null;
  }

  try {
    const bundle = await idbGet<EncryptedBundle>(BUNDLE_ID);
    const key = await idbGet<CryptoKey>(KEY_ID);
    if (!bundle || !key) {
      await clearPendingVaultSetup();
      return null;
    }

    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(bundle.iv) },
      key,
      new Uint8Array(bundle.ciphertext),
    );
    const data: PendingVaultData = JSON.parse(new TextDecoder().decode(plaintext));

    if (
      !data.kdfSalt ||
      !data.encryptedVerificationBlob ||
      !data.secretKeyBase32 ||
      !data.email
    ) {
      await clearPendingVaultSetup();
      return null;
    }

    if (Date.now() - data.timestamp > TTL_MS) {
      await clearPendingVaultSetup();
      return null;
    }

    return data;
  } catch {
    await clearPendingVaultSetup();
    return null;
  }
}

export async function clearPendingVaultSetup(): Promise<void> {
  try {
    localStorage.removeItem(MARKER_KEY);
  } catch {
    // best-effort
  }
  try {
    await idbDelete(BUNDLE_ID);
    await idbDelete(KEY_ID);
  } catch {
    // best-effort
  }
}

/**
 * Synchronous, non-secret presence check for UI guards. Reads only the
 * localStorage marker (email + timestamp) — never the sensitive bundle.
 */
export function hasPendingVaultSetup(): boolean {
  const marker = readMarker();
  if (!marker) return false;
  if (Date.now() - marker.timestamp > TTL_MS) {
    // Stale — drop the marker so guards stop firing. Fire-and-forget cleanup.
    void clearPendingVaultSetup();
    return false;
  }
  return true;
}

function readMarker(): PresenceMarker | null {
  try {
    const raw = localStorage.getItem(MARKER_KEY);
    if (!raw) return null;
    const marker = JSON.parse(raw) as PresenceMarker;
    if (!marker || !marker.email || typeof marker.timestamp !== "number") {
      return null;
    }
    return marker;
  } catch {
    return null;
  }
}
