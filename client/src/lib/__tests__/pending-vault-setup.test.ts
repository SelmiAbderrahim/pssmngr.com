// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  storePendingVaultSetup,
  getPendingVaultSetup,
  clearPendingVaultSetup,
  hasPendingVaultSetup,
  type PendingVaultData,
} from '@/lib/pending-vault-setup';

const MARKER_KEY = 'pssmngr_pending_vault_setup_marker';
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const VALID_INPUT: Omit<PendingVaultData, 'timestamp'> = {
  kdfSalt: 'randomSalt123',
  encryptedVerificationBlob: 'encryptedBlob456',
  secretKeyBase32: 'JBSWY3DPEHPK3PXP',
  email: 'user@example.com',
};

// ── Minimal in-memory localStorage ───────────────────────────────────
function makeLocalStorage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  };
}

// ── Minimal in-memory IndexedDB ──────────────────────────────────────
// jsdom ships no IndexedDB; this fake honours just the request/event surface
// the module under test relies on (open/upgrade, get/put/delete).
function makeFakeIndexedDB() {
  const dbs = new Map<string, Map<string, Map<string, unknown>>>();

  function deferred<T>(req: any, run: () => T) {
    Promise.resolve().then(() => {
      try {
        req.result = run();
        req.error = null;
        req.onsuccess?.({ target: req });
      } catch (e) {
        req.error = e;
        req.onerror?.({ target: req });
      }
    });
  }

  function makeDb(stores: Map<string, Map<string, unknown>>) {
    return {
      objectStoreNames: { contains: (n: string) => stores.has(n) },
      createObjectStore: (n: string) => stores.set(n, new Map()),
      transaction: (_name: string, _mode?: string) => ({
        objectStore: (n: string) => {
          const store = stores.get(n)!;
          return {
            get: (k: string) => {
              const req: any = {};
              deferred(req, () => (store.has(k) ? store.get(k) : undefined));
              return req;
            },
            put: (v: unknown, k: string) => {
              const req: any = {};
              deferred(req, () => {
                store.set(k, v);
                return undefined;
              });
              return req;
            },
            delete: (k: string) => {
              const req: any = {};
              deferred(req, () => {
                store.delete(k);
                return undefined;
              });
              return req;
            },
          };
        },
      }),
    };
  }

  return {
    open(name: string, _version?: number) {
      const req: any = { onsuccess: null, onerror: null, onupgradeneeded: null };
      Promise.resolve().then(() => {
        const isNew = !dbs.has(name);
        if (isNew) dbs.set(name, new Map());
        const db = makeDb(dbs.get(name)!);
        req.result = db;
        if (isNew) req.onupgradeneeded?.({ target: req });
        req.onsuccess?.({ target: req });
      });
      return req;
    },
  };
}

describe('pending-vault-setup (encrypted at rest)', () => {
  let ls: ReturnType<typeof makeLocalStorage>;

  beforeEach(() => {
    ls = makeLocalStorage();
    vi.stubGlobal('localStorage', ls);
    vi.stubGlobal('indexedDB', makeFakeIndexedDB());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  describe('store + get round-trip', () => {
    it('round-trips all fields through encrypted storage', async () => {
      await storePendingVaultSetup(VALID_INPUT);
      const result = await getPendingVaultSetup();
      expect(result).toMatchObject(VALID_INPUT);
      expect(typeof result?.timestamp).toBe('number');
    });

    it('does NOT write the Secret Key or verification blob to localStorage', async () => {
      await storePendingVaultSetup(VALID_INPUT);

      const allValues = [...ls.map.values()].join('\n');
      expect(allValues).not.toContain(VALID_INPUT.secretKeyBase32);
      expect(allValues).not.toContain(VALID_INPUT.encryptedVerificationBlob);
      expect(allValues).not.toContain(VALID_INPUT.kdfSalt);
    });

    it('only stores a non-secret presence marker (email + timestamp) in localStorage', async () => {
      await storePendingVaultSetup(VALID_INPUT);
      const raw = ls.getItem(MARKER_KEY);
      expect(raw).toBeTruthy();
      const marker = JSON.parse(raw as string);
      expect(Object.keys(marker).sort()).toEqual(['email', 'timestamp']);
      expect(marker.email).toBe(VALID_INPUT.email);
    });

    it('uses a non-extractable AES-GCM wrapping key in IndexedDB', async () => {
      await storePendingVaultSetup(VALID_INPUT);
      // Reach into the fake IDB store to inspect the persisted key.
      const req: any = indexedDB.open('pssmngr-pending-vault-setup');
      const db: any = await new Promise((res) => {
        req.onsuccess = () => res(req.result);
      });
      const key: CryptoKey = await new Promise((res) => {
        const r = db.transaction('kv').objectStore('kv').get('wrap-key');
        r.onsuccess = () => res(r.result);
      });
      expect(key).toBeTruthy();
      expect(key.type).toBe('secret');
      expect(key.extractable).toBe(false);
    });
  });

  describe('expiry + validation', () => {
    it('returns null and clears when expired (>24h)', async () => {
      vi.useFakeTimers();
      const t0 = 1_700_000_000_000;
      vi.setSystemTime(t0);
      await storePendingVaultSetup(VALID_INPUT);

      vi.setSystemTime(t0 + TTL_MS + 1);
      const result = await getPendingVaultSetup();
      expect(result).toBeNull();
      expect(ls.getItem(MARKER_KEY)).toBeNull();
    });

    it('returns data exactly at the TTL boundary', async () => {
      vi.useFakeTimers();
      const t0 = 1_700_000_000_000;
      vi.setSystemTime(t0);
      await storePendingVaultSetup(VALID_INPUT);

      vi.setSystemTime(t0 + TTL_MS);
      const result = await getPendingVaultSetup();
      expect(result).toMatchObject(VALID_INPUT);
    });

    it('returns null when nothing is stored', async () => {
      expect(await getPendingVaultSetup()).toBeNull();
    });

    it('returns null when the marker exists but the encrypted bundle is gone', async () => {
      await storePendingVaultSetup(VALID_INPUT);
      // Simulate a torn write: marker present, IDB cleared.
      vi.stubGlobal('indexedDB', makeFakeIndexedDB());
      expect(await getPendingVaultSetup()).toBeNull();
    });
  });

  describe('clearPendingVaultSetup', () => {
    it('removes both the marker and the encrypted bundle', async () => {
      await storePendingVaultSetup(VALID_INPUT);
      await clearPendingVaultSetup();
      expect(ls.getItem(MARKER_KEY)).toBeNull();
      expect(await getPendingVaultSetup()).toBeNull();
    });
  });

  describe('registration flow lifecycle', () => {
    it('last write wins when stored twice', async () => {
      await storePendingVaultSetup({ ...VALID_INPUT, email: 'first@example.com' });
      await storePendingVaultSetup({ ...VALID_INPUT, email: 'second@example.com' });

      const result = await getPendingVaultSetup();
      expect(result?.email).toBe('second@example.com');
    });

    it('store does not throw when localStorage is unavailable', async () => {
      vi.spyOn(ls, 'setItem').mockImplementation(() => {
        throw new DOMException('QuotaExceededError');
      });
      await expect(storePendingVaultSetup(VALID_INPUT)).resolves.toBeUndefined();
    });

    it('clear does not throw when localStorage is unavailable', async () => {
      vi.spyOn(ls, 'removeItem').mockImplementation(() => {
        throw new DOMException('SecurityError');
      });
      await expect(clearPendingVaultSetup()).resolves.toBeUndefined();
    });
  });

  describe('hasPendingVaultSetup (synchronous guard)', () => {
    it('returns false when nothing is stored', () => {
      expect(hasPendingVaultSetup()).toBe(false);
    });

    it('returns true after storing, synchronously via the marker', async () => {
      await storePendingVaultSetup(VALID_INPUT);
      expect(hasPendingVaultSetup()).toBe(true);
    });

    it('returns false for an expired marker', async () => {
      vi.useFakeTimers();
      const t0 = 1_700_000_000_000;
      vi.setSystemTime(t0);
      await storePendingVaultSetup(VALID_INPUT);
      vi.setSystemTime(t0 + TTL_MS + 1);
      expect(hasPendingVaultSetup()).toBe(false);
    });

    it('returns false for a malformed marker', () => {
      ls.setItem(MARKER_KEY, 'not-json');
      expect(hasPendingVaultSetup()).toBe(false);
    });
  });
});
