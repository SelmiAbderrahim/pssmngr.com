// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
export {
  deriveVaultKey,
  generateSecretKey,
  secretKeyToBase32,
  base32ToSecretKey,
} from './key-derivation';
export {
  encryptItem,
  decryptItem,
  generateDataKey,
  generateDataKeyAsync,
} from './vault';
export {
  generateDataKey as generateEnvelopeDataKey,
  wrapKey,
  unwrapKey,
  encryptItemWithEnvelope,
  decryptItemWithEnvelope,
} from './envelope';
export {
  generateX25519KeyPair,
  generateEd25519KeyPair,
  deriveSharedSecret,
  x25519PublicFromPrivate,
  sign,
  verify,
} from './keypair';
export {
  wrapKeyForRecipient,
  unwrapKeyFromEnvelope,
} from './sharing';
export {
  encryptForEphemeralShare,
  decryptEphemeralShare,
} from './ephemeral';
export {
  generateSharedVaultKey,
  wrapVaultKeyForMember,
  unwrapVaultKeyForMember,
  wrapVaultKeyForMembers,
} from './shared-vault';
export {
  rewrapSharedVaultKeyForRecovery,
  rewrapSharedVaultKeysForRecovery,
  generateRecoveryToken,
} from './recovery';
export {
  createEscrowForContact,
  decryptEscrowAsContact,
  serializeEscrowEnvelope,
  deserializeEscrowEnvelope,
} from './escrow';
export type {
  EphemeralEncryptResult,
  EphemeralAccessData,
} from './ephemeral';
export { generateRandomBytes, generateUUID, secureRandom, generateNonce, generateSalt, generateId } from './random';
export type {
  DeriveKeyParams,
  KdfParams,
  DeriveKeyResult,
  EncryptedBlob,
  AeadAad,
  WrappedKey,
  KeyPair,
  X25519KeyPair,
  Ed25519KeyPair,
  ShareEnvelope,
  HkdfParams,
  EncryptedVaultItem,
  CryptoVersion,
  EscrowEnvelope,
  SerializedEscrow,
} from './types';
export {
  VaultItemType,
  CURRENT_CRYPTO_VERSION,
  LEGACY_CRYPTO_VERSION,
  MIN_ARGON2_MEMORY_KIB,
  DEFAULT_KDF_PARAMS,
  CRYPTO_LENGTHS,
  HKDF_CONTEXTS,
} from './types';
