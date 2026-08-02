// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { describe, it, expect, vi, afterEach } from 'vitest';
import sodium from 'libsodium-wrappers-sumo';
import {
  encryptForEphemeralShare,
  decryptEphemeralShare,
} from './ephemeral';
import type { EphemeralAccessData } from './ephemeral';

describe('ephemeral passphrase key derivation (Argon2id hardening)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stretches the passphrase with Argon2id (crypto_pwhash), not a single fast hash', async () => {
    await sodium.ready;
    const pwhashSpy = vi.spyOn(sodium, 'crypto_pwhash');

    await encryptForEphemeralShare('top secret', 'correct horse battery');

    expect(pwhashSpy).toHaveBeenCalled();
    // Confirm the memory-hard interactive parameters and Argon2id algorithm.
    const [outlen, , , opslimit, memlimit, alg] = pwhashSpy.mock.calls[0];
    expect(outlen).toBe(32);
    expect(opslimit).toBe(sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE);
    expect(memlimit).toBe(sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE);
    expect(alg).toBe(sodium.crypto_pwhash_ALG_ARGON2ID13);
  });

  it('does NOT run the password KDF when there is no passphrase', async () => {
    await sodium.ready;
    const pwhashSpy = vi.spyOn(sodium, 'crypto_pwhash');

    await encryptForEphemeralShare('no passphrase here');

    expect(pwhashSpy).not.toHaveBeenCalled();
  });

  it('fails to decrypt when the wrong passphrase is supplied', async () => {
    const result = await encryptForEphemeralShare('secret', 'right-passphrase');
    const accessData: EphemeralAccessData = {
      encryptedBlob: result.encryptedBlob,
      nonce: result.nonce,
      authTag: result.authTag,
      hasPassphrase: true,
      passphraseSalt: result.passphraseSalt,
    };

    await expect(
      decryptEphemeralShare(accessData, result.linkKey, 'wrong-passphrase'),
    ).rejects.toThrow('Decryption failed');
  });
});

describe('ephemeral sharing', () => {
  const testData = JSON.stringify({
    title: 'My Login',
    username: 'user@example.com',
    password: 's3cret!',
    url: 'https://example.com',
  });

  it('round-trip encrypt/decrypt without passphrase', async () => {
    const result = await encryptForEphemeralShare(testData);

    expect(result.encryptedBlob).toBeTruthy();
    expect(result.nonce).toBeTruthy();
    expect(result.authTag).toBeTruthy();
    expect(result.linkKey).toBeTruthy();
    expect(result.passphraseSalt).toBeNull();

    const accessData: EphemeralAccessData = {
      encryptedBlob: result.encryptedBlob,
      nonce: result.nonce,
      authTag: result.authTag,
      hasPassphrase: false,
      passphraseSalt: null,
    };

    const decrypted = await decryptEphemeralShare(accessData, result.linkKey);
    expect(decrypted).toBe(testData);
  });

  it('round-trip encrypt/decrypt with passphrase', async () => {
    const passphrase = 'my-strong-passphrase';
    const result = await encryptForEphemeralShare(testData, passphrase);

    expect(result.passphraseSalt).toBeTruthy();

    const accessData: EphemeralAccessData = {
      encryptedBlob: result.encryptedBlob,
      nonce: result.nonce,
      authTag: result.authTag,
      hasPassphrase: true,
      passphraseSalt: result.passphraseSalt,
    };

    const decrypted = await decryptEphemeralShare(
      accessData,
      result.linkKey,
      passphrase,
    );
    expect(decrypted).toBe(testData);
  });

  it('wrong link key fails decryption', async () => {
    const result = await encryptForEphemeralShare(testData);
    const otherResult = await encryptForEphemeralShare('other data');

    const accessData: EphemeralAccessData = {
      encryptedBlob: result.encryptedBlob,
      nonce: result.nonce,
      authTag: result.authTag,
      hasPassphrase: false,
      passphraseSalt: null,
    };

    await expect(
      decryptEphemeralShare(accessData, otherResult.linkKey),
    ).rejects.toThrow('Decryption failed');
  });

  it('wrong passphrase fails decryption', async () => {
    const passphrase = 'correct-passphrase';
    const result = await encryptForEphemeralShare(testData, passphrase);

    const accessData: EphemeralAccessData = {
      encryptedBlob: result.encryptedBlob,
      nonce: result.nonce,
      authTag: result.authTag,
      hasPassphrase: true,
      passphraseSalt: result.passphraseSalt,
    };

    await expect(
      decryptEphemeralShare(accessData, result.linkKey, 'wrong-passphrase'),
    ).rejects.toThrow('Decryption failed');
  });

  it('missing passphrase fails when required', async () => {
    const passphrase = 'my-passphrase';
    const result = await encryptForEphemeralShare(testData, passphrase);

    const accessData: EphemeralAccessData = {
      encryptedBlob: result.encryptedBlob,
      nonce: result.nonce,
      authTag: result.authTag,
      hasPassphrase: true,
      passphraseSalt: result.passphraseSalt,
    };

    // Without passphrase, linkKey alone cannot decrypt
    await expect(
      decryptEphemeralShare(accessData, result.linkKey),
    ).rejects.toThrow('Decryption failed');
  });

  it('two encryptions of same data produce different ciphertexts', async () => {
    const result1 = await encryptForEphemeralShare(testData);
    const result2 = await encryptForEphemeralShare(testData);

    expect(result1.encryptedBlob).not.toBe(result2.encryptedBlob);
    expect(result1.linkKey).not.toBe(result2.linkKey);
    expect(result1.nonce).not.toBe(result2.nonce);
  });

  it('empty passphrase is treated as no passphrase', async () => {
    const result = await encryptForEphemeralShare(testData, '');

    expect(result.passphraseSalt).toBeNull();

    const accessData: EphemeralAccessData = {
      encryptedBlob: result.encryptedBlob,
      nonce: result.nonce,
      authTag: result.authTag,
      hasPassphrase: false,
      passphraseSalt: null,
    };

    const decrypted = await decryptEphemeralShare(accessData, result.linkKey);
    expect(decrypted).toBe(testData);
  });

  it('handles unicode content correctly', async () => {
    const unicodeData = JSON.stringify({
      title: 'مدير كلمات المرور',
      password: '密码管理器🔐',
    });

    const result = await encryptForEphemeralShare(unicodeData);
    const accessData: EphemeralAccessData = {
      encryptedBlob: result.encryptedBlob,
      nonce: result.nonce,
      authTag: result.authTag,
      hasPassphrase: false,
      passphraseSalt: null,
    };

    const decrypted = await decryptEphemeralShare(accessData, result.linkKey);
    expect(decrypted).toBe(unicodeData);
  });
});

describe('ephemeral output format', () => {
  const testData = JSON.stringify({ user: 'test', pass: 'secret' });

  it('all output fields are valid base64url (no padding)', async () => {
    const result = await encryptForEphemeralShare(testData);
    const base64urlPattern = /^[A-Za-z0-9_-]+$/;

    expect(result.encryptedBlob).toMatch(base64urlPattern);
    expect(result.nonce).toMatch(base64urlPattern);
    expect(result.authTag).toMatch(base64urlPattern);
    expect(result.linkKey).toMatch(base64urlPattern);
  });

  it('passphraseSalt is valid base64url when present', async () => {
    const result = await encryptForEphemeralShare(testData, 'pass123');
    const base64urlPattern = /^[A-Za-z0-9_-]+$/;

    expect(result.passphraseSalt).not.toBeNull();
    expect(result.passphraseSalt!).toMatch(base64urlPattern);
  });

  it('linkKey is not present in any server-stored field', async () => {
    const result = await encryptForEphemeralShare(testData);

    // linkKey must never appear in server-side fields
    expect(result.encryptedBlob).not.toContain(result.linkKey);
    expect(result.nonce).not.toContain(result.linkKey);
    expect(result.authTag).not.toContain(result.linkKey);
  });
});

describe('ephemeral edge cases', () => {
  it('handles large payload (100 KB)', async () => {
    const largeData = JSON.stringify({
      notes: 'x'.repeat(100_000),
    });

    const result = await encryptForEphemeralShare(largeData);
    const accessData: EphemeralAccessData = {
      encryptedBlob: result.encryptedBlob,
      nonce: result.nonce,
      authTag: result.authTag,
      hasPassphrase: false,
      passphraseSalt: null,
    };

    const decrypted = await decryptEphemeralShare(accessData, result.linkKey);
    expect(decrypted).toBe(largeData);
  });

  it('passphrase with special characters works', async () => {
    const data = JSON.stringify({ item: 'test' });
    const passphrase = '🔑 pässwörd!@#$%^&*()_+ مرور';

    const result = await encryptForEphemeralShare(data, passphrase);
    const accessData: EphemeralAccessData = {
      encryptedBlob: result.encryptedBlob,
      nonce: result.nonce,
      authTag: result.authTag,
      hasPassphrase: true,
      passphraseSalt: result.passphraseSalt,
    };

    const decrypted = await decryptEphemeralShare(
      accessData,
      result.linkKey,
      passphrase,
    );
    expect(decrypted).toBe(data);
  });

  it('minimal plaintext (single char) round-trips', async () => {
    const result = await encryptForEphemeralShare('x');
    const accessData: EphemeralAccessData = {
      encryptedBlob: result.encryptedBlob,
      nonce: result.nonce,
      authTag: result.authTag,
      hasPassphrase: false,
      passphraseSalt: null,
    };

    const decrypted = await decryptEphemeralShare(accessData, result.linkKey);
    expect(decrypted).toBe('x');
  });

  it('tampered ciphertext fails decryption', async () => {
    const result = await encryptForEphemeralShare('secret data');

    // Corrupt the first base64url character of encryptedBlob
    const corrupted =
      (result.encryptedBlob[0] === 'A' ? 'B' : 'A') +
      result.encryptedBlob.slice(1);

    const accessData: EphemeralAccessData = {
      encryptedBlob: corrupted,
      nonce: result.nonce,
      authTag: result.authTag,
      hasPassphrase: false,
      passphraseSalt: null,
    };

    await expect(
      decryptEphemeralShare(accessData, result.linkKey),
    ).rejects.toThrow('Decryption failed');
  });

  it('tampered authTag fails decryption', async () => {
    const result = await encryptForEphemeralShare('secret data');

    const corrupted =
      (result.authTag[0] === 'A' ? 'B' : 'A') + result.authTag.slice(1);

    const accessData: EphemeralAccessData = {
      encryptedBlob: result.encryptedBlob,
      nonce: result.nonce,
      authTag: corrupted,
      hasPassphrase: false,
      passphraseSalt: null,
    };

    await expect(
      decryptEphemeralShare(accessData, result.linkKey),
    ).rejects.toThrow('Decryption failed');
  });

  it('tampered nonce fails decryption', async () => {
    const result = await encryptForEphemeralShare('secret data');

    const corrupted =
      (result.nonce[0] === 'A' ? 'B' : 'A') + result.nonce.slice(1);

    const accessData: EphemeralAccessData = {
      encryptedBlob: result.encryptedBlob,
      nonce: corrupted,
      authTag: result.authTag,
      hasPassphrase: false,
      passphraseSalt: null,
    };

    await expect(
      decryptEphemeralShare(accessData, result.linkKey),
    ).rejects.toThrow('Decryption failed');
  });
});
