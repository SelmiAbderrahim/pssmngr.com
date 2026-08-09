// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Cryptographic type definitions for pssmngr
 *
 * These interfaces define the data structures used across all cryptographic
 * operations. See docs/security/crypto-profile.md for algorithm specifications.
 */

// ---------------------------------------------------------------------------
// Crypto version
// ---------------------------------------------------------------------------

/**
 * Supported cryptographic protocol versions.
 *
 * - `1` (legacy): AEAD with no associated data — the `version` field travelled
 *   alongside the ciphertext but was not authenticated.
 * - `2` (current): the `version` is bound into the AEAD associated data, so the
 *   authentication tag now detects version tampering / downgrade. Version-1
 *   blobs still decrypt (see `decryptItem`), so existing data is unaffected and
 *   re-encryption happens lazily on next write.
 */
export type CryptoVersion = 1 | 2;

/** Legacy protocol version (no AAD binding). Retained for decryption only. */
export const LEGACY_CRYPTO_VERSION: CryptoVersion = 1;

/** Current protocol version — always used for new encryptions. */
export const CURRENT_CRYPTO_VERSION: CryptoVersion = 2;

// ---------------------------------------------------------------------------
// Key derivation (Argon2id)
// ---------------------------------------------------------------------------

/** Parameters for Argon2id key derivation. */
export interface DeriveKeyParams {
  /** User's master password (UTF-8, will be NFC-normalized before use). */
  masterPassword: string;
  /** Device-generated secret key (>= 128 bits entropy). */
  secretKey: Uint8Array;
  /** Per-user random salt (128-bit / 16 bytes). */
  salt: Uint8Array;
  /** Memory cost in KiB. Minimum 131072 (128 MiB). */
  memoryKiB?: number;
  /** Time cost (iterations). Calibrated to 200–500 ms. */
  iterations?: number;
  /** Degree of parallelism (lanes). */
  parallelism?: number;
}

/** Stored KDF parameters (sent to server alongside salt). */
export interface KdfParams {
  memoryKiB: number;
  iterations: number;
  parallelism: number;
}

/** Result of initial key derivation (registration). */
export interface DeriveKeyResult {
  /** 256-bit vault key — keep in memory only. */
  vaultKey: Uint8Array;
  /** Random salt used for derivation. */
  salt: Uint8Array;
  /** Calibrated KDF parameters. */
  kdfParams: KdfParams;
}

// ---------------------------------------------------------------------------
// Authenticated encryption (XChaCha20-Poly1305)
// ---------------------------------------------------------------------------

/** Encrypted blob as stored on the server. */
export interface EncryptedBlob {
  /** Ciphertext bytes (variable length). */
  ciphertext: Uint8Array;
  /** 192-bit random nonce (24 bytes). */
  nonce: Uint8Array;
  /** 128-bit authentication tag (16 bytes). */
  authTag: Uint8Array;
  /**
   * Crypto protocol version.
   *
   * For version >= 2 this field is **bound into the AEAD associated data** by
   * `encryptItem`/`decryptItem`, so the authentication tag detects any attempt
   * to tamper with or downgrade the version of a stored blob. Version-1 blobs
   * (written before this binding) remain decryptable via the legacy path.
   */
  version: CryptoVersion;
}

/** Additional Authenticated Data for AEAD operations. */
export interface AeadAad {
  /** Item type identifier (uint8). */
  itemType: number;
  /** Crypto protocol version (uint16). */
  version: CryptoVersion;
}

/** Supported vault item types for AAD construction. */
export enum VaultItemType {
  Login = 1,
  SecureNote = 2,
  CreditCard = 3,
  Identity = 4,
}

// ---------------------------------------------------------------------------
// Key wrapping
// ---------------------------------------------------------------------------

/** A per-item data key wrapped (encrypted) by the vault key. */
export interface WrappedKey {
  /** Data key encrypted with vault key via XChaCha20-Poly1305. */
  encryptedDataKey: Uint8Array;
  /** 192-bit random nonce used for wrapping. */
  nonce: Uint8Array;
  /** 128-bit auth tag from wrapping operation. */
  authTag: Uint8Array;
}

// ---------------------------------------------------------------------------
// Asymmetric key pairs (X25519 / Ed25519)
// ---------------------------------------------------------------------------

/** Generic key pair (used for both X25519 and Ed25519). */
export interface KeyPair {
  /** Public key (32 bytes). */
  publicKey: Uint8Array;
  /** Private key (32 bytes for X25519, 64 bytes for Ed25519). */
  privateKey: Uint8Array;
}

/** An X25519 key pair for ECDH key agreement. */
export interface X25519KeyPair extends KeyPair {
  /** Private key (32 bytes). */
  privateKey: Uint8Array;
}

/** An Ed25519 key pair for digital signatures. */
export interface Ed25519KeyPair extends KeyPair {
  /** Private key (64 bytes — Ed25519 expanded secret key). */
  privateKey: Uint8Array;
}

// ---------------------------------------------------------------------------
// Sharing (key agreement + envelope)
// ---------------------------------------------------------------------------

/** Share envelope — everything needed for recipient to unwrap a shared item. */
export interface ShareEnvelope {
  /** Data key wrapped with the ECDH-derived wrap key. */
  wrappedDataKey: Uint8Array;
  /** Nonce used for wrapping. */
  nonce: Uint8Array;
  /** Auth tag from wrapping. */
  authTag: Uint8Array;
  /** Sender's ephemeral X25519 public key (used as HKDF salt). */
  ephemeralPublicKey: Uint8Array;
  /** Ed25519 signature over the envelope contents. */
  signature: Uint8Array;
}

/** HKDF parameters for deriving wrap keys from ECDH shared secrets. */
export interface HkdfParams {
  /** HKDF info string (context identifier). */
  info: string;
  /** Output key length in bytes. */
  outputLengthBytes: number;
}

/** Pre-defined HKDF contexts. */
export const HKDF_CONTEXTS = {
  share: "pssmngr-share-v1",
  recovery: "pssmngr-recovery-v1",
  deviceEnrollment: "pssmngr-device-v1",
  escrow: "pssmngr-escrow-v1",
} as const;

// ---------------------------------------------------------------------------
// Emergency escrow
// ---------------------------------------------------------------------------

/** Escrow envelope — vault key wrapped for a trusted contact's public key. */
export interface EscrowEnvelope {
  /** Vault key wrapped with the ECDH-derived escrow key. */
  wrappedVaultKey: Uint8Array;
  /** Nonce used for wrapping. */
  nonce: Uint8Array;
  /** Auth tag from wrapping. */
  authTag: Uint8Array;
  /** Owner's ephemeral X25519 public key. */
  ephemeralPublicKey: Uint8Array;
  /** Ed25519 signature over the envelope contents. */
  signature: Uint8Array;
}

/** Serialized escrow envelope (base64 strings for server storage). */
export interface SerializedEscrow {
  escrowBlob: string;
  escrowNonce: string;
  escrowAuthTag: string;
  ephemeralPublicKey: string;
  escrowSignature: string;
}

// ---------------------------------------------------------------------------
// Encrypted vault item (full server-stored record)
// ---------------------------------------------------------------------------

/** Complete encrypted vault item as stored in the database. */
export interface EncryptedVaultItem {
  /** Unique item identifier. */
  id: string;
  /** Encrypted item payload. */
  blob: EncryptedBlob;
  /** Data key wrapped by vault key. */
  wrappedKey: WrappedKey;
  /** Item type (plaintext — part of AAD). */
  itemType: VaultItemType;
  /** ISO 8601 timestamp. */
  createdAt: string;
  /** ISO 8601 timestamp. */
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum Argon2id memory cost (128 MiB in KiB). */
export const MIN_ARGON2_MEMORY_KIB = 131072;

/** Default Argon2id parameters. */
export const DEFAULT_KDF_PARAMS: KdfParams = {
  memoryKiB: 131072,
  iterations: 3,
  parallelism: 4,
};

/** Byte lengths for cryptographic values. */
export const CRYPTO_LENGTHS = {
  salt: 16,
  nonce: 24,
  authTag: 16,
  dataKey: 32,
  vaultKey: 32,
  secretKeyMin: 16,
  x25519PublicKey: 32,
  x25519PrivateKey: 32,
  ed25519PublicKey: 32,
  ed25519PrivateKey: 64,
  ed25519Signature: 64,
} as const;
