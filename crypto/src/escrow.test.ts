// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Emergency Escrow — Cryptographic Tests
 *
 * Verifies:
 *  - Escrow blob created for each contact
 *  - Blob unusable before correct keys
 *  - Contact can decrypt after creation
 *  - Domain separation from sharing envelopes
 *  - Serialization round-trip
 *  - Signature verification rejects tampering
 *  - Invalid key sizes rejected
 */

import { describe, it, expect } from "vitest";
import {
  createEscrowForContact,
  decryptEscrowAsContact,
  serializeEscrowEnvelope,
  deserializeEscrowEnvelope,
} from "./escrow";
import {
  generateX25519KeyPair,
  generateEd25519KeyPair,
  deriveSharedSecret,
  sign,
} from "./keypair";
import { wrapKeyForRecipient, unwrapKeyFromEnvelope } from "./sharing";
import { CRYPTO_LENGTHS, HKDF_CONTEXTS } from "./types";
import type { EscrowEnvelope } from "./types";
import sodium from "libsodium-wrappers-sumo";

// Generate a random vault key (32 bytes)
function randomVaultKey(): Uint8Array {
  return sodium.randombytes_buf(CRYPTO_LENGTHS.vaultKey);
}

/**
 * Construct a LEGACY (v1) escrow envelope as the pre-F3 code did: the signature
 * covers the plain concatenation with no contact binding. Used to prove v1
 * envelopes still decrypt after the recipient-binding upgrade (no migration).
 */
async function makeLegacyV1Escrow(
  vaultKey: Uint8Array,
  ownerX25519PrivateKey: Uint8Array,
  contactX25519PublicKey: Uint8Array,
  ownerEd25519PrivateKey: Uint8Array,
): Promise<EscrowEnvelope> {
  await sodium.ready;
  const sharedSecret = await deriveSharedSecret(
    ownerX25519PrivateKey,
    contactX25519PublicKey,
  );
  const info = new TextEncoder().encode(HKDF_CONTEXTS.escrow);
  const wrapKey = new Uint8Array(sodium.crypto_generichash(32, info, sharedSecret));
  const nonce = sodium.randombytes_buf(
    sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES,
  );
  const combined = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    vaultKey,
    null,
    null,
    nonce,
    wrapKey,
  );
  const tagLen = sodium.crypto_aead_xchacha20poly1305_ietf_ABYTES;
  const wrappedVaultKey = new Uint8Array(combined.slice(0, -tagLen));
  const authTag = new Uint8Array(combined.slice(-tagLen));
  const ephemeralPublicKey = new Uint8Array(
    sodium.crypto_scalarmult_base(ownerX25519PrivateKey),
  );
  const v1Payload = new Uint8Array(
    wrappedVaultKey.length + nonce.length + authTag.length + ephemeralPublicKey.length,
  );
  let off = 0;
  v1Payload.set(wrappedVaultKey, off); off += wrappedVaultKey.length;
  v1Payload.set(nonce, off); off += nonce.length;
  v1Payload.set(authTag, off); off += authTag.length;
  v1Payload.set(ephemeralPublicKey, off);
  const signature = await sign(v1Payload, ownerEd25519PrivateKey);
  return {
    wrappedVaultKey,
    nonce: new Uint8Array(nonce),
    authTag,
    ephemeralPublicKey,
    signature,
  };
}

describe("escrow", () => {
  describe("createEscrowForContact", () => {
    it("creates an escrow envelope with correct field sizes", async () => {
      const ownerX25519 = await generateX25519KeyPair();
      const ownerEd25519 = await generateEd25519KeyPair();
      const contactX25519 = await generateX25519KeyPair();
      const vaultKey = randomVaultKey();

      const envelope = await createEscrowForContact(
        vaultKey,
        ownerX25519.privateKey,
        contactX25519.publicKey,
        ownerEd25519.privateKey,
      );

      expect(envelope.wrappedVaultKey).toBeInstanceOf(Uint8Array);
      expect(envelope.wrappedVaultKey.length).toBe(CRYPTO_LENGTHS.vaultKey); // ciphertext same length as plaintext
      expect(envelope.nonce.length).toBe(CRYPTO_LENGTHS.nonce); // 24 bytes
      expect(envelope.authTag.length).toBe(CRYPTO_LENGTHS.authTag); // 16 bytes
      expect(envelope.ephemeralPublicKey.length).toBe(CRYPTO_LENGTHS.x25519PublicKey); // 32 bytes
      expect(envelope.signature.length).toBe(CRYPTO_LENGTHS.ed25519Signature); // 64 bytes
    });

    it("produces different envelopes for different contacts", async () => {
      const ownerX25519 = await generateX25519KeyPair();
      const ownerEd25519 = await generateEd25519KeyPair();
      const contact1 = await generateX25519KeyPair();
      const contact2 = await generateX25519KeyPair();
      const vaultKey = randomVaultKey();

      const env1 = await createEscrowForContact(
        vaultKey,
        ownerX25519.privateKey,
        contact1.publicKey,
        ownerEd25519.privateKey,
      );

      const env2 = await createEscrowForContact(
        vaultKey,
        ownerX25519.privateKey,
        contact2.publicKey,
        ownerEd25519.privateKey,
      );

      // Different contacts → different ECDH → different wrapped keys
      expect(Buffer.from(env1.wrappedVaultKey)).not.toEqual(
        Buffer.from(env2.wrappedVaultKey),
      );
    });

    it("produces different nonces each time (random)", async () => {
      const ownerX25519 = await generateX25519KeyPair();
      const ownerEd25519 = await generateEd25519KeyPair();
      const contactX25519 = await generateX25519KeyPair();
      const vaultKey = randomVaultKey();

      const env1 = await createEscrowForContact(
        vaultKey,
        ownerX25519.privateKey,
        contactX25519.publicKey,
        ownerEd25519.privateKey,
      );

      const env2 = await createEscrowForContact(
        vaultKey,
        ownerX25519.privateKey,
        contactX25519.publicKey,
        ownerEd25519.privateKey,
      );

      // Random nonces → envelopes differ even for same keys
      expect(Buffer.from(env1.nonce)).not.toEqual(Buffer.from(env2.nonce));
    });

    it("rejects wrong vault key length", async () => {
      const ownerX25519 = await generateX25519KeyPair();
      const ownerEd25519 = await generateEd25519KeyPair();
      const contactX25519 = await generateX25519KeyPair();

      await expect(
        createEscrowForContact(
          new Uint8Array(16), // too short
          ownerX25519.privateKey,
          contactX25519.publicKey,
          ownerEd25519.privateKey,
        ),
      ).rejects.toThrow("Vault key must be 32 bytes");
    });

    it("rejects wrong owner private key length", async () => {
      const ownerEd25519 = await generateEd25519KeyPair();
      const contactX25519 = await generateX25519KeyPair();
      const vaultKey = randomVaultKey();

      await expect(
        createEscrowForContact(
          vaultKey,
          new Uint8Array(16), // wrong size
          contactX25519.publicKey,
          ownerEd25519.privateKey,
        ),
      ).rejects.toThrow("Owner X25519 private key must be 32 bytes");
    });

    it("rejects wrong contact public key length", async () => {
      const ownerX25519 = await generateX25519KeyPair();
      const ownerEd25519 = await generateEd25519KeyPair();
      const vaultKey = randomVaultKey();

      await expect(
        createEscrowForContact(
          vaultKey,
          ownerX25519.privateKey,
          new Uint8Array(16), // wrong size
          ownerEd25519.privateKey,
        ),
      ).rejects.toThrow("Contact X25519 public key must be 32 bytes");
    });

    it("rejects wrong signing key length", async () => {
      const ownerX25519 = await generateX25519KeyPair();
      const contactX25519 = await generateX25519KeyPair();
      const vaultKey = randomVaultKey();

      await expect(
        createEscrowForContact(
          vaultKey,
          ownerX25519.privateKey,
          contactX25519.publicKey,
          new Uint8Array(32), // Ed25519 private key is 64 bytes
        ),
      ).rejects.toThrow("Signing key must be 64 bytes");
    });
  });

  describe("decryptEscrowAsContact", () => {
    it("contact can decrypt the escrow to recover the vault key", async () => {
      const ownerX25519 = await generateX25519KeyPair();
      const ownerEd25519 = await generateEd25519KeyPair();
      const contactX25519 = await generateX25519KeyPair();
      const vaultKey = randomVaultKey();

      const envelope = await createEscrowForContact(
        vaultKey,
        ownerX25519.privateKey,
        contactX25519.publicKey,
        ownerEd25519.privateKey,
      );

      const decrypted = await decryptEscrowAsContact(
        envelope,
        contactX25519.privateKey,
        ownerEd25519.publicKey,
      );

      expect(Buffer.from(decrypted)).toEqual(Buffer.from(vaultKey));
    });

    it("wrong contact private key fails to decrypt", async () => {
      const ownerX25519 = await generateX25519KeyPair();
      const ownerEd25519 = await generateEd25519KeyPair();
      const contactX25519 = await generateX25519KeyPair();
      const wrongContact = await generateX25519KeyPair();
      const vaultKey = randomVaultKey();

      const envelope = await createEscrowForContact(
        vaultKey,
        ownerX25519.privateKey,
        contactX25519.publicKey,
        ownerEd25519.privateKey,
      );

      // F3: the escrow signature is bound to the intended contact's public key,
      // so a wrong contact key is rejected at signature verification (earlier
      // than the previous ECDH-decryption failure).
      await expect(
        decryptEscrowAsContact(
          envelope,
          wrongContact.privateKey,
          ownerEd25519.publicKey,
        ),
      ).rejects.toThrow("Escrow envelope signature verification failed");
    });

    it("wrong owner signing public key fails signature verification", async () => {
      const ownerX25519 = await generateX25519KeyPair();
      const ownerEd25519 = await generateEd25519KeyPair();
      const wrongEd25519 = await generateEd25519KeyPair();
      const contactX25519 = await generateX25519KeyPair();
      const vaultKey = randomVaultKey();

      const envelope = await createEscrowForContact(
        vaultKey,
        ownerX25519.privateKey,
        contactX25519.publicKey,
        ownerEd25519.privateKey,
      );

      await expect(
        decryptEscrowAsContact(
          envelope,
          contactX25519.privateKey,
          wrongEd25519.publicKey, // wrong signing key
        ),
      ).rejects.toThrow("Escrow envelope signature verification failed");
    });

    it("tampered wrappedVaultKey fails signature verification", async () => {
      const ownerX25519 = await generateX25519KeyPair();
      const ownerEd25519 = await generateEd25519KeyPair();
      const contactX25519 = await generateX25519KeyPair();
      const vaultKey = randomVaultKey();

      const envelope = await createEscrowForContact(
        vaultKey,
        ownerX25519.privateKey,
        contactX25519.publicKey,
        ownerEd25519.privateKey,
      );

      // Tamper with the wrapped vault key
      const tampered: EscrowEnvelope = {
        ...envelope,
        wrappedVaultKey: new Uint8Array(envelope.wrappedVaultKey.length).fill(0xFF),
      };

      await expect(
        decryptEscrowAsContact(
          tampered,
          contactX25519.privateKey,
          ownerEd25519.publicKey,
        ),
      ).rejects.toThrow("signature verification failed");
    });

    it("tampered nonce fails signature verification", async () => {
      const ownerX25519 = await generateX25519KeyPair();
      const ownerEd25519 = await generateEd25519KeyPair();
      const contactX25519 = await generateX25519KeyPair();
      const vaultKey = randomVaultKey();

      const envelope = await createEscrowForContact(
        vaultKey,
        ownerX25519.privateKey,
        contactX25519.publicKey,
        ownerEd25519.privateKey,
      );

      const tampered: EscrowEnvelope = {
        ...envelope,
        nonce: new Uint8Array(envelope.nonce.length).fill(0xAA),
      };

      await expect(
        decryptEscrowAsContact(
          tampered,
          contactX25519.privateKey,
          ownerEd25519.publicKey,
        ),
      ).rejects.toThrow("signature verification failed");
    });

    it("rejects wrong contact private key length", async () => {
      const ownerX25519 = await generateX25519KeyPair();
      const ownerEd25519 = await generateEd25519KeyPair();
      const contactX25519 = await generateX25519KeyPair();
      const vaultKey = randomVaultKey();

      const envelope = await createEscrowForContact(
        vaultKey,
        ownerX25519.privateKey,
        contactX25519.publicKey,
        ownerEd25519.privateKey,
      );

      await expect(
        decryptEscrowAsContact(
          envelope,
          new Uint8Array(16), // wrong size
          ownerEd25519.publicKey,
        ),
      ).rejects.toThrow("Contact X25519 private key must be 32 bytes");
    });

    it("rejects wrong owner public key length", async () => {
      const ownerX25519 = await generateX25519KeyPair();
      const ownerEd25519 = await generateEd25519KeyPair();
      const contactX25519 = await generateX25519KeyPair();
      const vaultKey = randomVaultKey();

      const envelope = await createEscrowForContact(
        vaultKey,
        ownerX25519.privateKey,
        contactX25519.publicKey,
        ownerEd25519.privateKey,
      );

      await expect(
        decryptEscrowAsContact(
          envelope,
          contactX25519.privateKey,
          new Uint8Array(16), // wrong size
        ),
      ).rejects.toThrow("Owner Ed25519 public key must be 32 bytes");
    });
  });

  describe("domain separation", () => {
    it("escrow context differs from sharing context", () => {
      expect(HKDF_CONTEXTS.escrow).toBe("pssmngr-escrow-v1");
      expect(HKDF_CONTEXTS.share).toBe("pssmngr-share-v1");
      expect(HKDF_CONTEXTS.escrow).not.toBe(HKDF_CONTEXTS.share);
    });

    it("sharing envelope cannot decrypt escrow and vice versa", async () => {
      const ownerX25519 = await generateX25519KeyPair();
      const ownerEd25519 = await generateEd25519KeyPair();
      const contactX25519 = await generateX25519KeyPair();
      const vaultKey = randomVaultKey();

      // Create an escrow envelope
      const escrowEnvelope = await createEscrowForContact(
        vaultKey,
        ownerX25519.privateKey,
        contactX25519.publicKey,
        ownerEd25519.privateKey,
      );

      // Create a sharing envelope with the same keys
      const shareEnvelope = await wrapKeyForRecipient(
        vaultKey,
        ownerX25519.privateKey,
        contactX25519.publicKey,
        ownerEd25519.privateKey,
      );

      // Try to unwrap escrow using sharing's unwrap (different HKDF context)
      // The signature covers the same fields so it will verify,
      // but the ECDH-derived wrap key differs due to domain separation → decryption fails
      await expect(
        unwrapKeyFromEnvelope(
          {
            wrappedDataKey: escrowEnvelope.wrappedVaultKey,
            nonce: escrowEnvelope.nonce,
            authTag: escrowEnvelope.authTag,
            ephemeralPublicKey: escrowEnvelope.ephemeralPublicKey,
            signature: escrowEnvelope.signature,
          },
          contactX25519.privateKey,
          ownerEd25519.publicKey,
        ),
      ).rejects.toThrow();

      // Try to decrypt sharing envelope using escrow's decrypt
      await expect(
        decryptEscrowAsContact(
          {
            wrappedVaultKey: shareEnvelope.wrappedDataKey,
            nonce: shareEnvelope.nonce,
            authTag: shareEnvelope.authTag,
            ephemeralPublicKey: shareEnvelope.ephemeralPublicKey,
            signature: shareEnvelope.signature,
          },
          contactX25519.privateKey,
          ownerEd25519.publicKey,
        ),
      ).rejects.toThrow();
    });
  });

  describe("serialization", () => {
    it("round-trips through serialize → deserialize", async () => {
      const ownerX25519 = await generateX25519KeyPair();
      const ownerEd25519 = await generateEd25519KeyPair();
      const contactX25519 = await generateX25519KeyPair();
      const vaultKey = randomVaultKey();

      const envelope = await createEscrowForContact(
        vaultKey,
        ownerX25519.privateKey,
        contactX25519.publicKey,
        ownerEd25519.privateKey,
      );

      const serialized = await serializeEscrowEnvelope(envelope);

      // All fields should be non-empty base64 strings
      expect(typeof serialized.escrowBlob).toBe("string");
      expect(serialized.escrowBlob.length).toBeGreaterThan(0);
      expect(typeof serialized.escrowNonce).toBe("string");
      expect(typeof serialized.escrowAuthTag).toBe("string");
      expect(typeof serialized.ephemeralPublicKey).toBe("string");
      expect(typeof serialized.escrowSignature).toBe("string");

      const deserialized = await deserializeEscrowEnvelope(serialized);

      expect(Buffer.from(deserialized.wrappedVaultKey)).toEqual(
        Buffer.from(envelope.wrappedVaultKey),
      );
      expect(Buffer.from(deserialized.nonce)).toEqual(
        Buffer.from(envelope.nonce),
      );
      expect(Buffer.from(deserialized.authTag)).toEqual(
        Buffer.from(envelope.authTag),
      );
      expect(Buffer.from(deserialized.ephemeralPublicKey)).toEqual(
        Buffer.from(envelope.ephemeralPublicKey),
      );
      expect(Buffer.from(deserialized.signature)).toEqual(
        Buffer.from(envelope.signature),
      );
    });

    it("deserialized envelope can be decrypted", async () => {
      const ownerX25519 = await generateX25519KeyPair();
      const ownerEd25519 = await generateEd25519KeyPair();
      const contactX25519 = await generateX25519KeyPair();
      const vaultKey = randomVaultKey();

      const envelope = await createEscrowForContact(
        vaultKey,
        ownerX25519.privateKey,
        contactX25519.publicKey,
        ownerEd25519.privateKey,
      );

      // Serialize (simulates server storage) → deserialize (simulates client retrieval)
      const serialized = await serializeEscrowEnvelope(envelope);
      const deserialized = await deserializeEscrowEnvelope(serialized);

      const decrypted = await decryptEscrowAsContact(
        deserialized,
        contactX25519.privateKey,
        ownerEd25519.publicKey,
      );

      expect(Buffer.from(decrypted)).toEqual(Buffer.from(vaultKey));
    });
  });

  describe("vault key rotation invalidation", () => {
    it("old escrow contains old vault key after rotation", async () => {
      const ownerX25519 = await generateX25519KeyPair();
      const ownerEd25519 = await generateEd25519KeyPair();
      const contactX25519 = await generateX25519KeyPair();

      const oldVaultKey = randomVaultKey();
      const newVaultKey = randomVaultKey();

      // Create escrow with old vault key
      const envelope = await createEscrowForContact(
        oldVaultKey,
        ownerX25519.privateKey,
        contactX25519.publicKey,
        ownerEd25519.privateKey,
      );

      // Contact decrypts → gets the OLD vault key
      const decrypted = await decryptEscrowAsContact(
        envelope,
        contactX25519.privateKey,
        ownerEd25519.publicKey,
      );

      expect(Buffer.from(decrypted)).toEqual(Buffer.from(oldVaultKey));
      expect(Buffer.from(decrypted)).not.toEqual(Buffer.from(newVaultKey));
    });
  });

  describe("read-only access scope", () => {
    it("escrow yields the vault key — same key used for decryption", async () => {
      const ownerX25519 = await generateX25519KeyPair();
      const ownerEd25519 = await generateEd25519KeyPair();
      const contactX25519 = await generateX25519KeyPair();
      const vaultKey = randomVaultKey();

      const envelope = await createEscrowForContact(
        vaultKey,
        ownerX25519.privateKey,
        contactX25519.publicKey,
        ownerEd25519.privateKey,
      );

      const recoveredKey = await decryptEscrowAsContact(
        envelope,
        contactX25519.privateKey,
        ownerEd25519.publicKey,
      );

      // The recovered key is byte-identical to the original vault key.
      // Read-only enforcement is at the application layer, not crypto layer.
      expect(Buffer.from(recoveredKey)).toEqual(Buffer.from(vaultKey));
    });
  });

  // ── F3: contact (recipient) binding + TLV signature payload ──────────────
  describe("contact binding (F3)", () => {
    it("still decrypts LEGACY v1 escrow envelopes (backward compatible)", async () => {
      const ownerX25519 = await generateX25519KeyPair();
      const ownerEd25519 = await generateEd25519KeyPair();
      const contactX25519 = await generateX25519KeyPair();
      const vaultKey = randomVaultKey();

      const legacy = await makeLegacyV1Escrow(
        vaultKey,
        ownerX25519.privateKey,
        contactX25519.publicKey,
        ownerEd25519.privateKey,
      );

      const recovered = await decryptEscrowAsContact(
        legacy,
        contactX25519.privateKey,
        ownerEd25519.publicKey,
      );
      expect(Buffer.from(recovered)).toEqual(Buffer.from(vaultKey));
    });

    it("a v2 escrow for contact A cannot be redirected to contact B", async () => {
      const ownerX25519 = await generateX25519KeyPair();
      const ownerEd25519 = await generateEd25519KeyPair();
      const contactA = await generateX25519KeyPair();
      const contactB = await generateX25519KeyPair();
      const vaultKey = randomVaultKey();

      const envForA = await createEscrowForContact(
        vaultKey,
        ownerX25519.privateKey,
        contactA.publicKey,
        ownerEd25519.privateKey,
      );

      // Even with the genuine owner signing key, B's key fails verification
      // because the signature is bound to A's public key.
      await expect(
        decryptEscrowAsContact(
          envForA,
          contactB.privateKey,
          ownerEd25519.publicKey,
        ),
      ).rejects.toThrow("signature verification failed");
    });
  });
});
