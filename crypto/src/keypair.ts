// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import sodium from 'libsodium-wrappers-sumo';
import type { X25519KeyPair, Ed25519KeyPair } from './types';
import { CRYPTO_LENGTHS } from './types';

let sodiumReady = false;

async function ensureSodium(): Promise<void> {
  if (!sodiumReady) {
    await sodium.ready;
    sodiumReady = true;
  }
}

/**
 * Generate an X25519 key pair for ECDH key agreement.
 *
 * Used in sharing flows to derive a shared secret between two parties
 * without transmitting any private key material.
 */
export async function generateX25519KeyPair(): Promise<X25519KeyPair> {
  await ensureSodium();
  const kp = sodium.crypto_box_keypair();
  return {
    publicKey: new Uint8Array(kp.publicKey),
    privateKey: new Uint8Array(kp.privateKey),
  };
}

/**
 * Generate an Ed25519 key pair for digital signatures.
 *
 * Used to sign share envelopes and device enrollment requests,
 * proving sender authenticity without encryption.
 */
export async function generateEd25519KeyPair(): Promise<Ed25519KeyPair> {
  await ensureSodium();
  const kp = sodium.crypto_sign_keypair();
  return {
    publicKey: new Uint8Array(kp.publicKey),
    privateKey: new Uint8Array(kp.privateKey),
  };
}

/**
 * Derive a shared secret from an X25519 ECDH key exchange.
 *
 * Performs scalar multiplication then hashes the raw shared point with
 * BLAKE2b (via crypto_generichash) to produce a uniformly random 256-bit
 * symmetric key. The raw shared point is zeroed immediately after hashing.
 */
export async function deriveSharedSecret(
  myPrivateKey: Uint8Array,
  theirPublicKey: Uint8Array,
): Promise<Uint8Array> {
  await ensureSodium();

  if (myPrivateKey.length !== CRYPTO_LENGTHS.x25519PrivateKey) {
    throw new Error(
      `Private key must be ${CRYPTO_LENGTHS.x25519PrivateKey} bytes`,
    );
  }
  if (theirPublicKey.length !== CRYPTO_LENGTHS.x25519PublicKey) {
    throw new Error(
      `Public key must be ${CRYPTO_LENGTHS.x25519PublicKey} bytes`,
    );
  }

  const rawShared = sodium.crypto_scalarmult(myPrivateKey, theirPublicKey);

  // Hash the raw ECDH output to derive a proper symmetric key
  const key = sodium.crypto_generichash(32, rawShared, null);

  // Clear raw shared secret from memory
  rawShared.fill(0);

  return new Uint8Array(key);
}

/**
 * Derive the X25519 public key for a given X25519 private key.
 *
 * Public key = scalar-mult of the private key with the curve base point. Lets a
 * device recover its own public key from the (decrypted) private key it stored,
 * without a server round-trip — used so self-targeted wraps go to *this* device.
 */
export async function x25519PublicFromPrivate(
  privateKey: Uint8Array,
): Promise<Uint8Array> {
  await ensureSodium();

  if (privateKey.length !== CRYPTO_LENGTHS.x25519PrivateKey) {
    throw new Error(
      `Private key must be ${CRYPTO_LENGTHS.x25519PrivateKey} bytes`,
    );
  }

  return new Uint8Array(sodium.crypto_scalarmult_base(privateKey));
}

/**
 * Create a detached Ed25519 signature over a message.
 *
 * Returns a 64-byte signature. The message is not included in the output.
 */
export async function sign(
  message: Uint8Array,
  privateKey: Uint8Array,
): Promise<Uint8Array> {
  await ensureSodium();

  if (privateKey.length !== CRYPTO_LENGTHS.ed25519PrivateKey) {
    throw new Error(
      `Signing key must be ${CRYPTO_LENGTHS.ed25519PrivateKey} bytes`,
    );
  }

  return new Uint8Array(sodium.crypto_sign_detached(message, privateKey));
}

/**
 * Verify a detached Ed25519 signature.
 *
 * Returns true if the signature is valid for the given message and public key.
 * Returns false (never throws) for invalid signatures or tampered messages.
 */
export async function verify(
  message: Uint8Array,
  signature: Uint8Array,
  publicKey: Uint8Array,
): Promise<boolean> {
  await ensureSodium();

  if (publicKey.length !== CRYPTO_LENGTHS.ed25519PublicKey) {
    throw new Error(
      `Verification key must be ${CRYPTO_LENGTHS.ed25519PublicKey} bytes`,
    );
  }

  try {
    return sodium.crypto_sign_verify_detached(signature, message, publicKey);
  } catch {
    return false;
  }
}
