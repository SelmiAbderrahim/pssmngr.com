// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Type facade for the repository-local crypto package.
 *
 * Vite resolves `@pssmngr/crypto` directly to `crypto/src`; this ambient
 * module keeps the client's composite TypeScript project at its own boundary.
 * The crypto package is type-checked independently in CI.
 */
declare module "@pssmngr/crypto" {
  export interface KeyPair {
    publicKey: Uint8Array;
    privateKey: Uint8Array;
  }

  export interface X25519KeyPair extends KeyPair {
    privateKey: Uint8Array;
  }

  export interface Ed25519KeyPair extends KeyPair {
    privateKey: Uint8Array;
  }

  export interface ShareEnvelope {
    wrappedDataKey: Uint8Array;
    nonce: Uint8Array;
    authTag: Uint8Array;
    ephemeralPublicKey: Uint8Array;
    signature: Uint8Array;
  }

  export interface EscrowEnvelope {
    ciphertext: Uint8Array;
    nonce: Uint8Array;
    authTag: Uint8Array;
    ephemeralPublicKey: Uint8Array;
    signature: Uint8Array;
  }

  export interface SerializedEscrow {
    escrowBlob: string;
    escrowNonce: string;
    escrowAuthTag: string;
    ephemeralPublicKey: string;
    escrowSignature: string;
  }

  export interface EphemeralEncryptResult {
    encryptedBlob: string;
    nonce: string;
    authTag: string;
    linkKey: string;
    passphraseSalt: string | null;
  }

  export interface EphemeralAccessData {
    encryptedBlob: string;
    nonce: string;
    authTag: string;
    hasPassphrase: boolean;
    passphraseSalt: string | null;
  }

  export function createEscrowForContact(
    vaultKey: Uint8Array,
    ownerPrivateKey: Uint8Array,
    contactPublicKey: Uint8Array,
    signingKey: Uint8Array,
  ): Promise<EscrowEnvelope>;

  export function decryptEscrowAsContact(
    envelope: EscrowEnvelope,
    contactPrivateKey: Uint8Array,
    ownerSigningPublicKey: Uint8Array,
  ): Promise<Uint8Array>;

  export function serializeEscrowEnvelope(
    envelope: EscrowEnvelope,
  ): Promise<SerializedEscrow>;

  export function deserializeEscrowEnvelope(
    serialized: SerializedEscrow,
  ): Promise<EscrowEnvelope>;

  export function generateX25519KeyPair(): Promise<X25519KeyPair>;
  export function generateEd25519KeyPair(): Promise<Ed25519KeyPair>;
  export function x25519PublicFromPrivate(
    privateKey: Uint8Array,
  ): Promise<Uint8Array>;
  export function generateSharedVaultKey(): Promise<Uint8Array>;

  export function wrapVaultKeyForMember(
    sharedVaultKey: Uint8Array,
    organizerX25519PrivateKey: Uint8Array,
    memberX25519PublicKey: Uint8Array,
    organizerEd25519SigningKey: Uint8Array,
  ): Promise<ShareEnvelope>;

  export function unwrapVaultKeyForMember(
    envelope: ShareEnvelope,
    memberX25519PrivateKey: Uint8Array,
    organizerEd25519PublicKey: Uint8Array,
  ): Promise<Uint8Array>;

  export function wrapKeyForRecipient(
    dataKey: Uint8Array,
    senderPrivateKey: Uint8Array,
    recipientPublicKey: Uint8Array,
    signingKey: Uint8Array,
  ): Promise<ShareEnvelope>;

  export function unwrapKeyFromEnvelope(
    envelope: ShareEnvelope,
    recipientPrivateKey: Uint8Array,
    senderSigningPublicKey: Uint8Array,
  ): Promise<Uint8Array>;

  export function encryptForRecipient(
    plaintext: Uint8Array,
    recipientPublicKey: Uint8Array,
    senderPrivateKey: Uint8Array,
  ): Promise<{
    ciphertext: Uint8Array;
    nonce: Uint8Array;
    ephemeralPublicKey: Uint8Array;
  }>;

  export function decryptFromSender(
    ciphertext: Uint8Array,
    nonce: Uint8Array,
    ephemeralPublicKey: Uint8Array,
    recipientPrivateKey: Uint8Array,
  ): Promise<Uint8Array>;

  export function encryptForEphemeralShare(
    plaintext: string,
    passphrase?: string,
  ): Promise<EphemeralEncryptResult>;

  export function decryptEphemeralShare(
    data: EphemeralAccessData,
    linkKeyBase64: string,
    passphrase?: string,
  ): Promise<string>;
}
