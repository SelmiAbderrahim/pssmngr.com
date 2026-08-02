// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * updateMemberRole → shared-vault permission sync.
 *
 * When an owner changes a member's org role, their shared-vault permission must
 * follow the same role→permission mapping used at grant time (member→view,
 * admin/owner→manage). This keeps read/write access consistent with the role
 * over the member's lifetime, not just at first grant.
 *
 * org-permissions is intentionally NOT mocked here so the real mapping runs.
 *
 * @vitest-environment node
 */

import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@pssmngr/server", () => ({
	sendLocalizedInvitation: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@pssmngr/server/lib/plan-gates", () => ({
	getOrgPlanTier: vi.fn(),
	requireProPlan: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@pssmngr/server/lib/org-membership", () => ({
	acceptMembershipGuarded: vi.fn(),
	AlreadyMemberError: class AlreadyMemberError extends Error {},
	MemberLimitError: class MemberLimitError extends Error {},
}));
vi.mock("@pssmngr/server/i18n/errors", () => ({
	notFoundError: (_t: any, key: string) =>
		new TRPCError({ code: "NOT_FOUND", message: key }),
	badRequestError: (_t: any, key: string) =>
		new TRPCError({ code: "BAD_REQUEST", message: key }),
	forbiddenError: (_t: any, key: string) =>
		new TRPCError({ code: "FORBIDDEN", message: key }),
}));
vi.mock("@/server/utils/site-url", () => ({
	WEBSITE_URL: "http://localhost:42789",
}));

import { organizationRouter } from "../../routers/organization";

// ---------------------------------------------------------------------------
// Mock DB
// ---------------------------------------------------------------------------

function makeMembership(role: string, overrides: Record<string, unknown> = {}) {
	return {
		id: "member-caller",
		userId: "user-1",
		organizationId: "org-1",
		role,
		createdAt: new Date(),
		organization: { id: "org-1", name: "Org", metadata: null },
		...overrides,
	};
}

/**
 * Build a db whose member.findFirst returns the owner caller first (for
 * requireOrgMembership) then the target member, whose sharedVault.findMany
 * returns `sharedVaults`, and whose update() records every `.set()` arg.
 */
function createMockDb(opts: {
	targetRole?: string;
	targetUserId?: string;
	sharedVaults?: Array<{ id: string }>;
}) {
	const setArgs: any[] = [];
	const db = {
		query: {
			member: {
				findFirst: vi
					.fn()
					.mockResolvedValueOnce(makeMembership("owner")) // requireOrgMembership (caller)
					.mockResolvedValueOnce({
						id: "member-target",
						userId: opts.targetUserId ?? "target-user",
						organizationId: "org-1",
						role: opts.targetRole ?? "member",
						createdAt: new Date(),
					}),
			},
			sharedVault: {
				findMany: vi.fn().mockResolvedValue(opts.sharedVaults ?? []),
			},
		},
		update: vi.fn().mockReturnValue({
			set: vi.fn().mockImplementation((v: any) => {
				setArgs.push(v);
				return {
					where: vi.fn().mockImplementation(() => {
						const p = Promise.resolve(undefined);
						(p as any).returning = vi
							.fn()
							.mockResolvedValue([{ id: "member-target", role: "admin" }]);
						return p;
					}),
				};
			}),
		}),
	} as any;
	return { db, setArgs };
}

function createCaller(db: any) {
	return organizationRouter.createCaller({
		session: { id: "session-user-1", activeOrganizationId: "org-1" },
		user: {
			id: "user-1",
			email: "user-1@test.com",
			name: "User 1",
			role: "member",
			ownerId: "user-1",
		},
		db,
		language: "en",
		t: ((key: string) => key) as any,
		req: { headers: {} },
		res: { setHeader: () => {} },
	} as any);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("updateMemberRole → shared-vault permission sync", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("promoting a member to admin lifts their shared-vault permission to manage", async () => {
		const { db, setArgs } = createMockDb({
			targetRole: "member",
			sharedVaults: [{ id: "sv-1" }],
		});

		await createCaller(db).updateMemberRole({
			organizationId: "org-1",
			memberId: "member-target",
			role: "admin",
		});

		// One set updates member.role, another updates shared-vault permission.
		expect(setArgs).toContainEqual({ role: "admin" });
		expect(setArgs).toContainEqual({ permission: "manage" });
	});

	it("demoting to member drops the shared-vault permission to view", async () => {
		const { db, setArgs } = createMockDb({
			targetRole: "admin",
			sharedVaults: [{ id: "sv-1" }],
		});

		await createCaller(db).updateMemberRole({
			organizationId: "org-1",
			memberId: "member-target",
			role: "member",
		});

		expect(setArgs).toContainEqual({ role: "member" });
		expect(setArgs).toContainEqual({ permission: "view" });
	});

	it("no-ops the permission sync when the org has no shared vault", async () => {
		const { db, setArgs } = createMockDb({
			targetRole: "member",
			sharedVaults: [],
		});

		await createCaller(db).updateMemberRole({
			organizationId: "org-1",
			memberId: "member-target",
			role: "admin",
		});

		// Only the member.role update ran; no shared-vault permission write.
		expect(setArgs).toContainEqual({ role: "admin" });
		expect(setArgs.some((a) => "permission" in a)).toBe(false);
	});
});
