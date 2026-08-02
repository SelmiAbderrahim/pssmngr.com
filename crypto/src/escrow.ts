// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Emergency Access Escrow — Cryptographic key wrapping for trusted contacts.
 *
 * When the vault owner designates a trusted contact, the owner's client
 * pre-encrypts the vault key using the contact's X25519 public key.  The
 * resulting escrow blob is stored on the server but is opaque — the server
 * cannot decrypt it.  After the time-lock expires without denial the server
 * activates the escrow and the contact can fetch + decrypt it.
 *
 * Domain separation: uses HKDF context "pssmngr-escrow-v1" so escrow
 * envelopes cannot be confused with sharing envelopes.
 */

import sodium from 'libsodium-wrappers-sumo';
import type { EscrowEnvelope, SerializedEscrow } from './types';
import { CRYPTO_LENGTHS, HKDF_CONTEXTS } from './types';
import { deriveSharedSecret, sign, verify } from './keypair';

let sodiumReady = false;

async function ensureSodium(): Promise<void> {
  if (!sodiumReady) {
    await sodium.ready;
    sodiumReady = true;
  }
}

/**
 * Derive a 256-bit escrow wrap key from an ECDH shared secret.
 * Uses BLAKE2b with the escrow-specific context for domain separation.
 */
async function deriveEscrowWrapKey(sharedSecret: Uint8Array): Promise<Uint8Array> {
  await ensureSodium();
  const info = new TextEncoder().encode(HKDF_CONTEXTS.escrow);
  return new Uint8Array(sodium.crypto_generichash(32, info, sharedSecret));
}

/**
 * Build the LEGACY (v1) byte payload that the envelope signature covers.
 * Concatenates wrappedVaultKey || nonce || authTag || ephemeralPublicKey.
 * Retained for verifying envelopes signed before recipient binding (F3).
 */
function buildSignaturePayload(
  wrappedVaultKey: Uint8Array,
  nonce: Uint8Array,
  authTag: Uint8Array,
  ephemeralPublicKey: Uint8Array,
): Uint8Array {
  const len = wrappedVaultKey.length + nonce.length + authTag.length + ephemeralPublicKey.length;
  const payload = new Uint8Array(len);
  let off = 0;
  payload.set(wrappedVaultKey, off); off += wrappedVaultKey.length;
  payload.set(nonce, off);           off += nonce.length;
  payload.set(authTag, off);         off += authTag.length;
  payload.set(ephemeralPublicKey, off);
  return payload;
}

/** Length-prefixed (TLV) concatenation: each field is `u32be(len) || bytes`. */
function tlv(fields: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const f of fields) total += 4 + f.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const f of fields) {
    out[off] = (f.length >>> 24) & 0xff;
    out[off + 1] = (f.length >>> 16) & 0xff;
    out[off + 2] = (f.length >>> 8) & 0xff;
    out[off + 3] = f.length & 0xff;
    off += 4;
    out.set(f, off);
    off += f.length;
  }
  return out;
}

// Domain tag separating escrow signatures from any other Ed25519 use, and
// versioning the payload layout.
const ESCROW_SIG_DOMAIN_V2 = new TextEncoder().encode('pssmngr-escrow-sig/v2');

/**
 * Build the v2 signature payload (F3). Length-prefixes a domain tag, the
 * **recipient (contact) public key**, and every mutable envelope field. Binding
 * the recipient key means a signature is valid only for its intended contact:
 * an envelope substituted to a different contact fails verification instead of
 * silently failing later at ECDH decryption.
 */
function buildSignaturePayloadV2(
  contactPublicKey: Uint8Array,
  wrappedVaultKey: Uint8Array,
  nonce: Uint8Array,
  authTag: Uint8Array,
  ephemeralPublicKey: Uint8Array,
): Uint8Array {
  return tlv([
    ESCROW_SIG_DOMAIN_V2,
    contactPublicKey,
    wrappedVaultKey,
    nonce,
    authTag,
    ephemeralPublicKey,
  ]);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create an escrow envelope: wrap the owner's vault key for a trusted
 * contact's X25519 public key.
 *
 * 1. ECDH(ownerPrivateKey, contactPublicKey) → shared secret
 * 2. BLAKE2b with the "pssmngr-escrow-v1" domain label → escrow wrap key
 * 3. XChaCha20-Poly1305(vaultKey, escrowWrapKey) → encrypted blob
 * 4. Ed25519 sign the envelope fields
 *
 * The result is opaque to the server. Only the contact can decrypt it.
 */
export async function createEscrowForContact(
  vaultKey: Uint8Array,
  ownerX25519PrivateKey: Uint8Array,
  contactX25519PublicKey: Uint8Array,
  ownerEd25519SigningKey: Uint8Array,
): Promise<EscrowEnvelope> {
  await ensureSodium();

  if (vaultKey.length !== CRYPTO_LENGTHS.vaultKey) {
    throw new Error(`Vault key must be ${CRYPTO_LENGTHS.vaultKey} bytes`);
  }
  if (ownerX25519PrivateKey.length !== CRYPTO_LENGTHS.x25519PrivateKey) {
    throw new Error(`Owner X25519 private key must be ${CRYPTO_LENGTHS.x25519PrivateKey} bytes`);
  }
  if (contactX25519PublicKey.length !== CRYPTO_LENGTHS.x25519PublicKey) {
    throw new Error(`Contact X25519 public key must be ${CRYPTO_LENGTHS.x25519PublicKey} bytes`);
  }
  if (ownerEd25519SigningKey.length !== CRYPTO_LENGTHS.ed25519PrivateKey) {
    throw new Error(`Signing key must be ${CRYPTO_LENGTHS.ed25519PrivateKey} bytes`);
  }

  // ECDH → shared secret → escrow wrap key (domain-separated)
  const sharedSecret = await deriveSharedSecret(ownerX25519PrivateKey, contactX25519PublicKey);
  const escrowWrapKey = await deriveEscrowWrapKey(sharedSecret);
  sharedSecret.fill(0);

  // Wrap vault key with XChaCha20-Poly1305
  const nonce = sodium.randombytes_buf(
    sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES,
  );

  const combined = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    vaultKey,
    null,
    null,
    nonce,
    escrowWrapKey,
  );
  escrowWrapKey.fill(0);

  const tagLen = sodium.crypto_aead_xchacha20poly1305_ietf_ABYTES;
  const wrappedVaultKey = new Uint8Array(combined.slice(0, -tagLen));
  const authTag = new Uint8Array(combined.slice(-tagLen));

  // Derive owner's X25519 public key for inclusion
  const ephemeralPublicKey = new Uint8Array(
    sodium.crypto_scalarmult_base(ownerX25519PrivateKey),
  );

  // SECURITY (F3): sign a recipient-bound, length-prefixed (TLV) payload so the
  // signature is valid only for this specific contact.
  const payload = buildSignaturePayloadV2(
    contactX25519PublicKey,
    wrappedVaultKey,
    nonce,
    authTag,
    ephemeralPublicKey,
  );
  const signature = await sign(payload, ownerEd25519SigningKey);

  return {
    wrappedVaultKey,
    nonce: new Uint8Array(nonce),
    authTag,
    ephemeralPublicKey,
    signature,
  };
}

/**
 * Decrypt an escrow envelope as the trusted contact.
 *
 * 1. Verify Ed25519 signature over envelope fields
 * 2. ECDH(contactPrivateKey, envelope.ephemeralPublicKey) → shared secret
 * 3. BLAKE2b with the "pssmngr-escrow-v1" domain label → escrow wrap key
 * 4. XChaCha20-Poly1305 decrypt → vault key
 *
 * Returns the owner's vault key (read-only access).
 * Throws on invalid signature or decryption failure.
 */
export async function decryptEscrowAsContact(
  envelope: EscrowEnvelope,
  contactX25519PrivateKey: Uint8Array,
  ownerEd25519PublicKey: Uint8Array,
): Promise<Uint8Array> {
  await ensureSodium();

  if (contactX25519PrivateKey.length !== CRYPTO_LENGTHS.x25519PrivateKey) {
    throw new Error(`Contact X25519 private key must be ${CRYPTO_LENGTHS.x25519PrivateKey} bytes`);
  }
  if (ownerEd25519PublicKey.length !== CRYPTO_LENGTHS.ed25519PublicKey) {
    throw new Error(`Owner Ed25519 public key must be ${CRYPTO_LENGTHS.ed25519PublicKey} bytes`);
  }

  // Verify signature first — reject tampered envelopes before crypto work.
  // Accept either the v2 recipient-bound payload or the legacy v1 payload; the
  // single signature can only match one, so this is backward compatible with no
  // stored version field. For v2 the recipient (contact) public key is derived
  // from the caller's own private key, so an envelope minted for a *different*
  // contact fails both checks (v2: wrong bound key; v1: signature is over the
  // v2 bytes, not the legacy concat).
  const contactPublicKey = new Uint8Array(
    sodium.crypto_scalarmult_base(contactX25519PrivateKey),
  );
  const payloadV2 = buildSignaturePayloadV2(
    contactPublicKey,
    envelope.wrappedVaultKey,
    envelope.nonce,
    envelope.authTag,
    envelope.ephemeralPublicKey,
  );
  const payloadV1 = buildSignaturePayload(
    envelope.wrappedVaultKey,
    envelope.nonce,
    envelope.authTag,
    envelope.ephemeralPublicKey,
  );

  const valid =
    (await verify(payloadV2, envelope.signature, ownerEd25519PublicKey)) ||
    (await verify(payloadV1, envelope.signature, ownerEd25519PublicKey));
  if (!valid) {
    throw new Error('Escrow envelope signature verification failed');
  }

  // ECDH → shared secret → escrow wrap key
  const sharedSecret = await deriveSharedSecret(
    contactX25519PrivateKey,
    envelope.ephemeralPublicKey,
  );
  const escrowWrapKey = await deriveEscrowWrapKey(sharedSecret);
  sharedSecret.fill(0);

  // Unwrap vault key
  const combined = new Uint8Array(
    envelope.wrappedVaultKey.length + envelope.authTag.length,
  );
  combined.set(envelope.wrappedVaultKey, 0);
  combined.set(envelope.authTag, envelope.wrappedVaultKey.length);

  try {
    const vaultKey = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
      null,
      combined,
      null,
      envelope.nonce,
      escrowWrapKey,
    );
    escrowWrapKey.fill(0);
    return new Uint8Array(vaultKey);
  } catch {
    escrowWrapKey.fill(0);
    throw new Error('Escrow envelope decryption failed');
  }
}

// ---------------------------------------------------------------------------
// Serialization helpers (binary ↔ base64 for server storage)
// ---------------------------------------------------------------------------

function toBase64(buf: Uint8Array): string {
  return sodium.to_base64(buf, sodium.base64_variants.URLSAFE_NO_PADDING);
}

function fromBase64(b64: string): Uint8Array {
  return sodium.from_base64(b64, sodium.base64_variants.URLSAFE_NO_PADDING);
}

/**
 * Serialize an escrow envelope to base64 strings for server storage.
 */
export async function serializeEscrowEnvelope(
  envelope: EscrowEnvelope,
): Promise<SerializedEscrow> {
  await ensureSodium();
  return {
    escrowBlob: toBase64(envelope.wrappedVaultKey),
    escrowNonce: toBase64(envelope.nonce),
    escrowAuthTag: toBase64(envelope.authTag),
    ephemeralPublicKey: toBase64(envelope.ephemeralPublicKey),
    escrowSignature: toBase64(envelope.signature),
  };
}

/**
 * Deserialize base64 server data back to an escrow envelope.
 */
export async function deserializeEscrowEnvelope(
  data: SerializedEscrow,
): Promise<EscrowEnvelope> {
  await ensureSodium();
  return {
    wrappedVaultKey: fromBase64(data.escrowBlob),
    nonce: fromBase64(data.escrowNonce),
    authTag: fromBase64(data.escrowAuthTag),
    ephemeralPublicKey: fromBase64(data.ephemeralPublicKey),
    signature: fromBase64(data.escrowSignature),
  };
}
