// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getDeviceId,
  setDeviceId,
  getSecretKey,
  setSecretKey,
  getDevicePrivateKey,
  setDevicePrivateKey,
  getEncryptedDevicePrivateKey,
  setEncryptedDevicePrivateKey,
  removeEncryptedDevicePrivateKey,
  hasStoredDevice,
  clearDeviceKeys,
  type EncryptedDeviceKey,
} from "../device-keys";

// ---------------------------------------------------------------------------
// Fake IndexedDB implementation
//
// The module under test uses the raw IndexedDB API (not a wrapper library).
// jsdom does not ship a working IndexedDB, so we construct a minimal but
// complete in-memory fake that honours the request/event model the source
// code relies on.
// ---------------------------------------------------------------------------

type FakeStore = Map<string, unknown>;

/** Build a fake IDBRequest whose onsuccess / onerror fire synchronously. */
function makeRequest<T>(
  executor: () => T | undefined,
): IDBRequest<T> {
  const req = {} as IDBRequest<T>;
  try {
    const result = executor();
    req.result = result as T;
    req.error = null;
    // Fire onsuccess on the next microtask so callers can attach handlers first.
    Promise.resolve().then(() => req.onsuccess?.call(req, new Event("success")));
  } catch (err) {
    req.result = undefined as T;
    req.error = err as DOMException;
    Promise.resolve().then(() => req.onerror?.call(req, new Event("error")));
  }
  return req;
}

/** Create a fake IDBObjectStore backed by a Map. */
function makeFakeStore(data: FakeStore): IDBObjectStore {
  return {
    get: (key: string) =>
      makeRequest(() => data.get(key)),
    put: (value: unknown, key: string) =>
      makeRequest(() => {
        data.set(key, value);
        return key;
      }),
    delete: (key: string) =>
      makeRequest(() => {
        data.delete(key);
        return undefined;
      }),
  } as unknown as IDBObjectStore;
}

/** Create a fake IDBTransaction. */
function makeFakeTransaction(data: FakeStore): IDBTransaction {
  return {
    objectStore: (_name: string) => makeFakeStore(data),
  } as unknown as IDBTransaction;
}

/** Create a fake IDBDatabase. */
function makeFakeDatabase(data: FakeStore): IDBDatabase {
  return {
    objectStoreNames: {
      contains: (_name: string) => true, // store already exists – skip createObjectStore
    },
    transaction: (_store: string, _mode: string) => makeFakeTransaction(data),
    createObjectStore: (_name: string) => makeFakeStore(data),
    result: undefined,
  } as unknown as IDBDatabase;
}

/** Build a fake indexedDB.open() request. */
function makeFakeOpenRequest(
  db: IDBDatabase,
): IDBOpenDBRequest {
  const req = {} as IDBOpenDBRequest;
  req.result = db;
  req.error = null;
  // Fire onsuccess on the next microtask.
  Promise.resolve().then(() => req.onsuccess?.call(req, new Event("success")));
  return req;
}

// ---------------------------------------------------------------------------
// Test state
// ---------------------------------------------------------------------------

let fakeData: FakeStore;

/** Install the fake indexedDB global before each test. */
function installFakeIndexedDB(): void {
  fakeData = new Map();
  const db = makeFakeDatabase(fakeData);

  vi.stubGlobal("indexedDB", {
    open: (_name: string, _version: number) => makeFakeOpenRequest(db),
  });
}

/** Install an indexedDB whose open() request fires onerror. */
function installBrokenOpenIndexedDB(): void {
  const req = {} as IDBOpenDBRequest;
  req.result = undefined as unknown as IDBDatabase;
  req.error = new DOMException("open failed", "UnknownError");
  Promise.resolve().then(() => req.onerror?.call(req, new Event("error")));

  vi.stubGlobal("indexedDB", {
    open: () => req,
  });
}

/** Install an indexedDB that opens but whose store operations always error. */
function installErroringOperationsIndexedDB(): void {
  const brokenStore = {
    get: (_key: string) =>
      makeRequest(() => {
        throw new DOMException("get failed", "UnknownError");
      }),
    put: (_value: unknown, _key: string) =>
      makeRequest(() => {
        throw new DOMException("put failed", "UnknownError");
      }),
    delete: (_key: string) =>
      makeRequest(() => {
        throw new DOMException("delete failed", "UnknownError");
      }),
  } as unknown as IDBObjectStore;

  const brokenTransaction = {
    objectStore: () => brokenStore,
  } as unknown as IDBTransaction;

  const db = {
    objectStoreNames: { contains: () => true },
    transaction: () => brokenTransaction,
    createObjectStore: () => brokenStore,
  } as unknown as IDBDatabase;

  const req = {} as IDBOpenDBRequest;
  req.result = db;
  req.error = null;
  Promise.resolve().then(() => req.onsuccess?.call(req, new Event("success")));

  vi.stubGlobal("indexedDB", { open: () => req });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("device-keys", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    installFakeIndexedDB();
  });

  // ── getDeviceId / setDeviceId ─────────────────────────────────────────

  describe("getDeviceId", () => {
    it("returns null when nothing has been stored", async () => {
      const result = await getDeviceId();
      expect(result).toBeNull();
    });

    it("returns the stored device ID after setDeviceId", async () => {
      await setDeviceId("device-abc-123");
      const result = await getDeviceId();
      expect(result).toBe("device-abc-123");
    });

    it("returns the most recently stored device ID", async () => {
      await setDeviceId("first-id");
      await setDeviceId("second-id");
      const result = await getDeviceId();
      expect(result).toBe("second-id");
    });

    it("rejects when IndexedDB open fails", async () => {
      installBrokenOpenIndexedDB();
      await expect(getDeviceId()).rejects.toBeInstanceOf(DOMException);
    });

    it("rejects when the store get operation fails", async () => {
      installErroringOperationsIndexedDB();
      await expect(getDeviceId()).rejects.toBeInstanceOf(DOMException);
    });
  });

  describe("setDeviceId", () => {
    it("resolves without error on success", async () => {
      await expect(setDeviceId("my-device")).resolves.toBeUndefined();
    });

    it("persists the value so getDeviceId can retrieve it", async () => {
      await setDeviceId("persisted-device");
      expect(await getDeviceId()).toBe("persisted-device");
    });

    it("rejects when IndexedDB open fails", async () => {
      installBrokenOpenIndexedDB();
      await expect(setDeviceId("id")).rejects.toBeInstanceOf(DOMException);
    });

    it("rejects when the store put operation fails", async () => {
      installErroringOperationsIndexedDB();
      await expect(setDeviceId("id")).rejects.toBeInstanceOf(DOMException);
    });
  });

  // ── getSecretKey / setSecretKey ──────────────────────────────────────

  describe("getSecretKey", () => {
    it("returns null when nothing has been stored", async () => {
      const result = await getSecretKey();
      expect(result).toBeNull();
    });

    it("returns a Uint8Array after setSecretKey", async () => {
      const key = new Uint8Array([10, 20, 30, 40]);
      await setSecretKey(key);
      const result = await getSecretKey();
      expect(result).toBeInstanceOf(Uint8Array);
    });

    it("round-trips the key bytes correctly", async () => {
      const key = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
      await setSecretKey(key);
      const result = await getSecretKey();
      expect(Array.from(result!)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    });

    it("returns a fresh Uint8Array instance (not the original reference)", async () => {
      const original = new Uint8Array([99, 88, 77]);
      await setSecretKey(original);
      const retrieved = await getSecretKey();
      // They should have equal content but be different objects
      expect(retrieved).not.toBe(original);
      expect(Array.from(retrieved!)).toEqual(Array.from(original));
    });

    it("handles a 32-byte key (AES-256 size)", async () => {
      const key = new Uint8Array(32).fill(0xab);
      await setSecretKey(key);
      const result = await getSecretKey();
      expect(result).toHaveLength(32);
      expect(result![0]).toBe(0xab);
    });

    it("rejects when IndexedDB open fails", async () => {
      installBrokenOpenIndexedDB();
      await expect(getSecretKey()).rejects.toBeInstanceOf(DOMException);
    });
  });

  describe("setSecretKey", () => {
    it("resolves without error", async () => {
      await expect(setSecretKey(new Uint8Array([1, 2, 3]))).resolves.toBeUndefined();
    });

    it("stores the key as a number array in IndexedDB", async () => {
      const key = new Uint8Array([5, 10, 15]);
      await setSecretKey(key);
      // Internal storage format is number[] — verify via round-trip
      const retrieved = await getSecretKey();
      expect(Array.from(retrieved!)).toEqual([5, 10, 15]);
    });

    it("rejects when IndexedDB open fails", async () => {
      installBrokenOpenIndexedDB();
      await expect(setSecretKey(new Uint8Array([1]))).rejects.toBeInstanceOf(DOMException);
    });
  });

  // ── getDevicePrivateKey / setDevicePrivateKey ────────────────────────

  describe("getDevicePrivateKey", () => {
    it("returns null when nothing has been stored", async () => {
      expect(await getDevicePrivateKey()).toBeNull();
    });

    it("returns a Uint8Array after setDevicePrivateKey", async () => {
      await setDevicePrivateKey(new Uint8Array([7, 8, 9]));
      const result = await getDevicePrivateKey();
      expect(result).toBeInstanceOf(Uint8Array);
    });

    it("round-trips all byte values correctly", async () => {
      const key = new Uint8Array([0, 127, 255]);
      await setDevicePrivateKey(key);
      const result = await getDevicePrivateKey();
      expect(Array.from(result!)).toEqual([0, 127, 255]);
    });

    it("handles a 32-byte X25519 private key", async () => {
      const key = new Uint8Array(32).fill(0x01);
      await setDevicePrivateKey(key);
      const result = await getDevicePrivateKey();
      expect(result).toHaveLength(32);
      expect(result![31]).toBe(0x01);
    });

    it("rejects when IndexedDB open fails", async () => {
      installBrokenOpenIndexedDB();
      await expect(getDevicePrivateKey()).rejects.toBeInstanceOf(DOMException);
    });
  });

  describe("setDevicePrivateKey", () => {
    it("resolves without error", async () => {
      await expect(
        setDevicePrivateKey(new Uint8Array([1, 2, 3])),
      ).resolves.toBeUndefined();
    });

    it("stores key separately from secretKey", async () => {
      await setSecretKey(new Uint8Array([10, 20]));
      await setDevicePrivateKey(new Uint8Array([30, 40]));

      const sk = await getSecretKey();
      const dk = await getDevicePrivateKey();
      expect(Array.from(sk!)).toEqual([10, 20]);
      expect(Array.from(dk!)).toEqual([30, 40]);
    });

    it("rejects when IndexedDB open fails", async () => {
      installBrokenOpenIndexedDB();
      await expect(
        setDevicePrivateKey(new Uint8Array([1])),
      ).rejects.toBeInstanceOf(DOMException);
    });
  });

  // ── getEncryptedDevicePrivateKey / setEncryptedDevicePrivateKey ──────

  describe("getEncryptedDevicePrivateKey", () => {
    it("returns null when nothing has been stored", async () => {
      expect(await getEncryptedDevicePrivateKey()).toBeNull();
    });

    it("returns the stored object after setEncryptedDevicePrivateKey", async () => {
      const payload: EncryptedDeviceKey = {
        ciphertext: [1, 2, 3],
        nonce: [4, 5, 6],
        authTag: [7, 8, 9],
      };
      await setEncryptedDevicePrivateKey(payload);
      const result = await getEncryptedDevicePrivateKey();
      expect(result).toEqual(payload);
    });

    it("preserves ciphertext, nonce, and authTag arrays", async () => {
      const payload: EncryptedDeviceKey = {
        ciphertext: Array.from({ length: 48 }, (_, i) => i),
        nonce: Array.from({ length: 12 }, (_, i) => i + 100),
        authTag: Array.from({ length: 16 }, (_, i) => i + 200),
      };
      await setEncryptedDevicePrivateKey(payload);
      const result = await getEncryptedDevicePrivateKey();
      expect(result!.ciphertext).toEqual(payload.ciphertext);
      expect(result!.nonce).toEqual(payload.nonce);
      expect(result!.authTag).toEqual(payload.authTag);
    });

    it("rejects when IndexedDB open fails", async () => {
      installBrokenOpenIndexedDB();
      await expect(getEncryptedDevicePrivateKey()).rejects.toBeInstanceOf(DOMException);
    });
  });

  describe("setEncryptedDevicePrivateKey", () => {
    it("resolves without error", async () => {
      const payload: EncryptedDeviceKey = {
        ciphertext: [0],
        nonce: [1],
        authTag: [2],
      };
      await expect(setEncryptedDevicePrivateKey(payload)).resolves.toBeUndefined();
    });

    it("overwrites a previously stored encrypted key", async () => {
      const first: EncryptedDeviceKey = { ciphertext: [1], nonce: [2], authTag: [3] };
      const second: EncryptedDeviceKey = { ciphertext: [9], nonce: [8], authTag: [7] };
      await setEncryptedDevicePrivateKey(first);
      await setEncryptedDevicePrivateKey(second);
      const result = await getEncryptedDevicePrivateKey();
      expect(result).toEqual(second);
    });

    it("rejects when IndexedDB open fails", async () => {
      installBrokenOpenIndexedDB();
      await expect(
        setEncryptedDevicePrivateKey({ ciphertext: [], nonce: [], authTag: [] }),
      ).rejects.toBeInstanceOf(DOMException);
    });
  });

  // ── removeEncryptedDevicePrivateKey ──────────────────────────────────

  describe("removeEncryptedDevicePrivateKey", () => {
    it("resolves without error when nothing was stored", async () => {
      await expect(removeEncryptedDevicePrivateKey()).resolves.toBeUndefined();
    });

    it("removes a previously stored encrypted key", async () => {
      await setEncryptedDevicePrivateKey({ ciphertext: [1], nonce: [2], authTag: [3] });
      await removeEncryptedDevicePrivateKey();
      expect(await getEncryptedDevicePrivateKey()).toBeNull();
    });

    it("is idempotent — safe to call multiple times", async () => {
      await setEncryptedDevicePrivateKey({ ciphertext: [5], nonce: [6], authTag: [7] });
      await removeEncryptedDevicePrivateKey();
      await expect(removeEncryptedDevicePrivateKey()).resolves.toBeUndefined();
      expect(await getEncryptedDevicePrivateKey()).toBeNull();
    });

    it("does not affect other stored keys", async () => {
      await setDeviceId("keep-me");
      await setEncryptedDevicePrivateKey({ ciphertext: [1], nonce: [2], authTag: [3] });
      await removeEncryptedDevicePrivateKey();
      expect(await getDeviceId()).toBe("keep-me");
    });

    it("rejects when IndexedDB open fails", async () => {
      installBrokenOpenIndexedDB();
      await expect(removeEncryptedDevicePrivateKey()).rejects.toBeInstanceOf(DOMException);
    });

    it("rejects when the store delete operation fails", async () => {
      installErroringOperationsIndexedDB();
      await expect(removeEncryptedDevicePrivateKey()).rejects.toBeInstanceOf(DOMException);
    });
  });

  // ── hasStoredDevice ──────────────────────────────────────────────────

  describe("hasStoredDevice", () => {
    it("returns false when no device ID has been stored", async () => {
      expect(await hasStoredDevice()).toBe(false);
    });

    it("returns true after a device ID is stored", async () => {
      await setDeviceId("device-xyz");
      expect(await hasStoredDevice()).toBe(true);
    });

    it("returns false after clearDeviceKeys removes the device ID", async () => {
      await setDeviceId("device-xyz");
      await clearDeviceKeys();
      expect(await hasStoredDevice()).toBe(false);
    });

    it("is based solely on deviceId presence, not on other keys", async () => {
      // Store other keys but not deviceId
      await setSecretKey(new Uint8Array([1, 2, 3]));
      await setDevicePrivateKey(new Uint8Array([4, 5, 6]));
      expect(await hasStoredDevice()).toBe(false);
    });

    it("rejects when IndexedDB open fails", async () => {
      installBrokenOpenIndexedDB();
      await expect(hasStoredDevice()).rejects.toBeInstanceOf(DOMException);
    });
  });

  // ── clearDeviceKeys ──────────────────────────────────────────────────

  describe("clearDeviceKeys", () => {
    it("resolves without error when the store is already empty", async () => {
      await expect(clearDeviceKeys()).resolves.toBeUndefined();
    });

    it("removes deviceId", async () => {
      await setDeviceId("id-to-clear");
      await clearDeviceKeys();
      expect(await getDeviceId()).toBeNull();
    });

    it("removes secretKey", async () => {
      await setSecretKey(new Uint8Array([1, 2, 3]));
      await clearDeviceKeys();
      expect(await getSecretKey()).toBeNull();
    });

    it("removes devicePrivateKey", async () => {
      await setDevicePrivateKey(new Uint8Array([4, 5, 6]));
      await clearDeviceKeys();
      expect(await getDevicePrivateKey()).toBeNull();
    });

    it("removes encryptedDevicePrivateKey", async () => {
      await setEncryptedDevicePrivateKey({ ciphertext: [1], nonce: [2], authTag: [3] });
      await clearDeviceKeys();
      expect(await getEncryptedDevicePrivateKey()).toBeNull();
    });

    it("clears all four keys in one call", async () => {
      await setDeviceId("id");
      await setSecretKey(new Uint8Array([10]));
      await setDevicePrivateKey(new Uint8Array([20]));
      await setEncryptedDevicePrivateKey({ ciphertext: [30], nonce: [31], authTag: [32] });

      await clearDeviceKeys();

      const [deviceId, secretKey, privateKey, encryptedKey] = await Promise.all([
        getDeviceId(),
        getSecretKey(),
        getDevicePrivateKey(),
        getEncryptedDevicePrivateKey(),
      ]);

      expect(deviceId).toBeNull();
      expect(secretKey).toBeNull();
      expect(privateKey).toBeNull();
      expect(encryptedKey).toBeNull();
    });

    it("is idempotent — safe to call when already empty", async () => {
      await clearDeviceKeys();
      await expect(clearDeviceKeys()).resolves.toBeUndefined();
    });

    it("rejects when IndexedDB open fails", async () => {
      installBrokenOpenIndexedDB();
      await expect(clearDeviceKeys()).rejects.toBeInstanceOf(DOMException);
    });
  });

  // ── DB upgrade path — createObjectStore branch ───────────────────────

  describe("IndexedDB upgrade path", () => {
    it("creates the object store when it does not yet exist", async () => {
      // Simulate a fresh database where the store does not exist yet.
      // openDB attaches onupgradeneeded; we fire it synchronously before onsuccess.
      fakeData = new Map();
      const createObjectStoreSpy = vi.fn(() => makeFakeStore(fakeData));

      const db = {
        objectStoreNames: {
          contains: (_name: string) => false, // store does NOT exist
        },
        transaction: (_store: string, _mode: string) => makeFakeTransaction(fakeData),
        createObjectStore: createObjectStoreSpy,
      } as unknown as IDBDatabase;

      // Build the open request object but don't schedule anything yet.
      // After indexedDB.open() is called, the source code attaches its
      // onupgradeneeded / onsuccess handlers — we fire them on the next tick.
      let capturedReq: IDBOpenDBRequest;

      vi.stubGlobal("indexedDB", {
        open: (_name: string, _version: number) => {
          const req = {} as IDBOpenDBRequest;
          req.result = db;
          req.error = null;
          capturedReq = req;
          Promise.resolve().then(() => {
            // Fire upgrade first, then success — matches real IDB behaviour.
            capturedReq.onupgradeneeded?.call(
              capturedReq,
              new Event("upgradeneeded") as IDBVersionChangeEvent,
            );
            capturedReq.onsuccess?.call(capturedReq, new Event("success"));
          });
          return req;
        },
      });

      await setDeviceId("upgrade-test-id");
      expect(createObjectStoreSpy).toHaveBeenCalledOnce();
      expect(createObjectStoreSpy).toHaveBeenCalledWith("keys");
    });

    it("skips createObjectStore when the store already exists", async () => {
      // Default fake has contains() returning true — createObjectStore should never be called.
      const createObjectStoreSpy = vi.fn();
      fakeData = new Map();

      const db = {
        objectStoreNames: { contains: () => true },
        transaction: () => makeFakeTransaction(fakeData),
        createObjectStore: createObjectStoreSpy,
      } as unknown as IDBDatabase;

      let capturedReq: IDBOpenDBRequest;

      vi.stubGlobal("indexedDB", {
        open: (_name: string, _version: number) => {
          const req = {} as IDBOpenDBRequest;
          req.result = db;
          req.error = null;
          capturedReq = req;
          Promise.resolve().then(() => {
            capturedReq.onupgradeneeded?.call(
              capturedReq,
              new Event("upgradeneeded") as IDBVersionChangeEvent,
            );
            capturedReq.onsuccess?.call(capturedReq, new Event("success"));
          });
          return req;
        },
      });

      await setDeviceId("no-upgrade-id");
      expect(createObjectStoreSpy).not.toHaveBeenCalled();
    });
  });

  // ── Key isolation — distinct IDB keys don't overwrite each other ─────

  describe("key isolation", () => {
    it("secretKey and devicePrivateKey are stored under different keys", async () => {
      await setSecretKey(new Uint8Array([1, 1, 1]));
      await setDevicePrivateKey(new Uint8Array([2, 2, 2]));

      expect(Array.from((await getSecretKey())!)).toEqual([1, 1, 1]);
      expect(Array.from((await getDevicePrivateKey())!)).toEqual([2, 2, 2]);
    });

    it("deviceId does not collide with secretKey", async () => {
      await setDeviceId("device-001");
      await setSecretKey(new Uint8Array([9, 8, 7]));

      expect(await getDeviceId()).toBe("device-001");
      expect(Array.from((await getSecretKey())!)).toEqual([9, 8, 7]);
    });

    it("encryptedDevicePrivateKey does not collide with devicePrivateKey", async () => {
      await setDevicePrivateKey(new Uint8Array([50, 51, 52]));
      await setEncryptedDevicePrivateKey({ ciphertext: [60], nonce: [61], authTag: [62] });

      expect(Array.from((await getDevicePrivateKey())!)).toEqual([50, 51, 52]);
      expect((await getEncryptedDevicePrivateKey())!.ciphertext).toEqual([60]);
    });
  });
});
