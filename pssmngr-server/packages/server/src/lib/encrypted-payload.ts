// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Size-bounded zod schemas for client-encrypted payload fields.
 *
 * Every encrypted blob the server stores is an opaque base64 string the
 * server cannot inspect — so without explicit maximums, an authenticated
 * client could submit arbitrarily large "ciphertexts" and exhaust
 * database storage (DoS). Limits are far above anything legitimate
 * clients produce:
 *
 *  - fixed-size crypto material (XChaCha20 nonces 24 B, Poly1305 tags
 *    16 B, wrapped 32 B data keys, X25519 public keys 32 B, Ed25519
 *    signatures 64 B) base64-encodes to well under 512 chars
 *  - item ciphertexts are encrypted JSON records (logins, notes, cards);
 *    1 MiB base64 ≈ 768 KiB plaintext per item
 *  - vault-wide state blobs (encrypted search index / watchtower state)
 *    grow with vault size; 10 MiB covers tens of thousands of items
 */

import { z } from "zod/v3";

/** Fixed-size crypto material: nonces, auth tags, wrapped keys, public keys, signatures, KDF salts. */
export const MAX_ENCRYPTED_FIELD_B64 = 512;

/** Single encrypted item payload (JSON record). */
export const MAX_ITEM_CIPHERTEXT_B64 = 1_048_576; // 1 MiB

/** Small standalone envelopes: verification blobs, emergency-escrow blobs, ephemeral share blobs. */
export const MAX_SMALL_BLOB_B64 = 65_536; // 64 KiB

/** Vault-wide encrypted state: search index, watchtower state. */
export const MAX_STATE_BLOB_B64 = 10_485_760; // 10 MiB

/** Nonces, tags, wrapped keys, public keys, signatures. */
export const encryptedField = z.string().min(1).max(MAX_ENCRYPTED_FIELD_B64);

/** Encrypted per-item payload. */
export const itemCiphertext = z.string().min(1).max(MAX_ITEM_CIPHERTEXT_B64);

/** Small encrypted envelope (escrow / verification blobs). */
export const smallBlob = z.string().min(1).max(MAX_SMALL_BLOB_B64);

/** Vault-wide encrypted state blob. */
export const stateBlob = z.string().min(1).max(MAX_STATE_BLOB_B64);

/**
 * The standard encrypted-item envelope: ciphertext encrypted with a
 * per-item data key, plus the data key wrapped by the vault key.
 * Spread into router input objects:
 *   z.object({ vaultId: ..., ...encryptedItemFields })
 */
export const encryptedItemFields = {
	ciphertext: itemCiphertext,
	nonce: encryptedField,
	authTag: encryptedField,
	wrappedDataKey: encryptedField,
	wrappedDataKeyNonce: encryptedField,
	wrappedDataKeyAuthTag: encryptedField,
} as const;
