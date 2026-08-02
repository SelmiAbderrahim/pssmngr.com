// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import * as argon2 from 'argon2-browser';
import type { DeriveKeyParams, DeriveKeyResult, KdfParams } from './types';
import {
  DEFAULT_KDF_PARAMS,
  MIN_ARGON2_MEMORY_KIB,
  CRYPTO_LENGTHS,
} from './types';
import { generateRandomBytes } from './random';

/**
 * Derive a 256-bit vault key from master password + secret key using Argon2id.
 *
 * The master password is NFC-normalized before use.  The secret key adds
 * device-bound entropy so that a compromised password alone is insufficient.
 */
export async function deriveVaultKey(
  params: DeriveKeyParams,
): Promise<DeriveKeyResult> {
  if (!params.masterPassword || params.masterPassword.length === 0) {
    throw new Error('Master password is required');
  }
  if (
    !params.secretKey ||
    params.secretKey.length < CRYPTO_LENGTHS.secretKeyMin
  ) {
    throw new Error(
      `Secret key must be at least ${CRYPTO_LENGTHS.secretKeyMin} bytes`,
    );
  }

  const memoryKiB = params.memoryKiB ?? DEFAULT_KDF_PARAMS.memoryKiB;
  const iterations = params.iterations ?? DEFAULT_KDF_PARAMS.iterations;
  const parallelism = params.parallelism ?? DEFAULT_KDF_PARAMS.parallelism;

  if (memoryKiB < MIN_ARGON2_MEMORY_KIB) {
    throw new Error(
      `memoryKiB must be >= ${MIN_ARGON2_MEMORY_KIB} (got ${memoryKiB})`,
    );
  }
  if (iterations < 1) {
    throw new Error('iterations must be >= 1');
  }
  if (parallelism < 1) {
    throw new Error('parallelism must be >= 1');
  }

  if (params.salt.length > 0 && params.salt.length < CRYPTO_LENGTHS.salt) {
    throw new Error(
      `Salt must be at least ${CRYPTO_LENGTHS.salt} bytes (got ${params.salt.length})`,
    );
  }

  const salt =
    params.salt.length > 0
      ? params.salt
      : generateRandomBytes(CRYPTO_LENGTHS.salt);

  // NFC-normalize the master password, then combine with secret key
  const encoder = new TextEncoder();
  const passwordBytes = encoder.encode(params.masterPassword.normalize('NFC'));
  const combined = new Uint8Array(
    passwordBytes.length + params.secretKey.length,
  );
  combined.set(passwordBytes, 0);
  combined.set(params.secretKey, passwordBytes.length);

  try {
    const result = await argon2.hash({
      pass: combined,
      salt: salt,
      type: argon2.ArgonType.Argon2id,
      mem: memoryKiB,
      time: iterations,
      parallelism: parallelism,
      hashLen: CRYPTO_LENGTHS.vaultKey,
    });

    const vaultKey = new Uint8Array(result.hash);

    // Zero the library's copy of the derived key
    if (result.hash instanceof Uint8Array) {
      result.hash.fill(0);
    }

    return {
      vaultKey,
      salt,
      kdfParams: { memoryKiB, iterations, parallelism },
    };
  } finally {
    // Clear sensitive material from memory
    passwordBytes.fill(0);
    combined.fill(0);
  }
}

/** Generate a random 128-bit secret key for device-bound entropy. */
export function generateSecretKey(): Uint8Array {
  return generateRandomBytes(CRYPTO_LENGTHS.secretKeyMin);
}

// ---------------------------------------------------------------------------
// Base32 encoding for recovery-kit display (RFC 4648, no padding)
// ---------------------------------------------------------------------------

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Encode a secret key as dash-separated Base32 groups for display. */
export function secretKeyToBase32(secretKey: Uint8Array): string {
  let result = '';
  let bits = 0;
  let value = 0;
  for (const byte of secretKey) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      result += BASE32_ALPHABET[(value >>> bits) & 0x1f];
    }
  }
  if (bits > 0) {
    result += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f];
  }
  return result.match(/.{1,5}/g)?.join('-') ?? result;
}

/** Decode a dash-separated Base32 string back to bytes. */
export function base32ToSecretKey(encoded: string): Uint8Array {
  const stripped = encoded.replace(/-/g, '').toUpperCase();
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;
  for (const char of stripped) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) {
      throw new Error(`Invalid Base32 character: ${char}`);
    }
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >>> bits) & 0xff);
    }
  }
  return new Uint8Array(bytes);
}
