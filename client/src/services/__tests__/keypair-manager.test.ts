// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────

// In-memory vault key store
const mockKeyStore: { key: Uint8Array | null } = { key: null };
vi.mock("@/lib/vault-keys", () => ({
  getVaultKey: () => mockKeyStore.key,
  setVaultKey: (k: Uint8Array) => {
    mockKeyStore.key = k;
  },
  clearVaultKey: () => {
    mockKeyStore.key = null;
  },
  hasVaultKey: () => mockKeyStore.key !== null,
}));

// In-memory device keys store (simulates IndexedDB)
const mockDeviceStore: Record<string, unknown> = {};
vi.mock("@/lib/device-keys", () => ({
  getDeviceId: vi.fn(async () => mockDeviceStore.deviceId ?? null),
  setDeviceId: vi.fn(async (id: string) => {
    mockDeviceStore.deviceId = id;
  }),
  getEncryptedDevicePrivateKey: vi.fn(
    async () => mockDeviceStore.encryptedDevicePrivateKey ?? null,
  ),
  setEncryptedDevicePrivateKey: vi.fn(async (val: unknown) => {
    mockDeviceStore.encryptedDevicePrivateKey = val;
  }),
  removeEncryptedDevicePrivateKey: vi.fn(async () => {
    delete mockDeviceStore.encryptedDevicePrivateKey;
  }),
  getDevicePrivateKey: vi.fn(
    async () => mockDeviceStore.devicePrivateKey ?? null,
  ),
  setDevicePrivateKey: vi.fn(async (val: unknown) => {
    mockDeviceStore.devicePrivateKey = val;
  }),
  removeDevicePrivateKey: vi.fn(async () => {
    delete mockDeviceStore.devicePrivateKey;
  }),
  getEncryptedSigningKey: vi.fn(
    async () => mockDeviceStore.encryptedSigningKey ?? null,
  ),
  setEncryptedSigningKey: vi.fn(async (val: unknown) => {
    mockDeviceStore.encryptedSigningKey = val;
  }),
  removeEncryptedSigningKey: vi.fn(async () => {
    delete mockDeviceStore.encryptedSigningKey;
  }),
}));

// Mock vault-crypto (key generation + base64 helpers)
vi.mock("@/lib/vault-crypto", () => ({
  generateX25519KeyPair: vi.fn(async () => ({
    publicKey: new Uint8Array(32).fill(0xaa),
    privateKey: new Uint8Array(32).fill(0xbb),
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

// Mock tRPC API calls
const mockTrpcMutation = vi.fn();
const mockTrpcQuery = vi.fn();
vi.mock("@/lib/api/trpc", () => ({
  trpcMutation: (...args: unknown[]) => mockTrpcMutation(...args),
  trpcQuery: (...args: unknown[]) => mockTrpcQuery(...args),
}));

// libsodium-wrappers-sumo is resolved via vitest.config.ts alias to test mock

// Import AFTER mocks
import {
  enrollDevice,
  getDecryptedPrivateKey,
  isDeviceEnrolled,
  getUserPublicKey,
  reEncryptDeviceKey,
  decryptEscrowBlob,
  backfillEscrowIfNeeded,
  adoptEscrowedDevice,
  enrollDeviceInBackground,
  isEnrollmentDeferred,
  clearEnrollmentDeferred,
} from "../keypair-manager";

// ── Tests ──────────────────────────────────────────────────────────

describe("keypair-manager", () => {
  const VAULT_KEY = new Uint8Array(32).fill(42);

  beforeEach(() => {
    mockKeyStore.key = null;
    Object.keys(mockDeviceStore).forEach((k) => delete mockDeviceStore[k]);
    vi.clearAllMocks();
  });

  // ── enrollDevice ────────────────────────────────────────────────

  describe("enrollDevice", () => {
    it("throws when vault is locked", async () => {
      await expect(enrollDevice("My Browser", "browser")).rejects.toThrow(
        "Vault must be unlocked",
      );
    });

    it("generates key pair, encrypts private key, registers with server", async () => {
      mockKeyStore.key = new Uint8Array(VAULT_KEY);
      mockTrpcMutation.mockResolvedValueOnce({ id: "device-123" });

      const result = await enrollDevice("My Browser", "browser");

      // Returns device ID from server
      expect(result.deviceId).toBe("device-123");
      expect(result.publicKey).toBeTruthy();

      // Device ID stored in IndexedDB
      expect(mockDeviceStore.deviceId).toBe("device-123");

      // Encrypted private key stored (not raw bytes)
      const stored = mockDeviceStore.encryptedDevicePrivateKey as {
        ciphertext: number[];
        nonce: number[];
        authTag: number[];
      };
      expect(stored).toBeDefined();
      expect(stored.ciphertext).toBeInstanceOf(Array);
      expect(stored.nonce).toBeInstanceOf(Array);
      expect(stored.authTag).toBeInstanceOf(Array);
      expect(stored.ciphertext.length).toBeGreaterThan(0);
      expect(stored.nonce.length).toBe(24); // XChaCha20 nonce
      expect(stored.authTag.length).toBe(16); // Poly1305 tag

      // Server was called with public key
      expect(mockTrpcMutation).toHaveBeenCalledWith(
        "device",
        "register",
        expect.objectContaining({
          deviceName: "My Browser",
          deviceType: "browser",
          publicKey: expect.any(String),
        }),
      );
    });

    it("stored encrypted key is NOT the raw private key", async () => {
      mockKeyStore.key = new Uint8Array(VAULT_KEY);
      mockTrpcMutation.mockResolvedValueOnce({ id: "device-456" });

      await enrollDevice("Test Device", "browser");

      const stored = mockDeviceStore.encryptedDevicePrivateKey as {
        ciphertext: number[];
      };
      const rawPrivateKey = Array.from(new Uint8Array(32).fill(0xbb));

      // Encrypted ciphertext must differ from raw private key
      expect(stored.ciphertext).not.toEqual(rawPrivateKey);
    });
  });

  // ── getDecryptedPrivateKey ──────────────────────────────────────

  describe("getDecryptedPrivateKey", () => {
    it("throws when vault is locked", async () => {
      await expect(getDecryptedPrivateKey()).rejects.toThrow(
        "Vault must be unlocked",
      );
    });

    it("throws when no encrypted key stored", async () => {
      mockKeyStore.key = new Uint8Array(VAULT_KEY);

      await expect(getDecryptedPrivateKey()).rejects.toThrow(
        "No encrypted device key found",
      );
    });

    it("round-trips: enroll then decrypt recovers private key", async () => {
      mockKeyStore.key = new Uint8Array(VAULT_KEY);
      mockTrpcMutation.mockResolvedValueOnce({ id: "device-789" });

      await enrollDevice("Test Device", "browser");

      // Now decrypt the stored key
      const decrypted = await getDecryptedPrivateKey();

      expect(decrypted).toBeInstanceOf(Uint8Array);
      expect(decrypted.length).toBe(32); // X25519 private key length
    });

    it("decryption fails with wrong vault key", async () => {
      mockKeyStore.key = new Uint8Array(VAULT_KEY);
      mockTrpcMutation.mockResolvedValueOnce({ id: "device-abc" });

      await enrollDevice("Test Device", "browser");

      // Change vault key (simulates wrong password)
      mockKeyStore.key = new Uint8Array(32).fill(99);

      await expect(getDecryptedPrivateKey()).rejects.toThrow(
        "Failed to decrypt device private key",
      );
    });
  });

  // ── isDeviceEnrolled ────────────────────────────────────────────

  describe("isDeviceEnrolled", () => {
    it("returns false when no device data stored", async () => {
      expect(await isDeviceEnrolled()).toBe(false);
    });

    it("returns false when only deviceId is stored", async () => {
      mockDeviceStore.deviceId = "device-123";
      expect(await isDeviceEnrolled()).toBe(false);
    });

    it("returns true when both deviceId and encrypted key are stored", async () => {
      mockDeviceStore.deviceId = "device-123";
      mockDeviceStore.encryptedDevicePrivateKey = {
        ciphertext: [1, 2, 3],
        nonce: [4, 5, 6],
        authTag: [7, 8, 9],
      };
      expect(await isDeviceEnrolled()).toBe(true);
    });
  });

  // ── getUserPublicKey ────────────────────────────────────────────

  describe("getUserPublicKey", () => {
    it("calls server with userId and returns public key info", async () => {
      const mockResult = {
        deviceId: "dev-1",
        publicKey: "base64key",
        deviceName: "Alice's Browser",
        trusted: true,
      };
      mockTrpcQuery.mockResolvedValueOnce(mockResult);

      const result = await getUserPublicKey("user-alice");

      expect(mockTrpcQuery).toHaveBeenCalledWith("device", "getPublicKey", {
        userId: "user-alice",
      });
      expect(result).toEqual(mockResult);
    });
  });

  // ── reEncryptDeviceKey ──────────────────────────────────────────

  describe("reEncryptDeviceKey", () => {
    it("does nothing when no encrypted key is stored", async () => {
      const oldKey = new Uint8Array(32).fill(1);
      const newKey = new Uint8Array(32).fill(2);

      await expect(reEncryptDeviceKey(oldKey, newKey)).resolves.not.toThrow();
    });

    it("re-encrypts with new vault key", async () => {
      // First enroll with original key
      mockKeyStore.key = new Uint8Array(VAULT_KEY);
      mockTrpcMutation.mockResolvedValueOnce({ id: "device-re" });
      await enrollDevice("Test Device", "browser");

      const originalEncrypted = { ...mockDeviceStore.encryptedDevicePrivateKey };

      // Re-encrypt with a new vault key
      const newVaultKey = new Uint8Array(32).fill(99);
      await reEncryptDeviceKey(new Uint8Array(VAULT_KEY), newVaultKey);

      const reEncrypted = mockDeviceStore.encryptedDevicePrivateKey;

      // Encrypted data should be different (different key + nonce)
      expect(reEncrypted).not.toEqual(originalEncrypted);

      // Should be decryptable with new key
      mockKeyStore.key = newVaultKey;
      const decrypted = await getDecryptedPrivateKey();
      expect(decrypted).toBeInstanceOf(Uint8Array);
      expect(decrypted.length).toBe(32);
    });

    it("re-encrypted key is NOT decryptable with old vault key", async () => {
      mockKeyStore.key = new Uint8Array(VAULT_KEY);
      mockTrpcMutation.mockResolvedValueOnce({ id: "device-re2" });
      await enrollDevice("Test Device", "browser");

      const newVaultKey = new Uint8Array(32).fill(77);
      await reEncryptDeviceKey(new Uint8Array(VAULT_KEY), newVaultKey);

      // Try to decrypt with old key — should fail
      mockKeyStore.key = new Uint8Array(VAULT_KEY);
      await expect(getDecryptedPrivateKey()).rejects.toThrow();
    });
  });

  // ── Device-key escrow ───────────────────────────────────────────

  describe("escrow", () => {
    it("enrollDevice uploads vault-key-encrypted escrow blobs", async () => {
      mockKeyStore.key = new Uint8Array(VAULT_KEY);
      mockTrpcMutation.mockResolvedValueOnce({ id: "device-esc" });

      await enrollDevice("Chrome", "browser");

      const [router, proc, payload] = mockTrpcMutation.mock.calls[0] as [
        string,
        string,
        Record<string, string>,
      ];
      expect(router).toBe("device");
      expect(proc).toBe("register");
      expect(payload.escrowedPrivateKey).toBeTruthy();
      // Escrow blob is the encrypted local form, decryptable with vault key
      const priv = await decryptEscrowBlob(
        payload.escrowedPrivateKey,
        new Uint8Array(VAULT_KEY),
      );
      expect(Array.from(priv)).toEqual(Array.from(new Uint8Array(32).fill(0xbb)));
      // ...and NOT with a wrong key
      await expect(
        decryptEscrowBlob(payload.escrowedPrivateKey, new Uint8Array(32).fill(5)),
      ).rejects.toThrow();
    });

    it("adoptEscrowedDevice stores keys + deviceId locally", async () => {
      await adoptEscrowedDevice({
        id: "dev-adopted",
        deviceName: "Chrome",
        deviceType: "browser",
        publicKey: "pk",
        signingPublicKey: "spk",
        escrowedPrivateKey: '{"ciphertext":[1],"nonce":[2],"authTag":[3]}',
        escrowedSigningPrivateKey: '{"ciphertext":[4],"nonce":[5],"authTag":[6]}',
        trusted: false,
        lastSeen: null,
      });

      expect(mockDeviceStore.deviceId).toBe("dev-adopted");
      expect(mockDeviceStore.encryptedDevicePrivateKey).toEqual({
        ciphertext: [1],
        nonce: [2],
        authTag: [3],
      });
      expect(mockDeviceStore.encryptedSigningKey).toEqual({
        ciphertext: [4],
        nonce: [5],
        authTag: [6],
      });
    });

    it("backfillEscrowIfNeeded uploads once, only when server escrow missing", async () => {
      // Enrolled locally, server row has no escrow yet
      mockKeyStore.key = new Uint8Array(VAULT_KEY);
      mockTrpcMutation.mockResolvedValueOnce({ id: "dev-bf" });
      await enrollDevice("Chrome", "browser");
      mockTrpcMutation.mockClear();

      mockTrpcQuery.mockResolvedValue([
        { id: "dev-bf", escrowedPrivateKey: null, escrowedSigningPrivateKey: null },
      ]);
      mockTrpcMutation.mockResolvedValue({ success: true });

      await backfillEscrowIfNeeded();

      expect(mockTrpcMutation).toHaveBeenCalledWith(
        "device",
        "updateEscrowedKeys",
        expect.objectContaining({
          deviceId: "dev-bf",
          escrowedPrivateKey: expect.any(String),
        }),
      );

      // Second call is a no-op (module-level once guard)
      mockTrpcMutation.mockClear();
      mockTrpcQuery.mockClear();
      await backfillEscrowIfNeeded();
      expect(mockTrpcQuery).not.toHaveBeenCalled();
      expect(mockTrpcMutation).not.toHaveBeenCalled();
    });
  });

  // ── enrollDeviceInBackground ────────────────────────────────────

  describe("enrollDeviceInBackground", () => {
    // localStorage in the test env is a stubbed vi.fn() bag — drive it
    // manually via mocked getItem/setItem.
    const storage = new Map<string, string>();
    beforeEach(() => {
      storage.clear();
      vi.mocked(localStorage.getItem).mockImplementation((k) =>
        storage.get(String(k)) ?? null,
      );
      vi.mocked(localStorage.setItem).mockImplementation((k, v) => {
        storage.set(String(k), String(v));
      });
      vi.mocked(localStorage.removeItem).mockImplementation((k) => {
        storage.delete(String(k));
      });
    });

    it("skips silently when device is already enrolled", async () => {
      mockKeyStore.key = new Uint8Array(VAULT_KEY);
      mockTrpcMutation.mockResolvedValueOnce({ id: "already-enrolled" });
      await enrollDevice("X", "browser");
      mockTrpcMutation.mockClear();
      mockTrpcQuery.mockResolvedValue([]); // no server devices → skip backfill

      const ok = await enrollDeviceInBackground();
      expect(ok).toBe(true);
      expect(mockTrpcMutation).not.toHaveBeenCalledWith(
        "device",
        "register",
        expect.anything(),
      );
      expect(isEnrollmentDeferred()).toBe(false);
    });

    it("enrolls when not yet enrolled", async () => {
      mockKeyStore.key = new Uint8Array(VAULT_KEY);
      mockTrpcMutation.mockResolvedValueOnce({ id: "fresh-device" });

      const ok = await enrollDeviceInBackground();
      expect(ok).toBe(true);
      expect(mockDeviceStore.deviceId).toBe("fresh-device");
      expect(isEnrollmentDeferred()).toBe(false);
    });

    it("retries 3× then persists deferred flag and calls onFailure", async () => {
      mockKeyStore.key = new Uint8Array(VAULT_KEY);
      mockTrpcMutation.mockRejectedValue(new Error("boom"));
      const onFailure = vi.fn();

      const ok = await enrollDeviceInBackground({ onFailure, backoffMs: 1 });

      expect(ok).toBe(false);
      expect(onFailure).toHaveBeenCalledTimes(1);
      expect(isEnrollmentDeferred()).toBe(true);
      const registerCalls = mockTrpcMutation.mock.calls
        .filter((c) => c[0] === "device" && c[1] === "register").length;
      expect(registerCalls).toBe(3);
    });

    it("clearEnrollmentDeferred() wipes the flag", () => {
      storage.set("pssmngr_device_enrollment_deferred", "1");
      expect(isEnrollmentDeferred()).toBe(true);
      clearEnrollmentDeferred();
      expect(isEnrollmentDeferred()).toBe(false);
    });
  });
});
