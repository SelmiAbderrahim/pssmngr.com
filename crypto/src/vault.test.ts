// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { describe, it, expect, vi } from 'vitest';
import sodium from 'libsodium-wrappers-sumo';
import {
  encryptItem,
  decryptItem,
  generateDataKey,
  generateDataKeyAsync,
} from './vault';
import {
  CURRENT_CRYPTO_VERSION,
  LEGACY_CRYPTO_VERSION,
  CRYPTO_LENGTHS,
} from './types';
import type { EncryptedBlob } from './types';

async function makeKey(): Promise<Uint8Array> {
  await sodium.ready;
  return sodium.crypto_aead_xchacha20poly1305_ietf_keygen();
}

/**
 * Build a legacy v1 blob exactly as the pre-F2 scheme did: AEAD with the
 * caller's additionalData (or empty) as the only associated data — the version
 * was NOT bound. Used to prove backward-compatible decryption.
 */
async function makeLegacyBlob(
  plaintext: Uint8Array,
  key: Uint8Array,
  additionalData: Uint8Array = new Uint8Array(0),
): Promise<EncryptedBlob> {
  await sodium.ready;
  const nonce = sodium.randombytes_buf(
    sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES,
  );
  const combined = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    plaintext,
    additionalData,
    null,
    nonce,
    key,
  );
  const tagLen = sodium.crypto_aead_xchacha20poly1305_ietf_ABYTES;
  return {
    ciphertext: new Uint8Array(combined.slice(0, -tagLen)),
    nonce: new Uint8Array(nonce),
    authTag: new Uint8Array(combined.slice(-tagLen)),
    version: LEGACY_CRYPTO_VERSION,
  };
}

describe('encryptItem / decryptItem', () => {
  it('round-trip preserves plaintext', async () => {
    const key = await makeKey();
    const plaintext = new TextEncoder().encode('hello vault');
    const blob = await encryptItem(plaintext, key);
    const recovered = await decryptItem(blob, key);
    expect(recovered).toEqual(plaintext);
  });

  it('different plaintexts produce different ciphertexts', async () => {
    const key = await makeKey();
    const a = await encryptItem(new TextEncoder().encode('alpha'), key);
    const b = await encryptItem(new TextEncoder().encode('bravo'), key);
    expect(a.ciphertext).not.toEqual(b.ciphertext);
  });

  it('same plaintext produces different ciphertexts (random nonce)', async () => {
    const key = await makeKey();
    const plaintext = new TextEncoder().encode('same data');
    const a = await encryptItem(plaintext, key);
    const b = await encryptItem(plaintext, key);
    expect(a.nonce).not.toEqual(b.nonce);
    expect(a.ciphertext).not.toEqual(b.ciphertext);
  });

  it('wrong key fails decryption', async () => {
    const key = await makeKey();
    const wrongKey = await makeKey();
    const plaintext = new TextEncoder().encode('secret');
    const blob = await encryptItem(plaintext, key);
    await expect(decryptItem(blob, wrongKey)).rejects.toThrow();
  });

  it('tampered ciphertext fails decryption', async () => {
    const key = await makeKey();
    const blob = await encryptItem(new TextEncoder().encode('data'), key);
    blob.ciphertext[0] ^= 0xff;
    await expect(decryptItem(blob, key)).rejects.toThrow();
  });

  it('tampered auth tag fails decryption', async () => {
    const key = await makeKey();
    const blob = await encryptItem(new TextEncoder().encode('data'), key);
    blob.authTag[0] ^= 0xff;
    await expect(decryptItem(blob, key)).rejects.toThrow();
  });

  it('tampered nonce fails decryption', async () => {
    const key = await makeKey();
    const blob = await encryptItem(new TextEncoder().encode('data'), key);
    blob.nonce[0] ^= 0xff;
    await expect(decryptItem(blob, key)).rejects.toThrow();
  });

  it('additional data must match for decryption', async () => {
    const key = await makeKey();
    const plaintext = new TextEncoder().encode('with aad');
    const aad = new Uint8Array([1, 0, 1]);
    const blob = await encryptItem(plaintext, key, aad);
    const recovered = await decryptItem(blob, key, aad);
    expect(recovered).toEqual(plaintext);
  });

  it('mismatched additional data fails', async () => {
    const key = await makeKey();
    const plaintext = new TextEncoder().encode('with aad');
    const aad = new Uint8Array([1, 0, 1]);
    const blob = await encryptItem(plaintext, key, aad);
    const wrongAad = new Uint8Array([2, 0, 1]);
    await expect(decryptItem(blob, key, wrongAad)).rejects.toThrow();
  });

  it('decryption without AAD fails when encrypted with AAD', async () => {
    const key = await makeKey();
    const plaintext = new TextEncoder().encode('aad required');
    const aad = new Uint8Array([3, 0, 1]);
    const blob = await encryptItem(plaintext, key, aad);
    // Passing no AAD (defaults to empty) should fail
    await expect(decryptItem(blob, key)).rejects.toThrow();
  });

  it('invalid key length throws on encrypt', async () => {
    const shortKey = new Uint8Array(16);
    const plaintext = new TextEncoder().encode('test');
    await expect(encryptItem(plaintext, shortKey)).rejects.toThrow(
      'Key must be',
    );
  });

  it('invalid key length throws on decrypt', async () => {
    const key = await makeKey();
    const blob = await encryptItem(new TextEncoder().encode('test'), key);
    const shortKey = new Uint8Array(16);
    await expect(decryptItem(blob, shortKey)).rejects.toThrow('Key must be');
  });

  it('unsupported version throws on decrypt', async () => {
    const key = await makeKey();
    const blob = await encryptItem(new TextEncoder().encode('test'), key);
    const tampered: EncryptedBlob = { ...blob, version: 99 as never };
    await expect(decryptItem(tampered, key)).rejects.toThrow(
      'Unsupported blob version',
    );
  });

  it('nonce is 24 bytes (192 bits)', async () => {
    const key = await makeKey();
    const blob = await encryptItem(new TextEncoder().encode('test'), key);
    expect(blob.nonce.length).toBe(CRYPTO_LENGTHS.nonce);
  });

  it('auth tag is 16 bytes', async () => {
    const key = await makeKey();
    const blob = await encryptItem(new TextEncoder().encode('test'), key);
    expect(blob.authTag.length).toBe(CRYPTO_LENGTHS.authTag);
  });

  it('blob version is CURRENT_CRYPTO_VERSION', async () => {
    const key = await makeKey();
    const blob = await encryptItem(new TextEncoder().encode('test'), key);
    expect(blob.version).toBe(CURRENT_CRYPTO_VERSION);
  });

  it('handles empty plaintext', async () => {
    const key = await makeKey();
    const empty = new Uint8Array(0);
    const blob = await encryptItem(empty, key);
    const recovered = await decryptItem(blob, key);
    expect(recovered.length).toBe(0);
  });

  it('handles large plaintext (64 KiB)', async () => {
    const key = await makeKey();
    const large = new Uint8Array(64 * 1024);
    large.fill(0xab);
    const blob = await encryptItem(large, key);
    const recovered = await decryptItem(blob, key);
    expect(recovered).toEqual(large);
  });
});

// ── F2: version binding into AEAD associated data ──────────────────────────
describe('encryptItem / decryptItem — version AAD binding (F2)', () => {
  it('new blobs are written at version 2', async () => {
    const key = await makeKey();
    const blob = await encryptItem(new TextEncoder().encode('v2'), key);
    expect(blob.version).toBe(2);
    expect(CURRENT_CRYPTO_VERSION).toBe(2);
  });

  it('decrypts legacy v1 blobs (backward compatible, no data migration)', async () => {
    const key = await makeKey();
    const plaintext = new TextEncoder().encode('legacy data');
    const legacy = await makeLegacyBlob(plaintext, key);
    expect(legacy.version).toBe(1);
    const recovered = await decryptItem(legacy, key);
    expect(recovered).toEqual(plaintext);
  });

  it('decrypts legacy v1 blobs that carried additionalData', async () => {
    const key = await makeKey();
    const plaintext = new TextEncoder().encode('legacy aad');
    const aad = new Uint8Array([9, 9, 9]);
    const legacy = await makeLegacyBlob(plaintext, key, aad);
    const recovered = await decryptItem(legacy, key, aad);
    expect(recovered).toEqual(plaintext);
  });

  it('rejects a version downgrade: flipping a v2 blob to v1 fails the tag', async () => {
    const key = await makeKey();
    const blob = await encryptItem(new TextEncoder().encode('no downgrade'), key);
    expect(blob.version).toBe(2);
    // Attacker rewrites only the (unauthenticated-looking) version field.
    const downgraded: EncryptedBlob = { ...blob, version: LEGACY_CRYPTO_VERSION };
    await expect(decryptItem(downgraded, key)).rejects.toThrow();
  });

  it('a genuine v1 blob cannot be re-read as v2 (binding is directional)', async () => {
    const key = await makeKey();
    const legacy = await makeLegacyBlob(new TextEncoder().encode('x'), key);
    const upgraded: EncryptedBlob = { ...legacy, version: 2 };
    await expect(decryptItem(upgraded, key)).rejects.toThrow();
  });
});

describe('decryptItem — defensive null check', () => {
  it('throws when libsodium decrypt returns falsy', async () => {
    const key = await makeKey();
    const blob = await encryptItem(new TextEncoder().encode('test'), key);

    // Temporarily patch decrypt to return null (simulates unexpected library behavior)
    const original = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt;
    sodium.crypto_aead_xchacha20poly1305_ietf_decrypt = vi.fn(() => null as unknown as Uint8Array);

    await expect(decryptItem(blob, key)).rejects.toThrow(
      'Decryption failed: authentication tag verification failed',
    );

    sodium.crypto_aead_xchacha20poly1305_ietf_decrypt = original;
  });
});

describe('generateDataKey', () => {
  it('returns 32 bytes', async () => {
    await sodium.ready;
    const key = generateDataKey();
    expect(key).toBeInstanceOf(Uint8Array);
    expect(key.length).toBe(CRYPTO_LENGTHS.dataKey);
  });

  it('returns different values on each call', async () => {
    await sodium.ready;
    const a = generateDataKey();
    const b = generateDataKey();
    expect(a).not.toEqual(b);
  });
});

describe('generateDataKeyAsync', () => {
  it('returns 32 bytes', async () => {
    const key = await generateDataKeyAsync();
    expect(key).toBeInstanceOf(Uint8Array);
    expect(key.length).toBe(CRYPTO_LENGTHS.dataKey);
  });

  it('returns different values on each call', async () => {
    const a = await generateDataKeyAsync();
    const b = await generateDataKeyAsync();
    expect(a).not.toEqual(b);
  });
});
