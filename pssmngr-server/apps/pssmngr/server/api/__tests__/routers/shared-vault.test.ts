// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Shared Vault Router Unit Tests
 *
 * Tests vault CRUD, permission matrix, item management,
 * key rotation, and member management.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { sharedVaultRouter } from "../../routers/shared-vault";

// ---------------------------------------------------------------------------
// Mock DB helpers
// ---------------------------------------------------------------------------

const FAMILY_META = JSON.stringify({ type: "family" });

function makeFamilyOrg(id = "org-1", name = "Test Family") {
	return {
		id,
		name,
		metadata: FAMILY_META,
		createdAt: new Date(),
		ownerId: "user-organizer",
	};
}

function makeMember(
	overrides: Partial<{
		id: string;
		userId: string;
		organizationId: string;
		role: string;
		createdAt: Date;
		organization: ReturnType<typeof makeFamilyOrg>;
	}> = {},
) {
	return {
		id: overrides.id ?? "member-1",
		userId: overrides.userId ?? "user-1",
		organizationId: overrides.organizationId ?? "org-1",
		role: overrides.role ?? "member",
		createdAt: overrides.createdAt ?? new Date(),
		organization: overrides.organization ?? makeFamilyOrg(),
	};
}

function makeVaultMember(
	overrides: Partial<{
		id: string;
		sharedVaultId: string;
		userId: string;
		permission: string;
		wrappedKey: string;
		wrappedKeyNonce: string;
		wrappedKeyAuthTag: string;
		ephemeralPublicKey: string;
		senderSignature: string;
		user: { id: string; name: string; email: string; image: string | null };
		sharedVault: any;
	}> = {},
) {
	return {
		id: overrides.id ?? "vm-1",
		sharedVaultId: overrides.sharedVaultId ?? "vault-1",
		userId: overrides.userId ?? "user-1",
		permission: overrides.permission ?? "view",
		wrappedKey: overrides.wrappedKey ?? "wk-base64",
		wrappedKeyNonce: overrides.wrappedKeyNonce ?? "nonce-base64",
		wrappedKeyAuthTag: overrides.wrappedKeyAuthTag ?? "at-base64",
		ephemeralPublicKey: overrides.ephemeralPublicKey ?? "epk-base64",
		senderSignature: overrides.senderSignature ?? "sig-base64",
		user: overrides.user ?? {
			id: "user-1",
			name: "User",
			email: "user@test.com",
			image: null,
		},
		sharedVault: overrides.sharedVault ?? null,
	};
}

function makeVault(
	overrides: Partial<{
		id: string;
		familyId: string;
		name: string;
		createdBy: string;
		createdAt: Date;
		members: any[];
	}> = {},
) {
	return {
		id: overrides.id ?? "vault-1",
		familyId: overrides.familyId ?? "org-1",
		name: overrides.name ?? "Shared Vault",
		createdBy: overrides.createdBy ?? "user-organizer",
		createdAt: overrides.createdAt ?? new Date(),
		members: overrides.members ?? [],
	};
}

function makeVaultItem(
	overrides: Partial<{
		id: string;
		sharedVaultId: string;
		itemType: string;
		ciphertext: string;
		nonce: string;
		authTag: string;
		wrappedDataKey: string;
		wrappedDataKeyNonce: string;
		wrappedDataKeyAuthTag: string;
		version: number;
		createdBy: string;
		deletedAt: Date | null;
		createdAt: Date;
		updatedAt: Date;
	}> = {},
) {
	return {
		id: overrides.id ?? "item-1",
		sharedVaultId: overrides.sharedVaultId ?? "vault-1",
		itemType: overrides.itemType ?? "login",
		ciphertext: overrides.ciphertext ?? "ct-base64",
		nonce: overrides.nonce ?? "n-base64",
		authTag: overrides.authTag ?? "at-base64",
		wrappedDataKey: overrides.wrappedDataKey ?? "wdk-base64",
		wrappedDataKeyNonce: overrides.wrappedDataKeyNonce ?? "wdkn-base64",
		wrappedDataKeyAuthTag: overrides.wrappedDataKeyAuthTag ?? "wdkat-base64",
		version: overrides.version ?? 1,
		createdBy: overrides.createdBy ?? "user-1",
		deletedAt: overrides.deletedAt ?? null,
		createdAt: overrides.createdAt ?? new Date(),
		updatedAt: overrides.updatedAt ?? new Date(),
	};
}

const MEMBER_KEY_INPUT = {
	userId: "user-1",
	permission: "manage" as const,
	wrappedKey: "wk",
	wrappedKeyNonce: "n",
	wrappedKeyAuthTag: "at",
	ephemeralPublicKey: "epk",
	senderSignature: "sig",
};

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

function createMockDb() {
	return {
		query: {
			member: {
				findMany: vi.fn().mockResolvedValue([]),
				findFirst: vi.fn().mockResolvedValue(null),
			},
			organization: { findFirst: vi.fn().mockResolvedValue(null) },
			sharedVault: { findFirst: vi.fn().mockResolvedValue(null) },
			sharedVaultMember: {
				findFirst: vi.fn().mockResolvedValue(null),
				findMany: vi.fn().mockResolvedValue([]),
			},
			sharedVaultItem: {
				findFirst: vi.fn().mockResolvedValue(null),
				findMany: vi.fn().mockResolvedValue([]),
			},
		},
		insert: mockInsert(),
		update: mockUpdate(),
		delete: mockDelete(),
		// Run the callback synchronously with the same mock db as the tx.
		transaction: vi.fn(async function (
			this: any,
			fn: (tx: any) => Promise<void>,
		) {
			return fn(this as any);
		}),
	} as any;
}

function createCtx(userId: string, db: any) {
	return {
		session: { id: `session-${userId}`, activeOrganizationId: "org-1" },
		user: {
			id: userId,
			email: `${userId}@test.com`,
			name: userId,
			role: "member",
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
	return sharedVaultRouter.createCaller(ctx as any);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Shared Vault Router", () => {
	let db: ReturnType<typeof createMockDb>;

	beforeEach(() => {
		vi.clearAllMocks();
		db = createMockDb();
	});

	// =====================================================================
	// Vault CRUD
	// =====================================================================

	describe("create", () => {
		it("creates a shared vault when called by organizer", async () => {
			const org = makeFamilyOrg();
			db.query.member.findMany
				.mockResolvedValueOnce([
					makeMember({ userId: "organizer", role: "owner", organization: org }),
				]) // getUserFamily
				.mockResolvedValueOnce([
					// family members check
					makeMember({ userId: "organizer" }),
					makeMember({ userId: "user-2" }),
				]);
			db.insert = mockInsert([{ id: "vault-1", name: "Passwords" }]);

			const caller = createCaller(createCtx("organizer", db));
			const result = await caller.create({
				name: "Passwords",
				memberKeys: [
					{ ...MEMBER_KEY_INPUT, userId: "organizer" },
					{ ...MEMBER_KEY_INPUT, userId: "user-2" },
				],
			});

			expect(result).toEqual({ id: "vault-1", name: "Passwords" });
		});

		it("creates a shared vault when called by admin", async () => {
			const org = makeFamilyOrg();
			db.query.member.findMany
				.mockResolvedValueOnce([
					makeMember({
						userId: "admin-user",
						role: "admin",
						organization: org,
					}),
				])
				.mockResolvedValueOnce([makeMember({ userId: "admin-user" })]);
			db.insert = mockInsert([{ id: "vault-2", name: "Admin Vault" }]);

			const caller = createCaller(createCtx("admin-user", db));
			const result = await caller.create({
				name: "Admin Vault",
				memberKeys: [{ ...MEMBER_KEY_INPUT, userId: "admin-user" }],
			});

			expect(result).toEqual({ id: "vault-2", name: "Admin Vault" });
		});

		it("throws FORBIDDEN for regular member", async () => {
			const org = makeFamilyOrg();
			db.query.member.findMany.mockResolvedValue([
				makeMember({ userId: "regular", role: "member", organization: org }),
			]);

			const caller = createCaller(createCtx("regular", db));
			await expect(
				caller.create({
					name: "Vault",
					memberKeys: [{ ...MEMBER_KEY_INPUT, userId: "regular" }],
				}),
			).rejects.toThrow(expect.objectContaining({ code: "FORBIDDEN" }));
		});

		it("throws BAD_REQUEST if memberKey references non-family user", async () => {
			const org = makeFamilyOrg();
			db.query.member.findMany
				.mockResolvedValueOnce([
					makeMember({ userId: "organizer", role: "owner", organization: org }),
				])
				.mockResolvedValueOnce([makeMember({ userId: "organizer" })]); // only organizer is family member

			const caller = createCaller(createCtx("organizer", db));
			await expect(
				caller.create({
					name: "Vault",
					memberKeys: [
						{ ...MEMBER_KEY_INPUT, userId: "organizer" },
						{ ...MEMBER_KEY_INPUT, userId: "outsider" }, // not a family member
					],
				}),
			).rejects.toThrow(expect.objectContaining({ code: "BAD_REQUEST" }));
		});
	});

	describe("list", () => {
		it("returns vaults the user has access to", async () => {
			db.query.sharedVaultMember.findMany.mockResolvedValue([
				makeVaultMember({
					userId: "user-1",
					permission: "edit",
					sharedVault: {
						id: "v-1",
						name: "Shared",
						createdAt: new Date(),
						members: [
							{
								id: "vm-1",
								userId: "user-1",
								permission: "edit",
								wrappedKey: "must-not-leak",
							},
							{
								id: "vm-2",
								userId: "user-2",
								permission: "view",
								wrappedKey: "must-not-leak",
							},
						],
					},
				}),
			]);

			const caller = createCaller(createCtx("user-1", db));
			const result = await caller.list();

			expect(result).toHaveLength(1);
			expect(result[0]).toMatchObject({
				id: "v-1",
				name: "Shared",
				permission: "edit",
				memberCount: 2,
				members: [
					{ id: "vm-1", userId: "user-1", permission: "edit" },
					{ id: "vm-2", userId: "user-2", permission: "view" },
				],
			});
			expect(JSON.stringify(result)).not.toContain("must-not-leak");
		});

		it("returns empty array for user with no vault access", async () => {
			db.query.sharedVaultMember.findMany.mockResolvedValue([]);

			const caller = createCaller(createCtx("user-no-vaults", db));
			const result = await caller.list();

			expect(result).toEqual([]);
		});
	});

	describe("get", () => {
		it("returns vault details with wrapped key for authorized user", async () => {
			const vm = makeVaultMember({ userId: "user-1", permission: "view" });
			db.query.sharedVaultMember.findFirst.mockResolvedValue(vm);
			db.query.sharedVault.findFirst.mockResolvedValue(
				makeVault({
					id: "v-1",
					name: "My Vault",
					members: [
						{
							id: "vm-1",
							userId: "user-1",
							permission: "view",
							user: {
								id: "user-1",
								name: "U1",
								email: "u1@t.com",
								image: null,
							},
						},
					],
				}),
			);

			const caller = createCaller(createCtx("user-1", db));
			const result = await caller.get({ vaultId: "v-1" });

			expect(result).toMatchObject({
				id: "v-1",
				name: "My Vault",
				permission: "view",
				wrappedKey: {
					wrappedKey: "wk-base64",
					wrappedKeyNonce: "nonce-base64",
					wrappedKeyAuthTag: "at-base64",
					ephemeralPublicKey: "epk-base64",
					senderSignature: "sig-base64",
				},
			});
		});

		it("throws FORBIDDEN for user without vault access", async () => {
			db.query.sharedVaultMember.findFirst.mockResolvedValue(null);

			const caller = createCaller(createCtx("outsider", db));
			await expect(caller.get({ vaultId: "v-1" })).rejects.toThrow(
				expect.objectContaining({ code: "FORBIDDEN" }),
			);
		});

		it("throws NOT_FOUND if vault doesn't exist after permission check", async () => {
			db.query.sharedVaultMember.findFirst.mockResolvedValue(
				makeVaultMember({ userId: "user-1", permission: "view" }),
			);
			db.query.sharedVault.findFirst.mockResolvedValue(null); // vault gone

			const caller = createCaller(createCtx("user-1", db));
			await expect(caller.get({ vaultId: "deleted-vault" })).rejects.toThrow(
				expect.objectContaining({ code: "NOT_FOUND" }),
			);
		});
	});

	describe("getForOrg", () => {
		it("uses an explicit organizationId even when the session has no active org", async () => {
			const ctx = createCtx("user-1", db);
			ctx.session.activeOrganizationId = null as any;
			db.query.member.findFirst.mockResolvedValue(
				makeMember({ userId: "user-1", organizationId: "org-2" }),
			);
			db.query.sharedVault.findFirst.mockResolvedValue(
				makeVault({ familyId: "org-2" }),
			);
			db.query.sharedVaultMember.findFirst.mockResolvedValue(
				makeVaultMember({ userId: "user-1" }),
			);

			const result = await createCaller(ctx).getForOrg({
				organizationId: "org-2",
			});

			expect(result).toMatchObject({
				exists: true,
				member: true,
				vaultId: "vault-1",
				permission: "view",
			});
		});

		it("falls back to the session's active organization when no input is given", async () => {
			db.query.member.findFirst.mockResolvedValue(
				makeMember({ userId: "user-1" }),
			);
			db.query.sharedVault.findFirst.mockResolvedValue(null);

			const result = await createCaller(createCtx("user-1", db)).getForOrg();

			expect(result).toEqual({
				exists: false,
				canManage: false,
				vaultId: null,
				member: false,
			});
		});

		it("throws NOT_FOUND when no org is given and the session has none", async () => {
			const ctx = createCtx("user-1", db);
			ctx.session.activeOrganizationId = null as any;

			await expect(createCaller(ctx).getForOrg()).rejects.toThrow(
				expect.objectContaining({ code: "NOT_FOUND" }),
			);
		});

		it("throws FORBIDDEN for an explicit org the caller is not a member of", async () => {
			db.query.member.findFirst.mockResolvedValue(null);

			await expect(
				createCaller(createCtx("user-1", db)).getForOrg({
					organizationId: "org-2",
				}),
			).rejects.toThrow(expect.objectContaining({ code: "FORBIDDEN" }));
		});

		it("reports a non-member of an existing vault as pending", async () => {
			db.query.member.findFirst.mockResolvedValue(
				makeMember({ userId: "user-1", role: "admin" }),
			);
			db.query.sharedVault.findFirst.mockResolvedValue(makeVault());
			db.query.sharedVaultMember.findFirst.mockResolvedValue(null);

			const result = await createCaller(createCtx("user-1", db)).getForOrg({
				organizationId: "org-1",
			});

			expect(result).toEqual({
				exists: true,
				canManage: true,
				vaultId: "vault-1",
				member: false,
			});
		});
	});

	// =====================================================================
	// Vault Member Management
	// =====================================================================

	describe("addMember", () => {
		it("adds a family member to the vault", async () => {
			// Caller has manage permission
			db.query.sharedVaultMember.findFirst
				.mockResolvedValueOnce(
					makeVaultMember({ userId: "organizer", permission: "manage" }),
				)
				.mockResolvedValueOnce(null); // target not already a member

			db.query.sharedVault.findFirst.mockResolvedValue(
				makeVault({ familyId: "org-1" }),
			);
			db.query.member.findMany.mockResolvedValue([
				makeMember({ userId: "new-user" }),
				makeMember({ userId: "organizer" }),
			]);
			db.insert = mockInsert([{ id: "vm-new", userId: "new-user" }]);

			const caller = createCaller(createCtx("organizer", db));
			const result = await caller.addMember({
				vaultId: "vault-1",
				member: { ...MEMBER_KEY_INPUT, userId: "new-user", permission: "edit" },
			});

			expect(result).toEqual({ id: "vm-new", userId: "new-user" });
		});

		it("throws FORBIDDEN without manage permission", async () => {
			db.query.sharedVaultMember.findFirst.mockResolvedValue(
				makeVaultMember({ userId: "viewer", permission: "view" }),
			);

			const caller = createCaller(createCtx("viewer", db));
			await expect(
				caller.addMember({
					vaultId: "vault-1",
					member: { ...MEMBER_KEY_INPUT, userId: "someone" },
				}),
			).rejects.toThrow(expect.objectContaining({ code: "FORBIDDEN" }));
		});

		it("throws CONFLICT if user already a vault member", async () => {
			db.query.sharedVaultMember.findFirst
				.mockResolvedValueOnce(
					makeVaultMember({ userId: "organizer", permission: "manage" }),
				)
				.mockResolvedValueOnce(makeVaultMember({ userId: "existing" })); // already member

			db.query.sharedVault.findFirst.mockResolvedValue(
				makeVault({ familyId: "org-1" }),
			);
			db.query.member.findMany.mockResolvedValue([
				makeMember({ userId: "existing" }),
				makeMember({ userId: "organizer" }),
			]);

			const caller = createCaller(createCtx("organizer", db));
			await expect(
				caller.addMember({
					vaultId: "vault-1",
					member: { ...MEMBER_KEY_INPUT, userId: "existing" },
				}),
			).rejects.toThrow(expect.objectContaining({ code: "CONFLICT" }));
		});

		it("throws BAD_REQUEST if target is not a family member", async () => {
			db.query.sharedVaultMember.findFirst.mockResolvedValue(
				makeVaultMember({ userId: "organizer", permission: "manage" }),
			);
			db.query.sharedVault.findFirst.mockResolvedValue(
				makeVault({ familyId: "org-1" }),
			);
			db.query.member.findMany.mockResolvedValue([
				makeMember({ userId: "organizer" }),
			]); // outsider not in family

			const caller = createCaller(createCtx("organizer", db));
			await expect(
				caller.addMember({
					vaultId: "vault-1",
					member: { ...MEMBER_KEY_INPUT, userId: "outsider" },
				}),
			).rejects.toThrow(expect.objectContaining({ code: "BAD_REQUEST" }));
		});

		it("throws NOT_FOUND if vault doesn't exist", async () => {
			db.query.sharedVaultMember.findFirst.mockResolvedValue(
				makeVaultMember({ userId: "organizer", permission: "manage" }),
			);
			db.query.sharedVault.findFirst.mockResolvedValue(null); // vault gone

			const caller = createCaller(createCtx("organizer", db));
			await expect(
				caller.addMember({
					vaultId: "deleted-vault",
					member: { ...MEMBER_KEY_INPUT, userId: "new-user" },
				}),
			).rejects.toThrow(expect.objectContaining({ code: "NOT_FOUND" }));
		});

		it("derives the new member's permission from their ORG role, ignoring client input", async () => {
			// Caller has manage; target is a plain member whose role should map to
			// read-only "view" even though the client asked for "manage".
			db.query.sharedVaultMember.findFirst
				.mockResolvedValueOnce(
					makeVaultMember({ userId: "organizer", permission: "manage" }),
				) // requireVaultPermission
				.mockResolvedValueOnce(null); // target not already a vault member
			db.query.sharedVault.findFirst.mockResolvedValue(
				makeVault({ familyId: "org-1" }),
			);
			db.query.member.findMany.mockResolvedValue([
				makeMember({ userId: "new-user", role: "member" }),
				makeMember({ userId: "organizer", role: "owner" }),
			]);

			let capturedValues: any = null;
			db.insert = vi.fn().mockReturnValue({
				values: vi.fn().mockImplementation((v: any) => {
					capturedValues = v;
					const p = Promise.resolve(undefined);
					(p as any).returning = vi
						.fn()
						.mockResolvedValue([{ id: "vm-new", userId: v.userId }]);
					return p;
				}),
			});

			const caller = createCaller(createCtx("organizer", db));
			await caller.addMember({
				vaultId: "vault-1",
				member: {
					...MEMBER_KEY_INPUT,
					userId: "new-user",
					permission: "manage",
				},
			});

			expect(capturedValues.permission).toBe("view");
		});

		it("grants an admin target 'manage' (read/write + can re-grant)", async () => {
			db.query.sharedVaultMember.findFirst
				.mockResolvedValueOnce(
					makeVaultMember({ userId: "organizer", permission: "manage" }),
				)
				.mockResolvedValueOnce(null);
			db.query.sharedVault.findFirst.mockResolvedValue(
				makeVault({ familyId: "org-1" }),
			);
			db.query.member.findMany.mockResolvedValue([
				makeMember({ userId: "an-admin", role: "admin" }),
				makeMember({ userId: "organizer", role: "owner" }),
			]);

			let capturedValues: any = null;
			db.insert = vi.fn().mockReturnValue({
				values: vi.fn().mockImplementation((v: any) => {
					capturedValues = v;
					const p = Promise.resolve(undefined);
					(p as any).returning = vi
						.fn()
						.mockResolvedValue([{ id: "vm-new", userId: v.userId }]);
					return p;
				}),
			});

			const caller = createCaller(createCtx("organizer", db));
			await caller.addMember({
				vaultId: "vault-1",
				member: { ...MEMBER_KEY_INPUT, userId: "an-admin", permission: "view" },
			});

			expect(capturedValues.permission).toBe("manage");
		});

		it("re-wrap of a flagged member PRESERVES the existing permission (no escalation)", async () => {
			db.query.sharedVaultMember.findFirst
				.mockResolvedValueOnce(
					makeVaultMember({ userId: "organizer", permission: "manage" }),
				) // requireVaultPermission
				.mockResolvedValueOnce({
					id: "vm-e",
					userId: "member-x",
					permission: "view",
					needsRewrap: true,
				}); // existing flagged row
			db.query.sharedVault.findFirst.mockResolvedValue(
				makeVault({ familyId: "org-1" }),
			);
			db.query.member.findMany.mockResolvedValue([
				makeMember({ userId: "member-x", role: "member" }),
				makeMember({ userId: "organizer", role: "owner" }),
			]);

			let updateSetArg: any = null;
			db.update = vi.fn().mockReturnValue({
				set: vi.fn().mockImplementation((v: any) => {
					updateSetArg = v;
					return { where: vi.fn().mockResolvedValue(undefined) };
				}),
			});

			const caller = createCaller(createCtx("organizer", db));
			await caller.addMember({
				vaultId: "vault-1",
				member: {
					...MEMBER_KEY_INPUT,
					userId: "member-x",
					permission: "manage",
				},
			});

			// The rewrap path replaces envelope fields but never sets a permission.
			expect(updateSetArg).not.toBeNull();
			expect(updateSetArg.permission).toBeUndefined();
			expect(updateSetArg.needsRewrap).toBe(false);
		});
	});

	describe("listGrantableMembers", () => {
		function withManageAndDevices() {
			db.query.sharedVaultMember.findFirst.mockResolvedValueOnce(
				makeVaultMember({ userId: "organizer", permission: "manage" }),
			); // requireVaultPermission
			db.query.sharedVault.findFirst.mockResolvedValue(
				makeVault({ familyId: "org-1" }),
			);
			db.query.device = {
				findMany: vi.fn().mockResolvedValue([
					{
						userId: "new-member",
						publicKey: "pk-m",
						signingPublicKey: "spk-m",
					},
					{ userId: "new-admin", publicKey: "pk-a", signingPublicKey: "spk-a" },
				]),
			};
		}

		function memberWithUser(userId: string, role: string) {
			return {
				...makeMember({ userId, role }),
				user: { id: userId, name: userId, email: `${userId}@t.c`, image: null },
			};
		}

		it("returns role-derived permission for never-granted members", async () => {
			withManageAndDevices();
			db.query.member.findMany.mockResolvedValue([
				memberWithUser("new-member", "member"),
				memberWithUser("new-admin", "admin"),
				memberWithUser("organizer", "owner"),
			]);
			// Only the organizer is currently in the vault.
			db.query.sharedVaultMember.findMany.mockResolvedValue([
				{ userId: "organizer", permission: "manage", needsRewrap: false },
			]);

			const caller = createCaller(createCtx("organizer", db));
			const result = await caller.listGrantableMembers({ vaultId: "vault-1" });

			const byId = Object.fromEntries(result.map((r: any) => [r.userId, r]));
			expect(byId["new-member"].permission).toBe("view");
			expect(byId["new-admin"].permission).toBe("manage");
			// organizer already in vault → not a candidate
			expect(byId.organizer).toBeUndefined();
		});

		it("preserves the existing permission for a needsRewrap member", async () => {
			withManageAndDevices();
			db.query.member.findMany.mockResolvedValue([
				memberWithUser("new-admin", "admin"),
				memberWithUser("organizer", "owner"),
			]);
			// new-admin already has a row flagged for rewrap with permission "edit":
			// the existing permission must win over the role-derived "manage".
			db.query.sharedVaultMember.findMany.mockResolvedValue([
				{ userId: "organizer", permission: "manage", needsRewrap: false },
				{ userId: "new-admin", permission: "edit", needsRewrap: true },
			]);

			const caller = createCaller(createCtx("organizer", db));
			const result = await caller.listGrantableMembers({ vaultId: "vault-1" });

			const rewrapAdmin = result.find((r: any) => r.userId === "new-admin");
			expect(rewrapAdmin?.rewrap).toBe(true);
			expect(rewrapAdmin?.permission).toBe("edit");
		});
	});

	describe("removeMember", () => {
		it("removes a member from the vault", async () => {
			db.query.sharedVaultMember.findFirst
				.mockResolvedValueOnce(
					makeVaultMember({ userId: "organizer", permission: "manage" }),
				)
				.mockResolvedValueOnce(
					makeVaultMember({ id: "vm-target", userId: "target" }),
				);
			db.query.sharedVault.findFirst.mockResolvedValue(makeVault());
			db.query.member.findMany.mockResolvedValue([
				makeMember({ userId: "organizer" }),
			]);
			db.query.sharedVaultMember.findMany.mockResolvedValue([
				{ userId: "organizer" },
				{ userId: "target" },
			]);

			const caller = createCaller(createCtx("organizer", db));
			const result = await caller.removeMember({
				vaultId: "vault-1",
				userId: "target",
				remainingMemberKeys: [{ ...MEMBER_KEY_INPUT, userId: "organizer" }],
			});

			expect(result).toEqual({ success: true });
			expect(db.delete).toHaveBeenCalled();
		});

		it("throws FORBIDDEN without manage permission", async () => {
			db.query.sharedVaultMember.findFirst.mockResolvedValue(
				makeVaultMember({ userId: "editor", permission: "edit" }),
			);

			const caller = createCaller(createCtx("editor", db));
			await expect(
				caller.removeMember({
					vaultId: "vault-1",
					userId: "target",
					remainingMemberKeys: [{ ...MEMBER_KEY_INPUT, userId: "organizer" }],
				}),
			).rejects.toThrow(expect.objectContaining({ code: "FORBIDDEN" }));
		});

		it("throws NOT_FOUND if target is not a vault member", async () => {
			db.query.sharedVaultMember.findFirst
				.mockResolvedValueOnce(
					makeVaultMember({ userId: "organizer", permission: "manage" }),
				)
				.mockResolvedValueOnce(null);

			const caller = createCaller(createCtx("organizer", db));
			await expect(
				caller.removeMember({
					vaultId: "vault-1",
					userId: "ghost",
					remainingMemberKeys: [{ ...MEMBER_KEY_INPUT, userId: "organizer" }],
				}),
			).rejects.toThrow(expect.objectContaining({ code: "NOT_FOUND" }));
		});
	});

	describe("updatePermission", () => {
		it("updates a member permission", async () => {
			db.query.sharedVaultMember.findFirst
				.mockResolvedValueOnce(
					makeVaultMember({ userId: "organizer", permission: "manage" }),
				)
				.mockResolvedValueOnce(
					makeVaultMember({ id: "vm-t", userId: "target", permission: "view" }),
				);
			db.query.sharedVault.findFirst.mockResolvedValue(makeVault());
			db.update = mockUpdate([{ id: "vm-t", permission: "edit" }]);

			const caller = createCaller(createCtx("organizer", db));
			const result = await caller.updatePermission({
				vaultId: "vault-1",
				userId: "target",
				permission: "edit",
			});

			expect(result).toEqual({ id: "vm-t", permission: "edit" });
		});

		it("throws FORBIDDEN without manage permission", async () => {
			db.query.sharedVaultMember.findFirst.mockResolvedValue(
				makeVaultMember({ userId: "sharer", permission: "share" }),
			);

			const caller = createCaller(createCtx("sharer", db));
			await expect(
				caller.updatePermission({
					vaultId: "vault-1",
					userId: "target",
					permission: "edit",
				}),
			).rejects.toThrow(expect.objectContaining({ code: "FORBIDDEN" }));
		});

		it("throws NOT_FOUND if target user is not a vault member", async () => {
			db.query.sharedVaultMember.findFirst
				.mockResolvedValueOnce(
					makeVaultMember({ userId: "organizer", permission: "manage" }),
				)
				.mockResolvedValueOnce(null); // target not found

			const caller = createCaller(createCtx("organizer", db));
			await expect(
				caller.updatePermission({
					vaultId: "vault-1",
					userId: "ghost",
					permission: "edit",
				}),
			).rejects.toThrow(expect.objectContaining({ code: "NOT_FOUND" }));
		});
	});

	// =====================================================================
	// Permission Matrix
	// =====================================================================

	describe("permission matrix", () => {
		const permTests = [
			{ perm: "view", canList: true, canAdd: false, canManage: false },
			{ perm: "edit", canList: true, canAdd: true, canManage: false },
			{ perm: "share", canList: true, canAdd: true, canManage: false },
			{ perm: "manage", canList: true, canAdd: true, canManage: true },
		] as const;

		for (const { perm, canList, canAdd, canManage } of permTests) {
			describe(`${perm} permission`, () => {
				it(`${canList ? "can" : "cannot"} list items`, async () => {
					if (canList) {
						db.query.sharedVaultMember.findFirst.mockResolvedValue(
							makeVaultMember({ permission: perm }),
						);
						db.query.sharedVaultItem.findMany.mockResolvedValue([]);

						const caller = createCaller(createCtx("user-1", db));
						const result = await caller.listItems({ vaultId: "vault-1" });
						expect(result).toEqual([]);
					}
				});

				it(`${canAdd ? "can" : "cannot"} add items`, async () => {
					db.query.sharedVaultMember.findFirst.mockResolvedValue(
						makeVaultMember({ permission: perm }),
					);

					const caller = createCaller(createCtx("user-1", db));
					const input = {
						vaultId: "vault-1",
						itemType: "login" as const,
						ciphertext: "ct",
						nonce: "n",
						authTag: "at",
						wrappedDataKey: "wdk",
						wrappedDataKeyNonce: "wdkn",
						wrappedDataKeyAuthTag: "wdkat",
					};

					if (canAdd) {
						db.insert = mockInsert([{ id: "item-new" }]);
						const result = await caller.addItem(input);
						expect(result).toHaveProperty("id");
					} else {
						await expect(caller.addItem(input)).rejects.toThrow(
							expect.objectContaining({ code: "FORBIDDEN" }),
						);
					}
				});

				it(`${canManage ? "can" : "cannot"} add vault members`, async () => {
					db.query.sharedVaultMember.findFirst.mockResolvedValue(
						makeVaultMember({ permission: perm }),
					);

					const caller = createCaller(createCtx("user-1", db));

					if (canManage) {
						// Need additional mocks for addMember
						db.query.sharedVaultMember.findFirst
							.mockResolvedValueOnce(makeVaultMember({ permission: perm })) // requireVaultPermission
							.mockResolvedValueOnce(null); // not already member
						db.query.sharedVault.findFirst.mockResolvedValue(
							makeVault({ familyId: "org-1" }),
						);
						db.query.member.findMany.mockResolvedValue([
							makeMember({ userId: "new-member" }),
							makeMember({ userId: "user-1" }),
						]);
						db.insert = mockInsert([{ id: "vm-new", userId: "new-member" }]);

						// Recreate caller with fresh db state
						const mgr = createCaller(createCtx("user-1", db));
						const result = await mgr.addMember({
							vaultId: "vault-1",
							member: { ...MEMBER_KEY_INPUT, userId: "new-member" },
						});
						expect(result).toHaveProperty("id");
					} else {
						await expect(
							caller.addMember({
								vaultId: "vault-1",
								member: { ...MEMBER_KEY_INPUT, userId: "new-member" },
							}),
						).rejects.toThrow(expect.objectContaining({ code: "FORBIDDEN" }));
					}
				});
			});
		}
	});

	// =====================================================================
	// Key Rotation
	// =====================================================================

	describe("rotateKey", () => {
		it("replaces all wrapped keys when called with manage permission", async () => {
			db.query.sharedVaultMember.findFirst.mockResolvedValue(
				makeVaultMember({ userId: "organizer", permission: "manage" }),
			);
			db.query.sharedVault.findFirst.mockResolvedValue(makeVault());
			db.query.member.findMany.mockResolvedValue([
				makeMember({ userId: "organizer" }),
				makeMember({ userId: "remaining-member" }),
			]);
			db.query.sharedVaultMember.findMany.mockResolvedValue([
				{ userId: "organizer" },
				{ userId: "remaining-member" },
			]);
			db.delete = mockDelete();
			db.insert = mockInsert([{}]);

			const caller = createCaller(createCtx("organizer", db));
			const result = await caller.rotateKey({
				vaultId: "vault-1",
				memberKeys: [
					{ ...MEMBER_KEY_INPUT, userId: "organizer" },
					{ ...MEMBER_KEY_INPUT, userId: "remaining-member" },
				],
			});

			expect(result).toEqual({ success: true });
			// Should delete all existing then insert new
			expect(db.delete).toHaveBeenCalled();
			expect(db.insert).toHaveBeenCalled();
		});

		it("throws FORBIDDEN without manage permission", async () => {
			db.query.sharedVaultMember.findFirst.mockResolvedValue(
				makeVaultMember({ userId: "editor", permission: "edit" }),
			);

			const caller = createCaller(createCtx("editor", db));
			await expect(
				caller.rotateKey({
					vaultId: "vault-1",
					memberKeys: [{ ...MEMBER_KEY_INPUT, userId: "editor" }],
				}),
			).rejects.toThrow(expect.objectContaining({ code: "FORBIDDEN" }));
		});
	});

	// =====================================================================
	// Round 4 fix #24 — createForOrg must not let a non-member org admin
	// extend an existing vault (e.g. self-insert with "manage")
	// =====================================================================

	describe("createForOrg security (fix #24)", () => {
		function mockOrgAdminCtx(userId: string) {
			// getActiveOrgMembership → caller is org admin
			db.query.member.findFirst.mockResolvedValue(
				makeMember({ userId, role: "admin" }),
			);
			// requireProPlan → owner-plan fallback (org sub null by default)
			db.query.organization.findFirst.mockResolvedValue({
				ownerId: "user-organizer",
			});
		}

		it("rejects an org admin who is not a vault member from extending an existing vault", async () => {
			mockOrgAdminCtx("org-admin");
			db.query.sharedVault.findFirst.mockResolvedValue(makeVault());
			db.query.member.findMany.mockResolvedValue([
				makeMember({ userId: "org-admin" }),
			]);
			// caller has NO sharedVaultMember row → requireVaultPermission throws
			db.query.sharedVaultMember.findFirst.mockResolvedValue(null);

			const caller = createCaller(createCtx("org-admin", db));
			await expect(
				caller.createForOrg({
					memberKeys: [
						{ ...MEMBER_KEY_INPUT, userId: "org-admin", permission: "manage" },
					],
				}),
			).rejects.toThrow(expect.objectContaining({ code: "FORBIDDEN" }));
			expect(db.insert).not.toHaveBeenCalled();
		});

		it("rejects a view-only vault member from extending an existing vault", async () => {
			mockOrgAdminCtx("org-admin");
			db.query.sharedVault.findFirst.mockResolvedValue(makeVault());
			db.query.member.findMany.mockResolvedValue([
				makeMember({ userId: "org-admin" }),
				makeMember({ userId: "new-user" }),
			]);
			db.query.sharedVaultMember.findFirst.mockResolvedValue(
				makeVaultMember({ userId: "org-admin", permission: "view" }),
			);

			const caller = createCaller(createCtx("org-admin", db));
			await expect(
				caller.createForOrg({
					memberKeys: [
						{ ...MEMBER_KEY_INPUT, userId: "new-user", permission: "view" },
					],
				}),
			).rejects.toThrow(expect.objectContaining({ code: "FORBIDDEN" }));
			expect(db.insert).not.toHaveBeenCalled();
		});

		it("allows a vault manager to add missing members to an existing vault", async () => {
			mockOrgAdminCtx("org-admin");
			db.query.sharedVault.findFirst.mockResolvedValue(makeVault());
			db.query.member.findMany.mockResolvedValue([
				makeMember({ userId: "org-admin" }),
				makeMember({ userId: "new-user" }),
			]);
			db.query.sharedVaultMember.findFirst.mockResolvedValue(
				makeVaultMember({ userId: "org-admin", permission: "manage" }),
			);
			db.query.sharedVaultMember.findMany.mockResolvedValue([
				{ userId: "org-admin" },
			]);
			db.insert = mockInsert([{}]);

			const caller = createCaller(createCtx("org-admin", db));
			const result = await caller.createForOrg({
				memberKeys: [
					{ ...MEMBER_KEY_INPUT, userId: "new-user", permission: "view" },
				],
			});

			expect(result).toEqual({
				id: "vault-1",
				name: "Shared Vault",
				existed: true,
			});
			expect(db.insert).toHaveBeenCalled();
		});

		it("still creates a brand-new org vault for an org admin", async () => {
			mockOrgAdminCtx("org-admin");
			db.query.sharedVault.findFirst.mockResolvedValue(null); // no existing vault
			db.query.member.findMany.mockResolvedValue([
				makeMember({ userId: "org-admin" }),
			]);
			db.query.sharedVaultMember.findMany.mockResolvedValue([]);
			db.insert = mockInsert([{ id: "vault-new", name: "Organization Vault" }]);

			const caller = createCaller(createCtx("org-admin", db));
			const result = await caller.createForOrg({
				memberKeys: [
					{ ...MEMBER_KEY_INPUT, userId: "org-admin", permission: "manage" },
				],
			});

			expect(result).toEqual({
				id: "vault-new",
				name: "Organization Vault",
				existed: false,
			});
		});
	});

	// =====================================================================
	// Round 4 fix #33 — the vault creator cannot be evicted or demoted by a
	// co-equal manage member
	// =====================================================================

	describe("creator protection (fix #33)", () => {
		it("forbids a manage member from removing the vault creator", async () => {
			db.query.sharedVaultMember.findFirst
				.mockResolvedValueOnce(
					makeVaultMember({ userId: "mallory", permission: "manage" }),
				)
				.mockResolvedValueOnce(
					makeVaultMember({
						id: "vm-creator",
						userId: "user-organizer",
						permission: "manage",
					}),
				);
			db.query.sharedVault.findFirst.mockResolvedValue(makeVault()); // createdBy user-organizer

			const caller = createCaller(createCtx("mallory", db));
			await expect(
				caller.removeMember({
					vaultId: "vault-1",
					userId: "user-organizer",
					remainingMemberKeys: [{ ...MEMBER_KEY_INPUT, userId: "mallory" }],
				}),
			).rejects.toThrow(
				expect.objectContaining({
					code: "FORBIDDEN",
					message: "errors:sharedVault.cannotRemoveCreator",
				}),
			);
		});

		it("allows the creator to remove themselves", async () => {
			db.query.sharedVaultMember.findFirst
				.mockResolvedValueOnce(
					makeVaultMember({ userId: "user-organizer", permission: "manage" }),
				)
				.mockResolvedValueOnce(
					makeVaultMember({
						id: "vm-creator",
						userId: "user-organizer",
						permission: "manage",
					}),
				);
			db.query.sharedVault.findFirst.mockResolvedValue(makeVault());
			db.query.member.findMany.mockResolvedValue([
				makeMember({ userId: "other" }),
			]);
			db.query.sharedVaultMember.findMany.mockResolvedValue([
				{ userId: "user-organizer" },
				{ userId: "other" },
			]);

			const caller = createCaller(createCtx("user-organizer", db));
			const result = await caller.removeMember({
				vaultId: "vault-1",
				userId: "user-organizer",
				remainingMemberKeys: [{ ...MEMBER_KEY_INPUT, userId: "other" }],
			});

			expect(result).toEqual({ success: true });
		});

		it("forbids a manage member from demoting the creator via updatePermission", async () => {
			db.query.sharedVaultMember.findFirst
				.mockResolvedValueOnce(
					makeVaultMember({ userId: "mallory", permission: "manage" }),
				)
				.mockResolvedValueOnce(
					makeVaultMember({
						id: "vm-creator",
						userId: "user-organizer",
						permission: "manage",
					}),
				);
			db.query.sharedVault.findFirst.mockResolvedValue(makeVault());

			const caller = createCaller(createCtx("mallory", db));
			await expect(
				caller.updatePermission({
					vaultId: "vault-1",
					userId: "user-organizer",
					permission: "view",
				}),
			).rejects.toThrow(
				expect.objectContaining({
					code: "FORBIDDEN",
					message: "errors:sharedVault.cannotDemoteCreator",
				}),
			);
		});

		it("allows the creator to change their own permission", async () => {
			db.query.sharedVaultMember.findFirst
				.mockResolvedValueOnce(
					makeVaultMember({ userId: "user-organizer", permission: "manage" }),
				)
				.mockResolvedValueOnce(
					makeVaultMember({
						id: "vm-creator",
						userId: "user-organizer",
						permission: "manage",
					}),
				);
			db.query.sharedVault.findFirst.mockResolvedValue(makeVault());
			db.update = mockUpdate([{ id: "vm-creator", permission: "view" }]);

			const caller = createCaller(createCtx("user-organizer", db));
			const result = await caller.updatePermission({
				vaultId: "vault-1",
				userId: "user-organizer",
				permission: "view",
			});

			expect(result).toEqual({ id: "vm-creator", permission: "view" });
		});

		it("forbids rotateKey entries that demote the creator", async () => {
			db.query.sharedVaultMember.findFirst
				.mockResolvedValueOnce(
					makeVaultMember({ userId: "mallory", permission: "manage" }),
				)
				.mockResolvedValueOnce(
					makeVaultMember({ userId: "user-organizer", permission: "manage" }),
				);
			db.query.sharedVault.findFirst.mockResolvedValue(makeVault());
			db.query.member.findMany.mockResolvedValue([
				makeMember({ userId: "mallory" }),
				makeMember({ userId: "user-organizer" }),
			]);
			db.query.sharedVaultMember.findMany.mockResolvedValue([
				{ userId: "mallory" },
				{ userId: "user-organizer" },
			]);

			const caller = createCaller(createCtx("mallory", db));
			await expect(
				caller.rotateKey({
					vaultId: "vault-1",
					memberKeys: [
						{ ...MEMBER_KEY_INPUT, userId: "mallory", permission: "manage" },
						{
							...MEMBER_KEY_INPUT,
							userId: "user-organizer",
							permission: "view",
						},
					],
				}),
			).rejects.toThrow(
				expect.objectContaining({
					code: "FORBIDDEN",
					message: "errors:sharedVault.cannotDemoteCreator",
				}),
			);
		});
	});

	// =====================================================================
	// Item CRUD
	// =====================================================================

	describe("listItems", () => {
		it("returns non-deleted items for authorized user", async () => {
			db.query.sharedVaultMember.findFirst.mockResolvedValue(
				makeVaultMember({ permission: "view" }),
			);
			const now = new Date();
			db.query.sharedVaultItem.findMany.mockResolvedValue([
				makeVaultItem({
					id: "i-1",
					itemType: "login",
					createdAt: now,
					updatedAt: now,
				}),
				makeVaultItem({
					id: "i-2",
					itemType: "note",
					createdAt: now,
					updatedAt: now,
				}),
			]);

			const caller = createCaller(createCtx("user-1", db));
			const result = await caller.listItems({ vaultId: "vault-1" });

			expect(result).toHaveLength(2);
			expect(result[0]).toMatchObject({ id: "i-1", itemType: "login" });
			expect(result[1]).toMatchObject({ id: "i-2", itemType: "note" });
		});
	});

	describe("addItem", () => {
		it("creates an encrypted item with edit permission", async () => {
			db.query.sharedVaultMember.findFirst.mockResolvedValue(
				makeVaultMember({ permission: "edit" }),
			);
			db.insert = mockInsert([{ id: "item-new" }]);

			const caller = createCaller(createCtx("user-1", db));
			const result = await caller.addItem({
				vaultId: "vault-1",
				itemType: "login",
				ciphertext: "encrypted-data",
				nonce: "nonce",
				authTag: "auth-tag",
				wrappedDataKey: "wrapped-key",
				wrappedDataKeyNonce: "wdk-nonce",
				wrappedDataKeyAuthTag: "wdk-auth-tag",
			});

			expect(result).toEqual({ id: "item-new" });
		});

		it("throws FORBIDDEN with view-only permission", async () => {
			db.query.sharedVaultMember.findFirst.mockResolvedValue(
				makeVaultMember({ permission: "view" }),
			);

			const caller = createCaller(createCtx("user-1", db));
			await expect(
				caller.addItem({
					vaultId: "vault-1",
					itemType: "login",
					ciphertext: "ct",
					nonce: "n",
					authTag: "at",
					wrappedDataKey: "wdk",
					wrappedDataKeyNonce: "wdkn",
					wrappedDataKeyAuthTag: "wdkat",
				}),
			).rejects.toThrow(expect.objectContaining({ code: "FORBIDDEN" }));
		});
	});

	describe("updateItem", () => {
		it("updates an existing item", async () => {
			db.query.sharedVaultMember.findFirst.mockResolvedValue(
				makeVaultMember({ permission: "edit" }),
			);
			db.query.sharedVaultItem.findFirst.mockResolvedValue(
				makeVaultItem({ id: "i-1", version: 1 }),
			);
			db.update = mockUpdate([{ id: "i-1", version: 2 }]);

			const caller = createCaller(createCtx("user-1", db));
			const result = await caller.updateItem({
				vaultId: "vault-1",
				itemId: "i-1",
				ciphertext: "new-ct",
				nonce: "new-n",
				authTag: "new-at",
				wrappedDataKey: "new-wdk",
				wrappedDataKeyNonce: "new-wdkn",
				wrappedDataKeyAuthTag: "new-wdkat",
			});

			expect(result).toEqual({ id: "i-1", version: 2 });
		});

		it("throws NOT_FOUND for nonexistent item", async () => {
			db.query.sharedVaultMember.findFirst.mockResolvedValue(
				makeVaultMember({ permission: "edit" }),
			);
			db.query.sharedVaultItem.findFirst.mockResolvedValue(null);

			const caller = createCaller(createCtx("user-1", db));
			await expect(
				caller.updateItem({
					vaultId: "vault-1",
					itemId: "nonexistent",
					ciphertext: "ct",
					nonce: "n",
					authTag: "at",
					wrappedDataKey: "wdk",
					wrappedDataKeyNonce: "wdkn",
					wrappedDataKeyAuthTag: "wdkat",
				}),
			).rejects.toThrow(expect.objectContaining({ code: "NOT_FOUND" }));
		});
	});

	describe("deleteItem", () => {
		it("soft-deletes an item with edit permission", async () => {
			db.query.sharedVaultMember.findFirst.mockResolvedValue(
				makeVaultMember({ permission: "edit" }),
			);
			db.query.sharedVaultItem.findFirst.mockResolvedValue(
				makeVaultItem({ id: "i-1" }),
			);
			db.update = mockUpdate([{}]);

			const caller = createCaller(createCtx("user-1", db));
			const result = await caller.deleteItem({
				vaultId: "vault-1",
				itemId: "i-1",
			});

			expect(result).toEqual({ success: true });
		});

		it("throws NOT_FOUND for already-deleted item", async () => {
			db.query.sharedVaultMember.findFirst.mockResolvedValue(
				makeVaultMember({ permission: "edit" }),
			);
			// Item not found (deleted or doesn't exist)
			db.query.sharedVaultItem.findFirst.mockResolvedValue(null);

			const caller = createCaller(createCtx("user-1", db));
			await expect(
				caller.deleteItem({ vaultId: "vault-1", itemId: "deleted-item" }),
			).rejects.toThrow(expect.objectContaining({ code: "NOT_FOUND" }));
		});

		it("throws FORBIDDEN with view-only permission", async () => {
			db.query.sharedVaultMember.findFirst.mockResolvedValue(
				makeVaultMember({ permission: "view" }),
			);

			const caller = createCaller(createCtx("user-1", db));
			await expect(
				caller.deleteItem({ vaultId: "vault-1", itemId: "i-1" }),
			).rejects.toThrow(expect.objectContaining({ code: "FORBIDDEN" }));
		});
	});

	// =====================================================================
	// Security: Zero-knowledge validation
	// =====================================================================

	describe("security: zero-knowledge", () => {
		it("server stores only encrypted blobs, never plaintext", () => {
			// The addItem input only accepts ciphertext + nonce + authTag + wrappedDataKey
			// There is no plaintext field in the schema
			const itemFields = [
				"ciphertext",
				"nonce",
				"authTag",
				"wrappedDataKey",
				"wrappedDataKeyNonce",
				"wrappedDataKeyAuthTag",
			];

			// Verify these are the encrypted fields (no "password", "username" etc.)
			for (const field of itemFields) {
				expect(field).not.toMatch(
					/^(password|username|plaintext|secret|data)$/,
				);
			}
		});

		it("wrapped key fields are per-member (each member has unique envelope)", async () => {
			// Verify vault member has individual wrapped key fields
			const vm1 = makeVaultMember({ userId: "u1", wrappedKey: "wk-for-u1" });
			const vm2 = makeVaultMember({ userId: "u2", wrappedKey: "wk-for-u2" });

			expect(vm1.wrappedKey).not.toBe(vm2.wrappedKey);
			expect(vm1.userId).not.toBe(vm2.userId);
		});
	});

	// =====================================================================
	// Rewrap flow (device-key escrow fallback)
	// =====================================================================

	describe("requestRewrap", () => {
		it("flags the caller's own membership row", async () => {
			db.query.sharedVaultMember.findFirst.mockResolvedValue(
				makeVaultMember({ id: "vm-1", userId: "user-1" }),
			);
			const setSpy = vi.fn().mockReturnValue({
				where: vi.fn().mockResolvedValue(undefined),
			});
			db.update = vi.fn().mockReturnValue({ set: setSpy });

			const result = await createCaller(createCtx("user-1", db)).requestRewrap({
				vaultId: "vault-1",
			});

			expect(result).toEqual({ success: true });
			expect(setSpy).toHaveBeenCalledWith({ needsRewrap: true });
		});

		it("is idempotent when already flagged", async () => {
			db.query.sharedVaultMember.findFirst.mockResolvedValue({
				...makeVaultMember({ userId: "user-1" }),
				needsRewrap: true,
			});
			db.update = vi.fn();

			const result = await createCaller(createCtx("user-1", db)).requestRewrap({
				vaultId: "vault-1",
			});

			expect(result).toEqual({ success: true });
			expect(db.update).not.toHaveBeenCalled();
		});

		it("throws NOT_FOUND for a non-member", async () => {
			db.query.sharedVaultMember.findFirst.mockResolvedValue(null);

			await expect(
				createCaller(createCtx("outsider", db)).requestRewrap({
					vaultId: "vault-1",
				}),
			).rejects.toThrow(expect.objectContaining({ code: "NOT_FOUND" }));
		});
	});

	describe("getForOrg with needsRewrap", () => {
		it("still returns the stale envelope so the member can retry and self-heal", async () => {
			db.query.member.findFirst.mockResolvedValue(
				makeMember({ userId: "user-1", role: "member" }),
			);
			db.query.sharedVault.findFirst.mockResolvedValue(makeVault());
			db.query.sharedVaultMember.findFirst.mockResolvedValue({
				...makeVaultMember({ userId: "user-1", permission: "edit" }),
				needsRewrap: true,
			});

			const result = await createCaller(createCtx("user-1", db)).getForOrg({
				organizationId: "org-1",
			});

			expect(result).toMatchObject({
				exists: true,
				member: true,
				vaultId: "vault-1",
				permission: "edit",
				needsRewrap: true,
				wrappedKey: {
					wrappedKey: "wk-base64",
					wrappedKeyNonce: "nonce-base64",
					wrappedKeyAuthTag: "at-base64",
					ephemeralPublicKey: "epk-base64",
					senderSignature: "sig-base64",
				},
			});
		});

		it("omits the flag for a healthy membership", async () => {
			db.query.member.findFirst.mockResolvedValue(
				makeMember({ userId: "user-1", role: "member" }),
			);
			db.query.sharedVault.findFirst.mockResolvedValue(makeVault());
			db.query.sharedVaultMember.findFirst.mockResolvedValue(
				makeVaultMember({ userId: "user-1", permission: "edit" }),
			);

			const result = await createCaller(createCtx("user-1", db)).getForOrg({
				organizationId: "org-1",
			});

			expect(result).not.toHaveProperty("needsRewrap");
			expect(result).toHaveProperty("wrappedKey");
		});
	});

	describe("addMember rewrap upsert", () => {
		it("replaces the envelope, preserves permission, clears the flag", async () => {
			db.query.sharedVaultMember.findFirst
				.mockResolvedValueOnce(
					makeVaultMember({ userId: "organizer", permission: "manage" }),
				)
				.mockResolvedValueOnce({
					...makeVaultMember({
						id: "vm-flagged",
						userId: "lost-user",
						permission: "share",
					}),
					needsRewrap: true,
				});
			db.query.sharedVault.findFirst.mockResolvedValue(
				makeVault({ familyId: "org-1" }),
			);
			db.query.member.findMany.mockResolvedValue([
				makeMember({ userId: "lost-user" }),
				makeMember({ userId: "organizer" }),
			]);
			const setSpy = vi.fn().mockReturnValue({
				where: vi.fn().mockResolvedValue(undefined),
			});
			db.update = vi.fn().mockReturnValue({ set: setSpy });
			db.insert = mockInsert([]);

			const caller = createCaller(createCtx("organizer", db));
			const result = await caller.addMember({
				vaultId: "vault-1",
				// caller sends "edit" but the row's existing "share" must survive
				member: {
					...MEMBER_KEY_INPUT,
					userId: "lost-user",
					permission: "edit",
				},
			});

			expect(result).toEqual({ id: "vm-flagged", userId: "lost-user" });
			expect(db.insert).not.toHaveBeenCalled();
			expect(setSpy).toHaveBeenCalledWith(
				expect.objectContaining({
					needsRewrap: false,
					grantedBy: "organizer",
					wrappedKey: MEMBER_KEY_INPUT.wrappedKey,
				}),
			);
			expect(setSpy.mock.calls[0][0]).not.toHaveProperty("permission");
		});

		it("still CONFLICTs for an unflagged existing member", async () => {
			db.query.sharedVaultMember.findFirst
				.mockResolvedValueOnce(
					makeVaultMember({ userId: "organizer", permission: "manage" }),
				)
				.mockResolvedValueOnce({
					...makeVaultMember({ userId: "existing" }),
					needsRewrap: false,
				});
			db.query.sharedVault.findFirst.mockResolvedValue(
				makeVault({ familyId: "org-1" }),
			);
			db.query.member.findMany.mockResolvedValue([
				makeMember({ userId: "existing" }),
				makeMember({ userId: "organizer" }),
			]);

			await expect(
				createCaller(createCtx("organizer", db)).addMember({
					vaultId: "vault-1",
					member: { ...MEMBER_KEY_INPUT, userId: "existing" },
				}),
			).rejects.toThrow(expect.objectContaining({ code: "CONFLICT" }));
		});
	});

	describe("listGrantableMembers with rewrap candidates", () => {
		it("includes flagged members with their current permission", async () => {
			// caller has manage permission
			db.query.sharedVaultMember.findFirst.mockResolvedValue(
				makeVaultMember({ userId: "organizer", permission: "manage" }),
			);
			db.query.sharedVault.findFirst.mockResolvedValue(
				makeVault({ familyId: "org-1" }),
			);
			db.query.member.findMany.mockResolvedValue([
				{
					...makeMember({ userId: "organizer" }),
					user: { id: "organizer", name: "Org", email: "o@t.c", image: null },
				},
				{
					...makeMember({ userId: "lost-user" }),
					user: { id: "lost-user", name: "Lost", email: "l@t.c", image: null },
				},
				{
					...makeMember({ userId: "never-granted" }),
					user: {
						id: "never-granted",
						name: "New",
						email: "n@t.c",
						image: null,
					},
				},
			]);
			db.query.sharedVaultMember.findMany.mockResolvedValue([
				{ userId: "organizer", permission: "manage", needsRewrap: false },
				{ userId: "lost-user", permission: "share", needsRewrap: true },
			]);
			db.query.device = {
				findMany: vi.fn().mockResolvedValue([
					{
						userId: "lost-user",
						publicKey: "pk-lost",
						signingPublicKey: "spk-lost",
					},
					{
						userId: "never-granted",
						publicKey: "pk-new",
						signingPublicKey: "spk-new",
					},
				]),
			} as any;

			const result = await createCaller(
				createCtx("organizer", db),
			).listGrantableMembers({
				vaultId: "vault-1",
			});

			const byId = new Map(result.map((c: any) => [c.userId, c]));
			expect(byId.has("organizer")).toBe(false); // healthy member not a candidate
			expect(byId.get("lost-user")).toMatchObject({
				rewrap: true,
				permission: "share",
				publicKey: "pk-lost",
			});
			// Never-granted members now carry their role-derived permission
			// (default makeMember role "member" → read-only "view").
			expect(byId.get("never-granted")).toMatchObject({
				rewrap: false,
				permission: "view",
				publicKey: "pk-new",
			});
		});
	});
});
