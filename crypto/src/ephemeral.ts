// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import sodium from 'libsodium-wrappers-sumo';

let sodiumReady = false;

async function ensureSodium(): Promise<void> {
  if (!sodiumReady) {
    await sodium.ready;
    sodiumReady = true;
  }
}

/** Result of encrypting data for an ephemeral share link. */
export interface EphemeralEncryptResult {
  /** Encrypted item data (base64url). */
  encryptedBlob: string;
  /** Nonce used for encryption (base64url). */
  nonce: string;
  /** Auth tag from AEAD (base64url). */
  authTag: string;
  /** Random link key to embed in URL fragment (base64url). Never sent to server. */
  linkKey: string;
  /** Salt for passphrase key derivation (base64url). Null if no passphrase. */
  passphraseSalt: string | null;
}

/** Data returned from server for an ephemeral share access. */
export interface EphemeralAccessData {
  encryptedBlob: string;
  nonce: string;
  authTag: string;
  hasPassphrase: boolean;
  passphraseSalt: string | null;
}

/**
 * Derive a 256-bit encryption key, optionally combining a link key with a passphrase.
 *
 * If passphrase is provided:
 *   1. Derive passphraseKey = Argon2id(passphrase, salt=passphraseSalt, 32 bytes)
 *   2. Derive combined = BLAKE2b(linkKey || passphraseKey, 32 bytes)
 *
 * If no passphrase: use linkKey directly as encryption key.
 *
 * SECURITY: the passphrase layer exists for the case where the share URL (which
 * carries the 256-bit link key in its fragment) leaks. An attacker who has the
 * URL can fetch `encryptedBlob` + `passphraseSalt` from the server and mount an
 * OFFLINE attack on the passphrase. A single fast hash (BLAKE2b) is brute-forced
 * at billions/sec on a GPU, so a human passphrase falls in minutes — the
 * "additional protection" would be largely illusory. We therefore stretch the
 * passphrase with Argon2id (interactive parameters: 64 MiB, opslimit 2) before
 * combining it with the link key, making offline guessing memory-hard.
 */
async function deriveEncryptionKey(
  linkKey: Uint8Array,
  passphrase?: string,
  passphraseSalt?: Uint8Array,
): Promise<Uint8Array> {
  await ensureSodium();

  if (!passphrase || !passphraseSalt) {
    return linkKey;
  }

  // crypto_pwhash requires a salt of exactly crypto_pwhash_SALTBYTES (16) bytes.
  if (passphraseSalt.length !== sodium.crypto_pwhash_SALTBYTES) {
    throw new Error('Invalid passphrase salt length');
  }

  const passphraseBytes = new TextEncoder().encode(passphrase);
  const passphraseKey = new Uint8Array(
    sodium.crypto_pwhash(
      32,
      passphraseBytes,
      passphraseSalt,
      sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE,
      sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE,
      sodium.crypto_pwhash_ALG_ARGON2ID13,
    ),
  );
  passphraseBytes.fill(0);

  const combined = new Uint8Array(linkKey.length + passphraseKey.length);
  combined.set(linkKey, 0);
  combined.set(passphraseKey, linkKey.length);
  passphraseKey.fill(0);

  const encKey = new Uint8Array(sodium.crypto_generichash(32, combined, null));
  combined.fill(0);
  return encKey;
}

/**
 * Encrypt item data for an ephemeral sharing link.
 *
 * Generates a random 256-bit link key and encrypts the serialized item data
 * with XChaCha20-Poly1305. The link key is returned separately — it must be
 * embedded in the URL fragment (never sent to the server).
 *
 * If a passphrase is provided, it adds an additional key derivation layer
 * so the recipient needs both the URL and the passphrase to decrypt.
 */
export async function encryptForEphemeralShare(
  plaintext: string,
  passphrase?: string,
): Promise<EphemeralEncryptResult> {
  await ensureSodium();

  const linkKey = sodium.randombytes_buf(32);
  let passphraseSalt: Uint8Array | undefined;

  if (passphrase && passphrase.length > 0) {
    passphraseSalt = sodium.randombytes_buf(16);
  }

  const encKey = await deriveEncryptionKey(linkKey, passphrase, passphraseSalt);
  const nonce = sodium.randombytes_buf(
    sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES,
  );

  const plaintextBytes = new TextEncoder().encode(plaintext);
  const combined = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    plaintextBytes,
    null,
    null,
    nonce,
    encKey,
  );

  if (encKey !== linkKey) encKey.fill(0);

  const tagLen = sodium.crypto_aead_xchacha20poly1305_ietf_ABYTES;
  const ciphertext = new Uint8Array(combined.slice(0, -tagLen));
  const authTag = new Uint8Array(combined.slice(-tagLen));

  return {
    encryptedBlob: sodium.to_base64(ciphertext, sodium.base64_variants.URLSAFE_NO_PADDING),
    nonce: sodium.to_base64(nonce, sodium.base64_variants.URLSAFE_NO_PADDING),
    authTag: sodium.to_base64(authTag, sodium.base64_variants.URLSAFE_NO_PADDING),
    linkKey: sodium.to_base64(linkKey, sodium.base64_variants.URLSAFE_NO_PADDING),
    passphraseSalt: passphraseSalt
      ? sodium.to_base64(passphraseSalt, sodium.base64_variants.URLSAFE_NO_PADDING)
      : null,
  };
}

/**
 * Decrypt an ephemeral share using the link key from the URL fragment
 * and an optional passphrase.
 *
 * Returns the decrypted plaintext string or throws on failure.
 */
export async function decryptEphemeralShare(
  data: EphemeralAccessData,
  linkKeyBase64: string,
  passphrase?: string,
): Promise<string> {
  await ensureSodium();

  const b64 = sodium.base64_variants.URLSAFE_NO_PADDING;
  const linkKey = sodium.from_base64(linkKeyBase64, b64);
  const ciphertext = sodium.from_base64(data.encryptedBlob, b64);
  const nonce = sodium.from_base64(data.nonce, b64);
  const authTag = sodium.from_base64(data.authTag, b64);
  const passphraseSalt = data.passphraseSalt
    ? sodium.from_base64(data.passphraseSalt, b64)
    : undefined;

  const encKey = await deriveEncryptionKey(linkKey, passphrase, passphraseSalt);

  const combined = new Uint8Array(ciphertext.length + authTag.length);
  combined.set(ciphertext, 0);
  combined.set(authTag, ciphertext.length);

  try {
    const plaintext = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
      null,
      combined,
      null,
      nonce,
      encKey,
    );
    if (encKey !== linkKey) encKey.fill(0);
    linkKey.fill(0);
    return new TextDecoder().decode(plaintext);
  } catch {
    if (encKey !== linkKey) encKey.fill(0);
    linkKey.fill(0);
    throw new Error('Decryption failed: invalid key or passphrase');
  }
}
