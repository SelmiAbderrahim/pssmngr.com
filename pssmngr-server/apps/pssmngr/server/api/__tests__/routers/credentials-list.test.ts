// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Credentials List Endpoint Tests — Empty Response Scenarios
 *
 * Verifies that credentials.list and credentials.listTrash return HTTP 200
 * with empty arrays when:
 *  - The vault exists but has no items
 *  - The vaultId does not exist
 *  - The vault belongs to another user
 *
 * Also verifies the happy path (items returned when they exist).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { credentialsRouter } from "../../routers/credentials";

// ---------------------------------------------------------------------------
// Mock DB helpers (same pattern as credentials.test.ts)
// ---------------------------------------------------------------------------

function createMockDb() {
	return {
		query: {
			vault: { findFirst: vi.fn().mockResolvedValue(null) },
			item: {
				findFirst: vi.fn().mockResolvedValue(null),
				findMany: vi.fn().mockResolvedValue([]),
			},
			itemVersion: {
				findMany: vi.fn().mockResolvedValue([]),
			},
		},
		insert: vi.fn().mockReturnValue({
			values: vi.fn().mockImplementation(() => {
				const p = Promise.resolve(undefined);
				(p as any).returning = vi.fn().mockResolvedValue([{}]);
				return p;
			}),
		}),
		update: vi.fn().mockReturnValue({
			set: vi.fn().mockImplementation(() => ({
				where: vi.fn().mockImplementation(() => {
					const p = Promise.resolve(undefined);
					(p as any).returning = vi.fn().mockResolvedValue([{}]);
					return p;
				}),
			})),
		}),
		delete: vi.fn().mockReturnValue({
			where: vi.fn().mockResolvedValue(undefined),
		}),
	};
}

function createCtx(userId: string, db: any) {
	return {
		session: { id: `session-${userId}`, activeOrganizationId: "org-1" },
		user: {
			id: userId,
			email: `${userId}@test.com`,
			name: userId,
			role: "member" as const,
			ownerId: "owner-1",
		},
		db,
		language: "en",
		t: ((key: string) => key) as any,
		req: { headers: {} },
		res: { setHeader: () => {} },
	};
}

function createCaller(ctx: any) {
	return credentialsRouter.createCaller(ctx as any);
}

function makeItem(overrides: Record<string, any> = {}) {
	return {
		id: "item-1",
		vaultId: "vault-1",
		itemType: "login",
		ciphertext: "encrypted-data",
		nonce: "nonce-1",
		authTag: "auth-tag-1",
		wrappedDataKey: "wrapped-key",
		wrappedDataKeyNonce: "wdk-nonce",
		wrappedDataKeyAuthTag: "wdk-auth-tag",
		version: 1,
		isFavorite: false,
		deletedAt: null,
		createdAt: new Date(),
		updatedAt: new Date(),
		vault: { userId: "user-1" },
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// Tests — credentials.list
// ---------------------------------------------------------------------------

describe("credentials.list — empty response scenarios", () => {
	let db: ReturnType<typeof createMockDb>;

	beforeEach(() => {
		vi.clearAllMocks();
		db = createMockDb();
	});

	it("returns empty items array when vault exists but has no items", async () => {
		db.query.vault.findFirst.mockResolvedValue({ id: "vault-1" });
		db.query.item.findMany.mockResolvedValue([]);
		const caller = createCaller(createCtx("user-1", db));

		const result = await caller.list({ vaultId: "vault-1", limit: 50 });

		expect(result).toEqual({ items: [], nextCursor: undefined });
	});

	it("returns empty items array when vaultId does not exist", async () => {
		db.query.vault.findFirst.mockResolvedValue(null);
		const caller = createCaller(createCtx("user-1", db));

		const result = await caller.list({ vaultId: "nonexistent-id", limit: 50 });

		expect(result).toEqual({ items: [], nextCursor: undefined });
	});

	it("returns empty items array when vault belongs to another user", async () => {
		// tryVerifyVaultOwnership filters by userId — returns null for wrong user
		db.query.vault.findFirst.mockResolvedValue(null);
		const caller = createCaller(createCtx("user-a", db));

		const result = await caller.list({ vaultId: "user-b-vault", limit: 50 });

		expect(result).toEqual({ items: [], nextCursor: undefined });
	});

	it("returns items when vault has items", async () => {
		db.query.vault.findFirst.mockResolvedValue({ id: "vault-1" });
		const items = [makeItem({ id: "item-1" }), makeItem({ id: "item-2" })];
		db.query.item.findMany.mockResolvedValue(items);
		const caller = createCaller(createCtx("user-1", db));

		const result = await caller.list({ vaultId: "vault-1", limit: 50 });

		expect(result.items).toHaveLength(2);
		expect(result.items[0]!.id).toBe("item-1");
	});

	it("does not throw for any empty scenario", async () => {
		db.query.vault.findFirst.mockResolvedValue(null);
		const caller = createCaller(createCtx("user-1", db));

		// Should resolve, not reject
		await expect(
			caller.list({ vaultId: "nonexistent", limit: 50 }),
		).resolves.toEqual({ items: [], nextCursor: undefined });
	});
});

// ---------------------------------------------------------------------------
// Tests — credentials.listTrash
// ---------------------------------------------------------------------------

describe("credentials.listTrash — empty response scenarios", () => {
	let db: ReturnType<typeof createMockDb>;

	beforeEach(() => {
		vi.clearAllMocks();
		db = createMockDb();
	});

	it("returns empty items array when vault exists but has no trashed items", async () => {
		db.query.vault.findFirst.mockResolvedValue({ id: "vault-1" });
		db.query.item.findMany.mockResolvedValue([]);
		const caller = createCaller(createCtx("user-1", db));

		const result = await caller.listTrash({ vaultId: "vault-1" });

		expect(result).toEqual({ items: [], nextCursor: undefined });
	});

	it("returns empty items array when vaultId does not exist", async () => {
		db.query.vault.findFirst.mockResolvedValue(null);
		const caller = createCaller(createCtx("user-1", db));

		const result = await caller.listTrash({ vaultId: "nonexistent-id" });

		expect(result).toEqual({ items: [], nextCursor: undefined });
	});

	it("returns empty items array when vault belongs to another user", async () => {
		db.query.vault.findFirst.mockResolvedValue(null);
		const caller = createCaller(createCtx("user-a", db));

		const result = await caller.listTrash({ vaultId: "user-b-vault" });

		expect(result).toEqual({ items: [], nextCursor: undefined });
	});

	it("returns trashed items when they exist", async () => {
		db.query.vault.findFirst.mockResolvedValue({ id: "vault-1" });
		const trashedItems = [
			makeItem({ id: "t-1", deletedAt: new Date() }),
			makeItem({ id: "t-2", deletedAt: new Date() }),
		];
		db.query.item.findMany.mockResolvedValue(trashedItems);
		const caller = createCaller(createCtx("user-1", db));

		const result = await caller.listTrash({ vaultId: "vault-1" });

		expect(result.items).toHaveLength(2);
	});

	it("does not throw for any empty scenario", async () => {
		db.query.vault.findFirst.mockResolvedValue(null);
		const caller = createCaller(createCtx("user-1", db));

		await expect(caller.listTrash({ vaultId: "nonexistent" })).resolves.toEqual(
			{ items: [], nextCursor: undefined },
		);
	});
});
