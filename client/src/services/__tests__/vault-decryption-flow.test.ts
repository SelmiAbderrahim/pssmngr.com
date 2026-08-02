// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Vault Decryption Flow — Integration Tests
 *
 * Tests the end-to-end encrypt → decrypt lifecycle, bulk
 * decryption patterns, and failure detection logic used
 * by the vault page, trash view, and dashboard.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock vault-keys module with defensive copy (matches production behavior)
const mockKeyStore: { key: Uint8Array | null } = { key: null };
vi.mock("@/lib/vault-keys", () => ({
  getVaultKey: () =>
    mockKeyStore.key ? new Uint8Array(mockKeyStore.key) : null,
  setVaultKey: (k: Uint8Array) => {
    if (mockKeyStore.key) mockKeyStore.key.fill(0);
    mockKeyStore.key = k;
  },
  clearVaultKey: () => {
    if (mockKeyStore.key) mockKeyStore.key.fill(0);
    mockKeyStore.key = null;
  },
  hasVaultKey: () => mockKeyStore.key !== null,
}));

vi.mock("@/lib/vault-crypto", () => ({
  deriveVaultKey: vi.fn(async ({ salt }: { salt: Uint8Array }) => ({
    vaultKey: new Uint8Array(32).fill(42),
    salt,
  })),
  uint8ToBase64: (bytes: Uint8Array) => {
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary);
  },
  base64ToUint8: (b64: string) => {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  },
}));

vi.mock("@/lib/device-keys", () => ({
  getSecretKey: vi.fn(async () => new Uint8Array(16).fill(7)),
}));

import {
  vaultCrypto,
  type ServerItemRecord,
  type EncryptedItemPayload,
} from "../vault-crypto";

// ── Helpers ───────────────────────────────────────────────────────

function makeServerRecord(
  encrypted: EncryptedItemPayload,
  overrides: Partial<ServerItemRecord> = {},
): ServerItemRecord {
  return {
    id: `item-${Math.random().toString(36).slice(2, 8)}`,
    vaultId: "vault-1",
    itemType: "login",
    ...encrypted,
    version: 1,
    isFavorite: false,
    deletedAt: null,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

/** Simulates vault.tsx / TrashView.tsx decryption pattern. */
async function bulkDecrypt(
  items: ServerItemRecord[],
): Promise<{ id: string; decrypted: Record<string, unknown> }[]> {
  return Promise.all(
    items.map(async (item) => {
      try {
        const decrypted = await vaultCrypto.decryptServerItem(item);
        return { id: item.id, decrypted };
      } catch {
        return { id: item.id, decrypted: { title: "[Decryption Error]" } };
      }
    }),
  );
}

// ── Tests ─────────────────────────────────────────────────────────

describe("Vault Decryption Flow", () => {
  beforeEach(() => {
    vaultCrypto.lock();
    mockKeyStore.key = null;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vaultCrypto.lock();
    mockKeyStore.key = null;
    vi.useRealTimers();
  });

  // ── Full Lifecycle ────────────────────────────────────────────

  describe("encrypt → decrypt lifecycle", () => {
    it("round-trips a login item through server record format", async () => {
      vaultCrypto.setKey(new Uint8Array(32).fill(42));

      const plaintext = {
        title: "GitHub",
        username: "alice",
        password: "s3cret!123",
        url: "https://github.com",
        notes: "My main account",
      };

      const encrypted = await vaultCrypto.encryptItem(plaintext);
      const record = makeServerRecord(encrypted, { itemType: "login" });
      const decrypted = await vaultCrypto.decryptServerItem(record);

      expect(decrypted).toEqual(plaintext);
    });

    it("round-trips a card item", async () => {
      vaultCrypto.setKey(new Uint8Array(32).fill(42));

      const plaintext = {
        title: "Visa",
        cardNumber: "4111111111111111",
        expiry: "12/27",
        cvv: "123",
        cardholderName: "Alice Smith",
      };

      const encrypted = await vaultCrypto.encryptItem(plaintext);
      const record = makeServerRecord(encrypted, { itemType: "card" });
      const decrypted = await vaultCrypto.decryptServerItem(record);

      expect(decrypted).toEqual(plaintext);
    });

    it("round-trips a note item with unicode content", async () => {
      vaultCrypto.setKey(new Uint8Array(32).fill(42));

      const plaintext = {
        title: "Recovery Keys",
        content: "Secret key: ABCDE-12345\nBackup: \u0645\u0641\u062A\u0627\u062D \u0633\u0631\u064A",
      };

      const encrypted = await vaultCrypto.encryptItem(plaintext);
      const record = makeServerRecord(encrypted, { itemType: "note" });
      const decrypted = await vaultCrypto.decryptServerItem(record);

      expect(decrypted).toEqual(plaintext);
    });
  });

  // ── Bulk Decryption ───────────────────────────────────────────

  describe("bulk decryption", () => {
    it("decrypts multiple items successfully", async () => {
      vaultCrypto.setKey(new Uint8Array(32).fill(42));

      const items = [
        { title: "Item 1", username: "alice" },
        { title: "Item 2", username: "bob" },
        { title: "Item 3", username: "carol" },
      ];

      const records = await Promise.all(
        items.map(async (p) => makeServerRecord(await vaultCrypto.encryptItem(p))),
      );

      const results = await bulkDecrypt(records);

      expect(results).toHaveLength(3);
      expect(results[0]!.decrypted).toEqual(items[0]);
      expect(results[1]!.decrypted).toEqual(items[1]);
      expect(results[2]!.decrypted).toEqual(items[2]);
    });

    it("partial failure preserves successful items", async () => {
      vaultCrypto.setKey(new Uint8Array(32).fill(42));

      // Encrypt 2 items with correct key
      const good1 = makeServerRecord(
        await vaultCrypto.encryptItem({ title: "Good 1" }),
      );
      const good2 = makeServerRecord(
        await vaultCrypto.encryptItem({ title: "Good 2" }),
      );

      // Create a corrupted item (encrypted with different key)
      vaultCrypto.setKey(new Uint8Array(32).fill(99));
      const bad = makeServerRecord(
        await vaultCrypto.encryptItem({ title: "Bad" }),
      );

      // Decrypt all with original key
      vaultCrypto.setKey(new Uint8Array(32).fill(42));
      const results = await bulkDecrypt([good1, bad, good2]);

      expect(results[0]!.decrypted).toEqual({ title: "Good 1" });
      expect(results[1]!.decrypted).toEqual({ title: "[Decryption Error]" });
      expect(results[2]!.decrypted).toEqual({ title: "Good 2" });
    });

    it("all items fail with wrong key", async () => {
      vaultCrypto.setKey(new Uint8Array(32).fill(42));

      const records = await Promise.all(
        [1, 2, 3].map(async (i) =>
          makeServerRecord(
            await vaultCrypto.encryptItem({ title: `Item ${i}` }),
          ),
        ),
      );

      // Switch to wrong key
      vaultCrypto.setKey(new Uint8Array(32).fill(99));

      const results = await bulkDecrypt(records);

      const failedCount = results.filter(
        (r) => (r.decrypted.title as string) === "[Decryption Error]",
      ).length;

      expect(failedCount).toBe(3);
    });
  });

  // ── Bulk Failure Detection ────────────────────────────────────

  describe("bulk failure detection", () => {
    it("detects all items failed and can trigger re-lock", async () => {
      vaultCrypto.setKey(new Uint8Array(32).fill(42));

      const records = await Promise.all(
        [1, 2, 3].map(async (i) =>
          makeServerRecord(
            await vaultCrypto.encryptItem({ title: `Item ${i}` }),
          ),
        ),
      );

      // Switch to wrong key
      vaultCrypto.setKey(new Uint8Array(32).fill(99));
      expect(vaultCrypto.isUnlocked()).toBe(true);

      const results = await bulkDecrypt(records);

      const failedCount = results.filter(
        (r) => (r.decrypted.title as string) === "[Decryption Error]",
      ).length;

      // Simulate vault.tsx bulk failure detection
      if (failedCount > 0 && failedCount === records.length) {
        vaultCrypto.lock();
      }

      expect(vaultCrypto.isUnlocked()).toBe(false);
    });

    it("does not re-lock when only some items fail", async () => {
      vaultCrypto.setKey(new Uint8Array(32).fill(42));

      const good = makeServerRecord(
        await vaultCrypto.encryptItem({ title: "Good" }),
      );

      // Create a bad item with different key
      vaultCrypto.setKey(new Uint8Array(32).fill(99));
      const bad = makeServerRecord(
        await vaultCrypto.encryptItem({ title: "Bad" }),
      );

      // Decrypt with original key
      vaultCrypto.setKey(new Uint8Array(32).fill(42));

      const results = await bulkDecrypt([good, bad]);

      const failedCount = results.filter(
        (r) => (r.decrypted.title as string) === "[Decryption Error]",
      ).length;

      // Simulate vault.tsx — should NOT re-lock since not all failed
      if (failedCount > 0 && failedCount === 2) {
        vaultCrypto.lock();
      }

      expect(vaultCrypto.isUnlocked()).toBe(true);
    });

    it("handles empty item list without triggering re-lock", async () => {
      vaultCrypto.setKey(new Uint8Array(32).fill(42));

      const results = await bulkDecrypt([]);

      const failedCount = results.filter(
        (r) => (r.decrypted.title as string) === "[Decryption Error]",
      ).length;

      // failedCount === 0 AND records.length === 0
      // The condition (failedCount > 0 && failedCount === 0) is false
      expect(failedCount).toBe(0);
      expect(vaultCrypto.isUnlocked()).toBe(true);
    });
  });

  // ── Defensive Copy Resilience ─────────────────────────────────

  describe("defensive copy prevents race condition", () => {
    it("concurrent decrypt + lock does not corrupt results", async () => {
      vaultCrypto.setKey(new Uint8Array(32).fill(42));

      const records = await Promise.all(
        [1, 2, 3, 4, 5].map(async (i) =>
          makeServerRecord(
            await vaultCrypto.encryptItem({ title: `Item ${i}` }),
          ),
        ),
      );

      // Re-set same key
      vaultCrypto.setKey(new Uint8Array(32).fill(42));

      // Start decryption
      const decryptPromise = bulkDecrypt(records);

      // Lock mid-flight (simulates auto-lock race)
      vaultCrypto.lock();

      const results = await decryptPromise;

      // All should succeed because each decrypt got a defensive copy
      const successCount = results.filter(
        (r) => (r.decrypted.title as string) !== "[Decryption Error]",
      ).length;

      expect(successCount).toBe(5);
    });
  });
});
