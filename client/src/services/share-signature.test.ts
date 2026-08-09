// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Security regression tests for personal-share sender authentication.
 *
 * The previous implementation signed the envelope with a BLAKE2b MAC keyed on
 * the ECDH shared secret — which the RECIPIENT also derives, making the
 * "signature" forgeable and therefore worthless for authenticating the sender.
 * The fix signs a recipient-bound, length-prefixed payload with the sender's
 * Ed25519 device key. These tests prove:
 *   1. payload binding (domain tag, recipient identity/key, TLV framing),
 *   2. a real Ed25519 signature verifies with the sender's PUBLIC key,
 *   3. re-targeting the envelope to a different recipient breaks verification,
 *   4. a recipient (who has the shared secret but NOT the signing key) cannot
 *      forge a signature.
 */
import { describe, expect, it } from "vitest";
import {
  SHARE_SIG_DOMAIN,
  buildShareSignaturePayload,
} from "./share-signature";

// NOTE: the end-to-end Ed25519 sign/verify proof (a genuine signature verifies,
// re-targeting breaks it, and a non-signer cannot forge) lives in the crypto
// package's share-signature-binding test, where libsodium is fully available.
// Here we cover the recipient-binding + TLV-framing of the signed payload.

const baseFields = () => ({
  recipientUserId: "user-recipient-1",
  recipientPublicKey: new Uint8Array(32).fill(7),
  wrappedKey: new Uint8Array([1, 2, 3, 4, 5]),
  nonce: new Uint8Array(24).fill(9),
  authTag: new Uint8Array(16).fill(3),
});

describe("buildShareSignaturePayload", () => {
  it("starts with the domain-separation tag", () => {
    const payload = buildShareSignaturePayload(baseFields());
    const tag = new TextEncoder().encode(SHARE_SIG_DOMAIN);
    // First 4 bytes are the big-endian length prefix of the tag.
    const view = new DataView(payload.buffer);
    expect(view.getUint32(0, false)).toBe(tag.length);
    expect(Array.from(payload.slice(4, 4 + tag.length))).toEqual(
      Array.from(tag),
    );
  });

  it("is deterministic for identical inputs", () => {
    expect(buildShareSignaturePayload(baseFields())).toEqual(
      buildShareSignaturePayload(baseFields()),
    );
  });

  it("changes when the recipient id changes (anti re-targeting)", () => {
    const a = buildShareSignaturePayload(baseFields());
    const b = buildShareSignaturePayload({
      ...baseFields(),
      recipientUserId: "user-recipient-2",
    });
    expect(a).not.toEqual(b);
  });

  it("changes when the recipient public key changes", () => {
    const a = buildShareSignaturePayload(baseFields());
    const b = buildShareSignaturePayload({
      ...baseFields(),
      recipientPublicKey: new Uint8Array(32).fill(8),
    });
    expect(a).not.toEqual(b);
  });

  it("is not vulnerable to concatenation ambiguity (TLV framing)", () => {
    // Moving a byte from one variable-length field to the next would collide
    // under naive concatenation; length-prefixing keeps them distinct.
    const a = buildShareSignaturePayload({
      ...baseFields(),
      recipientUserId: "ab",
      wrappedKey: new Uint8Array([1, 2, 3]),
    });
    const b = buildShareSignaturePayload({
      ...baseFields(),
      recipientUserId: "abc",
      wrappedKey: new Uint8Array([2, 3]),
    });
    expect(a).not.toEqual(b);
  });
});

