// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { describe, it, expect } from 'vitest';
import sodium from 'libsodium-wrappers-sumo';
import {
  generateX25519KeyPair,
  generateEd25519KeyPair,
  generateDataKeyAsync,
  deriveSharedSecret,
  sign,
  HKDF_CONTEXTS,
} from './index';
import { wrapKeyForRecipient, unwrapKeyFromEnvelope } from './sharing';
import type { ShareEnvelope } from './types';

/**
 * Construct a LEGACY (v1) share envelope exactly as the pre-F3 code did: the
 * signature covers the plain concatenation `wrappedDataKey || nonce || authTag
 * || ephemeralPublicKey`, with no recipient binding. Used to prove that v1
 * envelopes still unwrap after the recipient-binding upgrade (no migration).
 */
async function makeLegacyV1Envelope(
  dataKey: Uint8Array,
  recipientPublicKey: Uint8Array,
  senderSigningPrivateKey: Uint8Array,
): Promise<ShareEnvelope> {
  await sodium.ready;
  const ephemeral = await generateX25519KeyPair();
  const sharedSecret = await deriveSharedSecret(
    ephemeral.privateKey,
    recipientPublicKey,
  );
  const info = new TextEncoder().encode(HKDF_CONTEXTS.share);
  const wrapKey = new Uint8Array(sodium.crypto_generichash(32, info, sharedSecret));
  const nonce = sodium.randombytes_buf(
    sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES,
  );
  const combined = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    dataKey,
    null,
    null,
    nonce,
    wrapKey,
  );
  const tagLen = sodium.crypto_aead_xchacha20poly1305_ietf_ABYTES;
  const wrappedDataKey = new Uint8Array(combined.slice(0, -tagLen));
  const authTag = new Uint8Array(combined.slice(-tagLen));
  const ephemeralPublicKey = new Uint8Array(ephemeral.publicKey);
  // v1 payload = plain concatenation (no domain tag, no recipient binding).
  const v1Payload = new Uint8Array(
    wrappedDataKey.length + nonce.length + authTag.length + ephemeralPublicKey.length,
  );
  let off = 0;
  v1Payload.set(wrappedDataKey, off); off += wrappedDataKey.length;
  v1Payload.set(nonce, off); off += nonce.length;
  v1Payload.set(authTag, off); off += authTag.length;
  v1Payload.set(ephemeralPublicKey, off);
  const signature = await sign(v1Payload, senderSigningPrivateKey);
  return {
    wrappedDataKey,
    nonce: new Uint8Array(nonce),
    authTag,
    ephemeralPublicKey,
    signature,
  };
}

describe('wrapKeyForRecipient / unwrapKeyFromEnvelope', () => {
  it('round-trips: unwrap recovers the original data key', async () => {
    const sender = await generateX25519KeyPair();
    const recipient = await generateX25519KeyPair();
    const senderSigning = await generateEd25519KeyPair();
    const dataKey = await generateDataKeyAsync();
    const original = new Uint8Array(dataKey);

    const envelope = await wrapKeyForRecipient(
      dataKey,
      sender.privateKey,
      recipient.publicKey,
      senderSigning.privateKey,
    );

    const recovered = await unwrapKeyFromEnvelope(
      envelope,
      recipient.privateKey,
      senderSigning.publicKey,
    );

    expect(Buffer.from(recovered).equals(Buffer.from(original))).toBe(true);
  });

  it('wrong recipient key fails to unwrap', async () => {
    const sender = await generateX25519KeyPair();
    const recipient = await generateX25519KeyPair();
    const wrongRecipient = await generateX25519KeyPair();
    const senderSigning = await generateEd25519KeyPair();
    const dataKey = await generateDataKeyAsync();

    const envelope = await wrapKeyForRecipient(
      dataKey,
      sender.privateKey,
      recipient.publicKey,
      senderSigning.privateKey,
    );

    await expect(
      unwrapKeyFromEnvelope(
        envelope,
        wrongRecipient.privateKey,
        senderSigning.publicKey,
      ),
      // F3: the signature is now bound to the intended recipient's public key,
      // so a wrong recipient is rejected at signature verification (earlier and
      // stronger than the previous ECDH-decryption failure).
    ).rejects.toThrow('signature verification failed');
  });

  it('tampered envelope fails signature check', async () => {
    const sender = await generateX25519KeyPair();
    const recipient = await generateX25519KeyPair();
    const senderSigning = await generateEd25519KeyPair();
    const dataKey = await generateDataKeyAsync();

    const envelope = await wrapKeyForRecipient(
      dataKey,
      sender.privateKey,
      recipient.publicKey,
      senderSigning.privateKey,
    );

    // Tamper with wrappedDataKey
    const tampered: ShareEnvelope = {
      ...envelope,
      wrappedDataKey: new Uint8Array(envelope.wrappedDataKey.length),
    };
    tampered.wrappedDataKey.set(envelope.wrappedDataKey);
    tampered.wrappedDataKey[0] ^= 0xff;

    await expect(
      unwrapKeyFromEnvelope(
        tampered,
        recipient.privateKey,
        senderSigning.publicKey,
      ),
    ).rejects.toThrow('signature verification failed');
  });

  it('wrong signing key fails signature check', async () => {
    const sender = await generateX25519KeyPair();
    const recipient = await generateX25519KeyPair();
    const senderSigning = await generateEd25519KeyPair();
    const otherSigning = await generateEd25519KeyPair();
    const dataKey = await generateDataKeyAsync();

    const envelope = await wrapKeyForRecipient(
      dataKey,
      sender.privateKey,
      recipient.publicKey,
      senderSigning.privateKey,
    );

    await expect(
      unwrapKeyFromEnvelope(
        envelope,
        recipient.privateKey,
        otherSigning.publicKey,
      ),
    ).rejects.toThrow('signature verification failed');
  });

  it('different sender/recipient pairs work independently', async () => {
    const senderA = await generateX25519KeyPair();
    const senderB = await generateX25519KeyPair();
    const recipientA = await generateX25519KeyPair();
    const recipientB = await generateX25519KeyPair();
    const signingA = await generateEd25519KeyPair();
    const signingB = await generateEd25519KeyPair();
    const dataKey = await generateDataKeyAsync();

    const envA = await wrapKeyForRecipient(
      dataKey,
      senderA.privateKey,
      recipientA.publicKey,
      signingA.privateKey,
    );
    const envB = await wrapKeyForRecipient(
      dataKey,
      senderB.privateKey,
      recipientB.publicKey,
      signingB.privateKey,
    );

    const recoveredA = await unwrapKeyFromEnvelope(
      envA,
      recipientA.privateKey,
      signingA.publicKey,
    );
    const recoveredB = await unwrapKeyFromEnvelope(
      envB,
      recipientB.privateKey,
      signingB.publicKey,
    );

    expect(Buffer.from(recoveredA).equals(Buffer.from(dataKey))).toBe(true);
    expect(Buffer.from(recoveredB).equals(Buffer.from(dataKey))).toBe(true);

    // Cross-pair must fail — F3 rejects at signature verification because the
    // envelope is bound to recipientA's public key, not recipientB's.
    await expect(
      unwrapKeyFromEnvelope(envA, recipientB.privateKey, signingA.publicKey),
    ).rejects.toThrow('signature verification failed');
  });

  it('envelope has correct field sizes', async () => {
    const sender = await generateX25519KeyPair();
    const recipient = await generateX25519KeyPair();
    const signing = await generateEd25519KeyPair();
    const dataKey = await generateDataKeyAsync();

    const envelope = await wrapKeyForRecipient(
      dataKey,
      sender.privateKey,
      recipient.publicKey,
      signing.privateKey,
    );

    expect(envelope.wrappedDataKey.length).toBe(32);
    expect(envelope.nonce.length).toBe(24);
    expect(envelope.authTag.length).toBe(16);
    expect(envelope.ephemeralPublicKey.length).toBe(32);
    expect(envelope.signature.length).toBe(64);
  });

  it('two wraps of same key produce different ciphertext (random nonce)', async () => {
    const sender = await generateX25519KeyPair();
    const recipient = await generateX25519KeyPair();
    const signing = await generateEd25519KeyPair();
    const dataKey = await generateDataKeyAsync();

    const env1 = await wrapKeyForRecipient(
      dataKey,
      sender.privateKey,
      recipient.publicKey,
      signing.privateKey,
    );
    const env2 = await wrapKeyForRecipient(
      dataKey,
      sender.privateKey,
      recipient.publicKey,
      signing.privateKey,
    );

    expect(Buffer.from(env1.nonce).equals(Buffer.from(env2.nonce))).toBe(false);
    expect(
      Buffer.from(env1.wrappedDataKey).equals(Buffer.from(env2.wrappedDataKey)),
    ).toBe(false);
  });

  it('tampered nonce fails signature check', async () => {
    const sender = await generateX25519KeyPair();
    const recipient = await generateX25519KeyPair();
    const signing = await generateEd25519KeyPair();
    const dataKey = await generateDataKeyAsync();

    const envelope = await wrapKeyForRecipient(
      dataKey,
      sender.privateKey,
      recipient.publicKey,
      signing.privateKey,
    );

    const tampered: ShareEnvelope = {
      ...envelope,
      nonce: new Uint8Array(envelope.nonce.length),
    };
    tampered.nonce.set(envelope.nonce);
    tampered.nonce[0] ^= 0xff;

    await expect(
      unwrapKeyFromEnvelope(tampered, recipient.privateKey, signing.publicKey),
    ).rejects.toThrow('signature verification failed');
  });
});

describe('input validation', () => {
  it('rejects wrong-length data key', async () => {
    const sender = await generateX25519KeyPair();
    const recipient = await generateX25519KeyPair();
    const signing = await generateEd25519KeyPair();

    await expect(
      wrapKeyForRecipient(
        new Uint8Array(16),
        sender.privateKey,
        recipient.publicKey,
        signing.privateKey,
      ),
    ).rejects.toThrow('Data key must be 32 bytes');
  });

  it('rejects wrong-length private key', async () => {
    const recipient = await generateX25519KeyPair();
    const signing = await generateEd25519KeyPair();
    const dataKey = await generateDataKeyAsync();

    await expect(
      wrapKeyForRecipient(
        dataKey,
        new Uint8Array(16),
        recipient.publicKey,
        signing.privateKey,
      ),
    ).rejects.toThrow('Sender private key must be 32 bytes');
  });

  it('rejects wrong-length signing key', async () => {
    const sender = await generateX25519KeyPair();
    const recipient = await generateX25519KeyPair();
    const dataKey = await generateDataKeyAsync();

    await expect(
      wrapKeyForRecipient(
        dataKey,
        sender.privateKey,
        recipient.publicKey,
        new Uint8Array(32),
      ),
    ).rejects.toThrow('Signing key must be 64 bytes');
  });

  it('rejects wrong-length recipient public key', async () => {
    const sender = await generateX25519KeyPair();
    const signing = await generateEd25519KeyPair();
    const dataKey = await generateDataKeyAsync();

    await expect(
      wrapKeyForRecipient(
        dataKey,
        sender.privateKey,
        new Uint8Array(16),
        signing.privateKey,
      ),
    ).rejects.toThrow('Recipient public key must be 32 bytes');
  });
});

describe('unwrap input validation', () => {
  it('rejects wrong-length recipient private key', async () => {
    const sender = await generateX25519KeyPair();
    const recipient = await generateX25519KeyPair();
    const signing = await generateEd25519KeyPair();
    const dataKey = await generateDataKeyAsync();

    const envelope = await wrapKeyForRecipient(
      dataKey,
      sender.privateKey,
      recipient.publicKey,
      signing.privateKey,
    );

    await expect(
      unwrapKeyFromEnvelope(envelope, new Uint8Array(16), signing.publicKey),
    ).rejects.toThrow('Recipient private key must be 32 bytes');
  });

  it('rejects wrong-length sender signing public key', async () => {
    const sender = await generateX25519KeyPair();
    const recipient = await generateX25519KeyPair();
    const signing = await generateEd25519KeyPair();
    const dataKey = await generateDataKeyAsync();

    const envelope = await wrapKeyForRecipient(
      dataKey,
      sender.privateKey,
      recipient.publicKey,
      signing.privateKey,
    );

    await expect(
      unwrapKeyFromEnvelope(envelope, recipient.privateKey, new Uint8Array(16)),
    ).rejects.toThrow('Sender signing public key must be 32 bytes');
  });
});

describe('tamper detection (all envelope fields)', () => {
  it('tampered authTag fails signature check', async () => {
    const sender = await generateX25519KeyPair();
    const recipient = await generateX25519KeyPair();
    const signing = await generateEd25519KeyPair();
    const dataKey = await generateDataKeyAsync();

    const envelope = await wrapKeyForRecipient(
      dataKey,
      sender.privateKey,
      recipient.publicKey,
      signing.privateKey,
    );

    const tampered: ShareEnvelope = {
      ...envelope,
      authTag: new Uint8Array(envelope.authTag.length),
    };
    tampered.authTag.set(envelope.authTag);
    tampered.authTag[0] ^= 0xff;

    await expect(
      unwrapKeyFromEnvelope(tampered, recipient.privateKey, signing.publicKey),
    ).rejects.toThrow('signature verification failed');
  });

  it('tampered ephemeralPublicKey fails signature check', async () => {
    const sender = await generateX25519KeyPair();
    const recipient = await generateX25519KeyPair();
    const signing = await generateEd25519KeyPair();
    const dataKey = await generateDataKeyAsync();

    const envelope = await wrapKeyForRecipient(
      dataKey,
      sender.privateKey,
      recipient.publicKey,
      signing.privateKey,
    );

    const tampered: ShareEnvelope = {
      ...envelope,
      ephemeralPublicKey: new Uint8Array(envelope.ephemeralPublicKey.length),
    };
    tampered.ephemeralPublicKey.set(envelope.ephemeralPublicKey);
    tampered.ephemeralPublicKey[0] ^= 0xff;

    await expect(
      unwrapKeyFromEnvelope(tampered, recipient.privateKey, signing.publicKey),
    ).rejects.toThrow('signature verification failed');
  });

  it('tampered signature bytes fail verification', async () => {
    const sender = await generateX25519KeyPair();
    const recipient = await generateX25519KeyPair();
    const signing = await generateEd25519KeyPair();
    const dataKey = await generateDataKeyAsync();

    const envelope = await wrapKeyForRecipient(
      dataKey,
      sender.privateKey,
      recipient.publicKey,
      signing.privateKey,
    );

    const tampered: ShareEnvelope = {
      ...envelope,
      signature: new Uint8Array(envelope.signature.length),
    };
    tampered.signature.set(envelope.signature);
    tampered.signature[0] ^= 0xff;
    tampered.signature[63] ^= 0xff;

    await expect(
      unwrapKeyFromEnvelope(tampered, recipient.privateKey, signing.publicKey),
    ).rejects.toThrow('signature verification failed');
  });
});

describe('no plaintext key leakage', () => {
  it('envelope does not contain plaintext data key bytes', async () => {
    const sender = await generateX25519KeyPair();
    const recipient = await generateX25519KeyPair();
    const signing = await generateEd25519KeyPair();
    const dataKey = await generateDataKeyAsync();
    const dataKeyHex = Buffer.from(dataKey).toString('hex');

    const envelope = await wrapKeyForRecipient(
      dataKey,
      sender.privateKey,
      recipient.publicKey,
      signing.privateKey,
    );

    // None of the envelope fields should contain the raw data key
    const wrappedHex = Buffer.from(envelope.wrappedDataKey).toString('hex');
    const nonceHex = Buffer.from(envelope.nonce).toString('hex');
    const authTagHex = Buffer.from(envelope.authTag).toString('hex');
    const ephPubHex = Buffer.from(envelope.ephemeralPublicKey).toString('hex');
    const sigHex = Buffer.from(envelope.signature).toString('hex');

    expect(wrappedHex).not.toBe(dataKeyHex);
    expect(nonceHex).not.toContain(dataKeyHex);
    expect(authTagHex).not.toContain(dataKeyHex);
    expect(ephPubHex).not.toContain(dataKeyHex);
    expect(sigHex).not.toContain(dataKeyHex);
  });

  it('envelope does not contain sender private key bytes', async () => {
    const sender = await generateX25519KeyPair();
    const recipient = await generateX25519KeyPair();
    const signing = await generateEd25519KeyPair();
    const dataKey = await generateDataKeyAsync();
    const senderPrivHex = Buffer.from(sender.privateKey).toString('hex');

    const envelope = await wrapKeyForRecipient(
      dataKey,
      sender.privateKey,
      recipient.publicKey,
      signing.privateKey,
    );

    const allFields = Buffer.concat([
      Buffer.from(envelope.wrappedDataKey),
      Buffer.from(envelope.nonce),
      Buffer.from(envelope.authTag),
      Buffer.from(envelope.ephemeralPublicKey),
      Buffer.from(envelope.signature),
    ]).toString('hex');

    expect(allFields).not.toContain(senderPrivHex);
  });

  it('wrap does not mutate the original data key buffer', async () => {
    const sender = await generateX25519KeyPair();
    const recipient = await generateX25519KeyPair();
    const signing = await generateEd25519KeyPair();
    const dataKey = await generateDataKeyAsync();
    const snapshot = new Uint8Array(dataKey);

    await wrapKeyForRecipient(
      dataKey,
      sender.privateKey,
      recipient.publicKey,
      signing.privateKey,
    );

    expect(Buffer.from(dataKey).equals(Buffer.from(snapshot))).toBe(true);
  });
});

// ── F3: recipient binding + length-prefixed (TLV) signature payload ─────────
describe('wrapKeyForRecipient / unwrapKeyFromEnvelope — recipient binding (F3)', () => {
  it('still unwraps LEGACY v1 envelopes (backward compatible, no migration)', async () => {
    const recipient = await generateX25519KeyPair();
    const senderSigning = await generateEd25519KeyPair();
    const dataKey = await generateDataKeyAsync();
    const original = new Uint8Array(dataKey);

    const legacy = await makeLegacyV1Envelope(
      dataKey,
      recipient.publicKey,
      senderSigning.privateKey,
    );

    const recovered = await unwrapKeyFromEnvelope(
      legacy,
      recipient.privateKey,
      senderSigning.publicKey,
    );
    expect(Buffer.from(recovered).equals(Buffer.from(original))).toBe(true);
  });

  it('a v2 envelope for recipient A cannot be re-targeted to recipient B', async () => {
    const sender = await generateX25519KeyPair();
    const recipientA = await generateX25519KeyPair();
    const recipientB = await generateX25519KeyPair();
    const senderSigning = await generateEd25519KeyPair();
    const dataKey = await generateDataKeyAsync();

    const envForA = await wrapKeyForRecipient(
      dataKey,
      sender.privateKey,
      recipientA.publicKey,
      senderSigning.privateKey,
    );

    // Even with the genuine sender signing key, B's key fails verification
    // because the signature is bound to A's public key.
    await expect(
      unwrapKeyFromEnvelope(envForA, recipientB.privateKey, senderSigning.publicKey),
    ).rejects.toThrow('signature verification failed');

    // A can still unwrap normally.
    const recovered = await unwrapKeyFromEnvelope(
      envForA,
      recipientA.privateKey,
      senderSigning.publicKey,
    );
    expect(recovered.length).toBe(dataKey.length);
  });

  it('tampering with any signed field fails verification', async () => {
    const sender = await generateX25519KeyPair();
    const recipient = await generateX25519KeyPair();
    const senderSigning = await generateEd25519KeyPair();
    const dataKey = await generateDataKeyAsync();

    const env = await wrapKeyForRecipient(
      dataKey,
      sender.privateKey,
      recipient.publicKey,
      senderSigning.privateKey,
    );
    env.ephemeralPublicKey[0] ^= 0xff;

    await expect(
      unwrapKeyFromEnvelope(env, recipient.privateKey, senderSigning.publicKey),
    ).rejects.toThrow('signature verification failed');
  });
});
