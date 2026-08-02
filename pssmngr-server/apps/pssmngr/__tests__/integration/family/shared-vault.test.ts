// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Real-DB integration tests: shared vaults.
 *
 * Exercises the zero-knowledge shared-vault workflow end to end with real
 * X25519/Ed25519/AEAD crypto:
 *  - create with per-member wrapped keys, decrypt round-trip
 *  - permission enforcement (view < edit < share < manage)
 *  - item CRUD
 *  - post-accept grant flow (a freshly-joined member gains decryptable access
 *    only after an explicit grant)
 *  - SECURE member removal: removal rotates the vault key so the removed member
 *    can no longer decrypt items added afterwards (forward secrecy)
 */

import * as schema from "@pssmngr/server/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { familyRouter } from "../../../server/api/routers/family";
import { organizationRouter } from "../../../server/api/routers/organization";
import { sharedVaultRouter } from "../../../server/api/routers/shared-vault";
import {
	createUser,
	decryptItem,
	encryptItem,
	generateVaultKey,
	getTestDb,
	importX25519Public,
	joinOrg,
	makeCtx,
	type TestUser,
	testSetup,
	unwrapVaultKey,
	type WrappedEnvelope,
	wrapVaultKey,
} from "./setup";

const sv = (u: TestUser) => sharedVaultRouter.createCaller(makeCtx(u));
const fam = (u: TestUser) => familyRouter.createCaller(makeCtx(u));
const org = (u: TestUser) => organizationRouter.createCaller(makeCtx(u));

type Perm = "view" | "edit" | "share" | "manage";

/** Build memberKeys[] for `create`/`rotateKey`, wrapping `vaultKey` for each. */
function buildMemberKeys(
	vaultKey: Buffer,
	organizer: TestUser,
	members: Array<{ user: TestUser; permission: Perm }>,
) {
	return members.map(({ user, permission }) => ({
		userId: user.id,
		permission,
		...wrapVaultKey(
			vaultKey,
			organizer.crypto,
			importX25519Public(user.crypto.x25519.rawPub),
		),
	}));
}

function envFromGet(g: {
	wrappedKey: {
		wrappedKey: string;
		wrappedKeyNonce: string;
		wrappedKeyAuthTag: string;
		ephemeralPublicKey: string;
		senderSignature: string;
	};
}): WrappedEnvelope {
	return g.wrappedKey;
}

/** Create a family with organizer + the given members (joined directly). */
async function setupFamily(memberCount: number) {
	const organizer = await createUser({ name: "Organizer" });
	const family = await fam(organizer).create({ name: "Crypto Family" });
	const members: TestUser[] = [];
	for (let i = 0; i < memberCount; i++) {
		const m = await createUser({ name: `Member${i}` });
		await joinOrg(family.id, m.id, "member");
		members.push(m);
	}
	return { organizer, orgId: family.id, members };
}

describe("Shared vaults (real DB, real crypto)", () => {
	beforeAll(testSetup.beforeAll);
	afterAll(testSetup.afterAll);
	beforeEach(testSetup.beforeEach);

	it("creates a vault; every member decrypts the same key and a stored item", async () => {
		const { organizer, members } = await setupFamily(1);
		const member = members[0]!;
		const vaultKey = generateVaultKey();

		const created = await sv(organizer).create({
			name: "Family Logins",
			memberKeys: buildMemberKeys(vaultKey, organizer, [
				{ user: organizer, permission: "manage" },
				{ user: member, permission: "edit" },
			]),
		});

		// Organizer adds an item encrypted under the shared vault key.
		const secret = JSON.stringify({ site: "bank.com", password: "hunter2" });
		await sv(organizer).addItem({
			vaultId: created.id,
			itemType: "login",
			...encryptItem(vaultKey, secret),
		});

		// Member fetches their envelope, unwraps the key, lists + decrypts.
		const got = await sv(member).get({ vaultId: created.id });
		const memberKey = unwrapVaultKey(
			envFromGet(got),
			member.crypto.x25519.privateKey,
			organizer.crypto.ed25519.publicKey,
		);
		expect(memberKey.equals(vaultKey)).toBe(true);

		const items = await sv(member).listItems({ vaultId: created.id });
		expect(items).toHaveLength(1);
		expect(decryptItem(memberKey, items[0]!)).toBe(secret);
	});

	it("rejects a tampered wrapped-key envelope", async () => {
		const { organizer } = await setupFamily(0);
		const vaultKey = generateVaultKey();
		const created = await sv(organizer).create({
			name: "Tamper",
			memberKeys: buildMemberKeys(vaultKey, organizer, [
				{ user: organizer, permission: "manage" },
			]),
		});
		const got = await sv(organizer).get({ vaultId: created.id });
		const env = { ...envFromGet(got) };
		// Flip a byte in the wrapped key.
		const bad = Buffer.from(env.wrappedKey, "base64");
		bad[0] = (bad[0] ?? 0) ^ 0xff;
		env.wrappedKey = bad.toString("base64");

		expect(() =>
			unwrapVaultKey(
				env,
				organizer.crypto.x25519.privateKey,
				organizer.crypto.ed25519.publicKey,
			),
		).toThrow();
	});

	it("rejects shared-vault creation when the user has no family", async () => {
		const u = await createUser();
		const vaultKey = generateVaultKey();
		await expect(
			sv(u).create({
				name: "Orphan",
				memberKeys: buildMemberKeys(vaultKey, u, [
					{ user: u, permission: "manage" },
				]),
			}),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	describe("permission enforcement", () => {
		it("view members can read but not write; edit members can write but not manage", async () => {
			const { organizer, members } = await setupFamily(2);
			const viewer = members[0]!;
			const editor = members[1]!;
			const vaultKey = generateVaultKey();
			const created = await sv(organizer).create({
				name: "Perms",
				memberKeys: buildMemberKeys(vaultKey, organizer, [
					{ user: organizer, permission: "manage" },
					{ user: viewer, permission: "view" },
					{ user: editor, permission: "edit" },
				]),
			});
			const item = encryptItem(vaultKey, "data");

			// viewer: can list, cannot add.
			await expect(
				sv(viewer).listItems({ vaultId: created.id }),
			).resolves.toBeDefined();
			await expect(
				sv(viewer).addItem({
					vaultId: created.id,
					itemType: "note",
					...item,
				}),
			).rejects.toMatchObject({ code: "FORBIDDEN" });

			// editor: can add, cannot manage members.
			await expect(
				sv(editor).addItem({
					vaultId: created.id,
					itemType: "note",
					...item,
				}),
			).resolves.toBeDefined();
			await expect(
				sv(editor).updatePermission({
					vaultId: created.id,
					userId: viewer.id,
					permission: "edit",
				}),
			).rejects.toMatchObject({ code: "FORBIDDEN" });
		});

		it("non-members get FORBIDDEN on get/listItems", async () => {
			const { organizer, orgId } = await setupFamily(0);
			const outsider = await createUser();
			await joinOrg(orgId, outsider.id, "member"); // family member, not vault member
			const vaultKey = generateVaultKey();
			const created = await sv(organizer).create({
				name: "Closed",
				memberKeys: buildMemberKeys(vaultKey, organizer, [
					{ user: organizer, permission: "manage" },
				]),
			});
			await expect(
				sv(outsider).get({ vaultId: created.id }),
			).rejects.toMatchObject({ code: "FORBIDDEN" });
		});
	});

	describe("item CRUD", () => {
		it("add, update (version bump), and soft-delete an item", async () => {
			const { organizer } = await setupFamily(0);
			const vaultKey = generateVaultKey();
			const created = await sv(organizer).create({
				name: "CRUD",
				memberKeys: buildMemberKeys(vaultKey, organizer, [
					{ user: organizer, permission: "manage" },
				]),
			});
			const added = await sv(organizer).addItem({
				vaultId: created.id,
				itemType: "login",
				...encryptItem(vaultKey, "v1"),
			});
			const updated = await sv(organizer).updateItem({
				vaultId: created.id,
				itemId: added.id,
				...encryptItem(vaultKey, "v2"),
			});
			expect(updated.version).toBe(2);

			await sv(organizer).deleteItem({
				vaultId: created.id,
				itemId: added.id,
			});
			const items = await sv(organizer).listItems({ vaultId: created.id });
			expect(items).toHaveLength(0); // soft-deleted -> excluded
		});
	});

	describe("post-accept grant flow", () => {
		it("a freshly-joined member gains decryptable access only after an explicit grant", async () => {
			const organizer = await createUser();
			const family = await fam(organizer).create({ name: "Grant Family" });
			const vaultKey = generateVaultKey();
			const created = await sv(organizer).create({
				name: "Shared",
				memberKeys: buildMemberKeys(vaultKey, organizer, [
					{ user: organizer, permission: "manage" },
				]),
			});
			const secret = "top-secret";
			await sv(organizer).addItem({
				vaultId: created.id,
				itemType: "note",
				...encryptItem(vaultKey, secret),
			});

			// Invitee accepts the family invite (becomes family member, not vault member).
			const invitee = await createUser({ email: "grantee@test.local" });
			const inv = await fam(organizer).inviteMember({ email: invitee.email });
			await org(invitee).acceptInvitation({ invitationId: inv.id });

			// Before grant: no vault access.
			await expect(
				sv(invitee).get({ vaultId: created.id }),
			).rejects.toMatchObject({ code: "FORBIDDEN" });

			// Organizer discovers grantable members (incl. the invitee's public key).
			const grantable = await sv(organizer).listGrantableMembers({
				vaultId: created.id,
			});
			const target = grantable.find((m) => m.userId === invitee.id);
			expect(target).toBeDefined();
			expect(target!.publicKey).toBeTruthy();
			const targetPublicKey = target!.publicKey;
			if (!targetPublicKey) {
				throw new Error("grantable member is missing a device public key");
			}

			// Organizer wraps the vault key for the invitee and grants access.
			const recipientPub = importX25519Public(
				Buffer.from(targetPublicKey, "base64").toString("base64url"),
			);
			await sv(organizer).addMember({
				vaultId: created.id,
				member: {
					userId: invitee.id,
					permission: "view",
					...wrapVaultKey(vaultKey, organizer.crypto, recipientPub),
				},
			});

			// After grant: invitee can unwrap and decrypt.
			const got = await sv(invitee).get({ vaultId: created.id });
			const key = unwrapVaultKey(
				envFromGet(got),
				invitee.crypto.x25519.privateKey,
				organizer.crypto.ed25519.publicKey,
			);
			const items = await sv(invitee).listItems({ vaultId: created.id });
			expect(decryptItem(key, items[0]!)).toBe(secret);
		});

		it("derives the granted permission from the invitee's ORG role (member→view, admin→manage), ignoring client input", async () => {
			const organizer = await createUser();
			const family = await fam(organizer).create({ name: "Role Family" });
			const vaultKey = generateVaultKey();
			const created = await sv(organizer).create({
				name: "Shared",
				memberKeys: buildMemberKeys(vaultKey, organizer, [
					{ user: organizer, permission: "manage" },
				]),
			});

			// A plain member and an admin both join the org.
			const memberUser = await createUser({ name: "PlainMember" });
			await joinOrg(family.id, memberUser.id, "member");
			const adminUser = await createUser({ name: "AnAdmin" });
			await joinOrg(family.id, adminUser.id, "admin");

			// listGrantableMembers advertises the role-derived permission.
			const grantable = await sv(organizer).listGrantableMembers({
				vaultId: created.id,
			});
			expect(
				grantable.find((m) => m.userId === memberUser.id)?.permission,
			).toBe("view");
			expect(grantable.find((m) => m.userId === adminUser.id)?.permission).toBe(
				"manage",
			);

			// Grant both, but deliberately send the WRONG permission from the client.
			for (const [u, wrongPerm] of [
				[memberUser, "manage"],
				[adminUser, "view"],
			] as const) {
				const g = grantable.find((m) => m.userId === u.id)!;
				const recipientPub = importX25519Public(
					Buffer.from(g.publicKey!, "base64").toString("base64url"),
				);
				await sv(organizer).addMember({
					vaultId: created.id,
					member: {
						userId: u.id,
						permission: wrongPerm,
						...wrapVaultKey(vaultKey, organizer.crypto, recipientPub),
					},
				});
			}

			// Server persisted the ROLE-derived permission, not the client's value.
			const db = getTestDb();
			const memberRow = await db.query.sharedVaultMember.findFirst({
				where: eq(schema.sharedVaultMember.userId, memberUser.id),
			});
			const adminRow = await db.query.sharedVaultMember.findFirst({
				where: eq(schema.sharedVaultMember.userId, adminUser.id),
			});
			expect(memberRow?.permission).toBe("view");
			expect(adminRow?.permission).toBe("manage");

			// Enforcement round-trips: admin (manage) can write; member (view) cannot.
			await expect(
				sv(adminUser).addItem({
					vaultId: created.id,
					itemType: "note",
					...encryptItem(vaultKey, "admin-item"),
				}),
			).resolves.toBeDefined();
			await expect(
				sv(memberUser).addItem({
					vaultId: created.id,
					itemType: "note",
					...encryptItem(vaultKey, "member-item"),
				}),
			).rejects.toMatchObject({ code: "FORBIDDEN" });
		});
	});

	describe("secure member removal (key rotation)", () => {
		it("removing a member rotates the key; the removed member cannot read new items", async () => {
			const { organizer, members } = await setupFamily(2);
			const stay = members[0]!;
			const leave = members[1]!;
			const oldKey = generateVaultKey();
			const created = await sv(organizer).create({
				name: "Rotate",
				memberKeys: buildMemberKeys(oldKey, organizer, [
					{ user: organizer, permission: "manage" },
					{ user: stay, permission: "edit" },
					{ user: leave, permission: "view" },
				]),
			});

			// The removed member captured the old key while a member.
			const leaveGet = await sv(leave).get({ vaultId: created.id });
			const capturedKey = unwrapVaultKey(
				envFromGet(leaveGet),
				leave.crypto.x25519.privateKey,
				organizer.crypto.ed25519.publicKey,
			);
			expect(capturedKey.equals(oldKey)).toBe(true);
			const db = getTestDb();
			const beforeRows = await db.query.sharedVaultMember.findMany({
				where: eq(schema.sharedVaultMember.sharedVaultId, created.id),
			});
			const beforeByUser = new Map(
				beforeRows.map((row) => [
					row.userId,
					{
						wrappedKey: row.wrappedKey,
						ephemeralPublicKey: row.ephemeralPublicKey,
					},
				]),
			);

			// Secure removal: organizer generates a NEW key and re-wraps for the
			// remaining members atomically with the removal.
			const newKey = generateVaultKey();
			await sv(organizer).removeMember({
				vaultId: created.id,
				userId: leave.id,
				remainingMemberKeys: buildMemberKeys(newKey, organizer, [
					{ user: organizer, permission: "manage" },
					{ user: stay, permission: "edit" },
				]),
			});
			const afterRows = await db.query.sharedVaultMember.findMany({
				where: eq(schema.sharedVaultMember.sharedVaultId, created.id),
			});
			expect(afterRows.map((row) => row.userId).sort()).toEqual(
				[organizer.id, stay.id].sort(),
			);
			for (const row of afterRows) {
				const before = beforeByUser.get(row.userId);
				expect(before).toBeDefined();
				expect(row.wrappedKey).not.toBe(before!.wrappedKey);
				expect(row.ephemeralPublicKey).not.toBe(before!.ephemeralPublicKey);
			}

			// Removed member loses access entirely.
			await expect(
				sv(leave).get({ vaultId: created.id }),
			).rejects.toMatchObject({ code: "FORBIDDEN" });

			// A NEW item is added under the new key.
			const freshSecret = "post-rotation-secret";
			await sv(organizer).addItem({
				vaultId: created.id,
				itemType: "note",
				...encryptItem(newKey, freshSecret),
			});

			// Remaining member reads it with the rotated key.
			const stayGet = await sv(stay).get({ vaultId: created.id });
			const rotatedKey = unwrapVaultKey(
				envFromGet(stayGet),
				stay.crypto.x25519.privateKey,
				organizer.crypto.ed25519.publicKey,
			);
			expect(rotatedKey.equals(newKey)).toBe(true);
			const items = await sv(stay).listItems({ vaultId: created.id });
			const fresh = items.find((i) => {
				try {
					return decryptItem(rotatedKey, i) === freshSecret;
				} catch {
					return false;
				}
			});
			expect(fresh).toBeDefined();

			// Forward secrecy: the removed member's captured (old) key cannot
			// decrypt the post-rotation item.
			expect(() => decryptItem(capturedKey, fresh!)).toThrow();
		});

		it("rejects rotation payloads that re-wrap the removed member", async () => {
			const { organizer, members } = await setupFamily(1);
			const leave = members[0]!;
			const oldKey = generateVaultKey();
			const created = await sv(organizer).create({
				name: "Reject Removed",
				memberKeys: buildMemberKeys(oldKey, organizer, [
					{ user: organizer, permission: "manage" },
					{ user: leave, permission: "view" },
				]),
			});

			const newKey = generateVaultKey();
			await expect(
				sv(organizer).removeMember({
					vaultId: created.id,
					userId: leave.id,
					remainingMemberKeys: buildMemberKeys(newKey, organizer, [
						{ user: organizer, permission: "manage" },
						{ user: leave, permission: "view" },
					]),
				}),
			).rejects.toMatchObject({ code: "BAD_REQUEST" });
		});
	});
});
