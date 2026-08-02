// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Canonical signed-payload construction for personal vault-item sharing.
 *
 * Kept dependency-free (no sodium / vault imports) so it is unit-testable and
 * reusable by both the sender (sign) and a future recipient (verify) path.
 *
 * SECURITY: the payload binds a domain-separation tag, the recipient identity,
 * and the recipient public key, and length-prefixes (TLV) every field so two
 * distinct field tuples can never serialise to the same bytes. The sender signs
 * this with their Ed25519 device key; a recipient cannot forge it (they lack
 * the signing key) and cannot replay an envelope to a different recipient
 * (their identity/key is bound into the signed bytes).
 */

/** Domain-separation tag bound into every personal-share signature. */
export const SHARE_SIG_DOMAIN = "pssmngr-share-sig-v2";

/**
 * Build the canonical, length-prefixed (TLV) payload that the sender signs.
 * Each field is prefixed with its 4-byte big-endian length.
 */
export function buildShareSignaturePayload(fields: {
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
