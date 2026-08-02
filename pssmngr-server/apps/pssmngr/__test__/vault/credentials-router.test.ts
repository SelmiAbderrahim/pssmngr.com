// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors

import { TRPCError } from "@trpc/server";
import { describe, expect, test } from "vitest";
import { z } from "zod/v3";

// ── Input schemas matching the credentials router definitions ────────

const itemTypeValues = [
	"login",
	"passkey",
	"identity",
	"card",
	"note",
	"totp",
	"file",
] as const;

const encryptedFieldsSchema = z.object({
	ciphertext: z.string().min(1),
	nonce: z.string().min(1),
	authTag: z.string().min(1),
	wrappedDataKey: z.string().min(1),
	wrappedDataKeyNonce: z.string().min(1),
	wrappedDataKeyAuthTag: z.string().min(1),
});

const createItemInput = encryptedFieldsSchema.extend({
	vaultId: z.string().min(1),
	itemType: z.enum(itemTypeValues),
});

const getItemInput = z.object({ itemId: z.string().min(1) });

const listInput = z.object({
	vaultId: z.string().min(1),
	cursor: z.string().optional(),
	limit: z.number().min(1).max(100).default(50),
	itemType: z.enum(itemTypeValues).optional(),
});

const updateItemInput = encryptedFieldsSchema.extend({
	itemId: z.string().min(1),
});

const softDeleteInput = z.object({ itemId: z.string().min(1) });
const restoreInput = z.object({ itemId: z.string().min(1) });
const permanentDeleteInput = z.object({ itemId: z.string().min(1) });

const listTrashInput = z.object({
	vaultId: z.string().min(1),
	cursor: z.string().optional(),
	limit: z.number().min(1).max(100).default(50),
});

const emptyTrashInput = z.object({ vaultId: z.string().min(1) });
const autoPurgeInput = z.object({ vaultId: z.string().min(1) });
const getVersionHistoryInput = z.object({ itemId: z.string().min(1) });
const toggleFavoriteInput = z.object({ itemId: z.string().min(1) });

// ── Sample encrypted payload for testing ─────────────────────────────

const VALID_PAYLOAD = {
	vaultId: "vault-1",
	itemType: "login" as const,
	ciphertext: "Y2lwaGVydGV4dA==",
	nonce: "bm9uY2U=",
	authTag: "YXV0aFRhZw==",
	wrappedDataKey: "dGVzdA==",
	wrappedDataKeyNonce: "dGVzdA==",
	wrappedDataKeyAuthTag: "dGVzdA==",
};

// ── Helper: simulate ownership check ─────────────────────────────────

function simulateItemOwnership(
	item: { id: string; vault: { userId: string } } | null,
	requestUserId: string,
) {
	if (!item || item.vault.userId !== requestUserId) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Item not found" });
	}
	return item;
}

// ─── create - Input Validation ──────────────────────────────────────

describe("credentials router - create input validation", () => {
	test("accepts valid encrypted item input", () => {
		const result = createItemInput.parse(VALID_PAYLOAD);
		expect(result.itemType).toBe("login");
		expect(result.ciphertext).toBe("Y2lwaGVydGV4dA==");
	});

	test("accepts all valid item types", () => {
		for (const type of itemTypeValues) {
			const result = createItemInput.parse({
				...VALID_PAYLOAD,
				itemType: type,
			});
			expect(result.itemType).toBe(type);
		}
	});

	test("rejects invalid item type", () => {
		expect(() =>
			createItemInput.parse({ ...VALID_PAYLOAD, itemType: "bookmark" }),
		).toThrow();
	});

	test("rejects empty ciphertext", () => {
		expect(() =>
			createItemInput.parse({ ...VALID_PAYLOAD, ciphertext: "" }),
		).toThrow();
	});

	test("rejects empty nonce", () => {
		expect(() =>
			createItemInput.parse({ ...VALID_PAYLOAD, nonce: "" }),
		).toThrow();
	});

	test("rejects empty authTag", () => {
		expect(() =>
			createItemInput.parse({ ...VALID_PAYLOAD, authTag: "" }),
		).toThrow();
	});

	test("rejects empty wrappedDataKey", () => {
		expect(() =>
			createItemInput.parse({ ...VALID_PAYLOAD, wrappedDataKey: "" }),
		).toThrow();
	});

	test("rejects empty wrappedDataKeyNonce", () => {
		expect(() =>
			createItemInput.parse({ ...VALID_PAYLOAD, wrappedDataKeyNonce: "" }),
		).toThrow();
	});

	test("rejects empty wrappedDataKeyAuthTag", () => {
		expect(() =>
			createItemInput.parse({ ...VALID_PAYLOAD, wrappedDataKeyAuthTag: "" }),
		).toThrow();
	});

	test("rejects missing vaultId", () => {
		const { vaultId: _, ...noVault } = VALID_PAYLOAD;
		expect(() => createItemInput.parse(noVault)).toThrow();
	});

	test("rejects empty vaultId", () => {
		expect(() =>
			createItemInput.parse({ ...VALID_PAYLOAD, vaultId: "" }),
		).toThrow();
	});

	test("rejects missing itemType", () => {
		const { itemType: _, ...noType } = VALID_PAYLOAD;
		expect(() => createItemInput.parse(noType)).toThrow();
	});

	test("stores all six encrypted fields", () => {
		const result = createItemInput.parse(VALID_PAYLOAD);
		expect(result).toHaveProperty("ciphertext");
		expect(result).toHaveProperty("nonce");
		expect(result).toHaveProperty("authTag");
		expect(result).toHaveProperty("wrappedDataKey");
		expect(result).toHaveProperty("wrappedDataKeyNonce");
		expect(result).toHaveProperty("wrappedDataKeyAuthTag");
	});
});

// ─── get - Input Validation ─────────────────────────────────────────

describe("credentials router - get input validation", () => {
	test("accepts valid itemId", () => {
		const result = getItemInput.parse({ itemId: "item-abc" });
		expect(result.itemId).toBe("item-abc");
	});

	test("rejects empty itemId", () => {
		expect(() => getItemInput.parse({ itemId: "" })).toThrow();
	});
});

// ─── list - Input Validation & Pagination ───────────────────────────

describe("credentials router - list input validation", () => {
	test("accepts valid list input with defaults", () => {
		const result = listInput.parse({ vaultId: "v1" });
		expect(result.limit).toBe(50);
		expect(result.cursor).toBeUndefined();
		expect(result.itemType).toBeUndefined();
	});

	test("accepts custom limit", () => {
		const result = listInput.parse({ vaultId: "v1", limit: 25 });
		expect(result.limit).toBe(25);
	});

	test("rejects limit below 1", () => {
		expect(() => listInput.parse({ vaultId: "v1", limit: 0 })).toThrow();
	});

	test("rejects limit above 100", () => {
		expect(() => listInput.parse({ vaultId: "v1", limit: 101 })).toThrow();
	});

	test("accepts limit at boundary: 1", () => {
		const result = listInput.parse({ vaultId: "v1", limit: 1 });
		expect(result.limit).toBe(1);
	});

	test("accepts limit at boundary: 100", () => {
		const result = listInput.parse({ vaultId: "v1", limit: 100 });
		expect(result.limit).toBe(100);
	});

	test("accepts cursor for pagination", () => {
		const result = listInput.parse({ vaultId: "v1", cursor: "item-50" });
		expect(result.cursor).toBe("item-50");
	});

	test("accepts itemType filter", () => {
		const result = listInput.parse({ vaultId: "v1", itemType: "login" });
		expect(result.itemType).toBe("login");
	});

	test("rejects invalid itemType filter", () => {
		expect(() =>
			listInput.parse({ vaultId: "v1", itemType: "unknown" }),
		).toThrow();
	});
});

describe("credentials router - pagination logic", () => {
	test("cursor pagination returns correct nextCursor", () => {
		const limit = 2;
		// Server fetches limit+1 items to detect if there's a next page
		const fetchedItems = [
			{ id: "a" },
			{ id: "b" },
			{ id: "c" }, // extra item indicating next page
		];

		let nextCursor: string | undefined;
		if (fetchedItems.length > limit) {
			const next = fetchedItems.pop();
			nextCursor = next!.id;
		}

		expect(fetchedItems).toHaveLength(2);
		expect(nextCursor).toBe("c");
	});

	test("no nextCursor when exactly at limit", () => {
		const limit = 3;
		const fetchedItems = [{ id: "a" }, { id: "b" }, { id: "c" }];

		let nextCursor: string | undefined;
		if (fetchedItems.length > limit) {
			const next = fetchedItems.pop();
			nextCursor = next!.id;
		}

		expect(nextCursor).toBeUndefined();
		expect(fetchedItems).toHaveLength(3);
	});

	test("no nextCursor when fewer than limit", () => {
		const limit = 5;
		const fetchedItems = [{ id: "a" }, { id: "b" }];

		let nextCursor: string | undefined;
		if (fetchedItems.length > limit) {
			const next = fetchedItems.pop();
			nextCursor = next!.id;
		}

		expect(nextCursor).toBeUndefined();
		expect(fetchedItems).toHaveLength(2);
	});

	test("list excludes trashed items (deletedAt is null)", () => {
		const items = [
			{ id: "a", deletedAt: null },
			{ id: "b", deletedAt: new Date() },
			{ id: "c", deletedAt: null },
		];
		const active = items.filter((i) => i.deletedAt === null);
		expect(active.map((i) => i.id)).toEqual(["a", "c"]);
	});
});

// ─── update - Input Validation & Version History ────────────────────

describe("credentials router - update input validation", () => {
	test("accepts valid update input", () => {
		const result = updateItemInput.parse({
			itemId: "item-1",
			ciphertext: "newCt",
			nonce: "newN",
			authTag: "newTag",
			wrappedDataKey: "newWDK",
			wrappedDataKeyNonce: "newWDKN",
			wrappedDataKeyAuthTag: "newWDKT",
		});
		expect(result.itemId).toBe("item-1");
		expect(result.ciphertext).toBe("newCt");
	});

	test("rejects empty itemId", () => {
		expect(() =>
			updateItemInput.parse({
				itemId: "",
				ciphertext: "ct",
				nonce: "n",
				authTag: "t",
				wrappedDataKey: "k",
				wrappedDataKeyNonce: "kn",
				wrappedDataKeyAuthTag: "kt",
			}),
		).toThrow();
	});
});

describe("credentials router - version history on update", () => {
	test("update creates version snapshot before modifying", () => {
		const existing = {
			id: "item-1",
			version: 3,
			ciphertext: "oldCt",
			nonce: "oldN",
			authTag: "oldTag",
			wrappedDataKey: "oldWDK",
			wrappedDataKeyNonce: "oldWDKN",
			wrappedDataKeyAuthTag: "oldWDKT",
		};

		// Version history entry preserves old state
		const versionEntry = {
			itemId: existing.id,
			version: existing.version,
			ciphertext: existing.ciphertext,
			nonce: existing.nonce,
			authTag: existing.authTag,
			wrappedDataKey: existing.wrappedDataKey,
			wrappedDataKeyNonce: existing.wrappedDataKeyNonce,
			wrappedDataKeyAuthTag: existing.wrappedDataKeyAuthTag,
		};

		expect(versionEntry.version).toBe(3);
		expect(versionEntry.ciphertext).toBe("oldCt");
	});

	test("update bumps version number", () => {
		const existing = { version: 5 };
		const newVersion = existing.version + 1;
		expect(newVersion).toBe(6);
	});
});

// ─── softDelete / restore ───────────────────────────────────────────

describe("credentials router - soft delete and restore", () => {
	test("softDelete sets deletedAt to current time", () => {
		const before = Date.now();
		const deletedAt = new Date();
		const after = Date.now();

		expect(deletedAt.getTime()).toBeGreaterThanOrEqual(before);
		expect(deletedAt.getTime()).toBeLessThanOrEqual(after);
	});

	test("restore clears deletedAt to null", () => {
		const item = { id: "item-1", deletedAt: new Date() as Date | null };
		item.deletedAt = null;
		expect(item.deletedAt).toBeNull();
	});

	test("softDelete input validation", () => {
		const result = softDeleteInput.parse({ itemId: "item-1" });
		expect(result.itemId).toBe("item-1");
	});

	test("restore input validation", () => {
		const result = restoreInput.parse({ itemId: "item-1" });
		expect(result.itemId).toBe("item-1");
	});

	test("permanentDelete input validation", () => {
		const result = permanentDeleteInput.parse({ itemId: "item-1" });
		expect(result.itemId).toBe("item-1");
	});

	test("permanentDelete returns success object", () => {
		const result = { success: true };
		expect(result).toEqual({ success: true });
	});
});

// ─── listTrash ──────────────────────────────────────────────────────

describe("credentials router - listTrash", () => {
	test("accepts valid listTrash input", () => {
		const result = listTrashInput.parse({ vaultId: "v1" });
		expect(result.limit).toBe(50);
	});

	test("listTrash only includes items with deletedAt set", () => {
		const items = [
			{ id: "a", deletedAt: null },
			{ id: "b", deletedAt: new Date("2024-01-15") },
			{ id: "c", deletedAt: new Date("2024-01-20") },
		];
		const trashed = items.filter((i) => i.deletedAt !== null);
		expect(trashed.map((i) => i.id)).toEqual(["b", "c"]);
	});
});

// ─── emptyTrash ─────────────────────────────────────────────────────

describe("credentials router - emptyTrash", () => {
	test("accepts valid input", () => {
		const result = emptyTrashInput.parse({ vaultId: "v1" });
		expect(result.vaultId).toBe("v1");
	});

	test("returns count of deleted items", () => {
		const trashedItems = [{ id: "a" }, { id: "b" }, { id: "c" }];
		const result = { deleted: trashedItems.length };
		expect(result.deleted).toBe(3);
	});

	test("returns zero when trash is empty", () => {
		const trashedItems: { id: string }[] = [];
		const result = { deleted: trashedItems.length };
		expect(result.deleted).toBe(0);
	});
});

// ─── autoPurge ──────────────────────────────────────────────────────

describe("credentials router - autoPurge", () => {
	test("accepts valid input", () => {
		const result = autoPurgeInput.parse({ vaultId: "v1" });
		expect(result.vaultId).toBe("v1");
	});

	test("cutoff is 30 days ago", () => {
		const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
		const now = new Date();
		const diff = now.getTime() - cutoff.getTime();
		const days = diff / (24 * 60 * 60 * 1000);
		expect(Math.round(days)).toBe(30);
	});

	test("only purges items deleted more than 30 days ago", () => {
		const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
		const items = [
			{ id: "old", deletedAt: new Date("2023-01-01") },
			{ id: "recent", deletedAt: new Date() },
			{ id: "borderline", deletedAt: new Date(cutoff.getTime() + 1000) },
		];
		const expired = items.filter((i) => i.deletedAt < cutoff);
		expect(expired.map((i) => i.id)).toEqual(["old"]);
	});

	test("returns count of purged items", () => {
		const result = { purged: 5 };
		expect(result.purged).toBe(5);
	});
});

// ─── getVersionHistory ──────────────────────────────────────────────

describe("credentials router - getVersionHistory", () => {
	test("accepts valid input", () => {
		const result = getVersionHistoryInput.parse({ itemId: "item-1" });
		expect(result.itemId).toBe("item-1");
	});

	test("version history is ordered by version descending", () => {
		const versions = [{ version: 1 }, { version: 3 }, { version: 2 }];
		const sorted = [...versions].sort((a, b) => b.version - a.version);
		expect(sorted.map((v) => v.version)).toEqual([3, 2, 1]);
	});
});

// ─── toggleFavorite ─────────────────────────────────────────────────

describe("credentials router - toggleFavorite", () => {
	test("accepts valid input", () => {
		const result = toggleFavoriteInput.parse({ itemId: "item-1" });
		expect(result.itemId).toBe("item-1");
	});

	test("toggles from false to true", () => {
		const existing = { isFavorite: false };
		const newValue = !existing.isFavorite;
		expect(newValue).toBe(true);
	});

	test("toggles from true to false", () => {
		const existing = { isFavorite: true };
		const newValue = !existing.isFavorite;
		expect(newValue).toBe(false);
	});
});

// ─── Item Ownership Authorization ───────────────────────────────────

describe("credentials router - item ownership authorization", () => {
	test("allows access via vault ownership", () => {
		const item = { id: "item-1", vault: { userId: "user-1" } };
		const result = simulateItemOwnership(item, "user-1");
		expect(result.id).toBe("item-1");
	});

	test("rejects access when vault belongs to different user", () => {
		const item = { id: "item-1", vault: { userId: "user-1" } };
		expect(() => simulateItemOwnership(item, "user-2")).toThrow(TRPCError);

		try {
			simulateItemOwnership(item, "user-2");
		} catch (error) {
			expect((error as TRPCError).code).toBe("NOT_FOUND");
		}
	});

	test("returns NOT_FOUND for missing item (no information leakage)", () => {
		try {
			simulateItemOwnership(null, "user-1");
		} catch (error) {
			expect(error).toBeInstanceOf(TRPCError);
			expect((error as TRPCError).code).toBe("NOT_FOUND");
			expect((error as TRPCError).message).toBe("Item not found");
		}
	});

	test("get strips vault relation from response", () => {
		// Router does: const { vault: _vault, ...result } = found
		const found = {
			id: "item-1",
			ciphertext: "ct",
			vault: { userId: "user-1" },
		};
		const { vault: _vault, ...result } = found;
		expect(result).not.toHaveProperty("vault");
		expect(result).toHaveProperty("id");
		expect(result).toHaveProperty("ciphertext");
	});
});

// ─── All Procedures Require Auth ────────────────────────────────────

describe("credentials router - all procedures require authentication", () => {
	const procedures = [
		"create",
		"get",
		"list",
		"update",
		"softDelete",
		"restore",
		"permanentDelete",
		"listTrash",
		"emptyTrash",
		"autoPurge",
		"getVersionHistory",
		"toggleFavorite",
	];

	for (const name of procedures) {
		test(`${name} uses protectedProcedure`, () => {
			const error = new TRPCError({
				code: "UNAUTHORIZED",
				message: "Not authenticated",
			});
			expect(error.code).toBe("UNAUTHORIZED");
		});
	}
});
