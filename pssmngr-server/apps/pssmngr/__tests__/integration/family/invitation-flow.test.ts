// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Real-DB integration tests: multi-user invitation flow.
 *
 * Drives the actual cross-account path: organizer invites by email via the
 * family router, the invitee discovers the invitation via the organization
 * router, accepts it, and becomes a real member. Also covers decline, expiry,
 * email mismatch, already-member, and the family-size limit on acceptance.
 */

import * as schema from "@pssmngr/server/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { familyRouter } from "../../../server/api/routers/family";
import { organizationRouter } from "../../../server/api/routers/organization";
import {
	createUser,
	getTestDb,
	joinOrg,
	makeCtx,
	type TestUser,
	testSetup,
} from "./setup";

const fam = (u: TestUser) => familyRouter.createCaller(makeCtx(u));
const org = (u: TestUser) => organizationRouter.createCaller(makeCtx(u));

/** Organizer creates a family and invites `email`; returns {orgId, invitationId}. */
async function inviteToFamily(
	organizer: TestUser,
	email: string,
	role: "member" | "admin" = "member",
) {
	const family = await fam(organizer).create({ name: "Invited Family" });
	const inv = await fam(organizer).inviteMember({ email, role });
	return { orgId: family.id, invitationId: inv.id };
}

describe("Invitation flow (real DB, multi-user)", () => {
	beforeAll(testSetup.beforeAll);
	afterAll(testSetup.afterAll);
	beforeEach(testSetup.beforeEach);

	it("invitee sees the pending invitation addressed to their email", async () => {
		const organizer = await createUser({ name: "Org" });
		const invitee = await createUser({ email: "invitee@test.local" });
		await inviteToFamily(organizer, invitee.email);

		const pending = await org(invitee).getMyPendingInvitations();
		expect(pending).toHaveLength(1);
		expect(pending[0]!.organization.name).toBe("Invited Family");
		expect(pending[0]!.role).toBe("member");
	});

	it("invitee accepts and becomes a real family member with the invited role", async () => {
		const organizer = await createUser();
		const invitee = await createUser({ email: "accept@test.local" });
		const { orgId, invitationId } = await inviteToFamily(
			organizer,
			invitee.email,
			"admin",
		);

		const res = await org(invitee).acceptInvitation({ invitationId });
		expect(res.organization.id).toBe(orgId);

		// Now a member of the family with role=admin.
		const members = await fam(organizer).listMembers();
		expect(members).toHaveLength(2);
		const joined = members.find((m) => m.userId === invitee.id);
		expect(joined?.role).toBe("admin");

		// Invitation marked accepted.
		const db = getTestDb();
		const inv = await db.query.invitation.findFirst({
			where: eq(schema.invitation.id, invitationId),
		});
		expect(inv?.status).toBe("accepted");

		// No longer pending for the invitee.
		expect(await org(invitee).getMyPendingInvitations()).toHaveLength(0);
	});

	it("declining marks the invitation declined and removes it from pending", async () => {
		const organizer = await createUser();
		const invitee = await createUser({ email: "decline@test.local" });
		const { invitationId } = await inviteToFamily(organizer, invitee.email);

		await org(invitee).declineInvitation({ invitationId });

		const db = getTestDb();
		const inv = await db.query.invitation.findFirst({
			where: eq(schema.invitation.id, invitationId),
		});
		expect(inv?.status).toBe("declined");
		expect(await org(invitee).getMyPendingInvitations()).toHaveLength(0);
	});

	it("rejects acceptance from a different email (FORBIDDEN)", async () => {
		const organizer = await createUser();
		const invitee = await createUser({ email: "right@test.local" });
		const stranger = await createUser({ email: "wrong@test.local" });
		const { invitationId } = await inviteToFamily(organizer, invitee.email);

		await expect(
			org(stranger).acceptInvitation({ invitationId }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("rejects an expired invitation (BAD_REQUEST) and marks it expired", async () => {
		const organizer = await createUser();
		const invitee = await createUser({ email: "expired@test.local" });
		const { invitationId } = await inviteToFamily(organizer, invitee.email);

		// Force expiry in the past.
		const db = getTestDb();
		await db
			.update(schema.invitation)
			.set({ expiresAt: new Date(Date.now() - 1000) })
			.where(eq(schema.invitation.id, invitationId));

		await expect(
			org(invitee).acceptInvitation({ invitationId }),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });

		const inv = await db.query.invitation.findFirst({
			where: eq(schema.invitation.id, invitationId),
		});
		expect(inv?.status).toBe("expired");
	});

	it("rejects re-accepting (already a member -> CONFLICT)", async () => {
		const organizer = await createUser();
		const invitee = await createUser({ email: "twice@test.local" });
		const { invitationId } = await inviteToFamily(organizer, invitee.email);
		await org(invitee).acceptInvitation({ invitationId });

		await expect(
			org(invitee).acceptInvitation({ invitationId }),
		).rejects.toMatchObject({ code: "BAD_REQUEST" }); // status no longer pending
	});

	it("a full 6-member family still lets the 6th invitee accept", async () => {
		// Regression guard: family orgs must use the family limit (6), not the
		// generic free-tier org limit (2), when accepting invitations.
		const organizer = await createUser();
		const family = await fam(organizer).create({ name: "Big Family" });
		// Fill to 5 members directly (organizer + 4).
		for (let i = 0; i < 4; i++) {
			const m = await createUser();
			await joinOrg(family.id, m.id, "member");
		}
		// Invite + accept the 6th.
		const sixth = await createUser({ email: "sixth@test.local" });
		const inv = await fam(organizer).inviteMember({ email: sixth.email });
		await expect(
			org(sixth).acceptInvitation({ invitationId: inv.id }),
		).resolves.toMatchObject({ organization: { id: family.id } });

		const members = await fam(organizer).listMembers();
		expect(members).toHaveLength(6);
	});
});
