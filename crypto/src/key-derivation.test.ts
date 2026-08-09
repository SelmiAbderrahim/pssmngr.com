// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { describe, it, expect } from 'vitest';
import {
  deriveVaultKey,
  generateSecretKey,
  secretKeyToBase32,
  base32ToSecretKey,
} from './key-derivation';
import { generateRandomBytes } from './random';
import {
  CRYPTO_LENGTHS,
  MIN_ARGON2_MEMORY_KIB,
  DEFAULT_KDF_PARAMS,
} from './types';

// Use minimal Argon2 params for fast tests (128 MiB minimum, 1 iteration)
const FAST_KDF = {
  memoryKiB: MIN_ARGON2_MEMORY_KIB,
  iterations: 1,
  parallelism: 1,
};

function makeParams(overrides: Record<string, unknown> = {}) {
  return {
    masterPassword: 'correct-horse-battery-staple',
    secretKey: generateRandomBytes(CRYPTO_LENGTHS.secretKeyMin),
    salt: generateRandomBytes(CRYPTO_LENGTHS.salt),
    ...FAST_KDF,
    ...overrides,
  };
}

describe('deriveVaultKey', () => {
  it('produces a 256-bit (32-byte) vault key', async () => {
    const result = await deriveVaultKey(makeParams());
    expect(result.vaultKey).toBeInstanceOf(Uint8Array);
    expect(result.vaultKey.length).toBe(CRYPTO_LENGTHS.vaultKey);
  });

  it('returns salt and kdfParams alongside vault key', async () => {
    const params = makeParams();
    const result = await deriveVaultKey(params);
    expect(result.salt).toBeInstanceOf(Uint8Array);
    expect(result.salt.length).toBeGreaterThanOrEqual(CRYPTO_LENGTHS.salt);
    expect(result.kdfParams).toEqual({
      memoryKiB: params.memoryKiB,
      iterations: params.iterations,
      parallelism: params.parallelism,
    });
  });

  it('consistent output for same inputs', async () => {
    const params = makeParams();
    const a = await deriveVaultKey(params);
    const b = await deriveVaultKey(params);
    expect(a.vaultKey).toEqual(b.vaultKey);
  });

  it('different output for different master passwords', async () => {
    const base = makeParams();
    const a = await deriveVaultKey(base);
    const b = await deriveVaultKey({ ...base, masterPassword: 'different-pw' });
    expect(a.vaultKey).not.toEqual(b.vaultKey);
  });

  it('different output for different secret keys', async () => {
    const base = makeParams();
    const a = await deriveVaultKey(base);
    const b = await deriveVaultKey({
      ...base,
      secretKey: generateRandomBytes(CRYPTO_LENGTHS.secretKeyMin),
    });
    expect(a.vaultKey).not.toEqual(b.vaultKey);
  });

  it('different output for different salts', async () => {
    const base = makeParams();
    const a = await deriveVaultKey(base);
    const b = await deriveVaultKey({
      ...base,
      salt: generateRandomBytes(CRYPTO_LENGTHS.salt),
    });
    expect(a.vaultKey).not.toEqual(b.vaultKey);
  });

  it('rejects empty master password', async () => {
    await expect(
      deriveVaultKey(makeParams({ masterPassword: '' })),
    ).rejects.toThrow('Master password is required');
  });

  it('rejects secret key shorter than 16 bytes', async () => {
    await expect(
      deriveVaultKey(makeParams({ secretKey: new Uint8Array(8) })),
    ).rejects.toThrow(
      `Secret key must be at least ${CRYPTO_LENGTHS.secretKeyMin} bytes`,
    );
  });

  it('rejects salt that is non-empty but below 16 bytes', async () => {
    await expect(
      deriveVaultKey(makeParams({ salt: new Uint8Array(4) })),
    ).rejects.toThrow(`Salt must be at least ${CRYPTO_LENGTHS.salt} bytes`);
  });

  it('generates salt when empty salt provided', async () => {
    const result = await deriveVaultKey(
      makeParams({ salt: new Uint8Array(0) }),
    );
    expect(result.salt.length).toBe(CRYPTO_LENGTHS.salt);
  });

  it('respects custom memory parameter', async () => {
    const params = makeParams({ memoryKiB: MIN_ARGON2_MEMORY_KIB });
    const result = await deriveVaultKey(params);
    expect(result.kdfParams.memoryKiB).toBe(MIN_ARGON2_MEMORY_KIB);
    expect(result.vaultKey.length).toBe(CRYPTO_LENGTHS.vaultKey);
  });

  it('respects custom iterations parameter', async () => {
    const params = makeParams({ iterations: 2 });
    const result = await deriveVaultKey(params);
    expect(result.kdfParams.iterations).toBe(2);
  });

  it('respects custom parallelism parameter', async () => {
    const params = makeParams({ parallelism: 2 });
    const result = await deriveVaultKey(params);
    expect(result.kdfParams.parallelism).toBe(2);
  });

  it('rejects memoryKiB below minimum', async () => {
    await expect(
      deriveVaultKey(makeParams({ memoryKiB: 1024 })),
    ).rejects.toThrow(`memoryKiB must be >= ${MIN_ARGON2_MEMORY_KIB}`);
  });

  it('rejects iterations < 1', async () => {
    await expect(
      deriveVaultKey(makeParams({ iterations: 0 })),
    ).rejects.toThrow('iterations must be >= 1');
  });

  it('rejects parallelism < 1', async () => {
    await expect(
      deriveVaultKey(makeParams({ parallelism: 0 })),
    ).rejects.toThrow('parallelism must be >= 1');
  });

  it('uses default KDF params when not specified', async () => {
    const params = {
      masterPassword: 'test-password',
      secretKey: generateRandomBytes(CRYPTO_LENGTHS.secretKeyMin),
      salt: generateRandomBytes(CRYPTO_LENGTHS.salt),
    };
    const result = await deriveVaultKey(params);
    expect(result.kdfParams).toEqual(DEFAULT_KDF_PARAMS);
  });

  it('NFC-normalizes master password', async () => {
    const base = makeParams();
    // e followed by combining acute accent (U+0065 U+0301) vs precomposed e-acute (U+00E9)
    const a = await deriveVaultKey({ ...base, masterPassword: 'caf\u0065\u0301' });
    const b = await deriveVaultKey({ ...base, masterPassword: 'caf\u00e9' });
    expect(a.vaultKey).toEqual(b.vaultKey);
  });
});

describe('generateSecretKey', () => {
  it('returns 16 bytes', () => {
    const key = generateSecretKey();
    expect(key).toBeInstanceOf(Uint8Array);
    expect(key.length).toBe(CRYPTO_LENGTHS.secretKeyMin);
  });

  it('returns different values on each call', () => {
    const a = generateSecretKey();
    const b = generateSecretKey();
    expect(a).not.toEqual(b);
  });
});

describe('secretKeyToBase32 / base32ToSecretKey', () => {
  it('round-trip preserves original bytes', () => {
    const original = generateSecretKey();
    const encoded = secretKeyToBase32(original);
    const decoded = base32ToSecretKey(encoded);
    expect(decoded).toEqual(original);
  });

  it('format: groups of 5 separated by dashes', () => {
    const key = generateSecretKey();
    const encoded = secretKeyToBase32(key);
    const groups = encoded.split('-');
    // All groups except possibly the last should be 5 chars
    for (let i = 0; i < groups.length - 1; i++) {
      expect(groups[i].length).toBe(5);
    }
    expect(groups[groups.length - 1].length).toBeGreaterThan(0);
    expect(groups[groups.length - 1].length).toBeLessThanOrEqual(5);
  });

  it('uses only valid Base32 characters', () => {
    const key = generateSecretKey();
    const encoded = secretKeyToBase32(key);
    const stripped = encoded.replace(/-/g, '');
    expect(stripped).toMatch(/^[A-Z2-7]+$/);
  });

  it('rejects invalid Base32 characters', () => {
    expect(() => base32ToSecretKey('ABCD0')).toThrow(
      'Invalid Base32 character',
    );
    expect(() => base32ToSecretKey('abcd1')).toThrow(
      'Invalid Base32 character',
    );
  });

  it('handles dashes in input during decode', () => {
    const original = generateSecretKey();
    const encoded = secretKeyToBase32(original);
    // Ensure dashes are stripped properly
    const decoded = base32ToSecretKey(encoded);
    expect(decoded).toEqual(original);
  });

  it('empty input produces empty string', () => {
    const encoded = secretKeyToBase32(new Uint8Array(0));
    expect(encoded).toBe('');
  });

  it('case-insensitive decode (lowercased input)', () => {
    const original = generateSecretKey();
    const encoded = secretKeyToBase32(original).toLowerCase();
    const decoded = base32ToSecretKey(encoded);
    expect(decoded).toEqual(original);
  });
});
