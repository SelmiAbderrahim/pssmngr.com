// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import sodium from 'libsodium-wrappers-sumo';
import type { WrappedKey, EncryptedBlob } from './types';

let sodiumReady = false;

async function ensureSodium(): Promise<void> {
  if (!sodiumReady) {
    await sodium.ready;
    sodiumReady = true;
  }
}

/**
 * Generate a random 256-bit data key for per-item encryption.
 */
export async function generateDataKey(): Promise<Uint8Array> {
  await ensureSodium();
  return sodium.crypto_aead_xchacha20poly1305_ietf_keygen();
}

/**
 * Wrap (encrypt) a data key with the vault key using XChaCha20-Poly1305.
 *
 * The vault key never leaves client memory. Each wrap uses a fresh random
 * 192-bit nonce so identical data keys produce different wrapped outputs.
 */
export async function wrapKey(
  dataKey: Uint8Array,
  vaultKey: Uint8Array,
): Promise<WrappedKey> {
  await ensureSodium();

  if (dataKey.length !== 32) {
    throw new Error('Data key must be 32 bytes');
  }
  if (vaultKey.length !== 32) {
    throw new Error('Vault key must be 32 bytes');
  }

  const nonce = sodium.randombytes_buf(
    sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES, // 24
  );

  const combined = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    dataKey,
    null, // no additional data
    null, // nsec unused
    nonce,
    vaultKey,
  );

  const tagLength = sodium.crypto_aead_xchacha20poly1305_ietf_ABYTES; // 16
  const encryptedDataKey = combined.slice(0, -tagLength);
  const authTag = combined.slice(-tagLength);

  return {
    encryptedDataKey: new Uint8Array(encryptedDataKey),
    nonce: new Uint8Array(nonce),
    authTag: new Uint8Array(authTag),
  };
}

/**
 * Unwrap (decrypt) a wrapped data key using the vault key.
 *
 * Throws if the vault key is wrong or the wrapped key has been tampered with.
 */
export async function unwrapKey(
  wrapped: WrappedKey,
  vaultKey: Uint8Array,
): Promise<Uint8Array> {
  await ensureSodium();

  if (vaultKey.length !== 32) {
    throw new Error('Vault key must be 32 bytes');
  }

  // libsodium expects ciphertext || authTag as a single buffer
  const combined = new Uint8Array(
    wrapped.encryptedDataKey.length + wrapped.authTag.length,
  );
  combined.set(wrapped.encryptedDataKey, 0);
  combined.set(wrapped.authTag, wrapped.encryptedDataKey.length);

  try {
    const dataKey = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
      null, // nsec unused
      combined,
      null, // no additional data
      wrapped.nonce,
      vaultKey,
    );

    return new Uint8Array(dataKey);
  } catch {
    throw new Error(
      'Key unwrap failed: authentication tag verification failed',
    );
  }
}

/**
 * Encrypt an item using envelope encryption.
 *
 * 1. Generates a random per-item data key
 * 2. Wraps the data key with the vault key
 * 3. Encrypts the plaintext with the data key
 * 4. Zeros the data key from memory
 */
export async function encryptItemWithEnvelope(
  plaintext: Uint8Array,
  vaultKey: Uint8Array,
  additionalData?: Uint8Array,
): Promise<{ wrappedKey: WrappedKey; blob: EncryptedBlob }> {
  const { encryptItem } = await import('./vault');

  const dataKey = await generateDataKey();
  const wrappedKey = await wrapKey(dataKey, vaultKey);
  const blob = await encryptItem(plaintext, dataKey, additionalData);

  // Clear data key from memory
  dataKey.fill(0);

  return { wrappedKey, blob };
}

/**
 * Decrypt an item encrypted with envelope encryption.
 *
 * 1. Unwraps the data key using the vault key
 * 2. Decrypts the blob with the recovered data key
 * 3. Zeros the data key from memory
 */
export async function decryptItemWithEnvelope(
  wrappedKey: WrappedKey,
  blob: EncryptedBlob,
  vaultKey: Uint8Array,
  additionalData?: Uint8Array,
): Promise<Uint8Array> {
  const { decryptItem } = await import('./vault');

  const dataKey = await unwrapKey(wrappedKey, vaultKey);
  const plaintext = await decryptItem(blob, dataKey, additionalData);

  // Clear data key from memory
  dataKey.fill(0);

  return plaintext;
}
