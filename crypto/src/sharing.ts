// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import sodium from 'libsodium-wrappers-sumo';
import type { ShareEnvelope } from './types';
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
 * Derive a 256-bit wrap key from an ECDH shared secret.
 *
 * Uses BLAKE2b in keyed mode with the shared secret as key and the
 * HKDF context string as message for domain separation.
 */
async function deriveWrapKey(sharedSecret: Uint8Array): Promise<Uint8Array> {
  await ensureSodium();

  const info = new TextEncoder().encode(HKDF_CONTEXTS.share);
  return new Uint8Array(sodium.crypto_generichash(32, info, sharedSecret));
}

/**
 * Build the LEGACY (v1) byte payload signed by the envelope.
 *
 * Concatenates wrappedDataKey || nonce || authTag || ephemeralPublicKey.
 * Retained only to verify envelopes signed before recipient binding (F3).
 */
function buildSignaturePayload(
  wrappedDataKey: Uint8Array,
  nonce: Uint8Array,
  authTag: Uint8Array,
  ephemeralPublicKey: Uint8Array,
): Uint8Array {
  const len =
    wrappedDataKey.length + nonce.length + authTag.length + ephemeralPublicKey.length;
  const payload = new Uint8Array(len);
  let off = 0;
  payload.set(wrappedDataKey, off);
  off += wrappedDataKey.length;
  payload.set(nonce, off);
  off += nonce.length;
  payload.set(authTag, off);
  off += authTag.length;
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

// Domain tag separating share-envelope signatures from any other Ed25519 use,
// and versioning the payload layout.
const SHARE_SIG_DOMAIN_V2 = new TextEncoder().encode('pssmngr-share-sig/v2');

/**
 * Build the v2 signature payload (F3). Length-prefixes a domain tag, the
 * **recipient public key**, and every mutable envelope field, so a signature is
 * valid only for its intended recipient. An envelope substituted to a different
 * recipient fails verification rather than silently failing later at ECDH.
 */
function buildSignaturePayloadV2(
  recipientPublicKey: Uint8Array,
  wrappedDataKey: Uint8Array,
  nonce: Uint8Array,
  authTag: Uint8Array,
  ephemeralPublicKey: Uint8Array,
): Uint8Array {
  return tlv([
    SHARE_SIG_DOMAIN_V2,
    recipientPublicKey,
    wrappedDataKey,
    nonce,
    authTag,
    ephemeralPublicKey,
  ]);
}

/**
 * Wrap a per-item data key for a specific recipient.
 *
 * 1. Generate ephemeral X25519 keypair
 * 2. ECDH(ephemeralPrivateKey, recipientPublicKey) → shared secret
 * 2. BLAKE2b(shared secret, context) → wrap key
 * 3. XChaCha20-Poly1305(dataKey, wrapKey) → encrypted output
 * 4. Ed25519 sign the envelope fields
 *
 * Returns a ShareEnvelope containing everything the recipient needs to
 * unwrap the data key. No plaintext key material leaves this function.
 */
export async function wrapKeyForRecipient(
  dataKey: Uint8Array,
  senderPrivateKey: Uint8Array,
  recipientPublicKey: Uint8Array,
  signingKey: Uint8Array,
): Promise<ShareEnvelope> {
  await ensureSodium();

  if (dataKey.length !== CRYPTO_LENGTHS.dataKey) {
    throw new Error(`Data key must be ${CRYPTO_LENGTHS.dataKey} bytes`);
  }
  if (senderPrivateKey.length !== CRYPTO_LENGTHS.x25519PrivateKey) {
    throw new Error(
      `Sender private key must be ${CRYPTO_LENGTHS.x25519PrivateKey} bytes`,
    );
  }
  if (recipientPublicKey.length !== CRYPTO_LENGTHS.x25519PublicKey) {
    throw new Error(
      `Recipient public key must be ${CRYPTO_LENGTHS.x25519PublicKey} bytes`,
    );
  }
  if (signingKey.length !== CRYPTO_LENGTHS.ed25519PrivateKey) {
    throw new Error(
      `Signing key must be ${CRYPTO_LENGTHS.ed25519PrivateKey} bytes`,
    );
  }

  const ephemeralKeyPair = sodium.crypto_box_keypair();
  const ephemeralPrivateKey = new Uint8Array(ephemeralKeyPair.privateKey);
  const ephemeralPublicKey = new Uint8Array(ephemeralKeyPair.publicKey);

  // ECDH → shared secret → wrap key
  const sharedSecret = await deriveSharedSecret(ephemeralPrivateKey, recipientPublicKey);
  ephemeralPrivateKey.fill(0);
  const wrapKey = await deriveWrapKey(sharedSecret);
  sharedSecret.fill(0);

  // Wrap data key with XChaCha20-Poly1305
  const nonce = sodium.randombytes_buf(
    sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES,
  );

  const combined = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    dataKey,
    null,
    null,
    nonce,
    wrapKey,
  );
  wrapKey.fill(0);

  const tagLen = sodium.crypto_aead_xchacha20poly1305_ietf_ABYTES;
  const wrappedDataKey = new Uint8Array(combined.slice(0, -tagLen));
  const authTag = new Uint8Array(combined.slice(-tagLen));

  // SECURITY (F3): sign a recipient-bound, length-prefixed (TLV) payload so the
  // signature is valid only for this specific recipient.
  const payload = buildSignaturePayloadV2(
    recipientPublicKey,
    wrappedDataKey,
    nonce,
    authTag,
    ephemeralPublicKey,
  );
  const signature = await sign(payload, signingKey);

  return {
    wrappedDataKey,
    nonce: new Uint8Array(nonce),
    authTag,
    ephemeralPublicKey,
    signature,
  };
}

/**
 * Unwrap a data key from a share envelope.
 *
 * 1. Verify Ed25519 signature over envelope fields
 * 2. ECDH(recipientPrivateKey, envelope.ephemeralPublicKey) → shared secret
 * 3. BLAKE2b(shared secret, context) → wrap key
 * 4. XChaCha20-Poly1305 decrypt → data key
 *
 * Throws on invalid signature or decryption failure.
 */
export async function unwrapKeyFromEnvelope(
  envelope: ShareEnvelope,
  recipientPrivateKey: Uint8Array,
  senderSigningPublicKey: Uint8Array,
): Promise<Uint8Array> {
  await ensureSodium();

  if (recipientPrivateKey.length !== CRYPTO_LENGTHS.x25519PrivateKey) {
    throw new Error(
      `Recipient private key must be ${CRYPTO_LENGTHS.x25519PrivateKey} bytes`,
    );
  }
  if (senderSigningPublicKey.length !== CRYPTO_LENGTHS.ed25519PublicKey) {
    throw new Error(
      `Sender signing public key must be ${CRYPTO_LENGTHS.ed25519PublicKey} bytes`,
    );
  }

  // Verify signature first — reject tampered envelopes before any crypto work.
  // Accept either the v2 recipient-bound payload or the legacy v1 payload; the
  // single signature can only match one, so this is backward compatible with no
  // stored version field. For v2 the recipient public key is derived from the
  // caller's own private key, so an envelope minted for a *different* recipient
  // fails both checks.
  const recipientPublicKey = new Uint8Array(
    sodium.crypto_scalarmult_base(recipientPrivateKey),
  );
  const payloadV2 = buildSignaturePayloadV2(
    recipientPublicKey,
    envelope.wrappedDataKey,
    envelope.nonce,
    envelope.authTag,
    envelope.ephemeralPublicKey,
  );
  const payloadV1 = buildSignaturePayload(
    envelope.wrappedDataKey,
    envelope.nonce,
    envelope.authTag,
    envelope.ephemeralPublicKey,
  );

  const valid =
    (await verify(payloadV2, envelope.signature, senderSigningPublicKey)) ||
    (await verify(payloadV1, envelope.signature, senderSigningPublicKey));
  if (!valid) {
    throw new Error('Share envelope signature verification failed');
  }

  // ECDH → shared secret → wrap key (mirrors sender's derivation)
  const sharedSecret = await deriveSharedSecret(
    recipientPrivateKey,
    envelope.ephemeralPublicKey,
  );
  const wrapKey = await deriveWrapKey(sharedSecret);
  sharedSecret.fill(0);

  // Unwrap data key
  const combined = new Uint8Array(
    envelope.wrappedDataKey.length + envelope.authTag.length,
  );
  combined.set(envelope.wrappedDataKey, 0);
  combined.set(envelope.authTag, envelope.wrappedDataKey.length);

  try {
    const dataKey = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
      null,
      combined,
      null,
      envelope.nonce,
      wrapKey,
    );
    wrapKey.fill(0);
    return new Uint8Array(dataKey);
  } catch {
    wrapKey.fill(0);
    throw new Error('Share envelope unwrap failed: decryption error');
  }
}
