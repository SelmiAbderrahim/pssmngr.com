// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { describe, it, expect, beforeAll } from 'vitest';
import sodium from 'libsodium-wrappers-sumo';
import {
  generateSharedVaultKey,
  wrapVaultKeyForMember,
  unwrapVaultKeyForMember,
  wrapVaultKeyForMembers,
} from './shared-vault';
import { generateX25519KeyPair, generateEd25519KeyPair } from './keypair';

beforeAll(async () => {
  await sodium.ready;
});

describe('shared-vault crypto', () => {
  it('generates a 32-byte shared vault key', async () => {
    const key = await generateSharedVaultKey();
    expect(key).toBeInstanceOf(Uint8Array);
    expect(key.length).toBe(32);
  });

  it('generates unique keys each time', async () => {
    const k1 = await generateSharedVaultKey();
    const k2 = await generateSharedVaultKey();
    expect(Buffer.from(k1).equals(Buffer.from(k2))).toBe(false);
  });

  it('wraps and unwraps vault key for a single member', async () => {
    const vaultKey = await generateSharedVaultKey();
    const organizer = await generateX25519KeyPair();
    const member = await generateX25519KeyPair();
    const signingKey = await generateEd25519KeyPair();

    const envelope = await wrapVaultKeyForMember(
      vaultKey,
      organizer.privateKey,
      member.publicKey,
      signingKey.privateKey,
    );

    expect(envelope.wrappedDataKey).toBeInstanceOf(Uint8Array);
    expect(envelope.nonce).toBeInstanceOf(Uint8Array);
    expect(envelope.authTag).toBeInstanceOf(Uint8Array);
    expect(envelope.ephemeralPublicKey).toBeInstanceOf(Uint8Array);
    expect(envelope.signature).toBeInstanceOf(Uint8Array);

    const recovered = await unwrapVaultKeyForMember(
      envelope,
      member.privateKey,
      signingKey.publicKey,
    );

    expect(Buffer.from(recovered).equals(Buffer.from(vaultKey))).toBe(true);
  });

  it('different members can each unwrap the vault key', async () => {
    const vaultKey = await generateSharedVaultKey();
    const organizer = await generateX25519KeyPair();
    const signingKey = await generateEd25519KeyPair();

    const member1 = await generateX25519KeyPair();
    const member2 = await generateX25519KeyPair();
    const member3 = await generateX25519KeyPair();

    const envelopes = await wrapVaultKeyForMembers(
      vaultKey,
      organizer.privateKey,
      [member1.publicKey, member2.publicKey, member3.publicKey],
      signingKey.privateKey,
    );

    expect(envelopes).toHaveLength(3);

    const keys = [member1, member2, member3];
    for (let i = 0; i < 3; i++) {
      const recovered = await unwrapVaultKeyForMember(
        envelopes[i],
        keys[i].privateKey,
        signingKey.publicKey,
      );
      expect(Buffer.from(recovered).equals(Buffer.from(vaultKey))).toBe(true);
    }
  });

  it('rejects unwrap with wrong member key', async () => {
    const vaultKey = await generateSharedVaultKey();
    const organizer = await generateX25519KeyPair();
    const member = await generateX25519KeyPair();
    const wrongMember = await generateX25519KeyPair();
    const signingKey = await generateEd25519KeyPair();

    const envelope = await wrapVaultKeyForMember(
      vaultKey,
      organizer.privateKey,
      member.publicKey,
      signingKey.privateKey,
    );

    await expect(
      unwrapVaultKeyForMember(envelope, wrongMember.privateKey, signingKey.publicKey),
    ).rejects.toThrow();
  });

  it('rejects unwrap with wrong signing key (tampered envelope)', async () => {
    const vaultKey = await generateSharedVaultKey();
    const organizer = await generateX25519KeyPair();
    const member = await generateX25519KeyPair();
    const signingKey = await generateEd25519KeyPair();
    const wrongSigningKey = await generateEd25519KeyPair();

    const envelope = await wrapVaultKeyForMember(
      vaultKey,
      organizer.privateKey,
      member.publicKey,
      signingKey.privateKey,
    );

    await expect(
      unwrapVaultKeyForMember(envelope, member.privateKey, wrongSigningKey.publicKey),
    ).rejects.toThrow('signature verification failed');
  });

  it('key rotation: new key can be wrapped for remaining members', async () => {
    const organizer = await generateX25519KeyPair();
    const signingKey = await generateEd25519KeyPair();
    const member1 = await generateX25519KeyPair();
    const member2 = await generateX25519KeyPair();
    const removedMember = await generateX25519KeyPair();

    // Original vault key wrapped for all 3 members
    const originalKey = await generateSharedVaultKey();
    const originalEnvelopes = await wrapVaultKeyForMembers(
      originalKey,
      organizer.privateKey,
      [member1.publicKey, member2.publicKey, removedMember.publicKey],
      signingKey.privateKey,
    );
    expect(originalEnvelopes).toHaveLength(3);

    // After removing a member, rotate key for remaining members only
    const newKey = await generateSharedVaultKey();
    expect(Buffer.from(newKey).equals(Buffer.from(originalKey))).toBe(false);

    const newEnvelopes = await wrapVaultKeyForMembers(
      newKey,
      organizer.privateKey,
      [member1.publicKey, member2.publicKey],
      signingKey.privateKey,
    );
    expect(newEnvelopes).toHaveLength(2);

    // Remaining members can unwrap the new key
    const recovered1 = await unwrapVaultKeyForMember(
      newEnvelopes[0],
      member1.privateKey,
      signingKey.publicKey,
    );
    expect(Buffer.from(recovered1).equals(Buffer.from(newKey))).toBe(true);

    // Removed member's old envelope still works with old key, but they
    // don't have a new envelope — server enforces by deleting their row
    const oldRecovered = await unwrapVaultKeyForMember(
      originalEnvelopes[2],
      removedMember.privateKey,
      signingKey.publicKey,
    );
    expect(Buffer.from(oldRecovered).equals(Buffer.from(originalKey))).toBe(true);
    // But the new key is different, so even if they had the old key
    // they can't decrypt items re-encrypted with the new key
    expect(Buffer.from(oldRecovered).equals(Buffer.from(newKey))).toBe(false);
  });
});
