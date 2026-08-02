// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Emergency Escrow Service
 *
 * Coordinates client-side escrow creation and decryption for emergency
 * access. Uses the @pssmngr/crypto escrow module for cryptographic
 * operations and the keypair-manager for device key access.
 *
 * Flow:
 *  1. Owner adds trusted contact → createEscrowForTrustedContact()
 *     - Wraps vault key with contact's X25519 public key
 *     - Returns serialized escrow for server storage
 *
 *  2. Contact granted access → decryptEscrowFromServer()
 *     - Fetches escrow blob from server
 *     - Decrypts using contact's X25519 private key
 *     - Returns the owner's vault key (read-only access)
 */

import {
  createEscrowForContact,
  decryptEscrowAsContact,
  serializeEscrowEnvelope,
  deserializeEscrowEnvelope,
} from "@pssmngr/crypto";
import type { SerializedEscrow } from "@pssmngr/crypto";
import {
  ensureDeviceSigningKey,
  getDecryptedPrivateKey,
  getDecryptedSigningKey,
  getUserPublicKey,
} from "@/services/keypair-manager";
import { getVaultKey } from "@/lib/vault-keys";
import { base64ToUint8 } from "@/lib/vault-crypto";
import { trpcQuery } from "@/lib/api/trpc";
import type { EscrowBlobResponse, EscrowInput } from "@/types/emergency";

// ── Public API ─────────────────────────────────────────────────────

/**
 * Create an escrow blob for a trusted contact.
 *
 * Called by the vault owner when adding a new trusted contact.
 * The owner's vault key is wrapped for the contact's X25519 public key.
 *
 * @param contactUserId - The contact's user ID (to look up their public key)
 * @returns Serialized escrow ready for server submission
 */
export async function createEscrowForTrustedContact(
  contactUserId: string,
): Promise<EscrowInput> {
  const vaultKey = getVaultKey();
  if (!vaultKey) {
    throw new Error("Vault must be unlocked to create escrow");
  }

  // Sign with the device's real Ed25519 signing key (registered on the
  // server as `signingPublicKey`), lazily provisioning it for devices
  // enrolled before signing keys existed. The contact verifies against
  // the server-registered public key — never one derived from public
  // material, which anyone could reproduce.
  await ensureDeviceSigningKey();
  const ownerPrivateKey = await getDecryptedPrivateKey();
  let signingKey: Uint8Array | null = null;
  try {
    signingKey = await getDecryptedSigningKey();

    // Get contact's X25519 public key from server
    const contactKeyInfo = await getUserPublicKey(contactUserId);
    const contactPublicKey = base64ToUint8(contactKeyInfo.publicKey);

    // Create and serialize the opaque envelope for server storage.
    const envelope = await createEscrowForContact(
      vaultKey,
      ownerPrivateKey,
      contactPublicKey,
      signingKey,
    );
    return await serializeEscrowEnvelope(envelope);
  } finally {
    ownerPrivateKey.fill(0);
    signingKey?.fill(0);
  }
}

/**
 * Decrypt an escrow blob retrieved from the server.
 *
 * Called by the trusted contact after emergency access is granted.
 * Returns the owner's vault key for read-only vault access.
 *
 * @param requestId - The emergency access request ID
 * @param ownerUserId - The vault owner's user ID (to look up their signing public key)
 * @returns The decrypted vault key
 */
export async function decryptEscrowFromServer(
  requestId: string,
  ownerUserId: string,
): Promise<Uint8Array> {
  // Fetch escrow blob from server
  const escrowData = await trpcQuery<EscrowBlobResponse>(
    "emergency",
    "getEscrowBlob",
    { requestId },
  );

  if (!escrowData.escrowSignature) {
    throw new Error("Escrow signature is missing — cannot verify integrity");
  }

  // Deserialize from base64
  const serialized: SerializedEscrow = {
    escrowBlob: escrowData.escrowBlob,
    escrowNonce: escrowData.escrowNonce,
    escrowAuthTag: escrowData.escrowAuthTag,
    ephemeralPublicKey: escrowData.ephemeralPublicKey,
    escrowSignature: escrowData.escrowSignature,
  };
  const envelope = await deserializeEscrowEnvelope(serialized);

  // Get owner's registered Ed25519 signing public key from the server.
  // Fail closed if the owner's device has no signing key: deriving a
  // verification key from public material instead would let anyone
  // (including the server) forge escrow signatures.
  const ownerKeyInfo = await getUserPublicKey(ownerUserId);
  if (!ownerKeyInfo.signingPublicKey) {
    throw new Error(
      "Owner has no registered signing key — cannot verify escrow authenticity",
    );
  }
  const ownerEd25519PublicKey = base64ToUint8(ownerKeyInfo.signingPublicKey);

  // Get contact's X25519 private key
  const contactPrivateKey = await getDecryptedPrivateKey();

  // Decrypt the escrow
  const vaultKey = await decryptEscrowAsContact(
    envelope,
    contactPrivateKey,
    ownerEd25519PublicKey,
  );

  // Zero sensitive material
  contactPrivateKey.fill(0);

  return vaultKey;
}
