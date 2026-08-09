// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Persistent Unlock — wrapped-at-rest vault key for trusted devices.
 *
 * Threat model:
 *   Protects against server compromise (server holds only an expiry timestamp
 *   plus a device id — no key material, ever) and against theft of the
 *   IndexedDB ciphertext blob alone (the wrapping CryptoKey is
 *   non-extractable and origin-bound; the envelope is useless without it).
 *   Also blocks other origins / browser profiles.
 *
 *   Deliberately NOT protected: an attacker who already controls the user's
 *   logged-in OS session and browser profile can use the vault during the
 *   grant window. This mirrors competitors' "remember this device" posture.
 *   Compensating controls (shipped alongside this module): sensitive-action
 *   gates, a hard 30-day expiry, server-side revoke (the grant window is
 *   mirrored to `device.persistentUnlockExpiresAt`; the session-start
 *   bootstrap in `auth/persistent-unlock-bootstrap.ts` clears the local wrap
 *   when the server says null/past, and Settings → Security offers
 *   revoke-on-all-devices), instant local clear on logout / password change /
 *   secret-key rotation, and a settings opt-out.
 *
 * NEVER:
 *   - Put key material or the wrapping CryptoKey into localStorage,
 *     sessionStorage, cookies, console, analytics, or any server payload.
 *   - Export the wrapping key. It is created non-extractable and stays so.
 *   - Fall back to a software-exported key if WebCrypto is missing —
 *     persistence silently stays off instead.
 */

import { getDeviceKeyScope } from "@/lib/device-keys";

const DB_NAME = "pssmngr-persistent-unlock";
const DB_VERSION = 1;
const STORE_NAME = "persistent-unlock";
const RECORD_VERSION = 1 as const;

export interface PersistedEnvelope {
  v: typeof RECORD_VERSION;
  iv: Uint8Array;
  ciphertext: Uint8Array;
  createdAt: number;
  expiresAt: number;
}

interface StoredRecord {
  v: typeof RECORD_VERSION;
  key: CryptoKey;
  envelope: PersistedEnvelope;
}

function subtle(): SubtleCrypto | null {
  const c: Crypto | undefined =
    typeof globalThis !== "undefined"
      ? (globalThis as { crypto?: Crypto }).crypto
      : undefined;
  return c?.subtle ?? null;
}

function idb(): IDBFactory | null {
  const f =
    typeof globalThis !== "undefined"
      ? (globalThis as { indexedDB?: IDBFactory }).indexedDB
      : undefined;
  return f ?? null;
}

function currentScope(): string {
  // Empty string is a valid key; treat unset scope as "no-scope" so records
  // never leak across users. Callers of enable/restore must ensure the scope
  // is set (device-keys sets it on login).
  return getDeviceKeyScope() ?? "__no_scope__";
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const factory = idb();
    if (!factory) {
      reject(new Error("indexedDB unavailable"));
      return;
    }
    const req = factory.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("open failed"));
  });
}

async function putRecord(record: StoredRecord): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const req = tx.objectStore(STORE_NAME).put(record, currentScope());
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error("put failed"));
  });
}

async function getRecord(): Promise<StoredRecord | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(currentScope());
    req.onsuccess = () => resolve((req.result as StoredRecord | undefined) ?? null);
    req.onerror = () => reject(req.error ?? new Error("get failed"));
  });
}

async function deleteRecord(): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const req = tx.objectStore(STORE_NAME).delete(currentScope());
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error("delete failed"));
  });
}

function toBytes(buf: ArrayBuffer): Uint8Array {
  return new Uint8Array(buf);
}

export async function enablePersistence(
  vaultKey: Uint8Array,
  opts: { days: 7 | 30 },
): Promise<void> {
  const s = subtle();
  if (!s || !idb()) return; // silently stay off (R2 / R3)

  // Fresh non-extractable wrapping key per enable. Every call rotates.
  const wrappingKey = await s.generateKey(
    { name: "AES-GCM", length: 256 },
    /* extractable */ false,
    ["encrypt", "decrypt"],
  );

  const iv = new Uint8Array(12);
  (globalThis as { crypto: Crypto }).crypto.getRandomValues(iv);
  const ctBuf = await s.encrypt(
    { name: "AES-GCM", iv },
    wrappingKey,
    vaultKey as BufferSource,
  );

  const now = Date.now();
  const envelope: PersistedEnvelope = {
    v: RECORD_VERSION,
    iv,
    ciphertext: toBytes(ctBuf),
    createdAt: now,
    expiresAt: now + opts.days * 24 * 60 * 60 * 1000,
  };

  try {
    await putRecord({ v: RECORD_VERSION, key: wrappingKey, envelope });
  } catch {
    // Fail closed — never leave a half-written record around.
    try {
      await deleteRecord();
    } catch {
      /* ignore */
    }
  }
}

export async function tryRestore(): Promise<Uint8Array | null> {
  const s = subtle();
  if (!s || !idb()) return null;

  let record: StoredRecord | null;
  try {
    record = await getRecord();
  } catch {
    // A read failure doesn't imply corruption — leave the record alone.
    return null;
  }
  if (!record) return null;

  const bad = async (): Promise<null> => {
    try {
      await deleteRecord();
    } catch {
      /* ignore */
    }
    return null;
  };

  if (record.v !== RECORD_VERSION) return bad();
  if (!record.envelope || record.envelope.v !== RECORD_VERSION) return bad();
  if (
    !(record.envelope.iv instanceof Uint8Array) ||
    !(record.envelope.ciphertext instanceof Uint8Array)
  ) {
    return bad();
  }
  if (record.envelope.expiresAt <= Date.now()) return bad();

  let plaintext: ArrayBuffer;
  try {
    plaintext = await s.decrypt(
      { name: "AES-GCM", iv: record.envelope.iv as BufferSource },
      record.key,
      record.envelope.ciphertext as BufferSource,
    );
  } catch {
    return bad();
  }

  return toBytes(plaintext);
}

export async function clearPersistence(): Promise<void> {
  if (!idb()) return;
  try {
    await deleteRecord();
  } catch {
    /* ignore */
  }
}

export async function isEnabled(): Promise<boolean> {
  if (!subtle() || !idb()) return false;
  try {
    const r = await getRecord();
    if (!r) return false;
    if (r.envelope.expiresAt <= Date.now()) {
      await clearPersistence();
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function getExpiry(): Promise<number | null> {
  if (!subtle() || !idb()) return null;
  try {
    const r = await getRecord();
    if (!r) return null;
    if (r.envelope.expiresAt <= Date.now()) {
      await clearPersistence();
      return null;
    }
    return r.envelope.expiresAt;
  } catch {
    return null;
  }
}
