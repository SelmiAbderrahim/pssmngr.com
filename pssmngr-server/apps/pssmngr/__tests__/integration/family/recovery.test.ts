// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Real-DB integration tests: delegated family recovery.
 *
 * A member who lost their master password requests recovery; the organizer
 * approves; the member submits new keys (proving control via an Ed25519
 * signature); the organizer completes recovery by re-wrapping shared-vault
 * keys for the member's new public key. Afterwards the member can decrypt with
 * their new private key.
 */

import { sign as edSign } from "node:crypto";
import * as schema from "@pssmngr/server/db/schema";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { familyRouter } from "../../../server/api/routers/family";
import { sharedVaultRouter } from "../../../server/api/routers/shared-vault";
import {
	b64,
	createUser,
	generateMemberCrypto,
	generateVaultKey,
	getTestDb,
	importX25519Public,
	joinOrg,
	type MemberCrypto,
	makeCtx,
	type TestUser,
	testSetup,
	unwrapVaultKey,
	wrapVaultKey,
} from "./setup";

const fam = (u: TestUser) => familyRouter.createCaller(makeCtx(u));
const sv = (u: TestUser) => sharedVaultRouter.createCaller(makeCtx(u));

/** Canonical message the recovering member signs to prove key control. */
function recoveryProof(
	requestId: string,
	newPublicKeyB64: string,
	newSigningKeys: MemberCrypto,
): string {
	const msg = Buffer.from(`recovery:${requestId}:${newPublicKeyB64}`);
	return b64(edSign(null, msg, newSigningKeys.ed25519.privateKey));
}

async function familyWithMember() {
	const organizer = await createUser({ name: "Org" });
	const member = await createUser({ name: "Mem" });
	const family = await fam(organizer).create({ name: "Recover Family" });
	await joinOrg(family.id, member.id, "member");
	return { organizer, member, orgId: family.id };
}

/**
 * Create a shared vault for `family` and seed an envelope row for `recipient`.
 * Used to set up both in-family vaults and a cross-tenant "foreign" vault the
 * recovering member happens to belong to.
 */
async function seedVault(
	familyId: string,
	creator: TestUser,
	recipient: TestUser,
	vaultKey: Buffer,
	name = "Vault",
) {
	const db = getTestDb();
	const [vault] = await db
		.insert(schema.sharedVault)
		.values({ familyId, name, createdBy: creator.id })
		.returning();
	const env = wrapVaultKey(
		vaultKey,
		creator.crypto,
		importX25519Public(recipient.crypto.x25519.rawPub),
	);
	await db.insert(schema.sharedVaultMember).values({
		sharedVaultId: vault!.id,
		userId: recipient.id,
		permission: "edit",
		grantedBy: creator.id,
		...env,
	});
	return vault!;
}

/** Drive a recovery request to the "completing" state and return new keys. */
async function driveToCompleting(organizer: TestUser, member: TestUser) {
	const req = await fam(member).requestRecovery();
	await fam(organizer).approveRecovery({ requestId: req.id });
	const newCrypto = generateMemberCrypto();
	const newPublicKey = b64(Buffer.from(newCrypto.x25519.rawPub, "base64url"));
	const newSigningPublicKey = b64(
		Buffer.from(newCrypto.ed25519.rawPub, "base64url"),
	);
	await fam(member).submitNewKeys({
		requestId: req.id,
		newPublicKey,
		newSigningPublicKey,
		signature: recoveryProof(req.id, newPublicKey, newCrypto),
	});
	return { req, newCrypto };
}

async function envelopeOf(vaultId: string, userId: string) {
	return getTestDb().query.sharedVaultMember.findFirst({
		where: and(
			eq(schema.sharedVaultMember.sharedVaultId, vaultId),
			eq(schema.sharedVaultMember.userId, userId),
		),
	});
}

async function statusOf(requestId: string) {
	const r = await getTestDb().query.recoveryRequest.findFirst({
		where: eq(schema.recoveryRequest.id, requestId),
	});
	return r?.status;
}

describe("Delegated recovery (real DB)", () => {
	beforeAll(testSetup.beforeAll);
	afterAll(testSetup.afterAll);
	beforeEach(testSetup.beforeEach);

	it("organizer cannot request recovery", async () => {
		const { organizer } = await familyWithMember();
		await expect(fam(organizer).requestRecovery()).rejects.toMatchObject({
			code: "BAD_REQUEST",
		});
	});

	it("full recovery: request -> approve -> submitNewKeys -> complete re-keys the member", async () => {
		const { organizer, member } = await familyWithMember();

		// A shared vault exists with the member in it.
		const oldVaultKey = generateVaultKey();
		const vault = await sv(organizer).create({
			name: "Vault",
			memberKeys: [
				{
					userId: organizer.id,
					permission: "manage" as const,
					...wrapVaultKey(
						oldVaultKey,
						organizer.crypto,
						importX25519Public(organizer.crypto.x25519.rawPub),
					),
				},
				{
					userId: member.id,
					permission: "edit" as const,
					...wrapVaultKey(
						oldVaultKey,
						organizer.crypto,
						importX25519Public(member.crypto.x25519.rawPub),
					),
				},
			],
		});
		const db = getTestDb();
		const beforeMemberEnvelope = await db.query.sharedVaultMember.findFirst({
			where: and(
				eq(schema.sharedVaultMember.sharedVaultId, vault.id),
				eq(schema.sharedVaultMember.userId, member.id),
			),
		});
		expect(beforeMemberEnvelope).toBeDefined();

		// Member lost access -> requests recovery.
		const req = await fam(member).requestRecovery();
		expect(req.status).toBe("pending");
		await expect(
			db.query.recoveryRequest.findFirst({
				where: eq(schema.recoveryRequest.id, req.id),
			}),
		).resolves.toMatchObject({ status: "pending" });

		// Organizer sees + approves.
		const list = await fam(organizer).listRecoveryRequests();
		expect(list.some((r) => r.id === req.id)).toBe(true);
		const approved = await fam(organizer).approveRecovery({
			requestId: req.id,
		});
		expect(approved.status).toBe("approved");
		await expect(
			db.query.recoveryRequest.findFirst({
				where: eq(schema.recoveryRequest.id, req.id),
			}),
		).resolves.toMatchObject({ status: "approved" });

		// Member generates NEW keys and submits them with a valid proof signature.
		const newCrypto = generateMemberCrypto();
		const newPublicKey = b64(Buffer.from(newCrypto.x25519.rawPub, "base64url"));
		const newSigningPublicKey = b64(
			Buffer.from(newCrypto.ed25519.rawPub, "base64url"),
		);
		const submitted = await fam(member).submitNewKeys({
			requestId: req.id,
			newPublicKey,
			newSigningPublicKey,
			signature: recoveryProof(req.id, newPublicKey, newCrypto),
		});
		expect(submitted.status).toBe("completing");
		await expect(
			db.query.recoveryRequest.findFirst({
				where: eq(schema.recoveryRequest.id, req.id),
			}),
		).resolves.toMatchObject({ status: "completing" });

		// Organizer re-wraps the vault key for the member's NEW public key.
		const rewrap = wrapVaultKey(
			oldVaultKey,
			organizer.crypto,
			importX25519Public(newCrypto.x25519.rawPub),
		);
		const completed = await fam(organizer).completeRecovery({
			requestId: req.id,
			rewrappedKeys: [{ sharedVaultId: vault.id, ...rewrap }],
		});
		expect(completed.status).toBe("completed");
		await expect(
			db.query.recoveryRequest.findFirst({
				where: eq(schema.recoveryRequest.id, req.id),
			}),
		).resolves.toMatchObject({ status: "completed" });
		const afterMemberEnvelope = await db.query.sharedVaultMember.findFirst({
			where: and(
				eq(schema.sharedVaultMember.sharedVaultId, vault.id),
				eq(schema.sharedVaultMember.userId, member.id),
			),
		});
		expect(afterMemberEnvelope).toBeDefined();
		expect(afterMemberEnvelope!.wrappedKey).not.toBe(
			beforeMemberEnvelope!.wrappedKey,
		);
		expect(afterMemberEnvelope!.ephemeralPublicKey).not.toBe(
			beforeMemberEnvelope!.ephemeralPublicKey,
		);

		// The member, now holding ONLY the new private key, can unwrap the vault.
		const got = await sv(member).get({ vaultId: vault.id });
		const recovered = unwrapVaultKey(
			got.wrappedKey,
			newCrypto.x25519.privateKey,
			organizer.crypto.ed25519.publicKey,
		);
		expect(recovered.equals(oldVaultKey)).toBe(true);
	});

	it("rejects submitNewKeys with an invalid proof signature", async () => {
		const { organizer, member } = await familyWithMember();
		const req = await fam(member).requestRecovery();
		await fam(organizer).approveRecovery({ requestId: req.id });

		const newCrypto = generateMemberCrypto();
		const newPublicKey = b64(Buffer.from(newCrypto.x25519.rawPub, "base64url"));
		const newSigningPublicKey = b64(
			Buffer.from(newCrypto.ed25519.rawPub, "base64url"),
		);
		// Sign with a DIFFERENT (attacker) key -> proof must fail.
		const attacker = generateMemberCrypto();
		const badSig = recoveryProof(req.id, newPublicKey, attacker);

		await expect(
			fam(member).submitNewKeys({
				requestId: req.id,
				newPublicKey,
				newSigningPublicKey,
				signature: badSig,
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});

	it("submitNewKeys requires an approved request", async () => {
		const { member } = await familyWithMember();
		const req = await fam(member).requestRecovery();
		const newCrypto = generateMemberCrypto();
		const newPublicKey = b64(Buffer.from(newCrypto.x25519.rawPub, "base64url"));
		const newSigningPublicKey = b64(
			Buffer.from(newCrypto.ed25519.rawPub, "base64url"),
		);
		await expect(
			fam(member).submitNewKeys({
				requestId: req.id,
				newPublicKey,
				newSigningPublicKey,
				signature: recoveryProof(req.id, newPublicKey, newCrypto),
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});

	it("rejects a duplicate active recovery request (CONFLICT)", async () => {
		const { member } = await familyWithMember();
		await fam(member).requestRecovery();
		await expect(fam(member).requestRecovery()).rejects.toMatchObject({
			code: "CONFLICT",
		});
	});

	it("organizer can reject a recovery request", async () => {
		const { organizer, member } = await familyWithMember();
		const req = await fam(member).requestRecovery();
		const res = await fam(organizer).rejectRecovery({ requestId: req.id });
		expect(res.status).toBe("rejected");
		// Member's active status query returns null after rejection.
		expect(await fam(member).getRecoveryStatus()).toBeNull();
	});

	describe("completeRecovery authorization & exact-set enforcement", () => {
		it("cannot re-wrap a shared vault outside the recovering member's family", async () => {
			const { organizer, member, orgId } = await familyWithMember();

			// In-family vault the member legitimately belongs to.
			const inKey = generateVaultKey();
			const inVault = await seedVault(orgId, organizer, member, inKey, "In");

			// A SEPARATE family the member also has a vault membership in.
			const outsider = await createUser({ name: "Outsider" });
			const otherFamily = await fam(outsider).create({ name: "Other Family" });
			const outKey = generateVaultKey();
			const outVault = await seedVault(
				otherFamily.id,
				outsider,
				member,
				outKey,
				"Out",
			);
			const outBefore = await envelopeOf(outVault.id, member.id);

			const { req, newCrypto } = await driveToCompleting(organizer, member);

			// Organizer tries to slip the foreign vault into the rewrap set.
			const foreignRewrap = wrapVaultKey(
				outKey,
				organizer.crypto,
				importX25519Public(newCrypto.x25519.rawPub),
			);
			await expect(
				fam(organizer).completeRecovery({
					requestId: req.id,
					rewrappedKeys: [{ sharedVaultId: outVault.id, ...foreignRewrap }],
				}),
			).rejects.toMatchObject({ code: "BAD_REQUEST" });

			// Foreign envelope is untouched and the request is NOT completed.
			const outAfter = await envelopeOf(outVault.id, member.id);
			expect(outAfter!.wrappedKey).toBe(outBefore!.wrappedKey);
			expect(outAfter!.senderSignature).toBe(outBefore!.senderSignature);
			expect(outAfter!.grantedBy).toBe(outBefore!.grantedBy);
			expect(await statusOf(req.id)).toBe("completing");
			// The legitimate in-family vault was also left untouched.
			void inVault;
		});

		it("rejects duplicate shared vault IDs", async () => {
			const { organizer, member, orgId } = await familyWithMember();
			const key = generateVaultKey();
			const vault = await seedVault(orgId, organizer, member, key);
			const { req, newCrypto } = await driveToCompleting(organizer, member);

			const rewrap = () =>
				wrapVaultKey(
					key,
					organizer.crypto,
					importX25519Public(newCrypto.x25519.rawPub),
				);
			await expect(
				fam(organizer).completeRecovery({
					requestId: req.id,
					rewrappedKeys: [
						{ sharedVaultId: vault.id, ...rewrap() },
						{ sharedVaultId: vault.id, ...rewrap() },
					],
				}),
			).rejects.toMatchObject({ code: "BAD_REQUEST" });
			expect(await statusOf(req.id)).toBe("completing");
		});

		it("rejects an empty key list when family vaults exist", async () => {
			const { organizer, member, orgId } = await familyWithMember();
			const key = generateVaultKey();
			const vault = await seedVault(orgId, organizer, member, key);
			const before = await envelopeOf(vault.id, member.id);
			const { req } = await driveToCompleting(organizer, member);

			await expect(
				fam(organizer).completeRecovery({
					requestId: req.id,
					rewrappedKeys: [],
				}),
			).rejects.toMatchObject({ code: "BAD_REQUEST" });

			const after = await envelopeOf(vault.id, member.id);
			expect(after!.wrappedKey).toBe(before!.wrappedKey);
			expect(await statusOf(req.id)).toBe("completing");
		});

		it("rejects a partial set that omits an expected family vault", async () => {
			const { organizer, member, orgId } = await familyWithMember();
			const keyA = generateVaultKey();
			const keyB = generateVaultKey();
			const vaultA = await seedVault(orgId, organizer, member, keyA, "A");
			const vaultB = await seedVault(orgId, organizer, member, keyB, "B");
			const bBefore = await envelopeOf(vaultB.id, member.id);
			const { req, newCrypto } = await driveToCompleting(organizer, member);

			const rewrapA = wrapVaultKey(
				keyA,
				organizer.crypto,
				importX25519Public(newCrypto.x25519.rawPub),
			);
			await expect(
				fam(organizer).completeRecovery({
					requestId: req.id,
					rewrappedKeys: [{ sharedVaultId: vaultA.id, ...rewrapA }],
				}),
			).rejects.toMatchObject({ code: "BAD_REQUEST" });

			// Neither envelope was rewritten and recovery stays in "completing".
			const bAfter = await envelopeOf(vaultB.id, member.id);
			expect(bAfter!.wrappedKey).toBe(bBefore!.wrappedKey);
			expect(await statusOf(req.id)).toBe("completing");
		});

		it("succeeds when the submitted set exactly matches expected family vaults (and ignores foreign vaults)", async () => {
			const { organizer, member, orgId } = await familyWithMember();
			const keyA = generateVaultKey();
			const keyB = generateVaultKey();
			const vaultA = await seedVault(orgId, organizer, member, keyA, "A");
			const vaultB = await seedVault(orgId, organizer, member, keyB, "B");

			// A foreign vault membership exists but is NOT part of the expected set.
			const outsider = await createUser({ name: "Outsider" });
			const otherFamily = await fam(outsider).create({ name: "Other" });
			const outVault = await seedVault(
				otherFamily.id,
				outsider,
				member,
				generateVaultKey(),
				"Out",
			);
			const outBefore = await envelopeOf(outVault.id, member.id);

			const { req, newCrypto } = await driveToCompleting(organizer, member);
			const rewrapA = wrapVaultKey(
				keyA,
				organizer.crypto,
				importX25519Public(newCrypto.x25519.rawPub),
			);
			const rewrapB = wrapVaultKey(
				keyB,
				organizer.crypto,
				importX25519Public(newCrypto.x25519.rawPub),
			);

			const completed = await fam(organizer).completeRecovery({
				requestId: req.id,
				rewrappedKeys: [
					{ sharedVaultId: vaultA.id, ...rewrapA },
					{ sharedVaultId: vaultB.id, ...rewrapB },
				],
			});
			expect(completed.status).toBe("completed");

			// Both in-family envelopes were rewrapped and attributed to organizer.
			const aAfter = await envelopeOf(vaultA.id, member.id);
			const bAfter = await envelopeOf(vaultB.id, member.id);
			expect(aAfter!.grantedBy).toBe(organizer.id);
			expect(bAfter!.grantedBy).toBe(organizer.id);
			expect(
				unwrapVaultKey(
					{
						wrappedKey: aAfter!.wrappedKey,
						wrappedKeyNonce: aAfter!.wrappedKeyNonce,
						wrappedKeyAuthTag: aAfter!.wrappedKeyAuthTag,
						ephemeralPublicKey: aAfter!.ephemeralPublicKey,
						senderSignature: aAfter!.senderSignature,
					},
					newCrypto.x25519.privateKey,
					organizer.crypto.ed25519.publicKey,
				).equals(keyA),
			).toBe(true);

			// The foreign vault was never touched.
			const outAfter = await envelopeOf(outVault.id, member.id);
			expect(outAfter!.wrappedKey).toBe(outBefore!.wrappedKey);
		});
	});
});
