// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Vault Router Unit Tests
 *
 * Tests vault CRUD operations: get, list, create, update, delete,
 * updateWatchtowerState, updateSearchIndex.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { vaultRouter } from "../../routers/vault";

// ---------------------------------------------------------------------------
// Mock DB helpers
// ---------------------------------------------------------------------------

function mockInsert(returning: any[] = [{}]) {
	return vi.fn().mockReturnValue({
		values: vi.fn().mockImplementation(() => {
			const p = Promise.resolve(undefined);
			(p as any).returning = vi.fn().mockResolvedValue(returning);
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

function makeVault(overrides: Record<string, any> = {}) {
	return {
		id: "vault-1",
		userId: "user-1",
		name: "Personal Vault",
		kdfSalt: "c2FsdHNhbHRzYWx0c2FsdA==",
		encryptedWatchtowerState: null,
		encryptedSearchIndex: null,
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides,
	};
}

function createMockDb(vaultData: any = null) {
	return {
		query: {
			vault: {
				findFirst: vi.fn().mockResolvedValue(vaultData),
				findMany: vi.fn().mockResolvedValue([]),
			},
		},
		insert: mockInsert([makeVault()]),
		update: mockUpdate([makeVault()]),
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
	return vaultRouter.createCaller(ctx as any);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Vault Router", () => {
	let db: ReturnType<typeof createMockDb>;

	beforeEach(() => {
		vi.clearAllMocks();
		db = createMockDb();
	});

	// -----------------------------------------------------------------------
	// get
	// -----------------------------------------------------------------------

	describe("get", () => {
		it("returns vault for owner", async () => {
			const v = makeVault({ id: "vault-1", userId: "user-1" });
			db.query.vault.findFirst.mockResolvedValue(v);
			const caller = createCaller(createCtx("user-1", db));

			const result = await caller.get({ vaultId: "vault-1" });

			expect(result).toEqual(v);
			expect(db.query.vault.findFirst).toHaveBeenCalled();
		});

		it("throws NOT_FOUND for non-owner", async () => {
			db.query.vault.findFirst.mockResolvedValue(null);
			const caller = createCaller(createCtx("user-2", db));

			await expect(caller.get({ vaultId: "vault-1" })).rejects.toThrow(
				expect.objectContaining({ code: "NOT_FOUND" }),
			);
		});

		it("throws NOT_FOUND for missing vault", async () => {
			db.query.vault.findFirst.mockResolvedValue(null);
			const caller = createCaller(createCtx("user-1", db));

			await expect(caller.get({ vaultId: "nonexistent" })).rejects.toThrow(
				expect.objectContaining({ code: "NOT_FOUND" }),
			);
		});
	});

	// -----------------------------------------------------------------------
	// list
	// -----------------------------------------------------------------------

	describe("list", () => {
		it("returns all vaults for current user", async () => {
			const vaults = [
				makeVault({ id: "v-1", name: "Vault A" }),
				makeVault({ id: "v-2", name: "Vault B" }),
			];
			db.query.vault.findMany.mockResolvedValue(vaults);
			const caller = createCaller(createCtx("user-1", db));

			const result = await caller.list();

			expect(result).toHaveLength(2);
			expect(result[0]!.name).toBe("Vault A");
		});

		it("returns empty array when user has no vaults", async () => {
			db.query.vault.findMany.mockResolvedValue([]);
			const caller = createCaller(createCtx("user-1", db));

			const result = await caller.list();

			expect(result).toEqual([]);
		});

		// Regression: `list` must scope to the workspace org the client is in,
		// not the session's active org (which can lag on a fresh page load and
		// return a wrong-org vault that then 404s on write).
		it("scopes to an explicit organizationId over the session org", async () => {
			db.query.vault.findMany.mockResolvedValue([makeVault()]);
			const caller = createCaller(createCtx("user-1", db)); // session org-1

			await caller.list({ organizationId: "org-explicit" });
			const whereExplicit = db.query.vault.findMany.mock.calls.at(-1)![0].where;

			db.query.vault.findMany.mockClear();
			await caller.list(); // no arg → session org-1
			const whereSession = db.query.vault.findMany.mock.calls.at(-1)![0].where;

			expect(whereExplicit).not.toEqual(whereSession);
		});

		it("still works with no input (session fallback)", async () => {
			db.query.vault.findMany.mockResolvedValue([makeVault()]);
			const caller = createCaller(createCtx("user-1", db));

			const result = await caller.list();
			expect(result).toHaveLength(1);
		});

		it("lazily creates the org vault scoped to the explicit organizationId", async () => {
			// No vault yet for this org → falls through to the clone-and-create
			// path, which must stamp the EXPLICIT org onto the new vault.
			db.query.vault.findMany.mockResolvedValue([]);
			db.query.vault.findFirst.mockResolvedValue(
				makeVault({ id: "template", organizationId: "org-1" }),
			);
			const createdRow = makeVault({
				id: "new",
				organizationId: "org-explicit",
			});
			db.insert = mockInsert([createdRow]);
			const caller = createCaller(createCtx("user-1", db));

			const result = await caller.list({ organizationId: "org-explicit" });

			const insertedValues = (db.insert as any).mock.results[0].value.values
				.mock.calls[0][0];
			expect(insertedValues.organizationId).toBe("org-explicit");
			expect(result[0]!.id).toBe("new");
		});
	});

	// -----------------------------------------------------------------------
	// create
	// -----------------------------------------------------------------------

	describe("create", () => {
		it("creates vault with name and kdfSalt", async () => {
			const created = makeVault({
				name: "Work Vault",
				kdfSalt: "abcdefghijklmnopqrstuvwx",
			});
			db.insert = mockInsert([created]);
			const caller = createCaller(createCtx("user-1", db));

			const result = await caller.create({
				name: "Work Vault",
				kdfSalt: "abcdefghijklmnopqrstuvwx",
			});

			expect(result!.name).toBe("Work Vault");
			expect(db.insert).toHaveBeenCalled();
		});
	});

	// -----------------------------------------------------------------------
	// update
	// -----------------------------------------------------------------------

	describe("update", () => {
		it("updates vault name for owner", async () => {
			const v = makeVault({ id: "vault-1", userId: "user-1" });
			db.query.vault.findFirst.mockResolvedValue(v);
			const updated = makeVault({ name: "Renamed Vault" });
			db.update = mockUpdate([updated]);
			const caller = createCaller(createCtx("user-1", db));

			const result = await caller.update({
				vaultId: "vault-1",
				name: "Renamed Vault",
			});

			expect(result!.name).toBe("Renamed Vault");
		});

		it("throws NOT_FOUND for non-owner", async () => {
			db.query.vault.findFirst.mockResolvedValue(null);
			const caller = createCaller(createCtx("user-2", db));

			await expect(
				caller.update({ vaultId: "vault-1", name: "Hack" }),
			).rejects.toThrow(expect.objectContaining({ code: "NOT_FOUND" }));
		});
	});

	// -----------------------------------------------------------------------
	// delete
	// -----------------------------------------------------------------------

	describe("delete", () => {
		it("deletes vault and items with confirm: true", async () => {
			const v = makeVault({ id: "vault-1", userId: "user-1" });
			db.query.vault.findFirst.mockResolvedValue(v);
			const caller = createCaller(createCtx("user-1", db));

			const result = await caller.delete({ vaultId: "vault-1", confirm: true });

			expect(result.success).toBe(true);
			// Two deletes: items then vault
			expect(db.delete).toHaveBeenCalledTimes(2);
		});

		it("throws NOT_FOUND for non-owner", async () => {
			db.query.vault.findFirst.mockResolvedValue(null);
			const caller = createCaller(createCtx("user-2", db));

			await expect(
				caller.delete({ vaultId: "vault-1", confirm: true }),
			).rejects.toThrow(expect.objectContaining({ code: "NOT_FOUND" }));
		});
	});

	// -----------------------------------------------------------------------
	// updateWatchtowerState
	// -----------------------------------------------------------------------

	describe("updateWatchtowerState", () => {
		it("stores encrypted watchtower state blob", async () => {
			const v = makeVault({ id: "vault-1", userId: "user-1" });
			db.query.vault.findFirst.mockResolvedValue(v);
			const updated = makeVault({ encryptedWatchtowerState: "encrypted-blob" });
			db.update = mockUpdate([updated]);
			const caller = createCaller(createCtx("user-1", db));

			const result = await caller.updateWatchtowerState({
				vaultId: "vault-1",
				encryptedWatchtowerState: "encrypted-blob",
			});

			expect(result!.encryptedWatchtowerState).toBe("encrypted-blob");
		});

		it("throws NOT_FOUND for non-owner", async () => {
			db.query.vault.findFirst.mockResolvedValue(null);
			const caller = createCaller(createCtx("user-2", db));

			await expect(
				caller.updateWatchtowerState({
					vaultId: "vault-1",
					encryptedWatchtowerState: "blob",
				}),
			).rejects.toThrow(expect.objectContaining({ code: "NOT_FOUND" }));
		});
	});

	// -----------------------------------------------------------------------
	// updateSearchIndex
	// -----------------------------------------------------------------------

	describe("updateSearchIndex", () => {
		it("stores encrypted search index blob", async () => {
			const v = makeVault({ id: "vault-1", userId: "user-1" });
			db.query.vault.findFirst.mockResolvedValue(v);
			const updated = makeVault({ encryptedSearchIndex: "search-blob" });
			db.update = mockUpdate([updated]);
			const caller = createCaller(createCtx("user-1", db));

			const result = await caller.updateSearchIndex({
				vaultId: "vault-1",
				encryptedSearchIndex: "search-blob",
			});

			expect(result!.encryptedSearchIndex).toBe("search-blob");
		});

		it("throws NOT_FOUND for non-owner", async () => {
			db.query.vault.findFirst.mockResolvedValue(null);
			const caller = createCaller(createCtx("user-2", db));

			await expect(
				caller.updateSearchIndex({
					vaultId: "vault-1",
					encryptedSearchIndex: "blob",
				}),
			).rejects.toThrow(expect.objectContaining({ code: "NOT_FOUND" }));
		});
	});
});
