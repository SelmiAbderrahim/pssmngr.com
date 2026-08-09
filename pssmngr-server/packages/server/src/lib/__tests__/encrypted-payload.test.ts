// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Tests for the size-bounded encrypted payload schemas.
 *
 * Security regression tests: every encrypted blob the server stores is
 * opaque, so without explicit maximums an authenticated client could
 * submit arbitrarily large "ciphertexts" and exhaust database storage.
 */
import { describe, expect, it } from "vitest";
import { z } from "zod/v3";
import {
	encryptedField,
	encryptedItemFields,
	itemCiphertext,
	MAX_ENCRYPTED_FIELD_B64,
	MAX_ITEM_CIPHERTEXT_B64,
	MAX_SMALL_BLOB_B64,
	MAX_STATE_BLOB_B64,
	smallBlob,
	stateBlob,
} from "../encrypted-payload";

/** Base64 length of `bytes` raw bytes. */
const b64len = (bytes: number) => Math.ceil(bytes / 3) * 4;

describe("encryptedField", () => {
	it("accepts real-world crypto material sizes", () => {
		// XChaCha20 nonce (24 B), Poly1305 tag (16 B), wrapped 32 B data
		// key, X25519 public key (32 B), Ed25519 signature (64 B)
		for (const rawBytes of [16, 24, 32, 48, 64, 96]) {
			expect(
				encryptedField.safeParse("A".repeat(b64len(rawBytes))).success,
			).toBe(true);
		}
	});

	it("rejects empty and oversized values", () => {
		expect(encryptedField.safeParse("").success).toBe(false);
		expect(
			encryptedField.safeParse("A".repeat(MAX_ENCRYPTED_FIELD_B64 + 1)).success,
		).toBe(false);
	});
});

describe("itemCiphertext", () => {
	it("accepts a large but legitimate encrypted item (100 KiB)", () => {
		expect(itemCiphertext.safeParse("A".repeat(100 * 1024)).success).toBe(true);
	});

	it("rejects payloads above 1 MiB", () => {
		expect(
			itemCiphertext.safeParse("A".repeat(MAX_ITEM_CIPHERTEXT_B64 + 1)).success,
		).toBe(false);
	});
});

describe("smallBlob / stateBlob", () => {
	it("bound verification/escrow blobs to 64 KiB", () => {
		expect(smallBlob.safeParse("A".repeat(1024)).success).toBe(true);
		expect(
			smallBlob.safeParse("A".repeat(MAX_SMALL_BLOB_B64 + 1)).success,
		).toBe(false);
	});

	it("bound vault-wide state blobs to 10 MiB", () => {
		expect(stateBlob.safeParse("A".repeat(1024 * 1024)).success).toBe(true);
		expect(
			stateBlob.safeParse("A".repeat(MAX_STATE_BLOB_B64 + 1)).success,
		).toBe(false);
	});
});

describe("encryptedItemFields", () => {
	const itemSchema = z.object(encryptedItemFields).strict();

	const validItem = {
		ciphertext: "A".repeat(b64len(2048)),
		nonce: "A".repeat(b64len(24)),
		authTag: "A".repeat(b64len(16)),
		wrappedDataKey: "A".repeat(b64len(48)),
		wrappedDataKeyNonce: "A".repeat(b64len(24)),
		wrappedDataKeyAuthTag: "A".repeat(b64len(16)),
	};

	it("accepts a realistic encrypted item envelope", () => {
		expect(itemSchema.safeParse(validItem).success).toBe(true);
	});

	it("rejects an item with an oversized ciphertext", () => {
		expect(
			itemSchema.safeParse({
				...validItem,
				ciphertext: "A".repeat(MAX_ITEM_CIPHERTEXT_B64 + 1),
			}).success,
		).toBe(false);
	});

	it("rejects oversized fixed-size fields (no smuggling data via nonces)", () => {
		for (const field of [
			"nonce",
			"authTag",
			"wrappedDataKey",
			"wrappedDataKeyNonce",
			"wrappedDataKeyAuthTag",
		] as const) {
			expect(
				itemSchema.safeParse({
					...validItem,
					[field]: "A".repeat(MAX_ENCRYPTED_FIELD_B64 + 1),
				}).success,
			).toBe(false);
		}
	});

	it("rejects empty required fields", () => {
		expect(itemSchema.safeParse({ ...validItem, ciphertext: "" }).success).toBe(
			false,
		);
	});
});
