// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────

// Mock vault key store
const mockKeyStore: { key: Uint8Array | null } = { key: null };
vi.mock("@/lib/vault-keys", () => ({
  getVaultKey: () => mockKeyStore.key,
}));

// Mock keypair-manager
const mockGetDecryptedPrivateKey = vi.fn();
const mockGetDecryptedSigningKey = vi.fn();
const mockEnsureDeviceSigningKey = vi.fn();
const mockGetUserPublicKey = vi.fn();
vi.mock("@/services/keypair-manager", () => ({
  getDecryptedPrivateKey: (...args: unknown[]) => mockGetDecryptedPrivateKey(...args),
  getDecryptedSigningKey: (...args: unknown[]) => mockGetDecryptedSigningKey(...args),
  ensureDeviceSigningKey: (...args: unknown[]) => mockEnsureDeviceSigningKey(...args),
  getUserPublicKey: (...args: unknown[]) => mockGetUserPublicKey(...args),
}));

// Mock vault-crypto helpers
vi.mock("@/lib/vault-crypto", () => ({
  base64ToUint8: (b64: string) => {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  },
}));

// Mock tRPC API calls
const mockTrpcQuery = vi.fn();
vi.mock("@/lib/api/trpc", () => ({
  trpcQuery: (...args: unknown[]) => mockTrpcQuery(...args),
}));

// Mock @pssmngr/crypto escrow functions
const mockCreateEscrowForContact = vi.fn();
const mockDecryptEscrowAsContact = vi.fn();
const mockSerializeEscrowEnvelope = vi.fn();
const mockDeserializeEscrowEnvelope = vi.fn();
vi.mock("@pssmngr/crypto", () => ({
  createEscrowForContact: (...args: unknown[]) => mockCreateEscrowForContact(...args),
  decryptEscrowAsContact: (...args: unknown[]) => mockDecryptEscrowAsContact(...args),
  serializeEscrowEnvelope: (...args: unknown[]) => mockSerializeEscrowEnvelope(...args),
  deserializeEscrowEnvelope: (...args: unknown[]) => mockDeserializeEscrowEnvelope(...args),
}));

// Import AFTER mocks
import {
  createEscrowForTrustedContact,
  decryptEscrowFromServer,
} from "../emergency-escrow";

// ── Helpers ────────────────────────────────────────────────────────

const VAULT_KEY = new Uint8Array(32).fill(42);
const OWNER_PRIVATE_KEY = new Uint8Array(32).fill(0xaa);
const OWNER_SIGNING_KEY = new Uint8Array(64).fill(0xee);
const CONTACT_PRIVATE_KEY = new Uint8Array(32).fill(0xcc);
const CONTACT_PUBLIC_KEY_B64 = btoa(
  String.fromCharCode(...new Uint8Array(32).fill(0xdd)),
);
const OWNER_SIGNING_PUBLIC_KEY = new Uint8Array(32).fill(0xbb);
const OWNER_SIGNING_PUBLIC_KEY_B64 = btoa(
  String.fromCharCode(...OWNER_SIGNING_PUBLIC_KEY),
);

const MOCK_SERIALIZED_ESCROW = {
  escrowBlob: "blob-b64",
  escrowNonce: "nonce-b64",
  escrowAuthTag: "tag-b64",
  ephemeralPublicKey: "epk-b64",
  escrowSignature: "sig-b64",
};

// ── Tests ──────────────────────────────────────────────────────────

describe("emergency-escrow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockKeyStore.key = null;
    mockEnsureDeviceSigningKey.mockResolvedValue(undefined);
    mockGetDecryptedSigningKey.mockResolvedValue(
      new Uint8Array(OWNER_SIGNING_KEY),
    );
  });

  // ── createEscrowForTrustedContact ──────────────────────────────

  describe("createEscrowForTrustedContact", () => {
    it("throws if vault is locked (no vault key)", async () => {
      mockKeyStore.key = null;
      await expect(createEscrowForTrustedContact("contact-1")).rejects.toThrow(
        "Vault must be unlocked to create escrow",
      );
    });

    it("creates and serializes escrow envelope for a contact", async () => {
      mockKeyStore.key = VAULT_KEY;
      mockGetDecryptedPrivateKey.mockResolvedValue(new Uint8Array(OWNER_PRIVATE_KEY));
      mockGetUserPublicKey.mockResolvedValue({ publicKey: CONTACT_PUBLIC_KEY_B64 });
      mockCreateEscrowForContact.mockResolvedValue({ envelope: "mock" });
      mockSerializeEscrowEnvelope.mockResolvedValue(MOCK_SERIALIZED_ESCROW);

      const result = await createEscrowForTrustedContact("contact-1");

      // Verifies contact's public key was fetched
      expect(mockGetUserPublicKey).toHaveBeenCalledWith("contact-1");

      // Verifies escrow was created with correct args
      expect(mockCreateEscrowForContact).toHaveBeenCalledWith(
        VAULT_KEY,
        expect.any(Uint8Array), // owner private key
        expect.any(Uint8Array), // contact public key
        expect.any(Uint8Array), // signing key
      );

      // Verifies serialization
      expect(mockSerializeEscrowEnvelope).toHaveBeenCalledWith({ envelope: "mock" });

      // Returns serialized escrow
      expect(result).toEqual(MOCK_SERIALIZED_ESCROW);
    });

    it("zeros sensitive key material after use", async () => {
      const ownerKey = new Uint8Array(32).fill(0xaa);
      mockKeyStore.key = VAULT_KEY;
      mockGetDecryptedPrivateKey.mockResolvedValue(ownerKey);
      mockGetUserPublicKey.mockResolvedValue({ publicKey: CONTACT_PUBLIC_KEY_B64 });
      mockCreateEscrowForContact.mockResolvedValue({ envelope: "mock" });
      mockSerializeEscrowEnvelope.mockResolvedValue(MOCK_SERIALIZED_ESCROW);

      await createEscrowForTrustedContact("contact-1");

      // Owner private key should have been zeroed
      expect(ownerKey.every((b) => b === 0)).toBe(true);
    });

    it("provisions the device signing key before signing", async () => {
      mockKeyStore.key = VAULT_KEY;
      mockGetDecryptedPrivateKey.mockResolvedValue(new Uint8Array(OWNER_PRIVATE_KEY));
      mockGetUserPublicKey.mockResolvedValue({ publicKey: CONTACT_PUBLIC_KEY_B64 });
      mockCreateEscrowForContact.mockResolvedValue({ envelope: "mock" });
      mockSerializeEscrowEnvelope.mockResolvedValue(MOCK_SERIALIZED_ESCROW);

      await createEscrowForTrustedContact("contact-1");

      expect(mockEnsureDeviceSigningKey).toHaveBeenCalledTimes(1);
    });

    it("signs with the device's registered Ed25519 signing key", async () => {
      mockKeyStore.key = VAULT_KEY;
      mockGetDecryptedPrivateKey.mockResolvedValue(new Uint8Array(OWNER_PRIVATE_KEY));
      mockGetUserPublicKey.mockResolvedValue({ publicKey: CONTACT_PUBLIC_KEY_B64 });
      // Capture a copy of the signing key at call time (it is zeroed after).
      let capturedSigningKey: Uint8Array | null = null;
      mockCreateEscrowForContact.mockImplementation(
        (_vk: Uint8Array, _opk: Uint8Array, _cpk: Uint8Array, sk: Uint8Array) => {
          capturedSigningKey = new Uint8Array(sk);
          return Promise.resolve({ envelope: "mock" });
        },
      );
      mockSerializeEscrowEnvelope.mockResolvedValue(MOCK_SERIALIZED_ESCROW);

      await createEscrowForTrustedContact("contact-1");

      expect(mockGetDecryptedSigningKey).toHaveBeenCalledTimes(1);
      expect(capturedSigningKey).toEqual(OWNER_SIGNING_KEY);
    });

    it("zeros the signing key after use", async () => {
      const signingKey = new Uint8Array(64).fill(0xee);
      mockKeyStore.key = VAULT_KEY;
      mockGetDecryptedPrivateKey.mockResolvedValue(new Uint8Array(OWNER_PRIVATE_KEY));
      mockGetDecryptedSigningKey.mockResolvedValue(signingKey);
      mockGetUserPublicKey.mockResolvedValue({ publicKey: CONTACT_PUBLIC_KEY_B64 });
      mockCreateEscrowForContact.mockResolvedValue({ envelope: "mock" });
      mockSerializeEscrowEnvelope.mockResolvedValue(MOCK_SERIALIZED_ESCROW);

      await createEscrowForTrustedContact("contact-1");

      expect(signingKey.every((b) => b === 0)).toBe(true);
    });
  });

  // ── decryptEscrowFromServer ────────────────────────────────────

  describe("decryptEscrowFromServer", () => {
    it("throws if escrow signature is missing", async () => {
      mockTrpcQuery.mockResolvedValue({
        escrowBlob: "blob",
        escrowNonce: "nonce",
        escrowAuthTag: "tag",
        ephemeralPublicKey: "epk",
        escrowSignature: null,
      });

      await expect(
        decryptEscrowFromServer("req-1", "owner-1"),
      ).rejects.toThrow("Escrow signature is missing");
    });

    it("fetches, deserializes, and decrypts escrow blob", async () => {
      const decryptedVaultKey = new Uint8Array(32).fill(0xff);

      mockTrpcQuery.mockResolvedValue({
        escrowBlob: "blob-b64",
        escrowNonce: "nonce-b64",
        escrowAuthTag: "tag-b64",
        ephemeralPublicKey: "epk-b64",
        escrowSignature: "sig-b64",
      });
      mockDeserializeEscrowEnvelope.mockResolvedValue({ envelope: "deserialized" });
      mockGetDecryptedPrivateKey.mockResolvedValue(new Uint8Array(CONTACT_PRIVATE_KEY));
      mockGetUserPublicKey.mockResolvedValue({
        publicKey: CONTACT_PUBLIC_KEY_B64,
        signingPublicKey: OWNER_SIGNING_PUBLIC_KEY_B64,
      });
      mockDecryptEscrowAsContact.mockResolvedValue(decryptedVaultKey);

      const result = await decryptEscrowFromServer("req-1", "owner-1");

      // Verifies server fetch
      expect(mockTrpcQuery).toHaveBeenCalledWith("emergency", "getEscrowBlob", {
        requestId: "req-1",
      });

      // Verifies deserialization
      expect(mockDeserializeEscrowEnvelope).toHaveBeenCalledWith({
        escrowBlob: "blob-b64",
        escrowNonce: "nonce-b64",
        escrowAuthTag: "tag-b64",
        ephemeralPublicKey: "epk-b64",
        escrowSignature: "sig-b64",
      });

      // Verifies owner key lookup
      expect(mockGetUserPublicKey).toHaveBeenCalledWith("owner-1");

      // Verifies decryption was called
      expect(mockDecryptEscrowAsContact).toHaveBeenCalledWith(
        { envelope: "deserialized" },
        expect.any(Uint8Array),
        expect.any(Uint8Array),
      );

      expect(result).toBe(decryptedVaultKey);
    });

    it("zeros contact private key after decryption", async () => {
      const contactKey = new Uint8Array(32).fill(0xcc);
      mockTrpcQuery.mockResolvedValue({
        escrowBlob: "b",
        escrowNonce: "n",
        escrowAuthTag: "t",
        ephemeralPublicKey: "e",
        escrowSignature: "s",
      });
      mockDeserializeEscrowEnvelope.mockResolvedValue({ envelope: "d" });
      mockGetDecryptedPrivateKey.mockResolvedValue(contactKey);
      mockGetUserPublicKey.mockResolvedValue({
        publicKey: CONTACT_PUBLIC_KEY_B64,
        signingPublicKey: OWNER_SIGNING_PUBLIC_KEY_B64,
      });
      mockDecryptEscrowAsContact.mockResolvedValue(new Uint8Array(32));

      await decryptEscrowFromServer("req-1", "owner-1");

      expect(contactKey.every((b) => b === 0)).toBe(true);
    });

    it("throws when deserialization returns invalid escrow data", async () => {
      mockTrpcQuery.mockResolvedValue({
        escrowBlob: "blob-b64",
        escrowNonce: "nonce-b64",
        escrowAuthTag: "tag-b64",
        ephemeralPublicKey: "epk-b64",
        escrowSignature: "sig-b64",
      });
      mockDeserializeEscrowEnvelope.mockRejectedValue(
        new Error("Invalid escrow envelope format"),
      );

      await expect(
        decryptEscrowFromServer("req-1", "owner-1"),
      ).rejects.toThrow("Invalid escrow envelope format");
    });

    it("throws when signature verification fails during decryption", async () => {
      mockTrpcQuery.mockResolvedValue({
        escrowBlob: "blob-b64",
        escrowNonce: "nonce-b64",
        escrowAuthTag: "tag-b64",
        ephemeralPublicKey: "epk-b64",
        escrowSignature: "sig-b64",
      });
      mockDeserializeEscrowEnvelope.mockResolvedValue({ envelope: "d" });
      mockGetDecryptedPrivateKey.mockResolvedValue(new Uint8Array(CONTACT_PRIVATE_KEY));
      mockGetUserPublicKey.mockResolvedValue({
        publicKey: CONTACT_PUBLIC_KEY_B64,
        signingPublicKey: OWNER_SIGNING_PUBLIC_KEY_B64,
      });
      mockDecryptEscrowAsContact.mockRejectedValue(
        new Error("Signature verification failed"),
      );

      await expect(
        decryptEscrowFromServer("req-1", "owner-1"),
      ).rejects.toThrow("Signature verification failed");
    });

    it("fails closed when the owner has no registered signing public key", async () => {
      mockTrpcQuery.mockResolvedValue({
        escrowBlob: "blob-b64",
        escrowNonce: "nonce-b64",
        escrowAuthTag: "tag-b64",
        ephemeralPublicKey: "epk-b64",
        escrowSignature: "sig-b64",
      });
      mockDeserializeEscrowEnvelope.mockResolvedValue({ envelope: "d" });
      // Owner enrolled before signing keys existed: no signingPublicKey.
      mockGetUserPublicKey.mockResolvedValue({
        publicKey: CONTACT_PUBLIC_KEY_B64,
        signingPublicKey: null,
      });

      await expect(
        decryptEscrowFromServer("req-1", "owner-1"),
      ).rejects.toThrow("no registered signing key");
      // Decryption must never run without an authentic verification key.
      expect(mockDecryptEscrowAsContact).not.toHaveBeenCalled();
    });

    it("verifies against the owner's registered signing public key", async () => {
      mockTrpcQuery.mockResolvedValue({
        escrowBlob: "blob-b64",
        escrowNonce: "nonce-b64",
        escrowAuthTag: "tag-b64",
        ephemeralPublicKey: "epk-b64",
        escrowSignature: "sig-b64",
      });
      mockDeserializeEscrowEnvelope.mockResolvedValue({ envelope: "d" });
      mockGetDecryptedPrivateKey.mockResolvedValue(new Uint8Array(CONTACT_PRIVATE_KEY));
      mockGetUserPublicKey.mockResolvedValue({
        publicKey: CONTACT_PUBLIC_KEY_B64,
        signingPublicKey: OWNER_SIGNING_PUBLIC_KEY_B64,
      });
      mockDecryptEscrowAsContact.mockResolvedValue(new Uint8Array(32));

      await decryptEscrowFromServer("req-1", "owner-1");

      const [, , verifyKeyArg] = mockDecryptEscrowAsContact.mock.calls[0];
      // The verification key must be the owner's REGISTERED Ed25519 public
      // key, not anything derived from the owner's public X25519 key
      // (which anyone, including the server, could reproduce to forge).
      expect(new Uint8Array(verifyKeyArg as Uint8Array)).toEqual(
        OWNER_SIGNING_PUBLIC_KEY,
      );
    });

    it("throws when server returns expired escrow error", async () => {
      mockTrpcQuery.mockRejectedValue(
        new Error("Escrow has expired"),
      );

      await expect(
        decryptEscrowFromServer("req-1", "owner-1"),
      ).rejects.toThrow("Escrow has expired");
    });
  });

  // ── createEscrowForTrustedContact edge cases ──────────────────────

  describe("createEscrowForTrustedContact edge cases", () => {
    it("throws when contact public key lookup fails", async () => {
      mockKeyStore.key = VAULT_KEY;
      mockGetDecryptedPrivateKey.mockResolvedValue(new Uint8Array(OWNER_PRIVATE_KEY));
      mockGetUserPublicKey.mockRejectedValue(
        new Error("Contact public key not found"),
      );

      await expect(
        createEscrowForTrustedContact("unknown-contact"),
      ).rejects.toThrow("Contact public key not found");
    });

    it("passes the vault key as first argument to createEscrowForContact", async () => {
      mockKeyStore.key = VAULT_KEY;
      mockGetDecryptedPrivateKey.mockResolvedValue(new Uint8Array(OWNER_PRIVATE_KEY));
      mockGetUserPublicKey.mockResolvedValue({ publicKey: CONTACT_PUBLIC_KEY_B64 });
      mockCreateEscrowForContact.mockResolvedValue({ envelope: "mock" });
      mockSerializeEscrowEnvelope.mockResolvedValue(MOCK_SERIALIZED_ESCROW);

      await createEscrowForTrustedContact("contact-1");

      const [vaultKeyArg] = mockCreateEscrowForContact.mock.calls[0];
      expect(vaultKeyArg).toBe(VAULT_KEY);
    });

    it("produces escrow blob with all required fields", async () => {
      mockKeyStore.key = VAULT_KEY;
      mockGetDecryptedPrivateKey.mockResolvedValue(new Uint8Array(OWNER_PRIVATE_KEY));
      mockGetUserPublicKey.mockResolvedValue({ publicKey: CONTACT_PUBLIC_KEY_B64 });
      mockCreateEscrowForContact.mockResolvedValue({ envelope: "mock" });
      mockSerializeEscrowEnvelope.mockResolvedValue(MOCK_SERIALIZED_ESCROW);

      const result = await createEscrowForTrustedContact("contact-1");

      expect(result).toHaveProperty("escrowBlob");
      expect(result).toHaveProperty("escrowNonce");
      expect(result).toHaveProperty("escrowAuthTag");
      expect(result).toHaveProperty("ephemeralPublicKey");
      expect(result).toHaveProperty("escrowSignature");
    });
  });
});
