// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import sodium from 'libsodium-wrappers-sumo';
import { wrapKeyForRecipient, unwrapKeyFromEnvelope } from './sharing';
import type { ShareEnvelope } from './types';

let sodiumReady = false;

async function ensureSodium(): Promise<void> {
  if (!sodiumReady) {
    await sodium.ready;
    sodiumReady = true;
  }
}

/**
 * Generate a random 256-bit key for a shared vault.
 *
 * This key encrypts all items in the shared vault and is wrapped
 * individually for each family member via ECDH key agreement.
 */
export async function generateSharedVaultKey(): Promise<Uint8Array> {
  await ensureSodium();
  return sodium.randombytes_buf(32);
}

/**
 * Wrap a shared vault key for a specific family member.
 *
 * Delegates to the standard sharing envelope:
 * ECDH(organizer, member) → wrap key → XChaCha20-Poly1305 → signed envelope.
 *
 * @param sharedVaultKey - 256-bit shared vault key
 * @param organizerX25519PrivateKey - Organizer's X25519 private key
 * @param memberX25519PublicKey - Target member's X25519 public key
 * @param organizerEd25519SigningKey - Organizer's Ed25519 signing key
 */
export async function wrapVaultKeyForMember(
  sharedVaultKey: Uint8Array,
  organizerX25519PrivateKey: Uint8Array,
  memberX25519PublicKey: Uint8Array,
  organizerEd25519SigningKey: Uint8Array,
): Promise<ShareEnvelope> {
  return wrapKeyForRecipient(
    sharedVaultKey,
    organizerX25519PrivateKey,
    memberX25519PublicKey,
    organizerEd25519SigningKey,
  );
}

/**
 * Unwrap a shared vault key from a member's envelope.
 *
 * @param envelope - The share envelope stored for this member
 * @param memberX25519PrivateKey - Member's X25519 private key
 * @param organizerEd25519PublicKey - Organizer's Ed25519 public key (for signature verification)
 */
export async function unwrapVaultKeyForMember(
  envelope: ShareEnvelope,
  memberX25519PrivateKey: Uint8Array,
  organizerEd25519PublicKey: Uint8Array,
): Promise<Uint8Array> {
  return unwrapKeyFromEnvelope(envelope, memberX25519PrivateKey, organizerEd25519PublicKey);
}

/**
 * Wrap a shared vault key for multiple members at once.
 *
 * Used during vault creation and key rotation. Returns one envelope per
 * member in the same order as the input public keys.
 */
export async function wrapVaultKeyForMembers(
  sharedVaultKey: Uint8Array,
  organizerX25519PrivateKey: Uint8Array,
  memberPublicKeys: Uint8Array[],
  organizerEd25519SigningKey: Uint8Array,
): Promise<ShareEnvelope[]> {
  return Promise.all(
    memberPublicKeys.map((pubKey) =>
      wrapVaultKeyForMember(
        sharedVaultKey,
        organizerX25519PrivateKey,
        pubKey,
        organizerEd25519SigningKey,
      ),
    ),
  );
}
