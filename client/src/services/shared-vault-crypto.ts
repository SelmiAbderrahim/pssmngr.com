// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Shared Vault Crypto
 *
 * Client-side zero-knowledge key wrapping for shared (organization / family)
 * vaults. A shared vault has a single random 256-bit key that encrypts all its
 * items. That key is wrapped individually for each member via signed ECDH
 * (X25519 + Ed25519) so the server never sees it.
 *
 * Wrap  (granter): ECDH(granterX25519, memberX25519) → wrap key → XChaCha20
 *                  → Ed25519-signed envelope, verifiable by the member.
 * Unwrap (member): verify granter Ed25519 signature → ECDH → unwrap.
 *
 * Reuses the audited primitives in `@pssmngr/crypto`.
 */
import {
  generateSharedVaultKey,
  wrapVaultKeyForMember,
  unwrapVaultKeyForMember,
  x25519PublicFromPrivate,
  type ShareEnvelope,
} from "@pssmngr/crypto";
import { uint8ToBase64, base64ToUint8 } from "@/lib/vault-crypto";
import {
  getDecryptedPrivateKey,
  getDecryptedSigningKey,
  ensureDeviceSigningKey,
} from "@/services/keypair-manager";

/** Wrapped-key envelope in base64 form (matches the server's storage shape). */
export interface WrappedKeyB64 {
  wrappedKey: string;
  wrappedKeyNonce: string;
  wrappedKeyAuthTag: string;
  ephemeralPublicKey: string;
  senderSignature: string;
}

/** A member entry sent to sharedVault.create/createForOrg/addMember. */
export interface MemberKeyB64 extends WrappedKeyB64 {
  userId: string;
  permission: "view" | "edit" | "share" | "manage";
}

/** Generate a fresh 256-bit shared vault key. */
export async function createSharedVaultKey(): Promise<Uint8Array> {
  return generateSharedVaultKey();
}

/**
 * Wrap the shared vault key for a member, given their X25519 public key (base64).
 * Uses this device's X25519 + Ed25519 private keys; ensures a signing key exists
 * first (lazy upgrade for older devices). Requires the vault to be unlocked.
 */
export async function wrapSharedVaultKeyForMember(
  sharedKey: Uint8Array,
  memberPublicKeyB64: string,
): Promise<WrappedKeyB64> {
  await ensureDeviceSigningKey();
  const myPrivate = await getDecryptedPrivateKey();
  const mySigning = await getDecryptedSigningKey();
  try {
    const env = await wrapVaultKeyForMember(
      sharedKey,
      myPrivate,
      base64ToUint8(memberPublicKeyB64),
      mySigning,
    );
    return envelopeToB64(env);
  } finally {
    myPrivate.fill(0);
    mySigning.fill(0);
  }
}

/**
 * Wrap the shared vault key for *this* device (the caller themself).
 *
 * Derives the current device's X25519 public key locally from its decrypted
 * private key — never asks the server for it. This both avoids
 * `device.getPublicKey`'s `PRECONDITION_FAILED` when the caller has multiple
 * untrusted devices, and guarantees the wrap targets the device that will later
 * unwrap it (the server might otherwise return a different device's key).
 */
export async function wrapSharedVaultKeyForSelf(
  sharedKey: Uint8Array,
): Promise<WrappedKeyB64> {
  await ensureDeviceSigningKey();
  const myPrivate = await getDecryptedPrivateKey();
  const mySigning = await getDecryptedSigningKey();
  try {
    const myPublic = await x25519PublicFromPrivate(myPrivate);
    const env = await wrapVaultKeyForMember(
      sharedKey,
      myPrivate,
      myPublic,
      mySigning,
    );
    return envelopeToB64(env);
  } finally {
    myPrivate.fill(0);
    mySigning.fill(0);
  }
}

/**
 * Unwrap the shared vault key from the caller's stored envelope.
 * `senderSigningPublicKey` (base64) is the granter's Ed25519 public key,
 * required to verify the envelope signature.
 */
export async function unwrapSharedVaultKey(
  wrapped: WrappedKeyB64 & {
    senderSigningPublicKey?: string | null;
    senderSigningPublicKeys?: string[] | null;
  },
  // Escrow recovery: try a candidate private key (e.g. decrypted from another
  // of the user's escrowed devices) instead of this browser's stored one.
  // The caller owns the override's lifetime (it is NOT zeroed here).
  privateKeyOverride?: Uint8Array,
): Promise<Uint8Array> {
  // The envelope was signed by whichever of the granter's devices performed the
  // grant — which may be untrusted or not the latest. The server hands us every
  // candidate; try each until the signature verifies. Falls back to the legacy
  // singular field for older servers.
  const candidates = wrapped.senderSigningPublicKeys?.length
    ? wrapped.senderSigningPublicKeys
    : wrapped.senderSigningPublicKey
      ? [wrapped.senderSigningPublicKey]
      : [];
  if (candidates.length === 0) {
    throw new Error("Cannot unwrap shared vault key: missing granter signing key");
  }
  const myPrivate = privateKeyOverride ?? (await getDecryptedPrivateKey());
  try {
    const env: ShareEnvelope = {
      wrappedDataKey: base64ToUint8(wrapped.wrappedKey),
      nonce: base64ToUint8(wrapped.wrappedKeyNonce),
      authTag: base64ToUint8(wrapped.wrappedKeyAuthTag),
      ephemeralPublicKey: base64ToUint8(wrapped.ephemeralPublicKey),
      signature: base64ToUint8(wrapped.senderSignature),
    };
    let lastErr: unknown;
    for (const sigKey of candidates) {
      try {
        return await unwrapVaultKeyForMember(env, myPrivate, base64ToUint8(sigKey));
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr instanceof Error
      ? lastErr
      : new Error("Share envelope signature verification failed");
  } finally {
    if (!privateKeyOverride) myPrivate.fill(0);
  }
}

function envelopeToB64(env: ShareEnvelope): WrappedKeyB64 {
  return {
    wrappedKey: uint8ToBase64(env.wrappedDataKey),
    wrappedKeyNonce: uint8ToBase64(env.nonce),
    wrappedKeyAuthTag: uint8ToBase64(env.authTag),
    ephemeralPublicKey: uint8ToBase64(env.ephemeralPublicKey),
    senderSignature: uint8ToBase64(env.signature),
  };
}

// ── In-memory cache of unwrapped shared vault keys (by vaultId) ────────

const sharedKeyCache = new Map<string, Uint8Array>();

export function cacheSharedVaultKey(vaultId: string, key: Uint8Array): void {
  sharedKeyCache.set(vaultId, key);
}

export function getCachedSharedVaultKey(vaultId: string): Uint8Array | null {
  return sharedKeyCache.get(vaultId) ?? null;
}

export function clearSharedVaultKeys(): void {
  for (const k of sharedKeyCache.values()) k.fill(0);
  sharedKeyCache.clear();
}
