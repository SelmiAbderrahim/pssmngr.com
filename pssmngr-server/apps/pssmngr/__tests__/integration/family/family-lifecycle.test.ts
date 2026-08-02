// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Real-DB integration tests: family organization lifecycle.
 *
 * Covers create / get / invite-guards / listMembers / setRole / updateSettings
 * / removeMember / leave, with role-based authorization against a live Postgres.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { familyRouter } from "../../../server/api/routers/family";
import { createUser, joinOrg, makeCtx, memberIdOf, testSetup } from "./setup";

const fam = (u: Parameters<typeof makeCtx>[0]) =>
	familyRouter.createCaller(makeCtx(u));

describe("Family lifecycle (real DB)", () => {
	beforeAll(testSetup.beforeAll);
	afterAll(testSetup.afterAll);
	beforeEach(testSetup.beforeEach);

	describe("create", () => {
		it("creates a family with the creator as organizer", async () => {
			const u = await createUser();
			const res = await fam(u).create({ name: "The Smiths" });
			expect(res.id).toBeTruthy();

			const got = await fam(u).get();
			expect(got.name).toBe("The Smiths");
			expect(got.role).toBe("owner");
			expect(got.memberCount).toBe(1);
			expect(got.maxMembers).toBe(6);
		});

		it("rejects a second family for the same user (CONFLICT)", async () => {
			const u = await createUser();
			await fam(u).create({ name: "First" });
			await expect(fam(u).create({ name: "Second" })).rejects.toMatchObject({
				code: "CONFLICT",
			});
		});

		it("allows a user who only belongs to a non-family org", async () => {
			const u = await createUser();
			// Non-family org membership should not block family creation.
			const { getTestDb } = await import("./setup");
			const db = getTestDb();
			const schema = await import("@pssmngr/server/db/schema");
			const [org] = await db
				.insert(schema.organization)
				.values({
					name: "Work",
					ownerId: u.id,
					createdAt: new Date(),
					metadata: JSON.stringify({ type: "team" }),
				})
				.returning();
			await joinOrg(org!.id, u.id, "owner");

			const res = await fam(u).create({ name: "Home" });
			expect(res.id).toBeTruthy();
		});
	});

	describe("get", () => {
		it("throws NOT_FOUND when the user has no family", async () => {
			const u = await createUser();
			await expect(fam(u).get()).rejects.toMatchObject({ code: "NOT_FOUND" });
		});
	});

	describe("invite guards", () => {
		it("only the organizer can invite", async () => {
			const organizer = await createUser();
			const member = await createUser();
			const { id: orgId } = await fam(organizer).create({ name: "Fam" });
			await joinOrg(orgId, member.id, "member");

			await expect(
				fam(member).inviteMember({ email: "x@test.local", role: "member" }),
			).rejects.toMatchObject({ code: "FORBIDDEN" });

			const ok = await fam(organizer).inviteMember({
				email: "x@test.local",
				role: "member",
			});
			expect(ok.email).toBe("x@test.local");
		});

		it("rejects a duplicate pending invitation (CONFLICT)", async () => {
			const organizer = await createUser();
			await fam(organizer).create({ name: "Fam" });
			await fam(organizer).inviteMember({ email: "dup@test.local" });
			await expect(
				fam(organizer).inviteMember({ email: "dup@test.local" }),
			).rejects.toMatchObject({ code: "CONFLICT" });
		});

		it("rejects inviting an existing member (CONFLICT)", async () => {
			const organizer = await createUser();
			const member = await createUser({ email: "member@test.local" });
			const { id: orgId } = await fam(organizer).create({ name: "Fam" });
			await joinOrg(orgId, member.id, "member");

			await expect(
				fam(organizer).inviteMember({ email: "member@test.local" }),
			).rejects.toMatchObject({ code: "CONFLICT" });
		});

		it("enforces the 6-member family limit (members + pending)", async () => {
			const organizer = await createUser();
			const { id: orgId } = await fam(organizer).create({ name: "Fam" });
			// organizer = 1 member. Add 4 direct members + 1 pending invite = 6 total.
			for (let i = 0; i < 4; i++) {
				const m = await createUser();
				await joinOrg(orgId, m.id, "member");
			}
			await fam(organizer).inviteMember({ email: "sixth@test.local" });
			// total is now 6 -> the next invite must be rejected.
			await expect(
				fam(organizer).inviteMember({ email: "seventh@test.local" }),
			).rejects.toMatchObject({ code: "FORBIDDEN" });
		});
	});

	describe("listMembers / setRole / updateSettings", () => {
		it("lists members ordered by join time", async () => {
			const organizer = await createUser({ name: "Org" });
			const member = await createUser({ name: "Mem" });
			const { id: orgId } = await fam(organizer).create({ name: "Fam" });
			await joinOrg(orgId, member.id, "member");

			const members = await fam(organizer).listMembers();
			expect(members).toHaveLength(2);
			expect(members[0]!.role).toBe("owner");
			expect(members.map((m) => m.userId)).toContain(member.id);
		});

		it("organizer promotes a member to admin", async () => {
			const organizer = await createUser();
			const member = await createUser();
			const { id: orgId } = await fam(organizer).create({ name: "Fam" });
			await joinOrg(orgId, member.id, "member");
			const mid = await memberIdOf(orgId, member.id);

			const res = await fam(organizer).setRole({
				memberId: mid!,
				role: "admin",
			});
			expect(res.role).toBe("admin");
		});

		it("non-organizer cannot setRole", async () => {
			const organizer = await createUser();
			const member = await createUser();
			const other = await createUser();
			const { id: orgId } = await fam(organizer).create({ name: "Fam" });
			await joinOrg(orgId, member.id, "member");
			await joinOrg(orgId, other.id, "member");
			const mid = await memberIdOf(orgId, other.id);

			await expect(
				fam(member).setRole({ memberId: mid!, role: "admin" }),
			).rejects.toMatchObject({ code: "FORBIDDEN" });
		});

		it("organizer cannot change their own role", async () => {
			const organizer = await createUser();
			const { id: orgId } = await fam(organizer).create({ name: "Fam" });
			const mid = await memberIdOf(orgId, organizer.id);
			await expect(
				fam(organizer).setRole({ memberId: mid!, role: "admin" }),
			).rejects.toMatchObject({ code: "BAD_REQUEST" });
		});

		it("organizer renames the family", async () => {
			const organizer = await createUser();
			await fam(organizer).create({ name: "Old" });
			const res = await fam(organizer).updateSettings({ name: "New" });
			expect(res.name).toBe("New");
		});
	});

	describe("removeMember / leave", () => {
		it("organizer removes a member", async () => {
			const organizer = await createUser();
			const member = await createUser();
			const { id: orgId } = await fam(organizer).create({ name: "Fam" });
			await joinOrg(orgId, member.id, "member");
			const mid = await memberIdOf(orgId, member.id);

			const res = await fam(organizer).removeMember({ memberId: mid! });
			expect(res.success).toBe(true);
			const members = await fam(organizer).listMembers();
			expect(members).toHaveLength(1);
		});

		it("organizer cannot remove themselves", async () => {
			const organizer = await createUser();
			const { id: orgId } = await fam(organizer).create({ name: "Fam" });
			const mid = await memberIdOf(orgId, organizer.id);
			await expect(
				fam(organizer).removeMember({ memberId: mid! }),
			).rejects.toMatchObject({ code: "BAD_REQUEST" });
		});

		it("a member can leave; the organizer cannot", async () => {
			const organizer = await createUser();
			const member = await createUser();
			const { id: orgId } = await fam(organizer).create({ name: "Fam" });
			await joinOrg(orgId, member.id, "member");

			await expect(fam(member).leave()).resolves.toMatchObject({
				success: true,
			});
			await expect(fam(organizer).leave()).rejects.toMatchObject({
				code: "FORBIDDEN",
			});
		});
	});
});
