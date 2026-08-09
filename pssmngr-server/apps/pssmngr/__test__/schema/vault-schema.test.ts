// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors

import { device } from "@pssmngr/server/db/schema/device";
import {
	item,
	itemTypeEnum,
	itemVersion,
} from "@pssmngr/server/db/schema/item";
import {
	passwordHistory,
	shareEnvelope,
	sharePermissionEnum,
} from "@pssmngr/server/db/schema/share";
import { vault } from "@pssmngr/server/db/schema/vault";
import { getTableColumns } from "drizzle-orm";
import { describe, expect, test } from "vitest";

describe("vault schema", () => {
	const cols = getTableColumns(vault);

	test("requires userId", () => {
		expect(cols.userId.notNull).toBe(true);
	});

	test("requires kdfSalt", () => {
		expect(cols.kdfSalt.notNull).toBe(true);
	});

	test("defaults name to Personal Vault", () => {
		expect(cols.name.notNull).toBe(true);
		expect(cols.name.hasDefault).toBe(true);
	});

	test("auto-generates id", () => {
		expect(cols.id.primary).toBe(true);
		expect(cols.id.hasDefault).toBe(true);
	});

	test("has timestamps", () => {
		expect(cols.createdAt.notNull).toBe(true);
		expect(cols.createdAt.hasDefault).toBe(true);
		expect(cols.updatedAt.notNull).toBe(true);
		expect(cols.updatedAt.hasDefault).toBe(true);
	});

	test("encryptedSearchIndex is nullable", () => {
		expect(cols.encryptedSearchIndex.notNull).toBe(false);
	});

	test("has no plaintext content columns", () => {
		const colNames = Object.keys(cols);
		const forbidden = ["title", "username", "password", "url", "notes"];
		for (const name of forbidden) {
			expect(colNames).not.toContain(name);
		}
	});
});

describe("item schema", () => {
	const cols = getTableColumns(item);

	test("requires vaultId", () => {
		expect(cols.vaultId.notNull).toBe(true);
	});

	test("requires itemType from enum", () => {
		expect(cols.itemType.notNull).toBe(true);
		expect(itemTypeEnum.enumValues).toEqual([
			"login",
			"passkey",
			"identity",
			"card",
			"note",
			"totp",
			"file",
		]);
	});

	test("requires ciphertext, nonce, authTag", () => {
		expect(cols.ciphertext.notNull).toBe(true);
		expect(cols.nonce.notNull).toBe(true);
		expect(cols.authTag.notNull).toBe(true);
	});

	test("requires wrappedDataKey fields", () => {
		expect(cols.wrappedDataKey.notNull).toBe(true);
		expect(cols.wrappedDataKeyNonce.notNull).toBe(true);
		expect(cols.wrappedDataKeyAuthTag.notNull).toBe(true);
	});

	test("defaults version to 1", () => {
		expect(cols.version.notNull).toBe(true);
		expect(cols.version.hasDefault).toBe(true);
	});

	test("defaults isFavorite to false", () => {
		expect(cols.isFavorite.notNull).toBe(true);
		expect(cols.isFavorite.hasDefault).toBe(true);
	});

	test("deletedAt is nullable (soft delete)", () => {
		expect(cols.deletedAt.notNull).toBe(false);
	});

	test("rejects invalid itemType values", () => {
		const valid = itemTypeEnum.enumValues;
		expect(valid).not.toContain("bookmark");
		expect(valid).not.toContain("password");
		expect(valid).not.toContain("secret");
	});

	test("has no plaintext content columns", () => {
		const colNames = Object.keys(cols);
		const forbidden = ["title", "username", "password", "url", "notes"];
		for (const name of forbidden) {
			expect(colNames).not.toContain(name);
		}
	});
});

describe("item_version schema", () => {
	const cols = getTableColumns(itemVersion);

	test("requires itemId", () => {
		expect(cols.itemId.notNull).toBe(true);
	});

	test("requires version", () => {
		expect(cols.version.notNull).toBe(true);
	});

	test("requires encrypted fields", () => {
		expect(cols.ciphertext.notNull).toBe(true);
		expect(cols.nonce.notNull).toBe(true);
		expect(cols.authTag.notNull).toBe(true);
		expect(cols.wrappedDataKey.notNull).toBe(true);
		expect(cols.wrappedDataKeyNonce.notNull).toBe(true);
		expect(cols.wrappedDataKeyAuthTag.notNull).toBe(true);
	});

	test("auto-generates id", () => {
		expect(cols.id.primary).toBe(true);
		expect(cols.id.hasDefault).toBe(true);
	});
});

describe("device schema", () => {
	const cols = getTableColumns(device);

	test("requires userId", () => {
		expect(cols.userId.notNull).toBe(true);
	});

	test("requires deviceName", () => {
		expect(cols.deviceName.notNull).toBe(true);
	});

	test("requires publicKey", () => {
		expect(cols.publicKey.notNull).toBe(true);
	});

	test("defaults trusted to false", () => {
		expect(cols.trusted.notNull).toBe(true);
		expect(cols.trusted.hasDefault).toBe(true);
	});

	test("requires deviceType", () => {
		expect(cols.deviceType.notNull).toBe(true);
	});

	test("optional session fields are nullable", () => {
		expect(cols.lastIp.notNull).toBe(false);
		expect(cols.lastUserAgent.notNull).toBe(false);
		expect(cols.lastSeen.notNull).toBe(false);
	});
});

describe("share_envelope schema", () => {
	const cols = getTableColumns(shareEnvelope);

	test("requires itemId, senderUserId, recipientUserId", () => {
		expect(cols.itemId.notNull).toBe(true);
		expect(cols.senderUserId.notNull).toBe(true);
		expect(cols.recipientUserId.notNull).toBe(true);
	});

	test("requires wrappedKey fields", () => {
		expect(cols.wrappedKey.notNull).toBe(true);
		expect(cols.wrappedKeyNonce.notNull).toBe(true);
		expect(cols.wrappedKeyAuthTag.notNull).toBe(true);
	});

	test("requires senderSignature", () => {
		expect(cols.senderSignature.notNull).toBe(true);
	});

	test("defaults permission to view", () => {
		expect(cols.permission.notNull).toBe(true);
		expect(cols.permission.hasDefault).toBe(true);
		expect(sharePermissionEnum.enumValues).toEqual(["view", "edit", "share"]);
	});

	test("defaults accepted to false", () => {
		expect(cols.accepted.notNull).toBe(true);
		expect(cols.accepted.hasDefault).toBe(true);
	});

	test("expiresAt is nullable", () => {
		expect(cols.expiresAt.notNull).toBe(false);
	});

	test("revokedAt is nullable", () => {
		expect(cols.revokedAt.notNull).toBe(false);
	});
});

describe("password_history schema", () => {
	const cols = getTableColumns(passwordHistory);

	test("requires itemId", () => {
		expect(cols.itemId.notNull).toBe(true);
	});

	test("requires encrypted fields", () => {
		expect(cols.ciphertext.notNull).toBe(true);
		expect(cols.nonce.notNull).toBe(true);
		expect(cols.authTag.notNull).toBe(true);
		expect(cols.wrappedDataKey.notNull).toBe(true);
		expect(cols.wrappedDataKeyNonce.notNull).toBe(true);
		expect(cols.wrappedDataKeyAuthTag.notNull).toBe(true);
	});

	test("defaults isLegacy to false", () => {
		expect(cols.isLegacy.notNull).toBe(true);
		expect(cols.isLegacy.hasDefault).toBe(true);
	});

	test("auto-generates id", () => {
		expect(cols.id.primary).toBe(true);
		expect(cols.id.hasDefault).toBe(true);
	});
});
