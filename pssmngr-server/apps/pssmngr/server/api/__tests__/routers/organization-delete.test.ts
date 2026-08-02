// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Integration tests for organization deletion: `deleteOrganization`
 * (owner-facing, cascade + default reassignment) and its sibling `delete`
 * alias procedure. Unlike organization-multi-org.test.ts (which only
 * re-simulates the logic with plain JS), these tests call the real
 * `organizationRouter` via `createCaller`, so permission checks, cascade
 * order, and default-reassignment actually execute.
 */

import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@pssmngr/server", () => ({
	sendLocalizedInvitation: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@pssmngr/server/lib/auth", () => ({
	validateRequest: vi.fn(),
	validateDeviceRequest: vi.fn(),
}));

vi.mock("@pssmngr/server/lib/org-membership", () => ({
	acquireOrganizationLock: vi.fn().mockResolvedValue(undefined),
	acceptMembershipGuarded: vi.fn(),
	AlreadyMemberError: class AlreadyMemberError extends Error {},
	MemberLimitError: class MemberLimitError extends Error {},
}));

vi.mock("@pssmngr/server/i18n/errors", () => ({
	notFoundError: (_t: any, key: string) =>
		new TRPCError({ code: "NOT_FOUND", message: key }),
	badRequestError: (_t: any, key: string) =>
		new TRPCError({ code: "BAD_REQUEST", message: key }),
}));

vi.mock("@/server/utils/site-url", () => ({
	WEBSITE_URL: "http://localhost:42789",
}));

vi.mock("@/server/db", () => ({ db: {} }));

// Intentionally NOT mocking "@pssmngr/server/lib/org-permissions" — the real
// requirePermission/hasPermission matrix must run so owner/admin/member
// checks are actually exercised by these tests.

import {
	invitation as invitationTable,
	member as memberTable,
	organization as organizationTable,
} from "@pssmngr/server/db/schema";
import { organizationRouter } from "../../routers/organization";

const TABLE_NAMES = new Map<unknown, string>([
	[invitationTable, "invitation"],
	[memberTable, "member"],
	[organizationTable, "organization"],
]);

// ---------------------------------------------------------------------------
// Mock DB helpers
// ---------------------------------------------------------------------------

function makeMembership(overrides: Partial<Record<string, unknown>> = {}) {
	return {
		id: "member-org-1",
		userId: "user-1",
		organizationId: "org-1",
		role: "owner",
		isDefault: false,
		createdAt: new Date("2024-01-01"),
		...overrides,
	};
}

interface MockDbOptions {
	membership: ReturnType<typeof makeMembership> | null;
	/** Result returned for the post-delete "find next default org" lookup. */
	nextMembership?: ReturnType<typeof makeMembership> | undefined;
	/** Owner row re-read after the organization advisory lock is acquired. */
	lockedOwner?: boolean;
}

function createMockDb({
	membership,
	nextMembership,
	lockedOwner = true,
}: MockDbOptions) {
	const deleteCalls: Array<{ table: string }> = [];
	const updateCalls: Array<{ id: string; isDefault: boolean }> = [];

	const findFirstMock = vi
		.fn()
		// 1st call: requireOrgMembership lookup
		.mockResolvedValueOnce(membership)
		// 2nd call (only reached if wasDefault): next membership lookup
		.mockResolvedValueOnce(nextMembership ?? undefined);

	const db = {
		query: {
			member: {
				findFirst: findFirstMock,
			},
			organization: {
				findFirst: vi
					.fn()
					.mockResolvedValue(lockedOwner ? { id: "org-1" } : undefined),
			},
		},
		delete: vi.fn((table: unknown) => {
			const tableName = TABLE_NAMES.get(table) ?? "unknown";
			return {
				where: vi.fn(async () => {
					deleteCalls.push({ table: tableName });
				}),
			};
		}),
		update: vi.fn(() => ({
			set: vi.fn((values: { isDefault: boolean }) => ({
				where: vi.fn(async () => {
					updateCalls.push({
						id: nextMembership?.id ?? "unknown",
						isDefault: values.isDefault,
					});
				}),
			})),
		})),
		transaction: vi.fn(async function (
			this: any,
			fn: (tx: any) => Promise<any>,
		) {
			return fn(this as any);
		}),
	};

	return { db, deleteCalls, updateCalls, findFirstMock };
}

function createCtx(db: any, user: { id: string }) {
	return {
		session: { id: `session-${user.id}`, activeOrganizationId: "org-1" },
		user: {
			id: user.id,
			email: `${user.id}@test.com`,
			name: user.id,
			role: "member",
			ownerId: user.id,
		},
		db,
		language: "en",
		t: ((key: string) => key) as any,
		req: { headers: {} },
		res: { setHeader: () => {} },
	};
}

function createCaller(db: any, userId = "user-1") {
	return organizationRouter.createCaller(createCtx(db, { id: userId }) as any);
}

beforeEach(() => {
	vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// deleteOrganization
// ---------------------------------------------------------------------------

describe("deleteOrganization (real procedure)", () => {
	it("owner deletes successfully, cascades invitation -> member -> organization, returns success", async () => {
		const { db, deleteCalls } = createMockDb({
			membership: makeMembership({ role: "owner", isDefault: false }),
		});

		const caller = createCaller(db);
		const result = await caller.deleteOrganization({ organizationId: "org-1" });

		expect(result).toEqual({ success: true });
		expect(db.transaction).toHaveBeenCalledTimes(1);
		expect(deleteCalls.map((c) => c.table)).toEqual([
			"invitation",
			"member",
			"organization",
		]);
	});

	it("admin cannot delete — rejects FORBIDDEN / notOwner", async () => {
		const { db } = createMockDb({
			membership: makeMembership({ role: "admin" }),
		});
		const caller = createCaller(db);

		await expect(
			caller.deleteOrganization({ organizationId: "org-1" }),
		).rejects.toMatchObject({
			code: "FORBIDDEN",
			message: "errors:organization.notOwner",
		});
	});

	it("member cannot delete — rejects FORBIDDEN / notOwner", async () => {
		const { db } = createMockDb({
			membership: makeMembership({ role: "member" }),
		});
		const caller = createCaller(db);

		await expect(
			caller.deleteOrganization({ organizationId: "org-1" }),
		).rejects.toMatchObject({
			code: "FORBIDDEN",
			message: "errors:organization.notOwner",
		});
	});

	it("non-member cannot delete — rejects FORBIDDEN / notMember", async () => {
		const { db } = createMockDb({ membership: null });
		const caller = createCaller(db);

		await expect(
			caller.deleteOrganization({ organizationId: "org-1" }),
		).rejects.toMatchObject({
			code: "FORBIDDEN",
			message: "errors:organization.notMember",
		});
	});

	it("re-checks ownership under the lock before deleting any rows", async () => {
		const { db, deleteCalls } = createMockDb({
			membership: makeMembership({ role: "owner" }),
			lockedOwner: false,
		});
		const caller = createCaller(db);

		await expect(
			caller.deleteOrganization({ organizationId: "org-1" }),
		).rejects.toMatchObject({
			code: "FORBIDDEN",
			message: "errors:organization.notOwner",
		});
		expect(deleteCalls).toEqual([]);
	});

	it("reassigns default to the next oldest membership when the default org is deleted", async () => {
		const next = makeMembership({
			id: "member-org-2",
			organizationId: "org-2",
		});
		const { db, updateCalls, findFirstMock } = createMockDb({
			membership: makeMembership({ role: "owner", isDefault: true }),
			nextMembership: next,
		});
		const caller = createCaller(db);

		const result = await caller.deleteOrganization({ organizationId: "org-1" });

		expect(result).toEqual({ success: true });
		expect(findFirstMock).toHaveBeenCalledTimes(2);
		expect(updateCalls).toEqual([{ id: "member-org-2", isDefault: true }]);
	});

	it("does not crash when the deleted org was default and no other org remains", async () => {
		const { db, updateCalls, findFirstMock } = createMockDb({
			membership: makeMembership({ role: "owner", isDefault: true }),
			nextMembership: undefined,
		});
		const caller = createCaller(db);

		const result = await caller.deleteOrganization({ organizationId: "org-1" });

		expect(result).toEqual({ success: true });
		expect(findFirstMock).toHaveBeenCalledTimes(2);
		expect(updateCalls).toEqual([]);
	});

	it("skips default-reassignment lookup entirely when a non-default org is deleted", async () => {
		const { db, updateCalls, findFirstMock } = createMockDb({
			membership: makeMembership({ role: "owner", isDefault: false }),
		});
		const caller = createCaller(db);

		await caller.deleteOrganization({ organizationId: "org-1" });

		// Only the requireOrgMembership lookup should have run.
		expect(findFirstMock).toHaveBeenCalledTimes(1);
		expect(updateCalls).toEqual([]);
	});

	it("rejects an unknown extra field (strict schema)", async () => {
		const { db } = createMockDb({
			membership: makeMembership({ role: "owner" }),
		});
		const caller = createCaller(db);

		await expect(
			caller.deleteOrganization({
				organizationId: "org-1",
				extra: "nope",
			} as any),
		).rejects.toThrow();
	});

	it("rejects a missing organizationId", async () => {
		const { db } = createMockDb({
			membership: makeMembership({ role: "owner" }),
		});
		const caller = createCaller(db);

		await expect(caller.deleteOrganization({} as any)).rejects.toThrow();
	});
});

// ---------------------------------------------------------------------------
// delete (legacy alias, still referenced by pssmngr-server's internal
// dashboard sidebar — same permission/cascade contract, no default
// reassignment).
// ---------------------------------------------------------------------------

describe("delete (legacy alias, real procedure)", () => {
	it("owner deletes successfully, cascades invitation -> member -> organization", async () => {
		const { db, deleteCalls } = createMockDb({
			membership: makeMembership({ role: "owner" }),
		});
		const caller = createCaller(db);

		const result = await caller.delete({ organizationId: "org-1" });

		expect(result).toEqual({ success: true });
		expect(deleteCalls.map((c) => c.table)).toEqual([
			"invitation",
			"member",
			"organization",
		]);
	});

	it("admin cannot delete — rejects FORBIDDEN / notOwner", async () => {
		const { db } = createMockDb({
			membership: makeMembership({ role: "admin" }),
		});
		const caller = createCaller(db);

		await expect(
			caller.delete({ organizationId: "org-1" }),
		).rejects.toMatchObject({
			code: "FORBIDDEN",
			message: "errors:organization.notOwner",
		});
	});

	it("member cannot delete — rejects FORBIDDEN / notOwner", async () => {
		const { db } = createMockDb({
			membership: makeMembership({ role: "member" }),
		});
		const caller = createCaller(db);

		await expect(
			caller.delete({ organizationId: "org-1" }),
		).rejects.toMatchObject({
			code: "FORBIDDEN",
			message: "errors:organization.notOwner",
		});
	});

	it("non-member cannot delete — rejects FORBIDDEN / notMember", async () => {
		const { db } = createMockDb({ membership: null });
		const caller = createCaller(db);

		await expect(
			caller.delete({ organizationId: "org-1" }),
		).rejects.toMatchObject({
			code: "FORBIDDEN",
			message: "errors:organization.notMember",
		});
	});
});
