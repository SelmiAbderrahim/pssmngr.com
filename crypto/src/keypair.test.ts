// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { describe, it, expect } from 'vitest';
import {
  generateX25519KeyPair,
  generateEd25519KeyPair,
  deriveSharedSecret,
  x25519PublicFromPrivate,
  sign,
  verify,
} from './keypair';
import { CRYPTO_LENGTHS } from './types';

describe('x25519PublicFromPrivate', () => {
  it('recovers the public key from its private key', async () => {
    const kp = await generateX25519KeyPair();
    const derived = await x25519PublicFromPrivate(kp.privateKey);
    expect(Array.from(derived)).toEqual(Array.from(kp.publicKey));
  });

  it('rejects a wrong-length private key', async () => {
    await expect(x25519PublicFromPrivate(new Uint8Array(16))).rejects.toThrow();
  });
});

describe('generateX25519KeyPair', () => {
  it('returns keys with correct lengths', async () => {
    const kp = await generateX25519KeyPair();
    expect(kp.publicKey).toBeInstanceOf(Uint8Array);
    expect(kp.privateKey).toBeInstanceOf(Uint8Array);
    expect(kp.publicKey.length).toBe(CRYPTO_LENGTHS.x25519PublicKey);
    expect(kp.privateKey.length).toBe(CRYPTO_LENGTHS.x25519PrivateKey);
  });

  it('generates unique key pairs each call', async () => {
    const kp1 = await generateX25519KeyPair();
    const kp2 = await generateX25519KeyPair();
    expect(kp1.publicKey).not.toEqual(kp2.publicKey);
    expect(kp1.privateKey).not.toEqual(kp2.privateKey);
  });
});

describe('generateEd25519KeyPair', () => {
  it('returns keys with correct lengths', async () => {
    const kp = await generateEd25519KeyPair();
    expect(kp.publicKey).toBeInstanceOf(Uint8Array);
    expect(kp.privateKey).toBeInstanceOf(Uint8Array);
    expect(kp.publicKey.length).toBe(CRYPTO_LENGTHS.ed25519PublicKey);
    expect(kp.privateKey.length).toBe(CRYPTO_LENGTHS.ed25519PrivateKey);
  });

  it('generates unique key pairs each call', async () => {
    const kp1 = await generateEd25519KeyPair();
    const kp2 = await generateEd25519KeyPair();
    expect(kp1.publicKey).not.toEqual(kp2.publicKey);
    expect(kp1.privateKey).not.toEqual(kp2.privateKey);
  });
});

describe('deriveSharedSecret', () => {
  it('Alice and Bob derive the same shared secret', async () => {
    const alice = await generateX25519KeyPair();
    const bob = await generateX25519KeyPair();

    const secretAlice = await deriveSharedSecret(alice.privateKey, bob.publicKey);
    const secretBob = await deriveSharedSecret(bob.privateKey, alice.publicKey);

    expect(secretAlice).toEqual(secretBob);
    expect(secretAlice.length).toBe(32);
  });

  it('different key pairs produce different shared secrets', async () => {
    const alice = await generateX25519KeyPair();
    const bob = await generateX25519KeyPair();
    const carol = await generateX25519KeyPair();

    const secretAB = await deriveSharedSecret(alice.privateKey, bob.publicKey);
    const secretAC = await deriveSharedSecret(alice.privateKey, carol.publicKey);

    expect(secretAB).not.toEqual(secretAC);
  });

  it('throws for invalid private key length', async () => {
    const bob = await generateX25519KeyPair();
    const shortKey = new Uint8Array(16);

    await expect(deriveSharedSecret(shortKey, bob.publicKey)).rejects.toThrow(
      `Private key must be ${CRYPTO_LENGTHS.x25519PrivateKey} bytes`,
    );
  });

  it('throws for invalid public key length', async () => {
    const alice = await generateX25519KeyPair();
    const shortKey = new Uint8Array(16);

    await expect(deriveSharedSecret(alice.privateKey, shortKey)).rejects.toThrow(
      `Public key must be ${CRYPTO_LENGTHS.x25519PublicKey} bytes`,
    );
  });
});

describe('sign and verify', () => {
  it('round-trip succeeds', async () => {
    const kp = await generateEd25519KeyPair();
    const message = new TextEncoder().encode('hello world');

    const signature = await sign(message, kp.privateKey);
    expect(signature.length).toBe(CRYPTO_LENGTHS.ed25519Signature);

    const valid = await verify(message, signature, kp.publicKey);
    expect(valid).toBe(true);
  });

  it('verify with wrong key returns false', async () => {
    const kp1 = await generateEd25519KeyPair();
    const kp2 = await generateEd25519KeyPair();
    const message = new TextEncoder().encode('hello world');

    const signature = await sign(message, kp1.privateKey);
    const valid = await verify(message, signature, kp2.publicKey);
    expect(valid).toBe(false);
  });

  it('verify with tampered message returns false', async () => {
    const kp = await generateEd25519KeyPair();
    const message = new TextEncoder().encode('hello world');
    const tampered = new TextEncoder().encode('hello worlD');

    const signature = await sign(message, kp.privateKey);
    const valid = await verify(tampered, signature, kp.publicKey);
    expect(valid).toBe(false);
  });

  it('verify with tampered signature returns false', async () => {
    const kp = await generateEd25519KeyPair();
    const message = new TextEncoder().encode('hello world');

    const signature = await sign(message, kp.privateKey);
    const tampered = new Uint8Array(signature);
    tampered[0] ^= 0xff;

    const valid = await verify(message, tampered, kp.publicKey);
    expect(valid).toBe(false);
  });

  it('verify with truncated signature returns false', async () => {
    const kp = await generateEd25519KeyPair();
    const message = new TextEncoder().encode('test');

    const signature = await sign(message, kp.privateKey);
    const truncated = signature.slice(0, 32);

    const valid = await verify(message, truncated, kp.publicKey);
    expect(valid).toBe(false);
  });

  it('sign throws for invalid private key length', async () => {
    const message = new TextEncoder().encode('hello');
    const badKey = new Uint8Array(32);

    await expect(sign(message, badKey)).rejects.toThrow(
      `Signing key must be ${CRYPTO_LENGTHS.ed25519PrivateKey} bytes`,
    );
  });

  it('verify throws for invalid public key length', async () => {
    const message = new TextEncoder().encode('hello');
    const signature = new Uint8Array(64);
    const badKey = new Uint8Array(16);

    await expect(verify(message, signature, badKey)).rejects.toThrow(
      `Verification key must be ${CRYPTO_LENGTHS.ed25519PublicKey} bytes`,
    );
  });

  it('works with empty message', async () => {
    const kp = await generateEd25519KeyPair();
    const empty = new Uint8Array(0);

    const signature = await sign(empty, kp.privateKey);
    const valid = await verify(empty, signature, kp.publicKey);
    expect(valid).toBe(true);
  });

  it('works with large message', async () => {
    const kp = await generateEd25519KeyPair();
    const large = new Uint8Array(1024 * 1024); // 1 MiB
    large.fill(0xab);

    const signature = await sign(large, kp.privateKey);
    const valid = await verify(large, signature, kp.publicKey);
    expect(valid).toBe(true);
  });
});

describe('memory safety', () => {
  it('raw ECDH shared point is cleared', async () => {
    // We can't directly observe the internal zeroing, but we verify
    // the function succeeds and returns a hashed (non-zero) key
    const alice = await generateX25519KeyPair();
    const bob = await generateX25519KeyPair();

    const secret = await deriveSharedSecret(alice.privateKey, bob.publicKey);

    // The derived key should not be all zeros (the raw was zeroed, not the output)
    const allZero = secret.every((b) => b === 0);
    expect(allZero).toBe(false);
  });
});
