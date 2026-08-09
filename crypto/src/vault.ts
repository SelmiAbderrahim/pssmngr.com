// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import sodium from 'libsodium-wrappers-sumo';
import type { CryptoVersion, EncryptedBlob } from './types';
import { CURRENT_CRYPTO_VERSION, LEGACY_CRYPTO_VERSION } from './types';

let sodiumReady = false;

async function ensureSodium(): Promise<void> {
  if (!sodiumReady) {
    await sodium.ready;
    sodiumReady = true;
  }
}

// Domain tag for version-bound associated data. Fixed length so the layout
// `tag || version || callerAad` is unambiguous (callerAad is the remainder).
const AAD_DOMAIN_TAG = new TextEncoder().encode('pssmngr-blob/v2');

/**
 * Build the AEAD associated data for a given protocol version.
 *
 * - v1 (legacy): the caller's `additionalData` only (or empty) — the version is
 *   NOT authenticated, matching how pre-binding blobs were produced.
 * - v2+: a fixed domain tag, the version byte, then the caller's
 *   `additionalData`. Because the tag and version are fixed-width and the
 *   caller data is the tail, the encoding is unambiguous. Binding the version
 *   makes the auth tag fail on any version downgrade/tamper.
 */
function buildAad(
  version: CryptoVersion,
  additionalData: Uint8Array,
): Uint8Array {
  if (version <= LEGACY_CRYPTO_VERSION) {
    return additionalData;
  }
  const aad = new Uint8Array(
    AAD_DOMAIN_TAG.length + 1 + additionalData.length,
  );
  aad.set(AAD_DOMAIN_TAG, 0);
  aad[AAD_DOMAIN_TAG.length] = version & 0xff;
  aad.set(additionalData, AAD_DOMAIN_TAG.length + 1);
  return aad;
}

/**
 * Encrypt a plaintext buffer using XChaCha20-Poly1305 AEAD.
 *
 * Generates a random 192-bit nonce per call. The returned blob splits
 * the libsodium combined output into separate ciphertext and authTag
 * fields for storage.
 */
export async function encryptItem(
  plaintext: Uint8Array,
  key: Uint8Array,
  additionalData?: Uint8Array,
): Promise<EncryptedBlob> {
  await ensureSodium();

  if (key.length !== sodium.crypto_aead_xchacha20poly1305_ietf_KEYBYTES) {
    throw new Error(
      `Key must be ${sodium.crypto_aead_xchacha20poly1305_ietf_KEYBYTES} bytes`,
    );
  }

  const nonce = sodium.randombytes_buf(
    sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES, // 24 bytes
  );

  // SECURITY (F2): bind the protocol version into the AEAD associated data so
  // the auth tag detects version tampering / downgrade on stored blobs.
  const ad = buildAad(CURRENT_CRYPTO_VERSION, additionalData ?? new Uint8Array(0));

  const ciphertextWithTag = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    plaintext,
    ad,
    null, // nsec (unused in IETF variant)
    nonce,
    key,
  );

  const tagLength = sodium.crypto_aead_xchacha20poly1305_ietf_ABYTES; // 16
  const ciphertext = ciphertextWithTag.slice(0, -tagLength);
  const authTag = ciphertextWithTag.slice(-tagLength);

  return {
    ciphertext: new Uint8Array(ciphertext),
    nonce: new Uint8Array(nonce),
    authTag: new Uint8Array(authTag),
    version: CURRENT_CRYPTO_VERSION,
  };
}

/**
 * Decrypt an EncryptedBlob using XChaCha20-Poly1305 AEAD.
 *
 * Reconstructs the combined ciphertext+tag buffer that libsodium expects
 * and verifies the authentication tag before returning plaintext.
 */
export async function decryptItem(
  blob: EncryptedBlob,
  key: Uint8Array,
  additionalData?: Uint8Array,
): Promise<Uint8Array> {
  await ensureSodium();

  if (key.length !== sodium.crypto_aead_xchacha20poly1305_ietf_KEYBYTES) {
    throw new Error(
      `Key must be ${sodium.crypto_aead_xchacha20poly1305_ietf_KEYBYTES} bytes`,
    );
  }

  if (
    blob.version !== CURRENT_CRYPTO_VERSION &&
    blob.version !== LEGACY_CRYPTO_VERSION
  ) {
    throw new Error(`Unsupported blob version: ${blob.version}`);
  }

  // libsodium expects ciphertext || authTag as a single buffer
  const combined = new Uint8Array(blob.ciphertext.length + blob.authTag.length);
  combined.set(blob.ciphertext, 0);
  combined.set(blob.authTag, blob.ciphertext.length);

  // SECURITY (F2): reconstruct the AAD from the blob's *own* version. A v2 blob
  // whose version field has been flipped to v1 (downgrade) will be verified
  // with the legacy (unbound) AAD, which no longer matches the v2 AAD the tag
  // was computed over, so decryption fails closed.
  const ad = buildAad(blob.version, additionalData ?? new Uint8Array(0));

  const plaintext = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
    null, // nsec (unused)
    combined,
    ad,
    blob.nonce,
    key,
  );

  if (!plaintext) {
    throw new Error('Decryption failed: authentication tag verification failed');
  }

  return new Uint8Array(plaintext);
}

/**
 * Generate a random 256-bit data key suitable for XChaCha20-Poly1305.
 *
 * Callers must ensure sodium is initialized (await ensureSodium()) before
 * calling this synchronous function, or use generateDataKeyAsync().
 */
export function generateDataKey(): Uint8Array {
  return sodium.crypto_aead_xchacha20poly1305_ietf_keygen();
}

/**
 * Async variant that ensures sodium is initialized before key generation.
 */
export async function generateDataKeyAsync(): Promise<Uint8Array> {
  await ensureSodium();
  return generateDataKey();
}
