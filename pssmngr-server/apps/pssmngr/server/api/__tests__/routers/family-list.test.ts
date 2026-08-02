// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Family List Endpoint Tests — Empty Response Scenarios
 *
 * Verifies that family.listMembers and family.listRecoveryRequests return
 * HTTP 200 with empty arrays when:
 *  - The user has no family organization
 *  - The user is a member but not the organizer (recovery requests)
 *  - No recovery requests exist
 *
 * Also verifies the happy paths (members/requests returned when they exist).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { familyRouter } from "../../routers/family";

// ---------------------------------------------------------------------------
// Constants & data builders (same pattern as family.test.ts)
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
		status: string;
		requestedAt: Date;
		expiresAt: Date;
		approvedAt: Date | null;
		completedAt: Date | null;
		rejectedAt: Date | null;
		requester: {
			id: string;
			name: string;
			email: string;
			image: string | null;
		};
	}> = {},
) {
	return {
		id: overrides.id ?? "rec-1",
		familyId: overrides.familyId ?? "org-1",
		requesterId: overrides.requesterId ?? "user-member",
		status: overrides.status ?? "pending",
		requestedAt: overrides.requestedAt ?? new Date(),
		expiresAt:
			overrides.expiresAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
		approvedAt: overrides.approvedAt ?? null,
		completedAt: overrides.completedAt ?? null,
		rejectedAt: overrides.rejectedAt ?? null,
		requester: overrides.requester ?? {
			id: "user-member",
			name: "Member",
			email: "member@test.com",
			image: null,
		},
	};
}

// ---------------------------------------------------------------------------
// Mock DB helpers
// ---------------------------------------------------------------------------

function createMockDb() {
	return {
		query: {
			member: {
				findMany: vi.fn().mockResolvedValue([]),
				findFirst: vi.fn().mockResolvedValue(null),
			},
			recoveryRequest: {
				findMany: vi.fn().mockResolvedValue([]),
				findFirst: vi.fn().mockResolvedValue(null),
			},
			organization: {
				findFirst: vi.fn().mockResolvedValue(null),
			},
			invitation: {
				findFirst: vi.fn().mockResolvedValue(null),
			},
			user: {
				findFirst: vi.fn().mockResolvedValue(null),
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
		select: vi.fn().mockReturnValue({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockResolvedValue([{ value: 0 }]),
			}),
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
	return familyRouter.createCaller(ctx as any);
}

// ---------------------------------------------------------------------------
// Tests — family.listMembers
// ---------------------------------------------------------------------------

describe("family.listMembers — empty response scenarios", () => {
	let db: ReturnType<typeof createMockDb>;

	beforeEach(() => {
		vi.clearAllMocks();
		db = createMockDb();
	});

	it("returns empty array when user has no family", async () => {
		// tryGetUserFamily: findMany returns no memberships
		db.query.member.findMany.mockResolvedValue([]);
		const caller = createCaller(createCtx("user-no-family", db));

		const result = await caller.listMembers();

		expect(result).toEqual([]);
	});

	it("returns empty array when user belongs to non-family org only", async () => {
		// User has a membership but in a non-family organization
		db.query.member.findMany.mockResolvedValue([
			makeMember({
				userId: "user-team",
				organization: {
					id: "org-team",
					name: "Team Org",
					metadata: JSON.stringify({ type: "team" }),
					createdAt: new Date(),
					ownerId: "someone",
				},
			}),
		]);
		const caller = createCaller(createCtx("user-team", db));

		const result = await caller.listMembers();

		expect(result).toEqual([]);
	});

	it("returns members when user belongs to a family", async () => {
		const org = makeFamilyOrg();
		const ownerMember = makeMember({
			id: "m-1",
			userId: "user-owner",
			role: "owner",
			organization: org,
			user: {
				id: "user-owner",
				name: "Owner",
				email: "owner@test.com",
				image: null,
			},
		});
		const regularMember = makeMember({
			id: "m-2",
			userId: "user-member",
			role: "member",
			organization: org,
			user: {
				id: "user-member",
				name: "Member",
				email: "member@test.com",
				image: null,
			},
		});

		db.query.member.findMany
			.mockResolvedValueOnce([ownerMember]) // tryGetUserFamily
			.mockResolvedValueOnce([ownerMember, regularMember]); // listMembers query

		const caller = createCaller(createCtx("user-owner", db));
		const result = await caller.listMembers();

		expect(result).toHaveLength(2);
		expect(result[0]).toHaveProperty("id");
		expect(result[0]).toHaveProperty("role");
		expect(result[0]).toHaveProperty("user");
	});

	it("does not throw for no-family scenario", async () => {
		db.query.member.findMany.mockResolvedValue([]);
		const caller = createCaller(createCtx("user-no-family", db));

		await expect(caller.listMembers()).resolves.toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// Tests — family.listRecoveryRequests
// ---------------------------------------------------------------------------

describe("family.listRecoveryRequests — empty response scenarios", () => {
	let db: ReturnType<typeof createMockDb>;

	beforeEach(() => {
		vi.clearAllMocks();
		db = createMockDb();
	});

	it("returns empty array when user has no family", async () => {
		db.query.member.findMany.mockResolvedValue([]);
		const caller = createCaller(createCtx("user-no-family", db));

		const result = await caller.listRecoveryRequests();

		expect(result).toEqual([]);
	});

	it("returns empty array when user is not family organizer", async () => {
		const org = makeFamilyOrg();
		// tryGetUserFamily returns a member
		db.query.member.findMany.mockResolvedValue([
			makeMember({ userId: "user-member", role: "member", organization: org }),
		]);
		// organizer check: findFirst returns null (not owner)
		db.query.member.findFirst.mockResolvedValue(null);

		const caller = createCaller(createCtx("user-member", db));
		const result = await caller.listRecoveryRequests();

		expect(result).toEqual([]);
	});

	it("returns empty array when no recovery requests exist", async () => {
		const org = makeFamilyOrg();
		// tryGetUserFamily returns organizer
		db.query.member.findMany.mockResolvedValue([
			makeMember({ userId: "organizer", role: "owner", organization: org }),
		]);
		// organizer check passes
		db.query.member.findFirst.mockResolvedValue(
			makeMember({ userId: "organizer", role: "owner" }),
		);
		// no recovery requests
		db.query.recoveryRequest.findMany.mockResolvedValue([]);

		const caller = createCaller(createCtx("organizer", db));
		const result = await caller.listRecoveryRequests();

		expect(result).toEqual([]);
	});

	it("returns recovery requests when they exist for organizer", async () => {
		const org = makeFamilyOrg();
		db.query.member.findMany.mockResolvedValue([
			makeMember({ userId: "organizer", role: "owner", organization: org }),
		]);
		db.query.member.findFirst.mockResolvedValue(
			makeMember({ userId: "organizer", role: "owner" }),
		);
		db.query.recoveryRequest.findMany.mockResolvedValue([
			makeRecoveryRequest({ id: "r-1", status: "pending" }),
			makeRecoveryRequest({ id: "r-2", status: "approved" }),
		]);

		const caller = createCaller(createCtx("organizer", db));
		const result = await caller.listRecoveryRequests();

		expect(result).toHaveLength(2);
		expect(result[0]).toMatchObject({ id: "r-1", status: "pending" });
		expect(result[1]).toMatchObject({ id: "r-2", status: "approved" });
	});

	it("does not throw for no-family scenario", async () => {
		db.query.member.findMany.mockResolvedValue([]);
		const caller = createCaller(createCtx("user-no-family", db));

		await expect(caller.listRecoveryRequests()).resolves.toEqual([]);
	});

	it("does not throw for non-organizer scenario", async () => {
		const org = makeFamilyOrg();
		db.query.member.findMany.mockResolvedValue([
			makeMember({ userId: "user-member", role: "member", organization: org }),
		]);
		db.query.member.findFirst.mockResolvedValue(null);

		const caller = createCaller(createCtx("user-member", db));

		await expect(caller.listRecoveryRequests()).resolves.toEqual([]);
	});
});
