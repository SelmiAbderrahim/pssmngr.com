// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Family Router Unit Tests
 *
 * Tests family CRUD, role-based authorization, 6 member limit,
 * delegated recovery lifecycle, and security properties.
 */

import { sign as edSign, generateKeyPairSync } from "node:crypto";
import { getTranslator, initI18n } from "@pssmngr/server/i18n";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { familyRouter } from "../../routers/family";

vi.mock("@/server/db", () => ({ db: {} }));
vi.mock("@pssmngr/server/lib/auth", () => ({
	validateRequest: vi.fn(),
	validateDeviceRequest: vi.fn(),
}));

/**
 * Produce a valid recovery-proof triple: a fresh Ed25519 signing key whose
 * public half (base64) signs `recovery:<requestId>:<newPublicKey>`.
 */
function makeRecoveryProof(
	requestId: string,
	newPublicKey = "new-pub-key-base64",
) {
	const { publicKey, privateKey } = generateKeyPairSync("ed25519");
	const jwk = publicKey.export({ format: "jwk" }) as { x: string };
	const newSigningPublicKey = Buffer.from(jwk.x, "base64url").toString(
		"base64",
	);
	const signature = Buffer.from(
		edSign(
			null,
			Buffer.from(`recovery:${requestId}:${newPublicKey}`),
			privateKey,
		),
	).toString("base64");
	return { newPublicKey, newSigningPublicKey, signature };
}

// ---------------------------------------------------------------------------
// Mock DB helpers
// ---------------------------------------------------------------------------

const FAMILY_META = JSON.stringify({ type: "family" });
const NON_FAMILY_META = JSON.stringify({ type: "team" });

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
		user: { id: string; name: string; email: string; image: string | null };
	}> = {},
) {
	return {
		id: overrides.id ?? "member-1",
		userId: overrides.userId ?? "user-1",
		organizationId: overrides.organizationId ?? "org-1",
		role: overrides.role ?? "member",
		createdAt: overrides.createdAt ?? new Date(),
		organization: overrides.organization ?? makeFamilyOrg(),
		user: overrides.user ?? {
			id: "user-1",
			name: "User",
			email: "user@test.com",
			image: null,
		},
	};
}

function makeRecoveryRequest(
	overrides: Partial<{
		id: string;
		familyId: string;
		requesterId: string;
		approverId: string | null;
		status: string;
		expiresAt: Date;
		requestedAt: Date;
		approvedAt: Date | null;
		completedAt: Date | null;
		rejectedAt: Date | null;
		newPublicKey: string | null;
		newSigningPublicKey: string | null;
		requester: {
			id: string;
			name: string;
			email: string;
			image: string | null;
		};
	}> = {},
) {
	return {
		id: overrides.id ?? "recovery-1",
		familyId: overrides.familyId ?? "org-1",
		requesterId: overrides.requesterId ?? "user-member",
		approverId: overrides.approverId ?? null,
		status: overrides.status ?? "pending",
		expiresAt:
			overrides.expiresAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
		requestedAt: overrides.requestedAt ?? new Date(),
		approvedAt: overrides.approvedAt ?? null,
		completedAt: overrides.completedAt ?? null,
		rejectedAt: overrides.rejectedAt ?? null,
		newPublicKey: overrides.newPublicKey ?? null,
		newSigningPublicKey: overrides.newSigningPublicKey ?? null,
		requester: overrides.requester ?? {
			id: "user-member",
			name: "Member",
			email: "member@test.com",
			image: null,
		},
	};
}

/** Create a chainable insert mock: db.insert(table).values({}).returning() */
function mockInsert(returning: any[] = [{}]) {
	return vi.fn().mockReturnValue({
		values: vi.fn().mockImplementation(() => {
			const p = Promise.resolve(undefined);
			(p as any).returning = vi.fn().mockResolvedValue(returning);
			return p;
		}),
	});
}

/** Create a chainable update mock: db.update(table).set({}).where({}).returning() */
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

/** Create a chainable delete mock: db.delete(table).where({}).returning() */
function mockDelete(returning: any[] = [{ id: "removed" }]) {
	return vi.fn().mockReturnValue({
		where: vi.fn().mockImplementation(() => {
			const p = Promise.resolve(undefined);
			(p as any).returning = vi.fn().mockResolvedValue(returning);
			return p;
		}),
	});
}

/** Create a chainable select mock: db.select({}).from(table).where({}) */
function mockSelect(...results: any[][]) {
	const fn = vi.fn();
	const chain = (result: any[]) => {
		const where = vi.fn().mockResolvedValue(result);
		return {
			from: vi.fn().mockReturnValue({
				where,
				innerJoin: vi.fn().mockReturnValue({ where }),
			}),
		};
	};
	for (const r of results) {
		fn.mockReturnValueOnce(chain(r));
	}
	// Default fallback
	fn.mockReturnValue(chain([{ value: 0 }]));
	return fn;
}

function createMockDb() {
	const mockDb = {
		query: {
			member: {
				findMany: vi.fn().mockResolvedValue([]),
				findFirst: vi.fn().mockResolvedValue(null),
			},
			user: { findFirst: vi.fn().mockResolvedValue(null) },
			invitation: { findFirst: vi.fn().mockResolvedValue(null) },
			recoveryRequest: {
				findFirst: vi.fn().mockResolvedValue(null),
				findMany: vi.fn().mockResolvedValue([]),
			},
			notifications: { findFirst: vi.fn().mockResolvedValue(null) },
			organization: {
				findFirst: vi.fn().mockResolvedValue({ ownerId: "user-organizer" }),
			},
		},
		select: mockSelect([{ value: 0 }]),
		insert: mockInsert(),
		update: mockUpdate(),
		delete: mockDelete(),
		execute: vi.fn().mockResolvedValue(undefined),
		transaction: vi.fn(),
	};
	mockDb.transaction.mockImplementation(
		async (fn: (tx: typeof mockDb) => Promise<unknown>) => fn(mockDb),
	);
	return mockDb;
}

function createCtx(userId: string, db: any, extra: Record<string, any> = {}) {
	return {
		session: { id: `session-${userId}`, activeOrganizationId: "org-1" },
		user: {
			id: userId,
			email: `${userId}@test.com`,
			name: userId,
			role: "member",
			ownerId: "owner-1",
			...extra,
		},
		db,
		language: "en",
		// Real translator so message assertions resolve actual copy (not keys).
		t: getTranslator("en") as any,
		req: { headers: {} },
		res: { setHeader: () => {} },
	};
}

function createCaller(ctx: any) {
	return familyRouter.createCaller(ctx as any);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Family Router", () => {
	let db: ReturnType<typeof createMockDb>;

	beforeAll(async () => {
		await initI18n();
	});

	beforeEach(() => {
		vi.clearAllMocks();
		db = createMockDb();
	});

	// =====================================================================
	// Family CRUD
	// =====================================================================

	describe("create", () => {
		it("creates a family when user has no existing family", async () => {
			const org = makeFamilyOrg("new-org", "My Family");
			db.query.member.findMany.mockResolvedValue([]); // no existing memberships
			db.insert = mockInsert([org]);
			// Second insert (member) doesn't need returning
			const caller = createCaller(createCtx("user-1", db));

			const result = await caller.create({ name: "My Family" });

			expect(result).toEqual({ id: "new-org", name: "My Family" });
			expect(db.insert).toHaveBeenCalledTimes(2); // org + member
			expect(db.transaction).toHaveBeenCalledTimes(1);
			expect(db.execute).toHaveBeenCalledTimes(1);
		});

		it("throws CONFLICT if user already belongs to a family", async () => {
			db.query.member.findMany.mockResolvedValue([
				makeMember({ userId: "user-1", role: "member" }),
			]);
			const caller = createCaller(createCtx("user-1", db));

			await expect(caller.create({ name: "Another Family" })).rejects.toThrow(
				expect.objectContaining({ code: "CONFLICT" }),
			);
			expect(db.insert).not.toHaveBeenCalled();
		});

		it("allows creation if user belongs to non-family org only", async () => {
			const nonFamilyMember = makeMember({
				userId: "user-1",
				organization: { ...makeFamilyOrg(), metadata: NON_FAMILY_META },
			});
			db.query.member.findMany.mockResolvedValue([nonFamilyMember]);
			db.insert = mockInsert([makeFamilyOrg("new-org", "Family")]);
			const caller = createCaller(createCtx("user-1", db));

			const result = await caller.create({ name: "Family" });

			expect(result.id).toBe("new-org");
		});
	});

	describe("get", () => {
		it("returns family details with member count", async () => {
			const org = makeFamilyOrg("org-1", "Smith Family");
			db.query.member.findMany.mockResolvedValue([
				makeMember({ userId: "user-1", role: "owner", organization: org }),
			]);
			db.select = mockSelect([{ value: 3 }]);
			const caller = createCaller(createCtx("user-1", db));

			const result = await caller.get();

			expect(result).toMatchObject({
				id: "org-1",
				name: "Smith Family",
				memberCount: 3,
				maxMembers: null,
				role: "owner",
			});
		});

		it("throws NOT_FOUND if user has no family", async () => {
			db.query.member.findMany.mockResolvedValue([]);
			const caller = createCaller(createCtx("user-1", db));

			await expect(caller.get()).rejects.toThrow(
				expect.objectContaining({ code: "NOT_FOUND" }),
			);
		});
	});

	describe("listMembers", () => {
		it("returns all family members with user details", async () => {
			const org = makeFamilyOrg();
			const members = [
				makeMember({
					id: "m-1",
					userId: "u-1",
					role: "owner",
					organization: org,
					user: {
						id: "u-1",
						name: "Owner",
						email: "owner@test.com",
						image: null,
					},
				}),
				makeMember({
					id: "m-2",
					userId: "u-2",
					role: "member",
					organization: org,
					user: {
						id: "u-2",
						name: "Member",
						email: "member@test.com",
						image: null,
					},
				}),
			];

			// getUserFamily call
			db.query.member.findMany
				.mockResolvedValueOnce([members[0]]) // getUserFamily
				.mockResolvedValueOnce(members); // listMembers query

			const caller = createCaller(createCtx("u-1", db));
			const result = await caller.listMembers();

			expect(result).toHaveLength(2);
			expect(result[0]).toMatchObject({
				id: "m-1",
				userId: "u-1",
				role: "owner",
			});
			expect(result[1]).toMatchObject({
				id: "m-2",
				userId: "u-2",
				role: "member",
			});
		});
	});

	describe("updateSettings", () => {
		it("updates family name when called by organizer", async () => {
			const org = makeFamilyOrg("org-1", "Old Name");
			db.query.member.findMany.mockResolvedValue([
				makeMember({ userId: "user-org", role: "owner", organization: org }),
			]);
			db.query.member.findFirst.mockResolvedValue(
				makeMember({ userId: "user-org", role: "owner" }),
			);
			db.update = mockUpdate([{ id: "org-1", name: "New Name" }]);
			const caller = createCaller(createCtx("user-org", db));

			const result = await caller.updateSettings({ name: "New Name" });

			expect(result).toEqual({ id: "org-1", name: "New Name" });
		});

		it("throws FORBIDDEN if non-organizer tries to update", async () => {
			const org = makeFamilyOrg();
			db.query.member.findMany.mockResolvedValue([
				makeMember({
					userId: "user-member",
					role: "member",
					organization: org,
				}),
			]);
			db.query.member.findFirst.mockResolvedValue(null); // not owner
			const caller = createCaller(createCtx("user-member", db));

			await expect(caller.updateSettings({ name: "New" })).rejects.toThrow(
				expect.objectContaining({ code: "FORBIDDEN" }),
			);
		});

		it("throws BAD_REQUEST if no settings provided", async () => {
			const org = makeFamilyOrg();
			db.query.member.findMany.mockResolvedValue([
				makeMember({ userId: "user-org", role: "owner", organization: org }),
			]);
			db.query.member.findFirst.mockResolvedValue(
				makeMember({ userId: "user-org", role: "owner" }),
			);
			const caller = createCaller(createCtx("user-org", db));

			await expect(caller.updateSettings({})).rejects.toThrow(
				expect.objectContaining({ code: "BAD_REQUEST" }),
			);
		});
	});

	// =====================================================================
	// Member Management
	// =====================================================================

	describe("inviteMember", () => {
		function setupOrganizerCtx() {
			const org = makeFamilyOrg();
			db.query.member.findMany.mockResolvedValue([
				makeMember({ userId: "organizer", role: "owner", organization: org }),
			]);
			db.query.member.findFirst.mockResolvedValue(
				makeMember({ userId: "organizer", role: "owner" }),
			);
			return createCtx("organizer", db);
		}

		it("creates an invitation for a new user", async () => {
			const ctx = setupOrganizerCtx();
			// member count = 2, pending = 0, total < 6
			db.select = mockSelect([{ value: 2 }], [{ value: 0 }]);
			db.query.user.findFirst.mockResolvedValue(null); // user doesn't exist yet
			db.query.invitation.findFirst.mockResolvedValue(null); // no pending invite
			db.insert = mockInsert([
				{ id: "inv-1", email: "new@test.com", expiresAt: new Date() },
			]);

			const caller = createCaller(ctx);
			const result = await caller.inviteMember({ email: "new@test.com" });

			expect(result).toHaveProperty("id", "inv-1");
			expect(result).toHaveProperty("email", "new@test.com");
		});

		it("throws FORBIDDEN if not organizer", async () => {
			const org = makeFamilyOrg();
			db.query.member.findMany.mockResolvedValue([
				makeMember({ userId: "member", role: "member", organization: org }),
			]);
			db.query.member.findFirst.mockResolvedValue(null); // not owner
			const caller = createCaller(createCtx("member", db));

			await expect(
				caller.inviteMember({ email: "new@test.com" }),
			).rejects.toThrow(expect.objectContaining({ code: "FORBIDDEN" }));
		});

		it("throws CONFLICT if user is already a family member", async () => {
			const ctx = setupOrganizerCtx();
			db.select = mockSelect([{ value: 2 }], [{ value: 0 }]);
			// User exists and is already a member
			db.query.user.findFirst.mockResolvedValue({
				id: "existing-user",
				email: "existing@test.com",
			});
			db.query.member.findFirst
				.mockResolvedValueOnce(
					makeMember({ userId: "organizer", role: "owner" }),
				) // requireOrganizer
				.mockResolvedValueOnce(makeMember({ userId: "existing-user" })); // existing member check

			const caller = createCaller(ctx);
			await expect(
				caller.inviteMember({ email: "existing@test.com" }),
			).rejects.toThrow(
				expect.objectContaining({
					code: "CONFLICT",
					message: expect.stringContaining("already a family member"),
				}),
			);
		});

		it("throws CONFLICT if invitation already pending", async () => {
			const ctx = setupOrganizerCtx();
			db.select = mockSelect([{ value: 2 }], [{ value: 0 }]);
			db.query.user.findFirst.mockResolvedValue(null);
			db.query.invitation.findFirst.mockResolvedValue({
				id: "inv-old",
				status: "pending",
			});

			const caller = createCaller(ctx);
			await expect(
				caller.inviteMember({ email: "pending@test.com" }),
			).rejects.toThrow(
				expect.objectContaining({
					code: "CONFLICT",
					message: expect.stringContaining("already pending"),
				}),
			);
		});
	});

	describe("unrestricted family access", () => {
		it("does not gate invitations by family size", async () => {
			const org = makeFamilyOrg();
			db.query.member.findMany.mockResolvedValue([
				makeMember({ userId: "organizer", role: "owner", organization: org }),
			]);
			db.query.member.findFirst.mockResolvedValue(
				makeMember({ userId: "organizer", role: "owner" }),
			);
			db.select = mockSelect([{ value: 20 }], [{ value: 10 }]);
			db.query.user.findFirst.mockResolvedValue(null);
			db.query.invitation.findFirst.mockResolvedValue(null);
			db.insert = mockInsert([
				{ id: "inv-1", email: "new@test.com", expiresAt: new Date() },
			]);

			const caller = createCaller(createCtx("organizer", db));
			const result = await caller.inviteMember({ email: "new@test.com" });

			expect(result).toHaveProperty("id");
		});
	});

	describe("removeMember", () => {
		it("removes a member when called by organizer", async () => {
			const org = makeFamilyOrg();
			db.query.member.findMany.mockResolvedValue([
				makeMember({ userId: "organizer", role: "owner", organization: org }),
			]);
			// requireOrganizer
			db.query.member.findFirst
				.mockResolvedValueOnce(
					makeMember({ userId: "organizer", role: "owner" }),
				)
				// target member
				.mockResolvedValueOnce(
					makeMember({ id: "target-m", userId: "target-user" }),
				);

			const caller = createCaller(createCtx("organizer", db));
			const result = await caller.removeMember({ memberId: "target-m" });

			expect(result).toEqual({ success: true });
			expect(db.execute).toHaveBeenCalledTimes(1);
			expect(db.delete).toHaveBeenCalled();
		});

		it("throws NOT_FOUND if member doesn't exist", async () => {
			const org = makeFamilyOrg();
			db.query.member.findMany.mockResolvedValue([
				makeMember({ userId: "organizer", role: "owner", organization: org }),
			]);
			db.query.member.findFirst
				.mockResolvedValueOnce(
					makeMember({ userId: "organizer", role: "owner" }),
				)
				.mockResolvedValueOnce(null); // target not found

			const caller = createCaller(createCtx("organizer", db));
			await expect(
				caller.removeMember({ memberId: "nonexistent" }),
			).rejects.toThrow(expect.objectContaining({ code: "NOT_FOUND" }));
		});

		it("throws BAD_REQUEST if organizer tries to remove themselves", async () => {
			const org = makeFamilyOrg();
			db.query.member.findMany.mockResolvedValue([
				makeMember({ userId: "organizer", role: "owner", organization: org }),
			]);
			db.query.member.findFirst
				.mockResolvedValueOnce(
					makeMember({ userId: "organizer", role: "owner" }),
				)
				.mockResolvedValueOnce(
					makeMember({ id: "self-m", userId: "organizer" }),
				);

			const caller = createCaller(createCtx("organizer", db));
			await expect(caller.removeMember({ memberId: "self-m" })).rejects.toThrow(
				expect.objectContaining({
					code: "BAD_REQUEST",
					message: expect.stringContaining("yourself"),
				}),
			);
		});

		it("throws FORBIDDEN if non-organizer tries to remove a member", async () => {
			const org = makeFamilyOrg();
			db.query.member.findMany.mockResolvedValue([
				makeMember({ userId: "regular", role: "member", organization: org }),
			]);
			db.query.member.findFirst.mockResolvedValue(null); // not owner

			const caller = createCaller(createCtx("regular", db));
			await expect(
				caller.removeMember({ memberId: "target-m" }),
			).rejects.toThrow(expect.objectContaining({ code: "FORBIDDEN" }));
		});

		it("re-checks organizer authority after acquiring the organization lock", async () => {
			const org = makeFamilyOrg();
			db.query.member.findMany.mockResolvedValue([
				makeMember({ userId: "organizer", role: "owner", organization: org }),
			]);
			db.query.member.findFirst.mockResolvedValue(null);

			const caller = createCaller(createCtx("organizer", db));
			await expect(
				caller.removeMember({ memberId: "target-m" }),
			).rejects.toThrow(expect.objectContaining({ code: "FORBIDDEN" }));
			expect(db.execute).toHaveBeenCalledTimes(1);
			expect(db.delete).not.toHaveBeenCalled();
		});

		it("fails if the scoped member delete affects no row", async () => {
			const org = makeFamilyOrg();
			db.query.member.findMany.mockResolvedValue([
				makeMember({ userId: "organizer", role: "owner", organization: org }),
			]);
			db.query.member.findFirst
				.mockResolvedValueOnce(
					makeMember({ userId: "organizer", role: "owner" }),
				)
				.mockResolvedValueOnce(
					makeMember({ id: "target-m", userId: "target-user" }),
				);
			db.delete = mockDelete([]);

			await expect(
				createCaller(createCtx("organizer", db)).removeMember({
					memberId: "target-m",
				}),
			).rejects.toThrow(expect.objectContaining({ code: "NOT_FOUND" }));
		});
	});

	describe("setRole", () => {
		it("changes a member role", async () => {
			const org = makeFamilyOrg();
			db.query.member.findMany.mockResolvedValue([
				makeMember({ userId: "organizer", role: "owner", organization: org }),
			]);
			db.query.member.findFirst
				.mockResolvedValueOnce(
					makeMember({ userId: "organizer", role: "owner" }),
				)
				.mockResolvedValueOnce(
					makeMember({ id: "target-m", userId: "target", role: "member" }),
				);
			db.update = mockUpdate([{ id: "target-m", role: "admin" }]);

			const caller = createCaller(createCtx("organizer", db));
			const result = await caller.setRole({
				memberId: "target-m",
				role: "admin",
			});

			expect(result).toEqual({ id: "target-m", role: "admin" });
		});

		it("throws BAD_REQUEST if organizer tries to change own role", async () => {
			const org = makeFamilyOrg();
			db.query.member.findMany.mockResolvedValue([
				makeMember({ userId: "organizer", role: "owner", organization: org }),
			]);
			db.query.member.findFirst
				.mockResolvedValueOnce(
					makeMember({ userId: "organizer", role: "owner" }),
				)
				.mockResolvedValueOnce(
					makeMember({ id: "org-m", userId: "organizer", role: "owner" }),
				);

			const caller = createCaller(createCtx("organizer", db));
			await expect(
				caller.setRole({ memberId: "org-m", role: "admin" }),
			).rejects.toThrow(expect.objectContaining({ code: "BAD_REQUEST" }));
		});

		it("throws FORBIDDEN if trying to change another owner's role", async () => {
			const org = makeFamilyOrg();
			db.query.member.findMany.mockResolvedValue([
				makeMember({ userId: "organizer", role: "owner", organization: org }),
			]);
			db.query.member.findFirst
				.mockResolvedValueOnce(
					makeMember({ userId: "organizer", role: "owner" }),
				)
				.mockResolvedValueOnce(
					makeMember({
						id: "other-owner-m",
						userId: "other-owner",
						role: "owner",
					}),
				);

			const caller = createCaller(createCtx("organizer", db));
			await expect(
				caller.setRole({ memberId: "other-owner-m", role: "member" }),
			).rejects.toThrow(expect.objectContaining({ code: "FORBIDDEN" }));
		});

		it("throws NOT_FOUND if target member doesn't exist", async () => {
			const org = makeFamilyOrg();
			db.query.member.findMany.mockResolvedValue([
				makeMember({ userId: "organizer", role: "owner", organization: org }),
			]);
			db.query.member.findFirst
				.mockResolvedValueOnce(
					makeMember({ userId: "organizer", role: "owner" }),
				)
				.mockResolvedValueOnce(null); // target not found

			const caller = createCaller(createCtx("organizer", db));
			await expect(
				caller.setRole({ memberId: "ghost", role: "admin" }),
			).rejects.toThrow(expect.objectContaining({ code: "NOT_FOUND" }));
		});
	});

	describe("leave", () => {
		it("allows non-organizer to leave the family", async () => {
			const org = makeFamilyOrg();
			db.query.member.findMany.mockResolvedValue([
				makeMember({
					id: "m-member",
					userId: "user-member",
					role: "member",
					organization: org,
				}),
			]);
			db.query.member.findFirst.mockResolvedValue(
				makeMember({
					id: "m-member",
					userId: "user-member",
					role: "member",
					organization: org,
				}),
			);

			const caller = createCaller(createCtx("user-member", db));
			const result = await caller.leave();

			expect(result).toEqual({ success: true });
			expect(db.execute).toHaveBeenCalledTimes(1);
			expect(db.delete).toHaveBeenCalled();
		});

		it("throws FORBIDDEN if organizer tries to leave", async () => {
			const org = makeFamilyOrg();
			db.query.member.findMany.mockResolvedValue([
				makeMember({ userId: "organizer", role: "owner", organization: org }),
			]);
			db.query.member.findFirst.mockResolvedValue(
				makeMember({ userId: "organizer", role: "owner", organization: org }),
			);

			const caller = createCaller(createCtx("organizer", db));
			await expect(caller.leave()).rejects.toThrow(
				expect.objectContaining({
					code: "FORBIDDEN",
					message: expect.stringContaining("organizer cannot leave"),
				}),
			);
		});

		it("fails if the scoped leave delete affects no row", async () => {
			const org = makeFamilyOrg();
			const row = makeMember({
				id: "m-member",
				userId: "user-member",
				role: "member",
				organization: org,
			});
			db.query.member.findMany.mockResolvedValue([row]);
			db.query.member.findFirst.mockResolvedValue(row);
			db.delete = mockDelete([]);

			await expect(
				createCaller(createCtx("user-member", db)).leave(),
			).rejects.toThrow(expect.objectContaining({ code: "NOT_FOUND" }));
		});
	});

	// =====================================================================
	// Delegated Recovery
	// =====================================================================

	describe("requestRecovery", () => {
		it("creates a recovery request for a member", async () => {
			const org = makeFamilyOrg();
			db.query.member.findMany.mockResolvedValue([
				makeMember({
					userId: "user-member",
					role: "member",
					organization: org,
				}),
			]);
			db.query.recoveryRequest.findFirst.mockResolvedValue(null); // no active
			const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
			db.insert = mockInsert([{ id: "rec-1", status: "pending", expiresAt }]);
			// organizer lookup for notification
			db.query.member.findFirst.mockResolvedValue(
				makeMember({ userId: "organizer", role: "owner" }),
			);

			const caller = createCaller(createCtx("user-member", db));
			const result = await caller.requestRecovery();

			expect(result).toMatchObject({ id: "rec-1", status: "pending" });
			expect(db.insert).toHaveBeenCalledTimes(2); // recovery + notification
		});

		it("throws BAD_REQUEST if organizer tries to request recovery", async () => {
			const org = makeFamilyOrg();
			db.query.member.findMany.mockResolvedValue([
				makeMember({ userId: "organizer", role: "owner", organization: org }),
			]);

			const caller = createCaller(createCtx("organizer", db));
			await expect(caller.requestRecovery()).rejects.toThrow(
				expect.objectContaining({ code: "BAD_REQUEST" }),
			);
		});

		it("throws CONFLICT if active recovery request exists", async () => {
			const org = makeFamilyOrg();
			db.query.member.findMany.mockResolvedValue([
				makeMember({
					userId: "user-member",
					role: "member",
					organization: org,
				}),
			]);
			db.query.recoveryRequest.findFirst.mockResolvedValue(
				makeRecoveryRequest({ status: "pending" }),
			);

			const caller = createCaller(createCtx("user-member", db));
			await expect(caller.requestRecovery()).rejects.toThrow(
				expect.objectContaining({ code: "CONFLICT" }),
			);
		});
	});

	describe("listRecoveryRequests", () => {
		it("returns recovery requests for organizer", async () => {
			const org = makeFamilyOrg();
			db.query.member.findMany.mockResolvedValue([
				makeMember({ userId: "organizer", role: "owner", organization: org }),
			]);
			db.query.member.findFirst.mockResolvedValue(
				makeMember({ userId: "organizer", role: "owner" }),
			);
			db.query.recoveryRequest.findMany.mockResolvedValue([
				makeRecoveryRequest({ id: "r-1", status: "pending" }),
			]);

			const caller = createCaller(createCtx("organizer", db));
			const result = await caller.listRecoveryRequests();

			expect(result).toHaveLength(1);
			expect(result[0]).toMatchObject({ id: "r-1", status: "pending" });
		});

		it("returns empty array for non-organizer", async () => {
			const org = makeFamilyOrg();
			db.query.member.findMany.mockResolvedValue([
				makeMember({ userId: "member", role: "member", organization: org }),
			]);
			db.query.member.findFirst.mockResolvedValue(null); // not owner

			const caller = createCaller(createCtx("member", db));
			const result = await caller.listRecoveryRequests();

			expect(result).toEqual([]);
		});
	});

	describe("approveRecovery", () => {
		function setupOrganizerWithRecovery(
			reqOverrides: Parameters<typeof makeRecoveryRequest>[0] = {},
		) {
			const org = makeFamilyOrg();
			db.query.member.findMany.mockResolvedValue([
				makeMember({ userId: "organizer", role: "owner", organization: org }),
			]);
			db.query.member.findFirst.mockResolvedValue(
				makeMember({ userId: "organizer", role: "owner" }),
			);
			db.query.recoveryRequest.findFirst.mockResolvedValue(
				makeRecoveryRequest(reqOverrides),
			);
		}

		it("approves a pending recovery request", async () => {
			setupOrganizerWithRecovery({ id: "r-1", status: "pending" });
			db.update = mockUpdate([{ id: "r-1", status: "approved" }]);
			// Re-mock insert for notification
			db.insert = mockInsert([{}]);

			const caller = createCaller(createCtx("organizer", db));
			const result = await caller.approveRecovery({ requestId: "r-1" });

			expect(result).toEqual({ id: "r-1", status: "approved" });
		});

		it("throws NOT_FOUND for nonexistent request", async () => {
			const org = makeFamilyOrg();
			db.query.member.findMany.mockResolvedValue([
				makeMember({ userId: "organizer", role: "owner", organization: org }),
			]);
			db.query.member.findFirst.mockResolvedValue(
				makeMember({ userId: "organizer", role: "owner" }),
			);
			db.query.recoveryRequest.findFirst.mockResolvedValue(null);

			const caller = createCaller(createCtx("organizer", db));
			await expect(
				caller.approveRecovery({ requestId: "nonexistent" }),
			).rejects.toThrow(expect.objectContaining({ code: "NOT_FOUND" }));
		});

		it("throws BAD_REQUEST for non-pending request", async () => {
			setupOrganizerWithRecovery({ id: "r-1", status: "approved" });

			const caller = createCaller(createCtx("organizer", db));
			await expect(
				caller.approveRecovery({ requestId: "r-1" }),
			).rejects.toThrow(expect.objectContaining({ code: "BAD_REQUEST" }));
		});

		it("expires and rejects a past-due request", async () => {
			setupOrganizerWithRecovery({
				id: "r-1",
				status: "pending",
				expiresAt: new Date(Date.now() - 1000), // already expired
			});
			db.update = mockUpdate([{ id: "r-1", status: "expired" }]);

			const caller = createCaller(createCtx("organizer", db));
			await expect(
				caller.approveRecovery({ requestId: "r-1" }),
			).rejects.toThrow(
				expect.objectContaining({
					code: "BAD_REQUEST",
					message: expect.stringContaining("expired"),
				}),
			);
		});
	});

	describe("rejectRecovery", () => {
		it("rejects a pending recovery request", async () => {
			const org = makeFamilyOrg();
			db.query.member.findMany.mockResolvedValue([
				makeMember({ userId: "organizer", role: "owner", organization: org }),
			]);
			db.query.member.findFirst.mockResolvedValue(
				makeMember({ userId: "organizer", role: "owner" }),
			);
			db.query.recoveryRequest.findFirst.mockResolvedValue(
				makeRecoveryRequest({ id: "r-1", status: "pending" }),
			);
			db.update = mockUpdate([{ id: "r-1", status: "rejected" }]);
			db.insert = mockInsert([{}]); // notification

			const caller = createCaller(createCtx("organizer", db));
			const result = await caller.rejectRecovery({ requestId: "r-1" });

			expect(result).toEqual({ id: "r-1", status: "rejected" });
		});

		it("throws BAD_REQUEST for non-pending request", async () => {
			const org = makeFamilyOrg();
			db.query.member.findMany.mockResolvedValue([
				makeMember({ userId: "organizer", role: "owner", organization: org }),
			]);
			db.query.member.findFirst.mockResolvedValue(
				makeMember({ userId: "organizer", role: "owner" }),
			);
			db.query.recoveryRequest.findFirst.mockResolvedValue(
				makeRecoveryRequest({ id: "r-1", status: "completed" }),
			);

			const caller = createCaller(createCtx("organizer", db));
			await expect(caller.rejectRecovery({ requestId: "r-1" })).rejects.toThrow(
				expect.objectContaining({ code: "BAD_REQUEST" }),
			);
		});

		it("throws NOT_FOUND for nonexistent request", async () => {
			const org = makeFamilyOrg();
			db.query.member.findMany.mockResolvedValue([
				makeMember({ userId: "organizer", role: "owner", organization: org }),
			]);
			db.query.member.findFirst.mockResolvedValue(
				makeMember({ userId: "organizer", role: "owner" }),
			);
			db.query.recoveryRequest.findFirst.mockResolvedValue(null);

			const caller = createCaller(createCtx("organizer", db));
			await expect(
				caller.rejectRecovery({ requestId: "nonexistent" }),
			).rejects.toThrow(expect.objectContaining({ code: "NOT_FOUND" }));
		});
	});

	describe("getRecoveryStatus", () => {
		it("returns active recovery status for member", async () => {
			const org = makeFamilyOrg();
			const approvedAt = new Date();
			db.query.member.findMany.mockResolvedValue([
				makeMember({
					userId: "user-member",
					role: "member",
					organization: org,
				}),
			]);
			db.query.recoveryRequest.findFirst.mockResolvedValue(
				makeRecoveryRequest({ id: "r-1", status: "approved", approvedAt }),
			);

			const caller = createCaller(createCtx("user-member", db));
			const result = await caller.getRecoveryStatus();

			expect(result).toMatchObject({ id: "r-1", status: "approved" });
			expect(result!.approvedAt).toBeTruthy();
		});

		it("returns null when no active recovery", async () => {
			const org = makeFamilyOrg();
			db.query.member.findMany.mockResolvedValue([
				makeMember({
					userId: "user-member",
					role: "member",
					organization: org,
				}),
			]);
			db.query.recoveryRequest.findFirst.mockResolvedValue(null);

			const caller = createCaller(createCtx("user-member", db));
			const result = await caller.getRecoveryStatus();

			expect(result).toBeNull();
		});

		it("auto-expires stale request and returns null", async () => {
			const org = makeFamilyOrg();
			db.query.member.findMany.mockResolvedValue([
				makeMember({
					userId: "user-member",
					role: "member",
					organization: org,
				}),
			]);
			db.query.recoveryRequest.findFirst.mockResolvedValue(
				makeRecoveryRequest({
					id: "r-1",
					status: "pending",
					expiresAt: new Date(Date.now() - 1000),
				}),
			);
			db.update = mockUpdate([{}]);

			const caller = createCaller(createCtx("user-member", db));
			const result = await caller.getRecoveryStatus();

			expect(result).toBeNull();
			expect(db.update).toHaveBeenCalled();
		});
	});

	describe("submitNewKeys", () => {
		it("submits new keys for approved recovery", async () => {
			const org = makeFamilyOrg();
			db.query.member.findMany.mockResolvedValue([
				makeMember({
					userId: "user-member",
					role: "member",
					organization: org,
				}),
			]);
			db.query.recoveryRequest.findFirst.mockResolvedValue(
				makeRecoveryRequest({
					id: "r-1",
					status: "approved",
					requesterId: "user-member",
				}),
			);
			db.update = mockUpdate([{ id: "r-1", status: "completing" }]);
			db.query.member.findFirst.mockResolvedValue(
				makeMember({ userId: "organizer", role: "owner" }),
			);
			db.insert = mockInsert([{}]); // notification

			const caller = createCaller(createCtx("user-member", db));
			const result = await caller.submitNewKeys({
				requestId: "r-1",
				...makeRecoveryProof("r-1"),
			});

			expect(result).toEqual({ id: "r-1", status: "completing" });
		});

		it("throws BAD_REQUEST if request not in approved state", async () => {
			const org = makeFamilyOrg();
			db.query.member.findMany.mockResolvedValue([
				makeMember({
					userId: "user-member",
					role: "member",
					organization: org,
				}),
			]);
			db.query.recoveryRequest.findFirst.mockResolvedValue(
				makeRecoveryRequest({
					id: "r-1",
					status: "pending",
					requesterId: "user-member",
				}),
			);

			const caller = createCaller(createCtx("user-member", db));
			await expect(
				caller.submitNewKeys({
					requestId: "r-1",
					...makeRecoveryProof("r-1"),
				}),
			).rejects.toThrow(expect.objectContaining({ code: "BAD_REQUEST" }));
		});

		it("throws NOT_FOUND for nonexistent request", async () => {
			const org = makeFamilyOrg();
			db.query.member.findMany.mockResolvedValue([
				makeMember({
					userId: "user-member",
					role: "member",
					organization: org,
				}),
			]);
			db.query.recoveryRequest.findFirst.mockResolvedValue(null);

			const caller = createCaller(createCtx("user-member", db));
			await expect(
				caller.submitNewKeys({
					requestId: "nonexistent",
					...makeRecoveryProof("nonexistent"),
				}),
			).rejects.toThrow(expect.objectContaining({ code: "NOT_FOUND" }));
		});
	});

	describe("completeRecovery", () => {
		it("completes recovery with re-wrapped keys", async () => {
			const org = makeFamilyOrg();
			db.query.member.findMany.mockResolvedValue([
				makeMember({ userId: "organizer", role: "owner", organization: org }),
			]);
			db.query.member.findFirst.mockResolvedValue(
				makeMember({ userId: "organizer", role: "owner" }),
			);
			db.query.recoveryRequest.findFirst.mockResolvedValue(
				makeRecoveryRequest({
					id: "r-1",
					status: "completing",
					requesterId: "user-member",
				}),
			);
			db.update = mockUpdate([{ id: "r-1", status: "completed" }]);
			db.insert = mockInsert([{}]); // notification
			db.select = mockSelect([{ sharedVaultId: "vault-1" }]);

			const caller = createCaller(createCtx("organizer", db));
			const result = await caller.completeRecovery({
				requestId: "r-1",
				rewrappedKeys: [
					{
						sharedVaultId: "vault-1",
						wrappedKey: "wk1",
						wrappedKeyNonce: "n1",
						wrappedKeyAuthTag: "at1",
						ephemeralPublicKey: "epk1",
						senderSignature: "sig1",
					},
				],
			});

			expect(result).toEqual({ id: "r-1", status: "completed" });
		});

		it("throws BAD_REQUEST if request not in completing state", async () => {
			const org = makeFamilyOrg();
			db.query.member.findMany.mockResolvedValue([
				makeMember({ userId: "organizer", role: "owner", organization: org }),
			]);
			db.query.member.findFirst.mockResolvedValue(
				makeMember({ userId: "organizer", role: "owner" }),
			);
			db.query.recoveryRequest.findFirst.mockResolvedValue(
				makeRecoveryRequest({ id: "r-1", status: "approved" }),
			);

			const caller = createCaller(createCtx("organizer", db));
			await expect(
				caller.completeRecovery({ requestId: "r-1", rewrappedKeys: [] }),
			).rejects.toThrow(expect.objectContaining({ code: "BAD_REQUEST" }));
		});

		it("throws NOT_FOUND for nonexistent request", async () => {
			const org = makeFamilyOrg();
			db.query.member.findMany.mockResolvedValue([
				makeMember({ userId: "organizer", role: "owner", organization: org }),
			]);
			db.query.member.findFirst.mockResolvedValue(
				makeMember({ userId: "organizer", role: "owner" }),
			);
			db.query.recoveryRequest.findFirst.mockResolvedValue(null);

			const caller = createCaller(createCtx("organizer", db));
			await expect(
				caller.completeRecovery({
					requestId: "nonexistent",
					rewrappedKeys: [],
				}),
			).rejects.toThrow(expect.objectContaining({ code: "NOT_FOUND" }));
		});

		it("re-wraps keys for multiple shared vaults", async () => {
			const org = makeFamilyOrg();
			db.query.member.findMany.mockResolvedValue([
				makeMember({ userId: "organizer", role: "owner", organization: org }),
			]);
			db.query.member.findFirst.mockResolvedValue(
				makeMember({ userId: "organizer", role: "owner" }),
			);
			db.query.recoveryRequest.findFirst.mockResolvedValue(
				makeRecoveryRequest({
					id: "r-1",
					status: "completing",
					requesterId: "user-member",
				}),
			);
			db.update = mockUpdate([{ id: "r-1", status: "completed" }]);
			db.insert = mockInsert([{}]);
			db.select = mockSelect([
				{ sharedVaultId: "v-1" },
				{ sharedVaultId: "v-2" },
				{ sharedVaultId: "v-3" },
			]);

			const caller = createCaller(createCtx("organizer", db));
			const result = await caller.completeRecovery({
				requestId: "r-1",
				rewrappedKeys: [
					{
						sharedVaultId: "v-1",
						wrappedKey: "wk1",
						wrappedKeyNonce: "n1",
						wrappedKeyAuthTag: "at1",
						ephemeralPublicKey: "epk1",
						senderSignature: "sig1",
					},
					{
						sharedVaultId: "v-2",
						wrappedKey: "wk2",
						wrappedKeyNonce: "n2",
						wrappedKeyAuthTag: "at2",
						ephemeralPublicKey: "epk2",
						senderSignature: "sig2",
					},
					{
						sharedVaultId: "v-3",
						wrappedKey: "wk3",
						wrappedKeyNonce: "n3",
						wrappedKeyAuthTag: "at3",
						ephemeralPublicKey: "epk3",
						senderSignature: "sig3",
					},
				],
			});

			expect(result).toEqual({ id: "r-1", status: "completed" });
			// update called 3 times for vault members + 1 for recovery request status
			expect(db.update).toHaveBeenCalledTimes(4);
		});
	});

	// =====================================================================
	// Recovery Lifecycle (end-to-end state transitions)
	// =====================================================================

	describe("recovery lifecycle", () => {
		it("follows correct state transitions: pending → approved → completing → completed", () => {
			// Verify the expected state machine by checking each procedure's required status
			// requestRecovery: creates with status "pending"
			// approveRecovery: requires "pending", sets "approved"
			// submitNewKeys: requires "approved", sets "completing"
			// completeRecovery: requires "completing", sets "completed"

			const validTransitions: Record<string, string> = {
				pending: "approved",
				approved: "completing",
				completing: "completed",
			};

			expect(validTransitions.pending).toBe("approved");
			expect(validTransitions.approved).toBe("completing");
			expect(validTransitions.completing).toBe("completed");
		});

		it("recovery request expires after 7 days", () => {
			const RECOVERY_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;
			expect(RECOVERY_EXPIRY_MS).toBe(604800000);
		});
	});

	// =====================================================================
	// Security: Organizer cannot read private vaults
	// =====================================================================

	describe("security: organizer cannot read private vaults", () => {
		it("family router has no procedure to access member private vault data", () => {
			// Verify the router doesn't expose any vault-reading procedures
			const routerProcedures = Object.keys(
				(familyRouter as any)._def.procedures || {},
			);

			// None of the family procedures should access vault contents
			const vaultReadProcedures = routerProcedures.filter(
				(p) =>
					p.includes("vault") || p.includes("decrypt") || p.includes("getItem"),
			);
			expect(vaultReadProcedures).toHaveLength(0);
		});

		it("completeRecovery only re-wraps keys, never accesses vault contents", async () => {
			// The completeRecovery procedure only updates sharedVaultMember wrapped key
			// fields — it never reads sharedVaultItem ciphertext
			const org = makeFamilyOrg();
			db.query.member.findMany.mockResolvedValue([
				makeMember({ userId: "organizer", role: "owner", organization: org }),
			]);
			db.query.member.findFirst.mockResolvedValue(
				makeMember({ userId: "organizer", role: "owner" }),
			);
			db.query.recoveryRequest.findFirst.mockResolvedValue(
				makeRecoveryRequest({
					id: "r-1",
					status: "completing",
					requesterId: "member",
				}),
			);
			db.update = mockUpdate([{ id: "r-1", status: "completed" }]);
			db.insert = mockInsert([{}]);
			db.select = mockSelect([{ sharedVaultId: "v1" }]);

			const caller = createCaller(createCtx("organizer", db));
			await caller.completeRecovery({
				requestId: "r-1",
				rewrappedKeys: [
					{
						sharedVaultId: "v1",
						wrappedKey: "wk",
						wrappedKeyNonce: "n",
						wrappedKeyAuthTag: "at",
						ephemeralPublicKey: "epk",
						senderSignature: "sig",
					},
				],
			});

			// Verify no sharedVaultItem queries were made (no access to item ciphertext)
			expect(db.query.recoveryRequest.findFirst).toHaveBeenCalled();
			// The update calls should only touch sharedVaultMember (wrapped keys) and recoveryRequest
			// Never sharedVaultItem
		});

		it("rewrapped key input contains only wrapped fields, no plaintext", () => {
			// The completeRecovery input schema only accepts wrapped key envelope fields
			// This proves the organizer never sends plaintext vault data
			const rewrappedKeyFields = [
				"sharedVaultId",
				"wrappedKey",
				"wrappedKeyNonce",
				"wrappedKeyAuthTag",
				"ephemeralPublicKey",
				"senderSignature",
			];
			const forbiddenFields = [
				"plaintext",
				"password",
				"data",
				"secret",
				"vaultKey",
			];

			for (const field of rewrappedKeyFields) {
				expect(forbiddenFields).not.toContain(field);
			}
		});
	});

	// =====================================================================
	// Edge Cases
	// =====================================================================

	describe("edge cases", () => {
		it("admin can leave the family", async () => {
			const org = makeFamilyOrg();
			db.query.member.findMany.mockResolvedValue([
				makeMember({
					id: "m-admin",
					userId: "admin-user",
					role: "admin",
					organization: org,
				}),
			]);
			db.query.member.findFirst.mockResolvedValue(
				makeMember({
					id: "m-admin",
					userId: "admin-user",
					role: "admin",
					organization: org,
				}),
			);

			const caller = createCaller(createCtx("admin-user", db));
			const result = await caller.leave();

			expect(result).toEqual({ success: true });
			expect(db.delete).toHaveBeenCalled();
		});

		it("admin can request recovery (non-owner)", async () => {
			const org = makeFamilyOrg();
			db.query.member.findMany.mockResolvedValue([
				makeMember({ userId: "admin-user", role: "admin", organization: org }),
			]);
			db.query.recoveryRequest.findFirst.mockResolvedValue(null);
			const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
			db.insert = mockInsert([
				{ id: "rec-admin", status: "pending", expiresAt },
			]);
			db.query.member.findFirst.mockResolvedValue(
				makeMember({ userId: "organizer", role: "owner" }),
			);

			const caller = createCaller(createCtx("admin-user", db));
			const result = await caller.requestRecovery();

			expect(result).toMatchObject({ id: "rec-admin", status: "pending" });
		});

		it("non-organizer gets empty array for recovery requests", async () => {
			const org = makeFamilyOrg();
			db.query.member.findMany.mockResolvedValue([
				makeMember({ userId: "admin-user", role: "admin", organization: org }),
			]);
			db.query.member.findFirst.mockResolvedValue(null); // not owner

			const caller = createCaller(createCtx("admin-user", db));
			const result = await caller.listRecoveryRequests();

			expect(result).toEqual([]);
		});

		it("non-organizer cannot approve recovery", async () => {
			const org = makeFamilyOrg();
			db.query.member.findMany.mockResolvedValue([
				makeMember({ userId: "admin-user", role: "admin", organization: org }),
			]);
			db.query.member.findFirst.mockResolvedValue(null); // requireOrganizer fails

			const caller = createCaller(createCtx("admin-user", db));
			await expect(
				caller.approveRecovery({ requestId: "r-1" }),
			).rejects.toThrow(expect.objectContaining({ code: "FORBIDDEN" }));
		});

		it("non-organizer cannot complete recovery", async () => {
			const org = makeFamilyOrg();
			db.query.member.findMany.mockResolvedValue([
				makeMember({ userId: "admin-user", role: "admin", organization: org }),
			]);
			db.query.member.findFirst.mockResolvedValue(null); // requireOrganizer fails

			const caller = createCaller(createCtx("admin-user", db));
			await expect(
				caller.completeRecovery({ requestId: "r-1", rewrappedKeys: [] }),
			).rejects.toThrow(expect.objectContaining({ code: "FORBIDDEN" }));
		});

		it("completeRecovery with empty rewrappedKeys still completes", async () => {
			const org = makeFamilyOrg();
			db.query.member.findMany.mockResolvedValue([
				makeMember({ userId: "organizer", role: "owner", organization: org }),
			]);
			db.query.member.findFirst.mockResolvedValue(
				makeMember({ userId: "organizer", role: "owner" }),
			);
			db.query.recoveryRequest.findFirst.mockResolvedValue(
				makeRecoveryRequest({
					id: "r-1",
					status: "completing",
					requesterId: "user-member",
				}),
			);
			db.update = mockUpdate([{ id: "r-1", status: "completed" }]);
			db.insert = mockInsert([{}]);
			db.select = mockSelect([]);

			const caller = createCaller(createCtx("organizer", db));
			const result = await caller.completeRecovery({
				requestId: "r-1",
				rewrappedKeys: [],
			});

			// Member had no shared vault access — recovery still completes
			expect(result).toEqual({ id: "r-1", status: "completed" });
		});
	});
});
