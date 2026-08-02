// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { describe, it, expect } from 'vitest';
import {
  generateX25519KeyPair,
  generateEd25519KeyPair,
  generateSharedVaultKey,
  unwrapVaultKeyForMember,
} from './index';
import {
  rewrapSharedVaultKeyForRecovery,
  rewrapSharedVaultKeysForRecovery,
  generateRecoveryToken,
} from './recovery';
import { wrapVaultKeyForMember } from './shared-vault';

describe('rewrapSharedVaultKeyForRecovery', () => {
  it('member can unwrap vault key after recovery re-wrap', async () => {
    const organizer = await generateX25519KeyPair();
    const organizerSigning = await generateEd25519KeyPair();
    const memberOld = await generateX25519KeyPair();
    const memberNew = await generateX25519KeyPair();

    const sharedVaultKey = await generateSharedVaultKey();
    const original = new Uint8Array(sharedVaultKey);

    // Initial wrap for member's old key
    const oldEnvelope = await wrapVaultKeyForMember(
      sharedVaultKey,
      organizer.privateKey,
      memberOld.publicKey,
      organizerSigning.privateKey,
    );

    // Verify old key works
    const recoveredOld = await unwrapVaultKeyForMember(
      oldEnvelope,
      memberOld.privateKey,
      organizerSigning.publicKey,
    );
    expect(Buffer.from(recoveredOld).equals(Buffer.from(original))).toBe(true);

    // Recovery: organizer re-wraps for member's NEW key
    const newEnvelope = await rewrapSharedVaultKeyForRecovery(
      sharedVaultKey,
      organizer.privateKey,
      memberNew.publicKey,
      organizerSigning.privateKey,
    );

    // Member unwraps with new key
    const recoveredNew = await unwrapVaultKeyForMember(
      newEnvelope,
      memberNew.privateKey,
      organizerSigning.publicKey,
    );
    expect(Buffer.from(recoveredNew).equals(Buffer.from(original))).toBe(true);
  });

  it('old key cannot unwrap re-wrapped envelope', async () => {
    const organizer = await generateX25519KeyPair();
    const organizerSigning = await generateEd25519KeyPair();
    const memberOld = await generateX25519KeyPair();
    const memberNew = await generateX25519KeyPair();

    const sharedVaultKey = await generateSharedVaultKey();

    // Re-wrap for new key
    const newEnvelope = await rewrapSharedVaultKeyForRecovery(
      sharedVaultKey,
      organizer.privateKey,
      memberNew.publicKey,
      organizerSigning.privateKey,
    );

    // Old key must fail — F3 binds the re-wrapped envelope to the new member
    // key, so the old key is rejected at signature verification.
    await expect(
      unwrapVaultKeyForMember(
        newEnvelope,
        memberOld.privateKey,
        organizerSigning.publicKey,
      ),
    ).rejects.toThrow('signature verification failed');
  });

  it('organizer never needs member private key', async () => {
    const organizer = await generateX25519KeyPair();
    const organizerSigning = await generateEd25519KeyPair();
    const memberNew = await generateX25519KeyPair();

    const sharedVaultKey = await generateSharedVaultKey();

    // Organizer only uses member's PUBLIC key — no private key involved
    const envelope = await rewrapSharedVaultKeyForRecovery(
      sharedVaultKey,
      organizer.privateKey,
      memberNew.publicKey, // only public key
      organizerSigning.privateKey,
    );

    expect(envelope.wrappedDataKey.length).toBe(32);
    expect(envelope.nonce.length).toBe(24);
    expect(envelope.authTag.length).toBe(16);
    expect(envelope.ephemeralPublicKey.length).toBe(32);
    expect(envelope.signature.length).toBe(64);
  });
});

describe('rewrapSharedVaultKeysForRecovery', () => {
  it('re-wraps multiple vault keys and all can be unwrapped', async () => {
    const organizer = await generateX25519KeyPair();
    const organizerSigning = await generateEd25519KeyPair();
    const memberNew = await generateX25519KeyPair();

    const vaultKeyA = await generateSharedVaultKey();
    const vaultKeyB = await generateSharedVaultKey();
    const vaultKeyC = await generateSharedVaultKey();

    const vaultKeys = [
      { vaultId: 'vault-a', sharedVaultKey: vaultKeyA },
      { vaultId: 'vault-b', sharedVaultKey: vaultKeyB },
      { vaultId: 'vault-c', sharedVaultKey: vaultKeyC },
    ];

    const results = await rewrapSharedVaultKeysForRecovery(
      vaultKeys,
      organizer.privateKey,
      memberNew.publicKey,
      organizerSigning.privateKey,
    );

    expect(results).toHaveLength(3);
    expect(results[0].vaultId).toBe('vault-a');
    expect(results[1].vaultId).toBe('vault-b');
    expect(results[2].vaultId).toBe('vault-c');

    // Each envelope should be unwrappable with member's new key
    const recoveredA = await unwrapVaultKeyForMember(
      results[0].envelope,
      memberNew.privateKey,
      organizerSigning.publicKey,
    );
    const recoveredB = await unwrapVaultKeyForMember(
      results[1].envelope,
      memberNew.privateKey,
      organizerSigning.publicKey,
    );
    const recoveredC = await unwrapVaultKeyForMember(
      results[2].envelope,
      memberNew.privateKey,
      organizerSigning.publicKey,
    );

    expect(Buffer.from(recoveredA).equals(Buffer.from(vaultKeyA))).toBe(true);
    expect(Buffer.from(recoveredB).equals(Buffer.from(vaultKeyB))).toBe(true);
    expect(Buffer.from(recoveredC).equals(Buffer.from(vaultKeyC))).toBe(true);
  });

  it('returns empty array for empty input', async () => {
    const organizer = await generateX25519KeyPair();
    const organizerSigning = await generateEd25519KeyPair();
    const memberNew = await generateX25519KeyPair();

    const results = await rewrapSharedVaultKeysForRecovery(
      [],
      organizer.privateKey,
      memberNew.publicKey,
      organizerSigning.privateKey,
    );

    expect(results).toHaveLength(0);
  });
});

describe('generateRecoveryToken', () => {
  it('generates a 32-byte random token', async () => {
    const token = await generateRecoveryToken();
    expect(token.length).toBe(32);
  });

  it('generates unique tokens on each call', async () => {
    const token1 = await generateRecoveryToken();
    const token2 = await generateRecoveryToken();
    expect(Buffer.from(token1).equals(Buffer.from(token2))).toBe(false);
  });
});

describe('recovery security guarantees', () => {
  it('organizer cannot derive member private vault key from recovery flow', async () => {
    const organizer = await generateX25519KeyPair();
    const organizerSigning = await generateEd25519KeyPair();
    const memberNew = await generateX25519KeyPair();

    const sharedVaultKey = await generateSharedVaultKey();

    // The organizer only sees the shared vault key (which they already have)
    // and the member's new PUBLIC key. They never see:
    // - Member's private key (old or new)
    // - Member's private vault key
    // - Member's private vault items

    const envelope = await rewrapSharedVaultKeyForRecovery(
      sharedVaultKey,
      organizer.privateKey,
      memberNew.publicKey,
      organizerSigning.privateKey,
    );

    // Envelope contains only wrapped data — no private key material
    const allBytes = Buffer.concat([
      Buffer.from(envelope.wrappedDataKey),
      Buffer.from(envelope.nonce),
      Buffer.from(envelope.authTag),
      Buffer.from(envelope.ephemeralPublicKey),
      Buffer.from(envelope.signature),
    ]).toString('hex');

    const memberPrivHex = Buffer.from(memberNew.privateKey).toString('hex');
    expect(allBytes).not.toContain(memberPrivHex);
  });

  it('re-wrapped envelope uses different nonce than original', async () => {
    const organizer = await generateX25519KeyPair();
    const organizerSigning = await generateEd25519KeyPair();
    const memberOld = await generateX25519KeyPair();
    const memberNew = await generateX25519KeyPair();

    const sharedVaultKey = await generateSharedVaultKey();

    const oldEnvelope = await wrapVaultKeyForMember(
      sharedVaultKey,
      organizer.privateKey,
      memberOld.publicKey,
      organizerSigning.privateKey,
    );

    const newEnvelope = await rewrapSharedVaultKeyForRecovery(
      sharedVaultKey,
      organizer.privateKey,
      memberNew.publicKey,
      organizerSigning.privateKey,
    );

    // Nonces must differ (random)
    expect(
      Buffer.from(oldEnvelope.nonce).equals(Buffer.from(newEnvelope.nonce)),
    ).toBe(false);

    // Wrapped keys must differ (different recipient)
    expect(
      Buffer.from(oldEnvelope.wrappedDataKey).equals(
        Buffer.from(newEnvelope.wrappedDataKey),
      ),
    ).toBe(false);
  });
});
