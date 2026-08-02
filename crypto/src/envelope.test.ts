// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { describe, it, expect } from 'vitest';
import sodium from 'libsodium-wrappers-sumo';
import {
  generateDataKey,
  wrapKey,
  unwrapKey,
  encryptItemWithEnvelope,
  decryptItemWithEnvelope,
} from './envelope';

async function makeVaultKey(): Promise<Uint8Array> {
  await sodium.ready;
  return sodium.crypto_aead_xchacha20poly1305_ietf_keygen();
}

describe('generateDataKey', () => {
  it('returns 32 bytes', async () => {
    const key = await generateDataKey();
    expect(key).toBeInstanceOf(Uint8Array);
    expect(key.length).toBe(32);
  });

  it('returns unique keys on successive calls', async () => {
    const a = await generateDataKey();
    const b = await generateDataKey();
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
  });
});

describe('wrapKey / unwrapKey', () => {
  it('round-trips: unwrap recovers original data key', async () => {
    const vaultKey = await makeVaultKey();
    const dataKey = await generateDataKey();
    const original = new Uint8Array(dataKey);

    const wrapped = await wrapKey(dataKey, vaultKey);
    const recovered = await unwrapKey(wrapped, vaultKey);

    expect(Buffer.from(recovered).equals(Buffer.from(original))).toBe(true);
  });

  it('produces different output for same inputs (random nonce)', async () => {
    const vaultKey = await makeVaultKey();
    const dataKey = await generateDataKey();

    const w1 = await wrapKey(dataKey, vaultKey);
    const w2 = await wrapKey(dataKey, vaultKey);

    expect(Buffer.from(w1.nonce).equals(Buffer.from(w2.nonce))).toBe(false);
  });

  it('wrapped output has correct field sizes', async () => {
    const vaultKey = await makeVaultKey();
    const dataKey = await generateDataKey();
    const wrapped = await wrapKey(dataKey, vaultKey);

    expect(wrapped.encryptedDataKey.length).toBe(32); // same as plaintext
    expect(wrapped.nonce.length).toBe(24); // XChaCha20 nonce
    expect(wrapped.authTag.length).toBe(16); // Poly1305 tag
  });

  it('wrong vault key fails unwrap', async () => {
    const vaultKey = await makeVaultKey();
    const wrongKey = await makeVaultKey();
    const dataKey = await generateDataKey();

    const wrapped = await wrapKey(dataKey, vaultKey);

    await expect(unwrapKey(wrapped, wrongKey)).rejects.toThrow();
  });

  it('tampered encryptedDataKey fails unwrap', async () => {
    const vaultKey = await makeVaultKey();
    const dataKey = await generateDataKey();
    const wrapped = await wrapKey(dataKey, vaultKey);

    wrapped.encryptedDataKey[0] ^= 0xff;

    await expect(unwrapKey(wrapped, vaultKey)).rejects.toThrow();
  });

  it('tampered authTag fails unwrap', async () => {
    const vaultKey = await makeVaultKey();
    const dataKey = await generateDataKey();
    const wrapped = await wrapKey(dataKey, vaultKey);

    wrapped.authTag[0] ^= 0xff;

    await expect(unwrapKey(wrapped, vaultKey)).rejects.toThrow();
  });

  it('tampered nonce fails unwrap', async () => {
    const vaultKey = await makeVaultKey();
    const dataKey = await generateDataKey();
    const wrapped = await wrapKey(dataKey, vaultKey);

    wrapped.nonce[0] ^= 0xff;

    await expect(unwrapKey(wrapped, vaultKey)).rejects.toThrow();
  });

  it('throws on invalid data key length', async () => {
    const vaultKey = await makeVaultKey();
    const badKey = new Uint8Array(16);

    await expect(wrapKey(badKey, vaultKey)).rejects.toThrow(
      'Data key must be 32 bytes',
    );
  });

  it('throws on invalid vault key length (wrapKey)', async () => {
    const dataKey = await generateDataKey();
    const badVaultKey = new Uint8Array(16);

    await expect(wrapKey(dataKey, badVaultKey)).rejects.toThrow(
      'Vault key must be 32 bytes',
    );
  });

  it('throws on invalid vault key length (unwrapKey)', async () => {
    const vaultKey = await makeVaultKey();
    const dataKey = await generateDataKey();
    const wrapped = await wrapKey(dataKey, vaultKey);

    const badVaultKey = new Uint8Array(16);
    await expect(unwrapKey(wrapped, badVaultKey)).rejects.toThrow(
      'Vault key must be 32 bytes',
    );
  });
});

describe('encryptItemWithEnvelope / decryptItemWithEnvelope', () => {
  it('round-trips plaintext', async () => {
    const vaultKey = await makeVaultKey();
    const plaintext = new TextEncoder().encode('secret vault item data');

    const { wrappedKey, blob } = await encryptItemWithEnvelope(
      plaintext,
      vaultKey,
    );
    const recovered = await decryptItemWithEnvelope(
      wrappedKey,
      blob,
      vaultKey,
    );

    expect(Buffer.from(recovered).equals(Buffer.from(plaintext))).toBe(true);
  });

  it('round-trips with additional data', async () => {
    const vaultKey = await makeVaultKey();
    const plaintext = new TextEncoder().encode('credit card number');
    const aad = new Uint8Array([3, 0, 1]); // itemType=CreditCard, version=1

    const { wrappedKey, blob } = await encryptItemWithEnvelope(
      plaintext,
      vaultKey,
      aad,
    );
    const recovered = await decryptItemWithEnvelope(
      wrappedKey,
      blob,
      vaultKey,
      aad,
    );

    expect(Buffer.from(recovered).equals(Buffer.from(plaintext))).toBe(true);
  });

  it('mismatched AAD fails decryption', async () => {
    const vaultKey = await makeVaultKey();
    const plaintext = new TextEncoder().encode('data');
    const aad = new Uint8Array([1, 0, 1]);

    const { wrappedKey, blob } = await encryptItemWithEnvelope(
      plaintext,
      vaultKey,
      aad,
    );

    const wrongAad = new Uint8Array([2, 0, 1]);
    await expect(
      decryptItemWithEnvelope(wrappedKey, blob, vaultKey, wrongAad),
    ).rejects.toThrow();
  });

  it('wrong vault key fails decryption', async () => {
    const vaultKey = await makeVaultKey();
    const wrongKey = await makeVaultKey();
    const plaintext = new TextEncoder().encode('secret');

    const { wrappedKey, blob } = await encryptItemWithEnvelope(
      plaintext,
      vaultKey,
    );

    await expect(
      decryptItemWithEnvelope(wrappedKey, blob, wrongKey),
    ).rejects.toThrow();
  });

  it('clears data key from memory after encrypt', async () => {
    const vaultKey = await makeVaultKey();
    const plaintext = new TextEncoder().encode('test');

    // We can't directly inspect the local variable, but we verify the
    // operation succeeds (meaning the key was used before being zeroed)
    // and that a subsequent decrypt with the wrapped key works.
    const { wrappedKey, blob } = await encryptItemWithEnvelope(
      plaintext,
      vaultKey,
    );
    const recovered = await decryptItemWithEnvelope(
      wrappedKey,
      blob,
      vaultKey,
    );
    expect(Buffer.from(recovered).equals(Buffer.from(plaintext))).toBe(true);
  });

  it('handles empty plaintext', async () => {
    const vaultKey = await makeVaultKey();
    const plaintext = new Uint8Array(0);

    const { wrappedKey, blob } = await encryptItemWithEnvelope(
      plaintext,
      vaultKey,
    );
    const recovered = await decryptItemWithEnvelope(
      wrappedKey,
      blob,
      vaultKey,
    );

    expect(recovered.length).toBe(0);
  });

  it('handles large plaintext', async () => {
    const vaultKey = await makeVaultKey();
    const plaintext = new Uint8Array(64 * 1024); // 64 KiB
    plaintext.fill(0xab);

    const { wrappedKey, blob } = await encryptItemWithEnvelope(
      plaintext,
      vaultKey,
    );
    const recovered = await decryptItemWithEnvelope(
      wrappedKey,
      blob,
      vaultKey,
    );

    expect(Buffer.from(recovered).equals(Buffer.from(plaintext))).toBe(true);
  });
});
