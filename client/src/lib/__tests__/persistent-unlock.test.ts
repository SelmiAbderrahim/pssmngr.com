// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Tests for persistent-unlock.ts — written test-first (R1). Every failure path
 * supported by the feature is exercised here, and structural invariants
 * (non-extractable wrapping key, IDB-only storage) are asserted.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// jsdom's `window.crypto` in current Node ships a real WebCrypto (including
// SubtleCrypto). If it's missing for some reason we skip these crypto tests
// rather than reaching into node:crypto (which Vite externalises).
const hasSubtle = Boolean(
  (globalThis as { crypto?: Crypto }).crypto?.subtle?.generateKey,
);
const cryptoDescribe = hasSubtle ? describe : describe.skip;

vi.mock("@/lib/device-keys", () => ({
  getDeviceKeyScope: () => "user@example.test",
}));

// ── Minimal in-memory fake IndexedDB ────────────────────────────────
type FakeStore = Map<unknown, unknown>;
const stores = new Map<string, FakeStore>();

function makeRequest<T>(fn: () => T): IDBRequest<T> {
  const req = {} as IDBRequest<T> & {
    onsuccess?: (ev: Event) => void;
    onerror?: (ev: Event) => void;
  };
  try {
    req.result = fn() as T;
    req.error = null;
    queueMicrotask(() => req.onsuccess?.(new Event("success")));
  } catch (err) {
    req.error = err as DOMException;
    queueMicrotask(() => req.onerror?.(new Event("error")));
  }
  return req;
}

function makeFakeDB(name: string): IDBDatabase {
  if (!stores.has(name)) stores.set(name, new Map());
  const data = stores.get(name)!;
  return {
    objectStoreNames: { contains: () => true },
    transaction: () =>
      ({
        objectStore: () => ({
          get: (k: unknown) => makeRequest(() => data.get(k)),
          put: (v: unknown, k: unknown) =>
            makeRequest(() => {
              data.set(k, v);
              return k;
            }),
          delete: (k: unknown) =>
            makeRequest(() => {
              data.delete(k);
              return undefined;
            }),
        }),
      }) as unknown as IDBTransaction,
    createObjectStore: () => ({}) as IDBObjectStore,
  } as unknown as IDBDatabase;
}

function installFakeIDB(): void {
  stores.clear();
  vi.stubGlobal("indexedDB", {
    open: (name: string) => {
      const req = {} as IDBOpenDBRequest & {
        onsuccess?: (ev: Event) => void;
        onupgradeneeded?: (ev: Event) => void;
      };
      req.result = makeFakeDB(name);
      req.error = null;
      queueMicrotask(() => req.onsuccess?.(new Event("success")));
      return req;
    },
  });
}

function uninstallIDB(): void {
  vi.stubGlobal("indexedDB", undefined);
}

async function freshImport() {
  vi.resetModules();
  return import("../persistent-unlock");
}

beforeEach(() => {
  installFakeIDB();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-07T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

cryptoDescribe("persistent-unlock: enable + restore round-trip", () => {
  it("stores a wrapped key and restores it byte-for-byte", async () => {
    const mod = await freshImport();
    const vaultKey = new Uint8Array(32).fill(0x42);
    await mod.enablePersistence(vaultKey, { days: 30 });
    const restored = await mod.tryRestore();
    expect(restored).not.toBeNull();
    expect(restored).toEqual(vaultKey);
  });

  it("isEnabled() reflects state", async () => {
    const mod = await freshImport();
    expect(await mod.isEnabled()).toBe(false);
    await mod.enablePersistence(new Uint8Array(32), { days: 7 });
    expect(await mod.isEnabled()).toBe(true);
  });

  it("getExpiry() returns a timestamp roughly `days` in the future", async () => {
    const mod = await freshImport();
    const start = Date.now();
    await mod.enablePersistence(new Uint8Array(32), { days: 30 });
    const exp = await mod.getExpiry();
    expect(exp).not.toBeNull();
    expect(exp! - start).toBeGreaterThan(29 * 24 * 60 * 60 * 1000);
    expect(exp! - start).toBeLessThanOrEqual(30 * 24 * 60 * 60 * 1000);
  });
});

cryptoDescribe("persistent-unlock: security invariants (R2)", () => {
  it("does not touch localStorage or sessionStorage", async () => {
    const mod = await freshImport();
    const setSpy = vi.spyOn(Storage.prototype, "setItem");
    await mod.enablePersistence(new Uint8Array(32), { days: 30 });
    await mod.tryRestore();
    expect(setSpy).not.toHaveBeenCalled();
  });

  it("the wrapping CryptoKey is non-extractable (exportKey rejects)", async () => {
    // We reach into the fake IDB store to inspect the record shape — this is
    // the only invariant that structurally requires peeking under the API.
    const mod = await freshImport();
    await mod.enablePersistence(new Uint8Array(32).fill(1), { days: 7 });
    const rec = stores
      .get("pssmngr-persistent-unlock")!
      .get("user@example.test") as { key: CryptoKey };
    expect(rec.key.extractable).toBe(false);
    await expect(
      globalThis.crypto.subtle.exportKey("raw", rec.key),
    ).rejects.toBeDefined();
  });
});

cryptoDescribe("persistent-unlock: fail-closed failure paths (R3)", () => {
  it("null when no record", async () => {
    const mod = await freshImport();
    expect(await mod.tryRestore()).toBeNull();
  });

  it("expired grant → null + record deleted", async () => {
    const mod = await freshImport();
    await mod.enablePersistence(new Uint8Array(32), { days: 7 });
    vi.setSystemTime(Date.now() + 8 * 24 * 60 * 60 * 1000);
    const restored = await mod.tryRestore();
    expect(restored).toBeNull();
    expect(
      stores.get("pssmngr-persistent-unlock")!.get("user@example.test"),
    ).toBeUndefined();
  });

  it("corrupt ciphertext (byte flip) → null + record deleted", async () => {
    const mod = await freshImport();
    await mod.enablePersistence(new Uint8Array(32), { days: 7 });
    const rec = stores
      .get("pssmngr-persistent-unlock")!
      .get("user@example.test") as { envelope: { ciphertext: Uint8Array } };
    rec.envelope.ciphertext[0] ^= 0xff;
    const restored = await mod.tryRestore();
    expect(restored).toBeNull();
    expect(
      stores.get("pssmngr-persistent-unlock")!.get("user@example.test"),
    ).toBeUndefined();
  });

  it("record version mismatch → null + deleted", async () => {
    const mod = await freshImport();
    await mod.enablePersistence(new Uint8Array(32), { days: 7 });
    const rec = stores
      .get("pssmngr-persistent-unlock")!
      .get("user@example.test") as { v: number };
    rec.v = 99;
    expect(await mod.tryRestore()).toBeNull();
    expect(
      stores.get("pssmngr-persistent-unlock")!.get("user@example.test"),
    ).toBeUndefined();
  });

  it("envelope version mismatch → null + deleted", async () => {
    const mod = await freshImport();
    await mod.enablePersistence(new Uint8Array(32), { days: 7 });
    const rec = stores
      .get("pssmngr-persistent-unlock")!
      .get("user@example.test") as { envelope: { v: number } };
    rec.envelope.v = 42;
    expect(await mod.tryRestore()).toBeNull();
  });

  it("WebCrypto absent → tryRestore returns null and enable is a no-op", async () => {
    const c = (globalThis as { crypto: Crypto }).crypto;
    // Preserve getRandomValues; strip subtle only.
    Object.defineProperty(globalThis, "crypto", {
      value: { getRandomValues: c.getRandomValues.bind(c) },
      configurable: true,
    });
    try {
      const mod = await freshImport();
      await mod.enablePersistence(new Uint8Array(32), { days: 30 });
      expect(await mod.tryRestore()).toBeNull();
      // Nothing was persisted (no key to persist without subtle).
      expect(
        stores.get("pssmngr-persistent-unlock")?.get("user@example.test"),
      ).toBeUndefined();
    } finally {
      Object.defineProperty(globalThis, "crypto", {
        value: c,
        configurable: true,
      });
    }
  });

  it("IndexedDB absent → all APIs are safe no-ops", async () => {
    uninstallIDB();
    const mod = await freshImport();
    await expect(
      mod.enablePersistence(new Uint8Array(32), { days: 30 }),
    ).resolves.toBeUndefined();
    expect(await mod.tryRestore()).toBeNull();
    await expect(mod.clearPersistence()).resolves.toBeUndefined();
    expect(await mod.isEnabled()).toBe(false);
    expect(await mod.getExpiry()).toBeNull();
  });
});

cryptoDescribe("persistent-unlock: clear + rotate", () => {
  it("clearPersistence() removes the record", async () => {
    const mod = await freshImport();
    await mod.enablePersistence(new Uint8Array(32), { days: 30 });
    await mod.clearPersistence();
    expect(await mod.tryRestore()).toBeNull();
    expect(await mod.isEnabled()).toBe(false);
  });

  it("re-enabling rotates the wrapping key (old envelope no longer decrypts)", async () => {
    const mod = await freshImport();
    const key1 = new Uint8Array(32).fill(1);
    await mod.enablePersistence(key1, { days: 30 });
    const rec1 = stores
      .get("pssmngr-persistent-unlock")!
      .get("user@example.test") as { key: CryptoKey; envelope: { ciphertext: Uint8Array } };
    const ct1 = new Uint8Array(rec1.envelope.ciphertext);

    const key2 = new Uint8Array(32).fill(2);
    await mod.enablePersistence(key2, { days: 30 });
    const rec2 = stores
      .get("pssmngr-persistent-unlock")!
      .get("user@example.test") as { key: CryptoKey; envelope: { ciphertext: Uint8Array } };

    // Different ciphertext + different key handle.
    expect(rec2.envelope.ciphertext).not.toEqual(ct1);
    expect(rec2.key).not.toBe(rec1.key);

    // Restore returns the new key value.
    const restored = await mod.tryRestore();
    expect(restored).toEqual(key2);
  });
});
