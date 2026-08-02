// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Device key storage via IndexedDB.
 *
 * Stores per-device secrets that survive page reloads:
 *  - deviceId: server-assigned device ID
 *  - secretKey: user's 128-bit secret key (needed for key derivation)
 *  - devicePrivateKey: X25519 private key for this device
 *
 * These are stored in IndexedDB (not localStorage) for binary-safe
 * storage without base64 overhead.
 */

const DB_NAME = "pssmngr-device";
const DB_VERSION = 1;
const STORE_NAME = "keys";
let activeKeyScope: string | null = null;

function normalizeScope(scope: string | null | undefined): string | null {
  const normalized = scope?.trim().toLowerCase();
  return normalized ? normalized : null;
}

function scopedKey(key: string): string {
  return activeKeyScope ? `${activeKeyScope}:${key}` : key;
}

export function setDeviceKeyScope(scope: string | null | undefined): void {
  activeKeyScope = normalizeScope(scope);
}

export function getDeviceKeyScope(): string | null {
  return activeKeyScope;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getItem<T>(key: string): Promise<T | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(scopedKey(key));
    req.onsuccess = () => resolve((req.result as T) ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function setItem(key: string, value: unknown): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(value, scopedKey(key));
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function removeItem(key: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(scopedKey(key));
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ── Device ID ───────────────────────────────────────────────────────

export async function getDeviceId(): Promise<string | null> {
  return getItem<string>("deviceId");
}

export async function setDeviceId(id: string): Promise<void> {
  return setItem("deviceId", id);
}

// ── Secret Key (Uint8Array stored as number[]) ─────────────────────

export async function getSecretKey(): Promise<Uint8Array | null> {
  const encoded = await getItem<number[]>("secretKey");
  return encoded ? new Uint8Array(encoded) : null;
}

export async function setSecretKey(key: Uint8Array): Promise<void> {
  return setItem("secretKey", Array.from(key));
}

// ── Device Private Key (raw — legacy, prefer encrypted) ────────────

export async function getDevicePrivateKey(): Promise<Uint8Array | null> {
  const encoded = await getItem<number[]>("devicePrivateKey");
  return encoded ? new Uint8Array(encoded) : null;
}

export async function setDevicePrivateKey(key: Uint8Array): Promise<void> {
  return setItem("devicePrivateKey", Array.from(key));
}

export async function removeDevicePrivateKey(): Promise<void> {
  return removeItem("devicePrivateKey");
}

// ── Encrypted Device Private Key ──────────────────────────────────

/** Encrypted private key stored as {ciphertext, nonce, authTag} in number[] form. */
export interface EncryptedDeviceKey {
  ciphertext: number[];
  nonce: number[];
  authTag: number[];
}

export async function getEncryptedDevicePrivateKey(): Promise<EncryptedDeviceKey | null> {
  return getItem<EncryptedDeviceKey>("encryptedDevicePrivateKey");
}

export async function setEncryptedDevicePrivateKey(
  encrypted: EncryptedDeviceKey,
): Promise<void> {
  return setItem("encryptedDevicePrivateKey", encrypted);
}

export async function removeEncryptedDevicePrivateKey(): Promise<void> {
  return removeItem("encryptedDevicePrivateKey");
}

// ── Encrypted Device Signing Key (Ed25519, vault-key-encrypted) ────

export async function getEncryptedSigningKey(): Promise<EncryptedDeviceKey | null> {
  return getItem<EncryptedDeviceKey>("encryptedSigningKey");
}

export async function setEncryptedSigningKey(
  encrypted: EncryptedDeviceKey,
): Promise<void> {
  return setItem("encryptedSigningKey", encrypted);
}

export async function removeEncryptedSigningKey(): Promise<void> {
  return removeItem("encryptedSigningKey");
}

// ── Convenience ────────────────────────────────────────────────────

export async function hasStoredDevice(): Promise<boolean> {
  const id = await getDeviceId();
  return id !== null;
}

export async function clearDeviceKeys(): Promise<void> {
  await removeItem("deviceId");
  await removeItem("secretKey");
  await removeItem("devicePrivateKey");
  await removeItem("encryptedDevicePrivateKey");
  await removeItem("encryptedSigningKey");
}
