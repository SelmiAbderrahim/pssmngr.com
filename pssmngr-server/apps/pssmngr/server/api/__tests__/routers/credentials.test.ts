// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Credentials Router Unit Tests
 *
 * Tests item CRUD: create, batchCreate, get, list, update, softDelete,
 * restore, permanentDelete, listTrash, emptyTrash, autoPurge,
 * getVersionHistory, toggleFavorite.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	credentialsRouter,
	resolveOrganizationId,
} from "../../routers/credentials";

// ---------------------------------------------------------------------------
// Mock DB helpers
// ---------------------------------------------------------------------------

function mockInsert(returning: any[] = [{}]) {
	return vi.fn().mockReturnValue({
		values: vi.fn().mockImplementation((vals: any) => {
			const p = Promise.resolve(undefined);
			// Handle both single and batch insert
			const ret = Array.isArray(vals)
				? vals.map((_, i) => returning[i] || { id: `item-${i}` })
				: returning;
			(p as any).returning = vi.fn().mockResolvedValue(ret);
			// `runWithIdempotency` persists its response with this builder.
			(p as any).onConflictDoNothing = vi.fn().mockResolvedValue(undefined);
			return p;
		}),
	});
}

function mockUpdate(returning: any[] = [{}]) {
	return vi.fn().mockReturnValue({
		set: vi.fn().mockImplementation(() => ({
			where: vi.fn().mockImplementation(() => {
				const p = Promise.resolve(undefined);
				(p as any).returning = vi.fn().mockResolvedValue(returning);
				return p;
			}),
		})),
	});
}

function mockDelete() {
	return vi.fn().mockReturnValue({
		where: vi.fn().mockResolvedValue(undefined),
	});
}

// ---------------------------------------------------------------------------
// Data builders
// ---------------------------------------------------------------------------

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
		vault: { userId: "user-1", organizationId: "org-1" },
		...overrides,
	};
}

function makeVersion(overrides: Record<string, any> = {}) {
	return {
		id: "ver-1",
		itemId: "item-1",
		version: 1,
		ciphertext: "old-encrypted",
		nonce: "old-nonce",
		authTag: "old-auth-tag",
		wrappedDataKey: "old-wrapped-key",
		wrappedDataKeyNonce: "old-wdk-nonce",
		wrappedDataKeyAuthTag: "old-wdk-auth-tag",
		createdAt: new Date(),
		...overrides,
	};
}

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
			idempotencyKey: { findFirst: vi.fn().mockResolvedValue(null) },
		},
		insert: mockInsert([makeItem()]),
		update: mockUpdate([makeItem()]),
		delete: mockDelete(),
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

function itemInput(overrides: Record<string, any> = {}) {
	return {
		vaultId: "vault-1",
		itemType: "login" as const,
		ciphertext: "encrypted-data",
		nonce: "nonce-1",
		authTag: "auth-tag-1",
		wrappedDataKey: "wrapped-key",
		wrappedDataKeyNonce: "wdk-nonce",
		wrappedDataKeyAuthTag: "wdk-auth-tag",
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Credentials Router", () => {
	let db: ReturnType<typeof createMockDb>;

	beforeEach(() => {
		vi.clearAllMocks();
		db = createMockDb();
	});

	// -----------------------------------------------------------------------
	// create
	// -----------------------------------------------------------------------

	describe("create", () => {
		it("stores encrypted item with vault ownership check", async () => {
			db.query.vault.findFirst.mockResolvedValue({ id: "vault-1" });
			const created = makeItem();
			db.insert = mockInsert([created]);
			const caller = createCaller(createCtx("user-1", db));

			const result = await caller.create(itemInput());

			expect(result!.ciphertext).toBe("encrypted-data");
			expect(db.query.vault.findFirst).toHaveBeenCalled();
			expect(db.insert).toHaveBeenCalled();
		});

		it("supports all item types", async () => {
			const types = [
				"login",
				"passkey",
				"identity",
				"card",
				"note",
				"totp",
				"file",
			] as const;
			for (const itemType of types) {
				db.query.vault.findFirst.mockResolvedValue({ id: "vault-1" });
				db.insert = mockInsert([makeItem({ itemType })]);
				const caller = createCaller(createCtx("user-1", db));

				const result = await caller.create(itemInput({ itemType }));

				expect(result!.itemType).toBe(itemType);
			}
		});

		it("rejects when vault not owned", async () => {
			db.query.vault.findFirst.mockResolvedValue(null);
			const caller = createCaller(createCtx("user-1", db));

			await expect(caller.create(itemInput())).rejects.toThrow(
				expect.objectContaining({ code: "NOT_FOUND" }),
			);
		});

		// Regression: the AI bulk import (and any write on a freshly-loaded
		// page) 404'd because the vault was scoped to the session's active org,
		// which can lag the workspace the UI is actually in. The client now
		// passes an explicit `organizationId`; it must drive the vault scope.
		it("scopes the vault ownership check to an explicit organizationId over the session", async () => {
			db.query.vault.findFirst.mockResolvedValue({ id: "vault-1" });
			db.insert = mockInsert([makeItem()]);
			// Session says org-1; client is really in org-explicit.
			const caller = createCaller(createCtx("user-1", db));

			await caller.create(itemInput({ organizationId: "org-explicit" }));
			const whereExplicit =
				db.query.vault.findFirst.mock.calls.at(-1)![0].where;

			db.query.vault.findFirst.mockClear();
			await caller.create(itemInput()); // no org → falls back to session org-1
			const whereSession = db.query.vault.findFirst.mock.calls.at(-1)![0].where;

			// Different effective org → structurally different scope clause.
			expect(whereExplicit).not.toEqual(whereSession);
		});

		it("produces the same vault scope when the explicit org equals the session org", async () => {
			db.query.vault.findFirst.mockResolvedValue({ id: "vault-1" });
			db.insert = mockInsert([makeItem()]);
			const caller = createCaller(createCtx("user-1", db));

			await caller.create(itemInput({ organizationId: "org-1" }));
			const whereExplicit =
				db.query.vault.findFirst.mock.calls.at(-1)![0].where;

			db.query.vault.findFirst.mockClear();
			await caller.create(itemInput()); // session is also org-1
			const whereSession = db.query.vault.findFirst.mock.calls.at(-1)![0].where;

			expect(whereExplicit).toEqual(whereSession);
		});
	});

	// -----------------------------------------------------------------------
	// resolveOrganizationId (the scoping helper behind the 404 fix)
	// -----------------------------------------------------------------------

	describe("resolveOrganizationId", () => {
		it("prefers the explicit organizationId from the client", () => {
			expect(
				resolveOrganizationId("org-explicit", {
					activeOrganizationId: "org-session",
				}),
			).toBe("org-explicit");
		});

		it("falls back to the session active org when none is passed", () => {
			expect(
				resolveOrganizationId(undefined, {
					activeOrganizationId: "org-session",
				}),
			).toBe("org-session");
		});

		it("treats an empty string as absent and falls back to the session", () => {
			expect(
				resolveOrganizationId("", { activeOrganizationId: "org-session" }),
			).toBe("org-session");
		});

		it("returns null when neither is present", () => {
			expect(resolveOrganizationId(undefined, null)).toBeNull();
			expect(
				resolveOrganizationId(undefined, { activeOrganizationId: null }),
			).toBeNull();
		});
	});

	// -----------------------------------------------------------------------
	// batchCreate
	// -----------------------------------------------------------------------

	describe("batchCreate", () => {
		it("creates multiple items and returns count", async () => {
			db.query.vault.findFirst.mockResolvedValue({ id: "vault-1" });
			db.insert = mockInsert([{ id: "i-1" }, { id: "i-2" }, { id: "i-3" }]);
			const caller = createCaller(createCtx("user-1", db));

			const items = Array.from({ length: 3 }, (_, i) => ({
				itemType: "login" as const,
				ciphertext: `data-${i}`,
				nonce: `nonce-${i}`,
				authTag: `tag-${i}`,
				wrappedDataKey: `key-${i}`,
				wrappedDataKeyNonce: `kn-${i}`,
				wrappedDataKeyAuthTag: `kt-${i}`,
			}));

			const result = await caller.batchCreate({ vaultId: "vault-1", items });

			expect(result.created).toBe(3);
		});

		it("rejects when vault not owned", async () => {
			db.query.vault.findFirst.mockResolvedValue(null);
			const caller = createCaller(createCtx("user-1", db));

			await expect(
				caller.batchCreate({
					vaultId: "vault-1",
					items: [
						{
							itemType: "login",
							ciphertext: "d",
							nonce: "n",
							authTag: "a",
							wrappedDataKey: "k",
							wrappedDataKeyNonce: "kn",
							wrappedDataKeyAuthTag: "kt",
						},
					],
				}),
			).rejects.toThrow(expect.objectContaining({ code: "NOT_FOUND" }));
		});

		it("scopes the vault check to an explicit organizationId when provided", async () => {
			db.query.vault.findFirst.mockResolvedValue({ id: "vault-1" });
			db.insert = mockInsert([{ id: "i-1" }]);
			const caller = createCaller(createCtx("user-1", db));

			const oneItem = [
				{
					itemType: "login" as const,
					ciphertext: "d",
					nonce: "n",
					authTag: "a",
					wrappedDataKey: "k",
					wrappedDataKeyNonce: "kn",
					wrappedDataKeyAuthTag: "kt",
				},
			];

			await caller.batchCreate({
				vaultId: "vault-1",
				organizationId: "org-explicit",
				items: oneItem,
			});
			const whereExplicit =
				db.query.vault.findFirst.mock.calls.at(-1)![0].where;

			db.query.vault.findFirst.mockClear();
			await caller.batchCreate({ vaultId: "vault-1", items: oneItem });
			const whereSession = db.query.vault.findFirst.mock.calls.at(-1)![0].where;

			expect(whereExplicit).not.toEqual(whereSession);
		});

		// Synthetic ciphertext envelopes. No plaintext, no real credential.
		function batchItems(count: number) {
			return Array.from({ length: count }, (_, i) => ({
				itemType: "login" as const,
				ciphertext: `ct-${i}`,
				nonce: `n-${i}`,
				authTag: `a-${i}`,
				wrappedDataKey: `k-${i}`,
				wrappedDataKeyNonce: `kn-${i}`,
				wrappedDataKeyAuthTag: `kt-${i}`,
			}));
		}

		it("accepts exactly 1 and exactly 50 items", async () => {
			for (const count of [1, 50]) {
				db.query.vault.findFirst.mockResolvedValue({ id: "vault-1" });
				db.insert = mockInsert();
				const caller = createCaller(createCtx("user-1", db));

				const result = await caller.batchCreate({
					vaultId: "vault-1",
					items: batchItems(count),
				});

				expect(result.created).toBe(count);
			}
		});

		it("rejects 51 items and an empty batch", async () => {
			db.query.vault.findFirst.mockResolvedValue({ id: "vault-1" });
			const caller = createCaller(createCtx("user-1", db));

			await expect(
				caller.batchCreate({ vaultId: "vault-1", items: batchItems(51) }),
			).rejects.toThrow();
			await expect(
				caller.batchCreate({ vaultId: "vault-1", items: [] }),
			).rejects.toThrow();
		});

		it("rejects plaintext fields on the batch input", async () => {
			db.query.vault.findFirst.mockResolvedValue({ id: "vault-1" });
			db.insert = mockInsert();
			const caller = createCaller(createCtx("user-1", db));

			const plaintextKeys = [
				"title",
				"username",
				"password",
				"url",
				"notes",
				"totp",
				"data",
			];

			for (const key of plaintextKeys) {
				await expect(
					caller.batchCreate({
						vaultId: "vault-1",
						items: [{ ...batchItems(1)[0]!, [key]: "leak" }],
					} as any),
				).rejects.toThrow();

				await expect(
					caller.batchCreate({
						vaultId: "vault-1",
						items: batchItems(1),
						[key]: "leak",
					} as any),
				).rejects.toThrow();
			}

			expect(db.insert).not.toHaveBeenCalled();
		});

		it("inserts every item in a single multi-row statement", async () => {
			db.query.vault.findFirst.mockResolvedValue({ id: "vault-1" });
			const insert = mockInsert();
			db.insert = insert;
			const caller = createCaller(createCtx("user-1", db));

			await caller.batchCreate({ vaultId: "vault-1", items: batchItems(50) });

			expect(insert).toHaveBeenCalledTimes(1);
			const values = insert.mock.results[0]!.value.values.mock.calls[0]![0];
			expect(values).toHaveLength(50);
			expect(values.every((v: any) => v.vaultId === "vault-1")).toBe(true);
		});

		it("replays a same-key retry without inserting again", async () => {
			db.query.vault.findFirst.mockResolvedValue({ id: "vault-1" });
			db.insert = mockInsert();
			const caller = createCaller(createCtx("user-1", db));

			const first = await caller.batchCreate({
				vaultId: "vault-1",
				items: batchItems(50),
				idempotencyKey: "import:op-1:vault-1:0",
			});
			expect(first).toEqual({ created: 50 });
			// One insert for the rows, one for the persisted idempotency response.
			expect(db.insert).toHaveBeenCalledTimes(2);

			db.query.idempotencyKey.findFirst.mockResolvedValue({
				responseBody: { created: 50 },
			});
			db.insert = mockInsert();

			const replay = await caller.batchCreate({
				vaultId: "vault-1",
				items: batchItems(50),
				idempotencyKey: "import:op-1:vault-1:0",
			});

			expect(replay).toEqual({ created: 50 });
			expect(db.insert).not.toHaveBeenCalled();
		});

		it("rejects a malformed idempotency key", async () => {
			db.query.vault.findFirst.mockResolvedValue({ id: "vault-1" });
			db.insert = mockInsert();
			const caller = createCaller(createCtx("user-1", db));

			await expect(
				caller.batchCreate({
					vaultId: "vault-1",
					items: batchItems(1),
					idempotencyKey: "has spaces and/slashes",
				}),
			).rejects.toThrow();
		});
	});

	// -----------------------------------------------------------------------
	// get
	// -----------------------------------------------------------------------

	describe("get", () => {
		it("returns item and strips vault relation", async () => {
			const found = makeItem({
				id: "item-1",
				vault: { userId: "user-1", organizationId: "org-1" },
			});
			db.query.item.findFirst.mockResolvedValue(found);
			const caller = createCaller(createCtx("user-1", db));

			const result = await caller.get({ itemId: "item-1" });

			expect(result.id).toBe("item-1");
			expect((result as any).vault).toBeUndefined();
		});

		it("rejects non-owner", async () => {
			db.query.item.findFirst.mockResolvedValue(
				makeItem({ vault: { userId: "other-user" } }),
			);
			const caller = createCaller(createCtx("user-1", db));

			await expect(caller.get({ itemId: "item-1" })).rejects.toThrow(
				expect.objectContaining({ code: "NOT_FOUND" }),
			);
		});

		it("rejects non-existent item", async () => {
			db.query.item.findFirst.mockResolvedValue(null);
			const caller = createCaller(createCtx("user-1", db));

			await expect(caller.get({ itemId: "no-item" })).rejects.toThrow(
				expect.objectContaining({ code: "NOT_FOUND" }),
			);
		});
	});

	// -----------------------------------------------------------------------
	// list
	// -----------------------------------------------------------------------

	describe("list", () => {
		it("returns items with cursor pagination", async () => {
			const items = Array.from({ length: 3 }, (_, i) =>
				makeItem({ id: `item-${i}` }),
			);
			db.query.vault.findFirst.mockResolvedValue({ id: "vault-1" });
			db.query.item.findMany.mockResolvedValue(items);
			const caller = createCaller(createCtx("user-1", db));

			const result = await caller.list({ vaultId: "vault-1" });

			expect(result.items).toHaveLength(3);
			expect(result.nextCursor).toBeUndefined();
		});

		it("returns nextCursor when more items exist", async () => {
			// When limit is 2, returning 3 items means there's a next page
			const items = Array.from({ length: 3 }, (_, i) =>
				makeItem({ id: `item-${i}` }),
			);
			db.query.vault.findFirst.mockResolvedValue({ id: "vault-1" });
			db.query.item.findMany.mockResolvedValue(items);
			const caller = createCaller(createCtx("user-1", db));

			const result = await caller.list({ vaultId: "vault-1", limit: 2 });

			expect(result.items).toHaveLength(2);
			expect(result.nextCursor).toBe("item-2");
		});

		it("supports itemType filter", async () => {
			db.query.vault.findFirst.mockResolvedValue({ id: "vault-1" });
			db.query.item.findMany.mockResolvedValue([
				makeItem({ itemType: "card" }),
			]);
			const caller = createCaller(createCtx("user-1", db));

			const result = await caller.list({
				vaultId: "vault-1",
				itemType: "card",
			});

			expect(result.items).toHaveLength(1);
		});

		it("uses an explicit organizationId over a stale session and falls back when absent", async () => {
			db.query.vault.findFirst
				.mockResolvedValueOnce({ id: "vault-1" })
				.mockResolvedValueOnce(null)
				.mockResolvedValueOnce({ id: "vault-1" });
			db.query.item.findMany.mockResolvedValue([makeItem()]);
			const caller = createCaller(createCtx("user-1", db));

			const explicit = await caller.list({
				vaultId: "vault-1",
				organizationId: "org-explicit",
			});
			const explicitScope =
				db.query.vault.findFirst.mock.calls.at(-1)![0].where;

			const staleSession = await caller.list({ vaultId: "vault-1" });
			const sessionScope = db.query.vault.findFirst.mock.calls.at(-1)![0].where;

			await caller.list({
				vaultId: "vault-1",
				organizationId: "org-1",
			});
			const explicitSessionScope =
				db.query.vault.findFirst.mock.calls.at(-1)![0].where;

			expect(explicit.items).toHaveLength(1);
			expect(staleSession.items).toEqual([]);
			expect(explicitScope).not.toEqual(sessionScope);
			expect(sessionScope).toEqual(explicitSessionScope);
		});
	});

	// -----------------------------------------------------------------------
	// update
	// -----------------------------------------------------------------------

	describe("update", () => {
		it("creates version history then updates item", async () => {
			const existing = makeItem({
				id: "item-1",
				version: 1,
				vault: { userId: "user-1", organizationId: "org-1" },
			});
			db.query.item.findFirst.mockResolvedValue(existing);
			// First insert is for version history
			db.insert = mockInsert([makeVersion()]);
			const updated = makeItem({ version: 2 });
			db.update = mockUpdate([updated]);
			const caller = createCaller(createCtx("user-1", db));

			const result = await caller.update({
				itemId: "item-1",
				ciphertext: "new-data",
				nonce: "new-nonce",
				authTag: "new-tag",
				wrappedDataKey: "new-key",
				wrappedDataKeyNonce: "new-kn",
				wrappedDataKeyAuthTag: "new-kt",
			});

			expect(result!.version).toBe(2);
			expect(db.insert).toHaveBeenCalled(); // version history
			expect(db.update).toHaveBeenCalled(); // item update
		});
	});

	// -----------------------------------------------------------------------
	// softDelete
	// -----------------------------------------------------------------------

	describe("softDelete", () => {
		it("sets deletedAt timestamp", async () => {
			db.query.item.findFirst.mockResolvedValue(
				makeItem({
					vault: { userId: "user-1", organizationId: "org-1" },
				}),
			);
			const deleted = makeItem({ deletedAt: new Date() });
			db.update = mockUpdate([deleted]);
			const caller = createCaller(createCtx("user-1", db));

			const result = await caller.softDelete({ itemId: "item-1" });

			expect(result!.deletedAt).toBeTruthy();
		});
	});

	// -----------------------------------------------------------------------
	// restore
	// -----------------------------------------------------------------------

	describe("restore", () => {
		it("clears deletedAt timestamp", async () => {
			db.query.item.findFirst.mockResolvedValue(
				makeItem({
					deletedAt: new Date(),
					vault: { userId: "user-1", organizationId: "org-1" },
				}),
			);
			const restored = makeItem({ deletedAt: null });
			db.update = mockUpdate([restored]);
			const caller = createCaller(createCtx("user-1", db));

			const result = await caller.restore({ itemId: "item-1" });

			expect(result!.deletedAt).toBeNull();
		});
	});

	// -----------------------------------------------------------------------
	// permanentDelete
	// -----------------------------------------------------------------------

	describe("permanentDelete", () => {
		it("removes item and version history", async () => {
			db.query.item.findFirst.mockResolvedValue(
				makeItem({
					vault: { userId: "user-1", organizationId: "org-1" },
				}),
			);
			const caller = createCaller(createCtx("user-1", db));

			const result = await caller.permanentDelete({ itemId: "item-1" });

			expect(result.success).toBe(true);
			// Two deletes: versions then item
			expect(db.delete).toHaveBeenCalledTimes(2);
		});
	});

	// -----------------------------------------------------------------------
	// listTrash
	// -----------------------------------------------------------------------

	describe("listTrash", () => {
		it("returns soft-deleted items", async () => {
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

		it("supports cursor pagination", async () => {
			db.query.vault.findFirst.mockResolvedValue({ id: "vault-1" });
			const items = Array.from({ length: 3 }, (_, i) =>
				makeItem({ id: `t-${i}`, deletedAt: new Date() }),
			);
			db.query.item.findMany.mockResolvedValue(items);
			const caller = createCaller(createCtx("user-1", db));

			const result = await caller.listTrash({ vaultId: "vault-1", limit: 2 });

			expect(result.items).toHaveLength(2);
			expect(result.nextCursor).toBe("t-2");
		});
	});

	// -----------------------------------------------------------------------
	// emptyTrash
	// -----------------------------------------------------------------------

	describe("emptyTrash", () => {
		it("deletes all trashed items and returns count", async () => {
			db.query.vault.findFirst.mockResolvedValue({ id: "vault-1" });
			db.query.item.findMany.mockResolvedValue([{ id: "t-1" }, { id: "t-2" }]);
			const caller = createCaller(createCtx("user-1", db));

			const result = await caller.emptyTrash({ vaultId: "vault-1" });

			expect(result.deleted).toBe(2);
			// Each item has 2 deletes (versions + item) = 4 total
			expect(db.delete).toHaveBeenCalledTimes(4);
		});

		it("returns zero when trash is empty", async () => {
			db.query.vault.findFirst.mockResolvedValue({ id: "vault-1" });
			db.query.item.findMany.mockResolvedValue([]);
			const caller = createCaller(createCtx("user-1", db));

			const result = await caller.emptyTrash({ vaultId: "vault-1" });

			expect(result.deleted).toBe(0);
		});
	});

	// -----------------------------------------------------------------------
	// autoPurge
	// -----------------------------------------------------------------------

	describe("autoPurge", () => {
		it("deletes items trashed more than 30 days ago", async () => {
			db.query.vault.findFirst.mockResolvedValue({ id: "vault-1" });
			db.query.item.findMany.mockResolvedValue([{ id: "old-1" }]);
			const caller = createCaller(createCtx("user-1", db));

			const result = await caller.autoPurge({ vaultId: "vault-1" });

			expect(result.purged).toBe(1);
			expect(db.delete).toHaveBeenCalledTimes(2); // versions + item
		});

		it("returns zero when nothing expired", async () => {
			db.query.vault.findFirst.mockResolvedValue({ id: "vault-1" });
			db.query.item.findMany.mockResolvedValue([]);
			const caller = createCaller(createCtx("user-1", db));

			const result = await caller.autoPurge({ vaultId: "vault-1" });

			expect(result.purged).toBe(0);
		});
	});

	// -----------------------------------------------------------------------
	// getVersionHistory
	// -----------------------------------------------------------------------

	describe("getVersionHistory", () => {
		it("returns versions ordered by version descending", async () => {
			db.query.item.findFirst.mockResolvedValue(
				makeItem({
					vault: { userId: "user-1", organizationId: "org-1" },
				}),
			);
			const versions = [
				makeVersion({ version: 3 }),
				makeVersion({ version: 2 }),
				makeVersion({ version: 1 }),
			];
			db.query.itemVersion.findMany.mockResolvedValue(versions);
			const caller = createCaller(createCtx("user-1", db));

			const result = await caller.getVersionHistory({ itemId: "item-1" });

			expect(result).toHaveLength(3);
			expect(result[0]!.version).toBe(3);
		});

		it("returns empty for item with no history", async () => {
			db.query.item.findFirst.mockResolvedValue(
				makeItem({
					vault: { userId: "user-1", organizationId: "org-1" },
				}),
			);
			db.query.itemVersion.findMany.mockResolvedValue([]);
			const caller = createCaller(createCtx("user-1", db));

			const result = await caller.getVersionHistory({ itemId: "item-1" });

			expect(result).toEqual([]);
		});
	});

	// -----------------------------------------------------------------------
	// toggleFavorite
	// -----------------------------------------------------------------------

	describe("toggleFavorite", () => {
		it("flips isFavorite from false to true", async () => {
			db.query.item.findFirst.mockResolvedValue(
				makeItem({
					isFavorite: false,
					vault: { userId: "user-1", organizationId: "org-1" },
				}),
			);
			const toggled = makeItem({ isFavorite: true });
			db.update = mockUpdate([toggled]);
			const caller = createCaller(createCtx("user-1", db));

			const result = await caller.toggleFavorite({ itemId: "item-1" });

			expect(result!.isFavorite).toBe(true);
		});

		it("flips isFavorite from true to false", async () => {
			db.query.item.findFirst.mockResolvedValue(
				makeItem({
					isFavorite: true,
					vault: { userId: "user-1", organizationId: "org-1" },
				}),
			);
			const toggled = makeItem({ isFavorite: false });
			db.update = mockUpdate([toggled]);
			const caller = createCaller(createCtx("user-1", db));

			const result = await caller.toggleFavorite({ itemId: "item-1" });

			expect(result!.isFavorite).toBe(false);
		});
	});
});
