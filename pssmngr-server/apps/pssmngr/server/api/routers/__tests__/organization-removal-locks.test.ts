// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors

import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { acquireOrganizationLock } = vi.hoisted(() => ({
	acquireOrganizationLock: vi.fn(),
}));

vi.mock("@pssmngr/server", () => ({
	getTranslator: vi.fn(),
	getEffectiveLanguage: vi.fn(),
	DEFAULT_LANGUAGE: "en",
	sendLocalizedInvitation: vi.fn(),
}));

vi.mock("@/server/db", () => ({ db: {} }));
vi.mock("@pssmngr/server/lib/auth", () => ({
	validateRequest: vi.fn(),
	validateDeviceRequest: vi.fn(),
}));

vi.mock("@pssmngr/server/lib/org-membership", () => ({
	acquireOrganizationLock,
	acceptMembershipGuarded: vi.fn(),
	createOwnedOrganizationGuarded: vi.fn(),
	reserveInvitationGuarded: vi.fn(),
	AlreadyMemberError: class AlreadyMemberError extends Error {},
	InvitationAlreadyExistsError: class InvitationAlreadyExistsError extends Error {},
	InvitationNotAcceptableError: class InvitationNotAcceptableError extends Error {},
	MemberLimitError: class MemberLimitError extends Error {},
	OrganizationLimitError: class OrganizationLimitError extends Error {},
}));

vi.mock("@/server/utils/site-url", () => ({
	WEBSITE_URL: "http://localhost:42789",
}));

import { organizationRouter } from "../organization";

function memberRow(
	overrides: Partial<{
		id: string;
		userId: string;
		role: "owner" | "admin" | "member";
		ownerId: string;
	}> = {},
) {
	return {
		id: overrides.id ?? "actor-member",
		userId: overrides.userId ?? "actor",
		organizationId: "org-1",
		role: overrides.role ?? "admin",
		isDefault: false,
		organization: {
			id: "org-1",
			name: "Workspace",
			ownerId: overrides.ownerId ?? "owner",
			metadata: null,
		},
		user: {
			id: overrides.userId ?? "actor",
			name: "User",
			email: "user@example.com",
		},
	};
}

function createDb(rows: unknown[], removed = [{ id: "removed" }]) {
	const returning = vi.fn().mockResolvedValue(removed);
	const where = vi.fn().mockReturnValue({ returning });
	const deleteFn = vi.fn().mockReturnValue({ where });
	const db: any = {
		query: {
			member: { findFirst: vi.fn() },
			sharedVault: { findMany: vi.fn().mockResolvedValue([]) },
		},
		delete: deleteFn,
		insert: vi.fn().mockReturnValue({
			values: vi.fn().mockResolvedValue(undefined),
		}),
		transaction: vi.fn(),
	};
	db.query.member.findFirst.mockImplementation(() =>
		Promise.resolve(rows.shift() ?? null),
	);
	db.transaction.mockImplementation((callback: (tx: typeof db) => unknown) =>
		callback(db),
	);
	return { db, deleteFn, returning };
}

function caller(db: any, userId = "actor") {
	return organizationRouter.createCaller({
		session: { id: "session-1", activeOrganizationId: "org-1" },
		user: {
			id: userId,
			email: `${userId}@example.com`,
			name: userId,
			role: "member",
			ownerId: userId,
		},
		db,
		language: "en",
		t: ((key: string) => key) as any,
		req: { headers: {} },
		res: { setHeader: vi.fn() },
	} as any);
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe("organization member removal lock", () => {
	it("locks, re-checks authority, and verifies the scoped delete", async () => {
		const actor = memberRow();
		const target = memberRow({
			id: "target-member",
			userId: "target",
			role: "member",
		});
		const { db, returning } = createDb([actor, target]);

		await expect(
			caller(db).removeMember({
				organizationId: "org-1",
				memberId: "target-member",
			}),
		).resolves.toEqual({ success: true });

		expect(acquireOrganizationLock).toHaveBeenCalledWith(db, "org-1");
		expect(acquireOrganizationLock.mock.invocationCallOrder[0]).toBeLessThan(
			db.query.member.findFirst.mock.invocationCallOrder[0],
		);
		expect(returning).toHaveBeenCalledWith(
			expect.objectContaining({ id: expect.anything() }),
		);
	});

	it("cannot remove the owner when a stale member role says member", async () => {
		const actor = memberRow({ role: "admin", ownerId: "target" });
		const target = memberRow({
			id: "target-member",
			userId: "target",
			role: "member",
		});
		const { db, deleteFn } = createDb([actor, target]);

		await expect(
			caller(db).removeMember({
				organizationId: "org-1",
				memberId: "target-member",
			}),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect(deleteFn).not.toHaveBeenCalled();
	});

	it("fails when the scoped delete affects no membership row", async () => {
		const { db } = createDb(
			[memberRow(), memberRow({ id: "target-member", userId: "target" })],
			[],
		);

		await expect(
			caller(db).removeMember({
				organizationId: "org-1",
				memberId: "target-member",
			}),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});
});

describe("organization leave lock", () => {
	it("locks, re-checks membership, and verifies the scoped delete", async () => {
		const { db, returning } = createDb([
			memberRow({ role: "member", ownerId: "owner" }),
		]);

		await expect(
			caller(db).leaveOrganization({ organizationId: "org-1" }),
		).resolves.toEqual({ success: true });

		expect(acquireOrganizationLock).toHaveBeenCalledWith(db, "org-1");
		expect(returning).toHaveBeenCalled();
	});

	it("cannot leave when organization.ownerId still names the caller", async () => {
		const { db, deleteFn } = createDb([
			memberRow({ role: "admin", ownerId: "actor" }),
		]);

		await expect(
			caller(db).leaveOrganization({ organizationId: "org-1" }),
		).rejects.toBeInstanceOf(TRPCError);
		expect(deleteFn).not.toHaveBeenCalled();
	});

	it("fails when the scoped delete affects no membership row", async () => {
		const { db } = createDb(
			[memberRow({ role: "member", ownerId: "owner" })],
			[],
		);

		await expect(
			caller(db).leaveOrganization({ organizationId: "org-1" }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});
});
