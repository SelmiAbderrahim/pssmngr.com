// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock vault-keys module (in-memory key store)
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

// Mock vault-crypto (key derivation)
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

// Mock device-keys (IndexedDB-based, not available in jsdom)
vi.mock("@/lib/device-keys", () => ({
  getSecretKey: vi.fn(async () => new Uint8Array(16).fill(7)),
}));

// libsodium-wrappers-sumo is resolved via vitest.config.ts alias to test mock

// Import AFTER mocks are set up
import { vaultCrypto, type EncryptedItemPayload } from "../vault-crypto";

describe("VaultCryptoService", () => {
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

  // ── Lock / Unlock ──────────────────────────────────────────────

  describe("lock/unlock state", () => {
    it("starts locked", () => {
      expect(vaultCrypto.isUnlocked()).toBe(false);
    });

    it("setKey unlocks the vault", () => {
      vaultCrypto.setKey(new Uint8Array(32).fill(1));
      expect(vaultCrypto.isUnlocked()).toBe(true);
    });

    it("lock clears the key", () => {
      vaultCrypto.setKey(new Uint8Array(32).fill(1));
      vaultCrypto.lock();
      expect(vaultCrypto.isUnlocked()).toBe(false);
    });

    it("lock zeros the key from memory", () => {
      const key = new Uint8Array(32).fill(99);
      vaultCrypto.setKey(key);
      vaultCrypto.lock();
      expect(mockKeyStore.key).toBeNull();
    });

    it("unlock derives key from master password", async () => {
      const salt = new Uint8Array(16).fill(5);
      const secretKey = new Uint8Array(16).fill(7);
      await vaultCrypto.unlock("master-password", salt, secretKey);
      expect(vaultCrypto.isUnlocked()).toBe(true);
    });

    it("unlock throws when no secret key available", async () => {
      const { getSecretKey } = await import("@/lib/device-keys");
      vi.mocked(getSecretKey).mockResolvedValueOnce(null);

      const salt = new Uint8Array(16).fill(5);
      await expect(
        vaultCrypto.unlock("password", salt),
      ).rejects.toThrow("Secret key not found");
    });
  });

  // ── Verification Blob ──────────────────────────────────────────

  describe("verification blob", () => {
    it("createVerificationBlob returns a non-empty base64 string", async () => {
      vaultCrypto.setKey(new Uint8Array(32).fill(42));
      const blob = await vaultCrypto.createVerificationBlob();
      expect(typeof blob).toBe("string");
      expect(blob.length).toBeGreaterThan(0);
      expect(blob).toMatch(/^[A-Za-z0-9+/=]+$/);
    });

    it("verifyVaultKey succeeds with correct key", async () => {
      vaultCrypto.setKey(new Uint8Array(32).fill(42));
      const blob = await vaultCrypto.createVerificationBlob();
      // Verify with same key — should not throw
      await expect(vaultCrypto.verifyVaultKey(blob)).resolves.toBeUndefined();
    });

    it("verifyVaultKey throws with wrong key", async () => {
      vaultCrypto.setKey(new Uint8Array(32).fill(42));
      const blob = await vaultCrypto.createVerificationBlob();

      // Switch to a different key
      vaultCrypto.setKey(new Uint8Array(32).fill(99));
      await expect(vaultCrypto.verifyVaultKey(blob)).rejects.toThrow();
    });

    it("verifyVaultKey rejects a valid ciphertext whose content is not the sentinel (same length)", async () => {
      vaultCrypto.setKey(new Uint8Array(32).fill(42));
      // Same length as the sentinel "pssmngr-vault-ok" but different bytes:
      // decryption succeeds, the constant-time content check must fail.
      const forged = new TextEncoder().encode("pssmngr-vault-no");
      const blob = await vaultCrypto.encryptBlob(forged);
      await expect(vaultCrypto.verifyVaultKey(blob)).rejects.toThrow(
        "Verification blob content mismatch",
      );
    });

    it("verifyVaultKey rejects a valid ciphertext with different length content", async () => {
      vaultCrypto.setKey(new Uint8Array(32).fill(42));
      const forgedShort = await vaultCrypto.encryptBlob(
        new TextEncoder().encode("x"),
      );
      const forgedLong = await vaultCrypto.encryptBlob(
        new TextEncoder().encode("pssmngr-vault-ok-but-longer"),
      );
      await expect(vaultCrypto.verifyVaultKey(forgedShort)).rejects.toThrow(
        "Verification blob content mismatch",
      );
      await expect(vaultCrypto.verifyVaultKey(forgedLong)).rejects.toThrow(
        "Verification blob content mismatch",
      );
    });

    it("unlock succeeds with correct verificationBlob", async () => {
      // Create a verification blob with key derived from mock
      vaultCrypto.setKey(new Uint8Array(32).fill(42));
      const blob = await vaultCrypto.createVerificationBlob();
      vaultCrypto.lock();

      // Unlock with verification — mock deriveVaultKey returns fill(42)
      const salt = new Uint8Array(16).fill(5);
      const secretKey = new Uint8Array(16).fill(7);
      await vaultCrypto.unlock("correct-password", salt, secretKey, blob);
      expect(vaultCrypto.isUnlocked()).toBe(true);
    });

    it("unlock throws 'Wrong master password' with bad verificationBlob", async () => {
      // Create a verification blob with a DIFFERENT key
      vaultCrypto.setKey(new Uint8Array(32).fill(99));
      const blob = await vaultCrypto.createVerificationBlob();
      vaultCrypto.lock();

      // Unlock — mock deriveVaultKey returns fill(42), blob was made with fill(99)
      const salt = new Uint8Array(16).fill(5);
      const secretKey = new Uint8Array(16).fill(7);
      await expect(
        vaultCrypto.unlock("wrong-password", salt, secretKey, blob),
      ).rejects.toThrow("Wrong master password");
    });

    it("vault remains locked after failed verification", async () => {
      vaultCrypto.setKey(new Uint8Array(32).fill(99));
      const blob = await vaultCrypto.createVerificationBlob();
      vaultCrypto.lock();

      const salt = new Uint8Array(16).fill(5);
      const secretKey = new Uint8Array(16).fill(7);
      try {
        await vaultCrypto.unlock("wrong-password", salt, secretKey, blob);
      } catch {
        // Expected
      }
      expect(vaultCrypto.isUnlocked()).toBe(false);
    });

    it("unlock with null verificationBlob skips verification (backward compat)", async () => {
      const salt = new Uint8Array(16).fill(5);
      const secretKey = new Uint8Array(16).fill(7);
      await vaultCrypto.unlock("any-password", salt, secretKey, null);
      expect(vaultCrypto.isUnlocked()).toBe(true);
    });

    it("unlock with undefined verificationBlob skips verification", async () => {
      const salt = new Uint8Array(16).fill(5);
      const secretKey = new Uint8Array(16).fill(7);
      await vaultCrypto.unlock("any-password", salt, secretKey, undefined);
      expect(vaultCrypto.isUnlocked()).toBe(true);
    });
  });

  // ── Subscribe / Notify ────────────────────────────────────────

  describe("subscribe", () => {
    it("notifies listeners on unlock", () => {
      const listener = vi.fn();
      const unsub = vaultCrypto.subscribe(listener);

      vaultCrypto.setKey(new Uint8Array(32).fill(1));
      expect(listener).toHaveBeenCalledWith(true);

      unsub();
    });

    it("notifies listeners on lock", () => {
      vaultCrypto.setKey(new Uint8Array(32).fill(1));

      const listener = vi.fn();
      const unsub = vaultCrypto.subscribe(listener);

      vaultCrypto.lock();
      expect(listener).toHaveBeenCalledWith(false);

      unsub();
    });

    it("unsubscribe stops notifications", () => {
      const listener = vi.fn();
      const unsub = vaultCrypto.subscribe(listener);
      unsub();

      vaultCrypto.setKey(new Uint8Array(32).fill(1));
      expect(listener).not.toHaveBeenCalled();
    });

    it("supports multiple listeners", () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      const unsub1 = vaultCrypto.subscribe(listener1);
      const unsub2 = vaultCrypto.subscribe(listener2);

      vaultCrypto.setKey(new Uint8Array(32).fill(1));
      expect(listener1).toHaveBeenCalledWith(true);
      expect(listener2).toHaveBeenCalledWith(true);

      unsub1();
      unsub2();
    });
  });

  // ── Auto-lock ─────────────────────────────────────────────────

  describe("auto-lock", () => {
    it("auto-locks after timeout", () => {
      vaultCrypto.setKey(new Uint8Array(32).fill(1));
      expect(vaultCrypto.isUnlocked()).toBe(true);

      vi.advanceTimersByTime(15 * 60 * 1000);
      expect(vaultCrypto.isUnlocked()).toBe(false);
    });

    it("resetAutoLock extends the timer", () => {
      vaultCrypto.setKey(new Uint8Array(32).fill(1));

      vi.advanceTimersByTime(14 * 60 * 1000);
      expect(vaultCrypto.isUnlocked()).toBe(true);

      vaultCrypto.resetAutoLock();

      vi.advanceTimersByTime(14 * 60 * 1000);
      expect(vaultCrypto.isUnlocked()).toBe(true);

      vi.advanceTimersByTime(1 * 60 * 1000);
      expect(vaultCrypto.isUnlocked()).toBe(false);
    });

    it("setAutoLockTimeout changes the duration", () => {
      vaultCrypto.setKey(new Uint8Array(32).fill(1));
      vaultCrypto.setAutoLockTimeout(5000);

      vi.advanceTimersByTime(4000);
      expect(vaultCrypto.isUnlocked()).toBe(true);

      vi.advanceTimersByTime(1000);
      expect(vaultCrypto.isUnlocked()).toBe(false);
    });

    it("setAutoLockTimeout(0) disables auto-lock", () => {
      vaultCrypto.setKey(new Uint8Array(32).fill(1));
      vaultCrypto.setAutoLockTimeout(0);

      vi.advanceTimersByTime(60 * 60 * 1000);
      expect(vaultCrypto.isUnlocked()).toBe(true);
    });

    it("resetAutoLock does nothing when locked", () => {
      expect(() => vaultCrypto.resetAutoLock()).not.toThrow();
    });
  });

  // ── Encrypt / Decrypt Round-Trip ──────────────────────────────

  describe("encrypt/decrypt", () => {
    beforeEach(() => {
      vaultCrypto.setKey(new Uint8Array(32).fill(42));
    });

    it("round-trips plaintext through encrypt/decrypt", async () => {
      const plaintext = { title: "GitHub", username: "alice", password: "s3cret" };
      const encrypted = await vaultCrypto.encryptItem(plaintext);
      const decrypted = await vaultCrypto.decryptItem(encrypted);
      expect(decrypted).toEqual(plaintext);
    });

    it("encrypted payload has all required fields", async () => {
      const encrypted = await vaultCrypto.encryptItem({ title: "Test" });
      expect(encrypted).toHaveProperty("ciphertext");
      expect(encrypted).toHaveProperty("nonce");
      expect(encrypted).toHaveProperty("authTag");
      expect(encrypted).toHaveProperty("wrappedDataKey");
      expect(encrypted).toHaveProperty("wrappedDataKeyNonce");
      expect(encrypted).toHaveProperty("wrappedDataKeyAuthTag");
    });

    it("encrypted fields are non-empty base64 strings", async () => {
      const encrypted = await vaultCrypto.encryptItem({ title: "Test" });
      for (const field of Object.values(encrypted)) {
        expect(typeof field).toBe("string");
        expect(field.length).toBeGreaterThan(0);
        expect(field).toMatch(/^[A-Za-z0-9+/=]+$/);
      }
    });

    it("encrypting same plaintext twice produces different ciphertext", async () => {
      const plaintext = { title: "Same Data" };
      const enc1 = await vaultCrypto.encryptItem(plaintext);
      const enc2 = await vaultCrypto.encryptItem(plaintext);
      expect(enc1.nonce).not.toBe(enc2.nonce);
      expect(enc1.ciphertext).not.toBe(enc2.ciphertext);
    });

    it("each item gets a unique wrapped data key", async () => {
      const enc1 = await vaultCrypto.encryptItem({ a: "1" });
      const enc2 = await vaultCrypto.encryptItem({ b: "2" });
      expect(enc1.wrappedDataKey).not.toBe(enc2.wrappedDataKey);
    });

    it("decryptItems decrypts multiple items in parallel", async () => {
      const items = [{ title: "Item 1" }, { title: "Item 2" }, { title: "Item 3" }];
      const encrypted = await Promise.all(
        items.map((item) => vaultCrypto.encryptItem(item)),
      );
      const decrypted = await vaultCrypto.decryptItems(encrypted);
      expect(decrypted).toEqual(items);
    });

    it("decryptServerItem extracts and decrypts from server record", async () => {
      const plaintext = { title: "Server Item" };
      const encrypted = await vaultCrypto.encryptItem(plaintext);

      const serverRecord = {
        id: "item-1",
        vaultId: "vault-1",
        itemType: "login",
        ...encrypted,
        version: 1,
        isFavorite: false,
        deletedAt: null,
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
      };

      const decrypted = await vaultCrypto.decryptServerItem(serverRecord);
      expect(decrypted).toEqual(plaintext);
    });
  });

  // ── Operations When Locked ────────────────────────────────────

  describe("operations fail when locked", () => {
    it("encryptItem throws when locked", async () => {
      await expect(
        vaultCrypto.encryptItem({ title: "Test" }),
      ).rejects.toThrow("Vault is locked");
    });

    it("decryptItem throws when locked", async () => {
      const payload: EncryptedItemPayload = {
        ciphertext: "dGVzdA==",
        nonce: "dGVzdA==",
        authTag: "dGVzdA==",
        wrappedDataKey: "dGVzdA==",
        wrappedDataKeyNonce: "dGVzdA==",
        wrappedDataKeyAuthTag: "dGVzdA==",
      };
      await expect(vaultCrypto.decryptItem(payload)).rejects.toThrow(
        "Vault is locked",
      );
    });

    it("encryptBlob throws when locked", async () => {
      await expect(
        vaultCrypto.encryptBlob(new Uint8Array([1, 2, 3])),
      ).rejects.toThrow("Vault is locked");
    });

    it("decryptBlob throws when locked", async () => {
      await expect(vaultCrypto.decryptBlob("dGVzdA==")).rejects.toThrow(
        "Vault is locked",
      );
    });
  });

  // ── Blob Encrypt / Decrypt ────────────────────────────────────

  describe("blob encrypt/decrypt", () => {
    beforeEach(() => {
      vaultCrypto.setKey(new Uint8Array(32).fill(42));
    });

    it("round-trips blob through encrypt/decrypt", async () => {
      const data = new Uint8Array([1, 2, 3, 4, 5, 100, 200, 255]);
      const encrypted = await vaultCrypto.encryptBlob(data);
      const decrypted = await vaultCrypto.decryptBlob(encrypted);
      expect(decrypted).toEqual(data);
    });

    it("encrypted blob is a base64 string", async () => {
      const data = new Uint8Array([10, 20, 30]);
      const encrypted = await vaultCrypto.encryptBlob(data);
      expect(typeof encrypted).toBe("string");
      expect(encrypted.length).toBeGreaterThan(0);
    });

    it("encrypted blob contains nonce prefix", async () => {
      const data = new Uint8Array([1, 2, 3]);
      const encrypted = await vaultCrypto.encryptBlob(data);
      const binary = atob(encrypted);
      const packed = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        packed[i] = binary.charCodeAt(i);
      }
      // nonce (24) + data (3) + tag (16) = 43 bytes minimum
      expect(packed.length).toBeGreaterThanOrEqual(43);
    });
  });

  // ── Decrypt Resilience ────────────────────────────────────────

  describe("decrypt resilience", () => {
    it("decrypt succeeds even if vault key is cleared after getting copy", async () => {
      // Encrypt with key A
      vaultCrypto.setKey(new Uint8Array(32).fill(42));
      const encrypted = await vaultCrypto.encryptItem({ title: "Resilient" });

      // Re-set same key (simulates fresh unlock)
      vaultCrypto.setKey(new Uint8Array(32).fill(42));

      // Start decryption — getVaultKey returns a defensive copy
      const decryptPromise = vaultCrypto.decryptItem(encrypted);

      // Clear key mid-flight (simulates auto-lock race)
      vaultCrypto.lock();

      // Decryption should still succeed because it holds a copy
      const result = await decryptPromise;
      expect(result).toEqual({ title: "Resilient" });
    });

    it("decryptItem with wrong key throws descriptive error", async () => {
      // Encrypt with key A
      vaultCrypto.setKey(new Uint8Array(32).fill(42));
      const encrypted = await vaultCrypto.encryptItem({ title: "Secret" });

      // Set different key B
      vaultCrypto.setKey(new Uint8Array(32).fill(99));

      await expect(vaultCrypto.decryptItem(encrypted)).rejects.toThrow(
        "Failed to unwrap data key",
      );
    });

    it("decryptItem with zeroed key throws descriptive error", async () => {
      // Encrypt with valid key
      vaultCrypto.setKey(new Uint8Array(32).fill(42));
      const encrypted = await vaultCrypto.encryptItem({ title: "Secret" });

      // Set all-zero key (simulates the old race condition result)
      vaultCrypto.setKey(new Uint8Array(32).fill(0));

      await expect(vaultCrypto.decryptItem(encrypted)).rejects.toThrow(
        "Failed to unwrap data key",
      );
    });

    it("decryptServerItem with wrong key throws descriptive error", async () => {
      vaultCrypto.setKey(new Uint8Array(32).fill(42));
      const encrypted = await vaultCrypto.encryptItem({ title: "Server" });

      const serverRecord = {
        id: "item-1",
        vaultId: "vault-1",
        itemType: "login",
        ...encrypted,
        version: 1,
        isFavorite: false,
        deletedAt: null,
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
      };

      // Set wrong key
      vaultCrypto.setKey(new Uint8Array(32).fill(77));

      await expect(
        vaultCrypto.decryptServerItem(serverRecord),
      ).rejects.toThrow("Failed to unwrap data key");
    });

    it("decryptBlob with wrong key throws descriptive error", async () => {
      vaultCrypto.setKey(new Uint8Array(32).fill(42));
      const encrypted = await vaultCrypto.encryptBlob(
        new Uint8Array([1, 2, 3]),
      );

      vaultCrypto.setKey(new Uint8Array(32).fill(99));

      await expect(vaultCrypto.decryptBlob(encrypted)).rejects.toThrow(
        "Failed to decrypt blob",
      );
    });
  });

  // ── Production console hygiene (no crypto-failure leakage) ─────
  //
  // Raw crypto errors / ciphertext structure must never reach the console,
  // while the generic, fail-closed errors must still be thrown. See
  // vault-crypto.ts unwrap/decrypt catch blocks.

  describe("production console hygiene", () => {
    let errorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
      errorSpy.mockRestore();
      vi.unstubAllEnvs();
    });

    it("does NOT log unwrap-failure internals when not in DEV (fail-closed)", async () => {
      vi.stubEnv("DEV", false);

      vaultCrypto.setKey(new Uint8Array(32).fill(42));
      const encrypted = await vaultCrypto.encryptItem({ title: "Secret" });

      // Wrong key forces the unwrap catch block.
      vaultCrypto.setKey(new Uint8Array(32).fill(99));

      await expect(vaultCrypto.decryptItem(encrypted)).rejects.toThrow(
        "Failed to unwrap data key",
      );
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it("does NOT log blob-decrypt-failure internals when not in DEV", async () => {
      vi.stubEnv("DEV", false);

      vaultCrypto.setKey(new Uint8Array(32).fill(42));
      const encrypted = await vaultCrypto.encryptBlob(new Uint8Array([1, 2, 3]));

      vaultCrypto.setKey(new Uint8Array(32).fill(99));

      await expect(vaultCrypto.decryptBlob(encrypted)).rejects.toThrow(
        "Failed to decrypt blob",
      );
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it("does NOT log unwrap-failure diagnostics when in DEV", async () => {
      vi.stubEnv("DEV", true);

      vaultCrypto.setKey(new Uint8Array(32).fill(42));
      const encrypted = await vaultCrypto.encryptItem({ title: "Secret" });

      vaultCrypto.setKey(new Uint8Array(32).fill(99));

      await expect(vaultCrypto.decryptItem(encrypted)).rejects.toThrow(
        "Failed to unwrap data key",
      );
      expect(errorSpy).not.toHaveBeenCalled();
    });
  });
});
