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
} from "./keypair-manager";
import { trpcQuery } from "@/lib/api/trpc";
import { buildShareSignaturePayload } from "./share-signature";

// ── Types ──────────────────────────────────────────────────────────

export interface ShareCryptoPayload {
  recipientUserId: string;
  wrappedKey: string;
  wrappedKeyNonce: string;
  wrappedKeyAuthTag: string;
  senderSignature: string;
}

// ── Sodium loader ──────────────────────────────────────────────────

// libsodium-wrappers-sumo type defs omit some sumo-only functions
interface SodiumSumo {
  ready: Promise<void>;
  crypto_aead_xchacha20poly1305_ietf_decrypt(
    nsec: Uint8Array | null, ciphertext: Uint8Array, ad: Uint8Array | null, npub: Uint8Array, key: Uint8Array
  ): Uint8Array;
  crypto_aead_xchacha20poly1305_ietf_encrypt(
    message: Uint8Array, ad: Uint8Array | null, nsec: Uint8Array | null, npub: Uint8Array, key: Uint8Array
  ): Uint8Array;
  crypto_aead_xchacha20poly1305_ietf_NPUBBYTES: number;
  crypto_aead_xchacha20poly1305_ietf_ABYTES: number;
  crypto_scalarmult(privateKey: Uint8Array, publicKey: Uint8Array): Uint8Array;
  crypto_generichash(hashLength: number, message: Uint8Array, key?: Uint8Array): Uint8Array;
  crypto_sign_detached(message: Uint8Array, privateKey: Uint8Array): Uint8Array;
  randombytes_buf(length: number): Uint8Array;
}

let _sodiumPromise: Promise<SodiumSumo> | null = null;

async function loadSodium(): Promise<SodiumSumo> {
  if (!_sodiumPromise) {
    _sodiumPromise = (async () => {
      try {
        const mod = await import("libsodium-wrappers-sumo");
        const sodium = (mod.default ?? mod) as unknown as SodiumSumo;
        await sodium.ready;
        return sodium;
      } catch (err) {
        _sodiumPromise = null;
        throw err;
      }
    })();
  }
  return _sodiumPromise;
}

// ── Public API ─────────────────────────────────────────────────────

/**
 * Prepare the crypto fields required by the sharing.shareItem endpoint.
 *
 * 1. Look up recipient by email → userId + X25519 public key
 * 2. Unwrap item's per-item data key using vault key
 * 3. ECDH(sender X25519 private, recipient X25519 public) → shared secret
 * 4. Derive wrap key via BLAKE2b with domain separation
 * 5. Wrap data key with XChaCha20-Poly1305
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

  const sodium = await loadSodium();

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

  try {
    // 3. Unwrap item's data key using vault key
    const wrappedDK = base64ToUint8(itemWrappedDataKey);
    const wrapNonce = base64ToUint8(itemWrappedDataKeyNonce);
    const wrapTag = base64ToUint8(itemWrappedDataKeyAuthTag);

    const wrapCombined = new Uint8Array(wrappedDK.length + wrapTag.length);
    wrapCombined.set(wrappedDK, 0);
    wrapCombined.set(wrapTag, wrappedDK.length);

    const dataKey = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
      null,
      wrapCombined,
      null,
      wrapNonce,
      vaultKey,
    );

    // 4. ECDH → shared secret (hashed with BLAKE2b)
    const rawShared = sodium.crypto_scalarmult(senderPrivateKey, recipientPubKey);
    const sharedSecret = new Uint8Array(
      sodium.crypto_generichash(32, rawShared),
    );
    rawShared.fill(0);

    // 5. Derive wrap key with domain separation
    const info = new TextEncoder().encode("pssmngr-share-v1");
    const shareWrapKey = new Uint8Array(
      sodium.crypto_generichash(32, info, sharedSecret),
    );

    // 6. Wrap data key for recipient (XChaCha20-Poly1305)
    const shareNonce = sodium.randombytes_buf(
      sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES,
    );
    const shareCombined = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
      dataKey,
      null,
      null,
      shareNonce,
      shareWrapKey,
    );

    const tagLen = sodium.crypto_aead_xchacha20poly1305_ietf_ABYTES;
    const shareWrapped = new Uint8Array(shareCombined.slice(0, -tagLen));
    const shareAuthTag = new Uint8Array(shareCombined.slice(-tagLen));

    // Zero data key
    dataKey.fill(0);

    // 7. Ed25519 detached signature for sender authentication. Unlike a MAC
    //    keyed on the ECDH shared secret (which the recipient can also derive,
    //    making it forgeable), only the holder of the sender's signing key can
    //    produce this. The payload is recipient-bound + length-prefixed.
    const signPayload = buildShareSignaturePayload({
      recipientUserId: recipient.userId,
      recipientPublicKey: recipientPubKey,
      wrappedKey: shareWrapped,
      nonce: new Uint8Array(shareNonce),
      authTag: shareAuthTag,
    });

    const signature = new Uint8Array(
      sodium.crypto_sign_detached(signPayload, senderSigningKey),
    );

    // Clean up secrets
    sharedSecret.fill(0);
    shareWrapKey.fill(0);

    return {
      recipientUserId: recipient.userId,
      wrappedKey: uint8ToBase64(shareWrapped),
      wrappedKeyNonce: uint8ToBase64(new Uint8Array(shareNonce)),
      wrappedKeyAuthTag: uint8ToBase64(shareAuthTag),
      senderSignature: uint8ToBase64(signature),
    };
  } finally {
    senderPrivateKey.fill(0);
    senderSigningKey.fill(0);
  }
}
