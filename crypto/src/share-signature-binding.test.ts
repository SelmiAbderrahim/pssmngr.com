// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * End-to-end proof that personal vault-item share envelopes are authenticated
 * with an UNFORGEABLE Ed25519 sender signature over a recipient-bound,
 * length-prefixed (TLV) payload.
 *
 * Background: the client's previous personal-share path (sharing-crypto.ts)
 * "signed" the envelope with a BLAKE2b MAC keyed on the ECDH shared secret.
 * Because the recipient derives the identical shared secret, that MAC is
 * forgeable by the recipient and proves nothing about the sender. The fix signs
 * with the sender's Ed25519 device key instead. This test mirrors the exact
 * payload layout from client/src/services/share-signature.ts and proves:
 *   1. a genuine signature verifies with the sender's PUBLIC key,
 *   2. re-targeting the envelope to a different recipient breaks verification,
 *   3. a party without the sender's signing key cannot forge a valid signature.
 */
import { describe, it, expect } from 'vitest';
import { generateEd25519KeyPair, sign, verify } from './keypair';

const SHARE_SIG_DOMAIN = 'pssmngr-share-sig-v2';

/** Mirror of client buildShareSignaturePayload (TLV, recipient-bound). */
function buildShareSignaturePayload(fields: {
  recipientUserId: string;
  recipientPublicKey: Uint8Array;
  wrappedKey: Uint8Array;
  nonce: Uint8Array;
  authTag: Uint8Array;
}): Uint8Array {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [
    enc.encode(SHARE_SIG_DOMAIN),
    enc.encode(fields.recipientUserId),
    fields.recipientPublicKey,
    fields.wrappedKey,
    fields.nonce,
    fields.authTag,
  ];
  const total = parts.reduce((n, p) => n + 4 + p.length, 0);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  let off = 0;
  for (const p of parts) {
    view.setUint32(off, p.length, false);
    off += 4;
    out.set(p, off);
    off += p.length;
  }
  return out;
}

const baseFields = () => ({
  recipientUserId: 'user-recipient-1',
  recipientPublicKey: new Uint8Array(32).fill(7),
  wrappedKey: new Uint8Array([1, 2, 3, 4, 5]),
  nonce: new Uint8Array(24).fill(9),
  authTag: new Uint8Array(16).fill(3),
});

describe('personal-share Ed25519 sender authentication', () => {
  it('genuine signature verifies with the sender public key', async () => {
    const sender = await generateEd25519KeyPair();
    const payload = buildShareSignaturePayload(baseFields());
    const signature = await sign(payload, sender.privateKey);
    expect(await verify(payload, signature, sender.publicKey)).toBe(true);
  });

  it('re-targeting to a different recipient breaks verification', async () => {
    const sender = await generateEd25519KeyPair();
    const fields = baseFields();
    const signature = await sign(
      buildShareSignaturePayload(fields),
      sender.privateKey,
    );

    const reTargeted = buildShareSignaturePayload({
      ...fields,
      recipientUserId: 'attacker-recipient',
    });
    expect(await verify(reTargeted, signature, sender.publicKey)).toBe(false);
  });

  it('swapping the recipient public key breaks verification', async () => {
    const sender = await generateEd25519KeyPair();
    const fields = baseFields();
    const signature = await sign(
      buildShareSignaturePayload(fields),
      sender.privateKey,
    );
    const swapped = buildShareSignaturePayload({
      ...fields,
      recipientPublicKey: new Uint8Array(32).fill(8),
    });
    expect(await verify(swapped, signature, sender.publicKey)).toBe(false);
  });

  it('a non-signer (e.g. the recipient) cannot forge a valid signature', async () => {
    const sender = await generateEd25519KeyPair();
    const attacker = await generateEd25519KeyPair();
    const payload = buildShareSignaturePayload(baseFields());

    // Attacker signs with their own key; it must NOT verify as the sender.
    const forged = await sign(payload, attacker.privateKey);
    expect(await verify(payload, forged, sender.publicKey)).toBe(false);
  });
});
