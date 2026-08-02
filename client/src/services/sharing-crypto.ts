// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Sharing Crypto Service
 *
 * Prepares the zero-knowledge crypto payload for sharing a vault item.
 * Handles recipient lookup, data key unwrapping, ECDH key wrapping,
 * and sender authentication — all client-side.
 *
 * SECURITY (sender authentication): the envelope is authenticated with a
 * detached **Ed25519 signature** made by the sender's device signing key, NOT
 * a symmetric MAC keyed on the ECDH shared secret. A shared-secret MAC is
 * forgeable by the recipient (who derives the identical secret), so it proves
 * nothing about the sender. The Ed25519 signature can only be produced by the
 * holder of the sender's private signing key, and it covers the recipient
 * identity + public key so a captured envelope cannot be re-targeted to a
 * different recipient. Verify with `@pssmngr/crypto`'s `verify` against the
 * sender's Ed25519 public key. The payload is length-prefixed (TLV) so no two
 * distinct field tuples can serialise to the same bytes.
 */

import { getVaultKey } from "@/lib/vault-keys";
import { uint8ToBase64, base64ToUint8 } from "@/lib/vault-crypto";
import {
  getDecryptedPrivateKey,
  getDecryptedSigningKey,
  ensureDeviceSigningKey,
  decryptEscrowBlob,
  fetchMyDevicesWithEscrow,
} from "./keypair-manager";
import { trpcQuery } from "@/lib/api/trpc";
import {
  decryptItem,
  unwrapKey,
  unwrapKeyFromEnvelope,
  wrapKeyForRecipient,
  type ShareEnvelope,
} from "@pssmngr/crypto";

// ── Types ──────────────────────────────────────────────────────────

export interface ShareCryptoPayload {
  recipientUserId: string;
  wrappedKey: string;
  wrappedKeyNonce: string;
  wrappedKeyAuthTag: string;
  senderSignature: string;
}

// ── Public API ─────────────────────────────────────────────────────

/**
 * Prepare the crypto fields required by the sharing.shareItem endpoint.
 *
 * 1. Look up recipient by email → userId + X25519 public key
 * 2. Unwrap item's per-item data key using vault key
 * 3. Generate an ephemeral X25519 key and derive a recipient-bound shared key
 * 4. Wrap the data key with XChaCha20-Poly1305
 * 5. Store the ephemeral public key alongside the wrapped key
 * 6. Ed25519-sign the recipient-bound envelope with the sender's signing key
 */
export async function prepareSharePayload(
  recipientEmail: string,
  itemWrappedDataKey: string,
  itemWrappedDataKeyNonce: string,
  itemWrappedDataKeyAuthTag: string,
): Promise<ShareCryptoPayload> {
  const vaultKey = getVaultKey();
  if (!vaultKey) throw new Error("Vault is locked");

  // Lazily ensure this device has an Ed25519 signing key (older devices may
  // pre-date signed sharing); required to authenticate the envelope.
  await ensureDeviceSigningKey();

  // 1. Look up recipient's userId and public key
  const recipient = await trpcQuery<{ userId: string; publicKey: string }>(
    "sharing",
    "lookupRecipientByEmail",
    { email: recipientEmail },
  );

  const recipientPubKey = base64ToUint8(recipient.publicKey);

  // 2. Get sender's X25519 private key + Ed25519 signing key (from IndexedDB)
  const senderPrivateKey = await getDecryptedPrivateKey();
  const senderSigningKey = await getDecryptedSigningKey();
  let dataKey: Uint8Array | null = null;

  try {
    const unwrappedDataKey = await unwrapKey(
      {
        encryptedDataKey: base64ToUint8(itemWrappedDataKey),
        nonce: base64ToUint8(itemWrappedDataKeyNonce),
        authTag: base64ToUint8(itemWrappedDataKeyAuthTag),
      },
      vaultKey,
    );
    dataKey = unwrappedDataKey;
    const shareEnvelope = await wrapKeyForRecipient(
      unwrappedDataKey,
      senderPrivateKey,
      recipientPubKey,
      senderSigningKey,
    );
    const storedWrappedKey = new Uint8Array(
      shareEnvelope.ephemeralPublicKey.length +
        shareEnvelope.wrappedDataKey.length,
    );
    storedWrappedKey.set(shareEnvelope.ephemeralPublicKey, 0);
    storedWrappedKey.set(
      shareEnvelope.wrappedDataKey,
      shareEnvelope.ephemeralPublicKey.length,
    );

    return {
      recipientUserId: recipient.userId,
      wrappedKey: uint8ToBase64(storedWrappedKey),
      wrappedKeyNonce: uint8ToBase64(shareEnvelope.nonce),
      wrappedKeyAuthTag: uint8ToBase64(shareEnvelope.authTag),
      senderSignature: uint8ToBase64(shareEnvelope.signature),
    };
  } finally {
    dataKey?.fill(0);
    senderPrivateKey.fill(0);
    senderSigningKey.fill(0);
  }
}

interface ReceivedShareEnvelope {
  id: string;
  recipientUserId: string;
  wrappedKey: string;
  wrappedKeyNonce: string;
  wrappedKeyAuthTag: string;
  senderSignature: string;
  permission: "view" | "edit" | "share";
  item: {
    id: string;
    itemType: string;
    ciphertext: string;
    nonce: string;
    authTag: string;
    version: number;
    createdAt: string;
    updatedAt: string;
  };
  senderDevices: Array<{
    publicKey: string | null;
    signingPublicKey: string | null;
  }>;
}

export interface DecryptedReceivedShare {
  item: ReceivedShareEnvelope["item"];
  permission: ReceivedShareEnvelope["permission"];
  decrypted: Record<string, unknown>;
}

/** Verify and decrypt an accepted person-to-person share on this device. */
export async function decryptReceivedShare(
  shareId: string,
): Promise<DecryptedReceivedShare> {
  const envelope = await trpcQuery<ReceivedShareEnvelope>(
    "sharing",
    "getShareEnvelope",
    { shareId },
  );
  const recipientPrivateKey = await getDecryptedPrivateKey();
  let dataKey: Uint8Array | null = null;

  try {
    const storedWrappedKey = base64ToUint8(envelope.wrappedKey);
    if (storedWrappedKey.length <= 32) {
      throw new Error("This share uses an obsolete envelope; ask the sender to share it again");
    }
    const shareEnvelope: ShareEnvelope = {
      ephemeralPublicKey: storedWrappedKey.slice(0, 32),
      wrappedDataKey: storedWrappedKey.slice(32),
      nonce: base64ToUint8(envelope.wrappedKeyNonce),
      authTag: base64ToUint8(envelope.wrappedKeyAuthTag),
      signature: base64ToUint8(envelope.senderSignature),
    };
    const tryRecipientKey = async (privateKey: Uint8Array) => {
      for (const senderDevice of envelope.senderDevices) {
        if (!senderDevice.signingPublicKey) continue;
        try {
          return await unwrapKeyFromEnvelope(
            shareEnvelope,
            privateKey,
            base64ToUint8(senderDevice.signingPublicKey),
          );
        } catch {
          // Users can have several devices; both device keys must match.
        }
      }
      return null;
    };

    dataKey = await tryRecipientKey(recipientPrivateKey);

    // A share may have been addressed while another recipient device was the
    // most recent/trusted one. Try that user's vault-key-encrypted device-key
    // escrows locally; the server still never receives a private key.
    if (!dataKey) {
      const vaultKey = getVaultKey();
      if (vaultKey) {
        const devices = await fetchMyDevicesWithEscrow();
        for (const device of devices) {
          if (!device.escrowedPrivateKey) continue;
          const escrowedPrivateKey = await decryptEscrowBlob(
            device.escrowedPrivateKey,
            vaultKey,
          );
          try {
            dataKey = await tryRecipientKey(escrowedPrivateKey);
            if (dataKey) break;
          } finally {
            escrowedPrivateKey.fill(0);
          }
        }
      }
    }
    if (!dataKey) throw new Error("Share envelope signature verification failed");

    const plaintext = await decryptItem(
      {
        ciphertext: base64ToUint8(envelope.item.ciphertext),
        nonce: base64ToUint8(envelope.item.nonce),
        authTag: base64ToUint8(envelope.item.authTag),
        version: envelope.item.version as 1 | 2,
      },
      dataKey,
    );

    return {
      item: envelope.item,
      permission: envelope.permission,
      decrypted: JSON.parse(new TextDecoder().decode(plaintext)),
    };
  } finally {
    recipientPrivateKey.fill(0);
    dataKey?.fill(0);
  }
}
