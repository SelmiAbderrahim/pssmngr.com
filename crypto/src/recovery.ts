// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import sodium from 'libsodium-wrappers-sumo';
import { wrapKeyForRecipient } from './sharing';
import type { ShareEnvelope } from './types';

let sodiumReady = false;

async function ensureSodium(): Promise<void> {
  if (!sodiumReady) {
    await sodium.ready;
    sodiumReady = true;
  }
}

/**
 * Re-wrap a shared vault key for a recovered member using their new public key.
 *
 * Called by the organizer after approving a recovery request. The organizer
 * already holds the shared vault key (decrypted from their own envelope).
 * This wraps it for the member's new X25519 public key so they can regain
 * shared vault access without the organizer ever seeing private vault data.
 *
 * @param sharedVaultKey - The decrypted shared vault key (organizer has this)
 * @param organizerX25519PrivateKey - Organizer's X25519 private key
 * @param memberNewX25519PublicKey - Member's NEW X25519 public key (post-recovery)
 * @param organizerEd25519SigningKey - Organizer's Ed25519 signing key
 */
export async function rewrapSharedVaultKeyForRecovery(
  sharedVaultKey: Uint8Array,
  organizerX25519PrivateKey: Uint8Array,
  memberNewX25519PublicKey: Uint8Array,
  organizerEd25519SigningKey: Uint8Array,
): Promise<ShareEnvelope> {
  return wrapKeyForRecipient(
    sharedVaultKey,
    organizerX25519PrivateKey,
    memberNewX25519PublicKey,
    organizerEd25519SigningKey,
  );
}

/**
 * Re-wrap multiple shared vault keys for a recovered member.
 *
 * Used when the member belongs to several shared vaults. The organizer
 * decrypts each shared vault key from their own envelope and re-wraps
 * each one for the member's new public key.
 *
 * @param vaultKeys - Array of { vaultId, sharedVaultKey } the organizer decrypted
 * @param organizerX25519PrivateKey - Organizer's X25519 private key
 * @param memberNewX25519PublicKey - Member's NEW X25519 public key
 * @param organizerEd25519SigningKey - Organizer's Ed25519 signing key
 */
export async function rewrapSharedVaultKeysForRecovery(
  vaultKeys: Array<{ vaultId: string; sharedVaultKey: Uint8Array }>,
  organizerX25519PrivateKey: Uint8Array,
  memberNewX25519PublicKey: Uint8Array,
  organizerEd25519SigningKey: Uint8Array,
): Promise<Array<{ vaultId: string; envelope: ShareEnvelope }>> {
  return Promise.all(
    vaultKeys.map(async ({ vaultId, sharedVaultKey }) => ({
      vaultId,
      envelope: await rewrapSharedVaultKeyForRecovery(
        sharedVaultKey,
        organizerX25519PrivateKey,
        memberNewX25519PublicKey,
        organizerEd25519SigningKey,
      ),
    })),
  );
}

/**
 * Generate a recovery token — a random 256-bit value used to
 * authenticate the recovery completion step.
 *
 * The token is shared out-of-band (e.g. shown to the organizer
 * who communicates it to the member) to prove they authorized recovery.
 */
export async function generateRecoveryToken(): Promise<Uint8Array> {
  await ensureSodium();
  return sodium.randombytes_buf(32);
}
