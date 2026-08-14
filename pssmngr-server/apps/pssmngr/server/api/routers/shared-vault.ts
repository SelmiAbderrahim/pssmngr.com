// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import {
	device,
	member,
	sharedVault,
	sharedVaultItem,
	sharedVaultMember,
} from "@pssmngr/server/db/schema";
import {
	badRequestError,
	forbiddenError,
	notFoundError,
} from "@pssmngr/server/i18n/errors";
import {
	idempotencyKeyZodSchema,
	runWithIdempotency,
} from "@pssmngr/server/idempotency";
import {
	encryptedField,
	encryptedItemFields,
} from "@pssmngr/server/lib/encrypted-payload";
import { sharedVaultPermissionForOrgRole } from "@pssmngr/server/lib/org-permissions";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { TFunction } from "i18next";
import { z } from "zod/v3";
import { type Context, createTRPCRouter, protectedProcedure } from "../trpc";

function activeOrganizationId(
	session: { activeOrganizationId?: string | null } | null,
): string | null {
	return session?.activeOrganizationId || null;
}

/**
 * Resolve the caller's membership + role in an organization. Prefers the
 * explicitly requested org (the client's active workspace) over the session's
 * active organization — the session value lags behind right after login until
 * the client syncs it, and membership is validated either way.
 */
async function getActiveOrgMembership(
	db: DbCtx,
	session: { activeOrganizationId?: string | null } | null,
	userId: string,
	t: TFunction,
	explicitOrgId?: string | null,
) {
	const orgId = explicitOrgId || activeOrganizationId(session);
	if (!orgId) {
		throw notFoundError(t, "organization");
	}
	const m = await db.query.member.findFirst({
		where: and(eq(member.organizationId, orgId), eq(member.userId, userId)),
	});
	if (!m) {
		throw forbiddenError(t, "access");
	}
	return { orgId, role: m.role as "owner" | "admin" | "member" };
}

const FAMILY_TYPE = "family";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseMeta(raw: string | null): Record<string, unknown> | null {
	if (!raw) return null;
	try {
		return JSON.parse(raw) as Record<string, unknown>;
	} catch {
		return null;
	}
}

function isFamily(org: { metadata: string | null }): boolean {
	return parseMeta(org.metadata)?.type === FAMILY_TYPE;
}

type DbCtx = Context["db"];

async function getUserFamily(db: DbCtx, userId: string, t: TFunction) {
	const members = await db.query.member.findMany({
		where: eq(member.userId, userId),
		with: { organization: true },
	});
	const fam = members.find((m) => isFamily(m.organization));
	if (!fam) {
		throw notFoundError(t, "family");
	}
	return fam;
}

/**
 * All distinct Ed25519 signing public keys across the granter's devices.
 *
 * A wrapped-key envelope is signed by whichever device performed the grant —
 * which may now be untrusted or not the most recent. We can't know which one
 * from the stored row, so we return every candidate and let the client (the
 * only party with the recipient private key) try each until the signature
 * verifies. `[0]` is also exposed as the legacy singular field for back-compat.
 */
async function granterSigningKeys(
	db: DbCtx,
	grantedBy: string | null,
): Promise<string[]> {
	if (!grantedBy) return [];
	const devices = await db.query.device.findMany({
		where: eq(device.userId, grantedBy),
		columns: { signingPublicKey: true },
	});
	return [
		...new Set(
			devices.map((d) => d.signingPublicKey).filter((k): k is string => !!k),
		),
	];
}

/** Permission hierarchy: manage > share > edit > view */
const PERM_LEVEL: Record<"view" | "edit" | "share" | "manage", number> = {
	view: 1,
	edit: 2,
	share: 3,
	manage: 4,
};

/** Assert caller has at least `minPerm` on the shared vault. */
async function requireVaultPermission(
	db: DbCtx,
	userId: string,
	vaultId: string,
	minPerm: "view" | "edit" | "share" | "manage",
	t: TFunction,
) {
	const m = await db.query.sharedVaultMember.findFirst({
		where: and(
			eq(sharedVaultMember.sharedVaultId, vaultId),
			eq(sharedVaultMember.userId, userId),
		),
	});
	const callerPermission = m
		? PERM_LEVEL[m.permission as "view" | "edit" | "share" | "manage"]
		: undefined;
	const requiredPermission = PERM_LEVEL[minPerm];
	if (
		!m ||
		callerPermission === undefined ||
		callerPermission < requiredPermission
	) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: t("errors:sharedVault.requiresPermission", {
				permission: minPerm,
			}),
		});
	}
	return m;
}

/**
 * SECURITY (Round 4, fix #33): the vault creator is the anchor manager. A
 * co-equal `manage` member must not be able to evict or demote the creator and
 * seize sole control of the vault. The creator may still change their own row.
 */
function assertCreatorNotDemoted(
	createdBy: string,
	callerId: string,
	currentPermission: string | undefined,
	newPermission: string | undefined,
	t: TFunction,
) {
	if (callerId === createdBy) return;
	if (currentPermission === undefined || newPermission === undefined) return;
	const current = PERM_LEVEL[currentPermission as keyof typeof PERM_LEVEL];
	const next = PERM_LEVEL[newPermission as keyof typeof PERM_LEVEL];
	if (current !== undefined && next !== undefined && next < current) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: t("errors:sharedVault.cannotDemoteCreator"),
		});
	}
}

async function getVaultOrThrow(db: DbCtx, vaultId: string, t: TFunction) {
	const vault = await db.query.sharedVault.findFirst({
		where: eq(sharedVault.id, vaultId),
	});

	if (!vault) {
		throw notFoundError(t, "vault");
	}

	return vault;
}

async function assertFamilyMembers(
	db: DbCtx,
	familyId: string,
	userIds: string[],
	t: TFunction,
) {
	if (new Set(userIds).size !== userIds.length) {
		throw badRequestError(t, "errors:sharedVault.invalidMemberKeys");
	}

	const familyMembers = await db.query.member.findMany({
		where: eq(member.organizationId, familyId),
		columns: { userId: true },
	});
	const familyMemberIds = new Set(familyMembers.map((m) => m.userId));

	if (!userIds.every((userId) => familyMemberIds.has(userId))) {
		throw badRequestError(t, "errors:sharedVault.notFamilyMember");
	}
}

async function assertExactRewrapRecipients(
	db: DbCtx,
	vaultId: string,
	memberKeys: Array<z.infer<typeof memberKeySchema>>,
	t: TFunction,
	removedUserId?: string,
) {
	const vault = await getVaultOrThrow(db, vaultId, t);
	const keyUserIds = memberKeys.map((key) => key.userId);
	await assertFamilyMembers(db, vault.familyId, keyUserIds, t);

	const currentMembers = await db.query.sharedVaultMember.findMany({
		where: eq(sharedVaultMember.sharedVaultId, vaultId),
		columns: { userId: true },
	});
	const expectedUserIds = currentMembers
		.map((m) => m.userId)
		.filter((userId) => userId !== removedUserId)
		.sort();
	const actualUserIds = [...keyUserIds].sort();

	if (
		expectedUserIds.length !== actualUserIds.length ||
		expectedUserIds.some((userId, index) => userId !== actualUserIds[index])
	) {
		throw badRequestError(t, "errors:sharedVault.invalidMemberKeys");
	}
}

async function addMissingSharedVaultMembers(
	db: DbCtx,
	vaultId: string,
	grantedBy: string,
	memberKeys: Array<z.infer<typeof memberKeySchema>>,
) {
	const currentMembers = await db.query.sharedVaultMember.findMany({
		where: eq(sharedVaultMember.sharedVaultId, vaultId),
		columns: { userId: true },
	});
	const currentUserIds = new Set(currentMembers.map((m) => m.userId));
	const missingMemberKeys = memberKeys.filter(
		(mk) => !currentUserIds.has(mk.userId),
	);

	if (missingMemberKeys.length === 0) return;

	await db.insert(sharedVaultMember).values(
		missingMemberKeys.map((mk) => ({
			sharedVaultId: vaultId,
			grantedBy,
			userId: mk.userId,
			permission: mk.permission,
			wrappedKey: mk.wrappedKey,
			wrappedKeyNonce: mk.wrappedKeyNonce,
			wrappedKeyAuthTag: mk.wrappedKeyAuthTag,
			ephemeralPublicKey: mk.ephemeralPublicKey,
			senderSignature: mk.senderSignature,
		})),
	);
}

// ---------------------------------------------------------------------------
// Zod schemas for wrapped key fields (base64 strings from client)
// ---------------------------------------------------------------------------

const wrappedKeySchema = z.object({
	wrappedKey: encryptedField,
	wrappedKeyNonce: encryptedField,
	wrappedKeyAuthTag: encryptedField,
	ephemeralPublicKey: encryptedField,
	senderSignature: encryptedField,
});

const memberKeySchema = z.object({
	userId: z.string().min(1),
	permission: z.enum(["view", "edit", "share", "manage"]).default("view"),
	...wrappedKeySchema.shape,
});

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const sharedVaultRouter = createTRPCRouter({
	/**
	 * Create a shared vault in the caller's family.
	 *
	 * The client generates a random vault key, wraps it for each member,
	 * and sends the wrapped envelopes. The server never sees the plaintext key.
	 */
	create: protectedProcedure
		.input(
			z
				.object({
					name: z.string().min(1).max(100),
					memberKeys: z.array(memberKeySchema).min(1).max(100),
				})
				.strict(),
		)
		.mutation(async ({ input, ctx }) => {
			const fam = await getUserFamily(ctx.db, ctx.user.id, ctx.t);

			// Only organizer (owner) or admin can create shared vaults
			if (fam.role !== "owner" && fam.role !== "admin") {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: ctx.t("errors:sharedVault.insufficientRole"),
				});
			}

			// Verify all target users are family members
			const familyMembers = await ctx.db.query.member.findMany({
				where: eq(member.organizationId, fam.organization.id),
			});
			const familyUserIds = new Set(familyMembers.map((m) => m.userId));

			for (const mk of input.memberKeys) {
				if (!familyUserIds.has(mk.userId)) {
					throw badRequestError(ctx.t, "errors:sharedVault.notFamilyMember");
				}
			}

			// Create shared vault
			const [vault] = await ctx.db
				.insert(sharedVault)
				.values({
					familyId: fam.organization.id,
					name: input.name,
					createdBy: ctx.user.id,
				})
				.returning();

			// Insert per-member wrapped keys
			await ctx.db.insert(sharedVaultMember).values(
				input.memberKeys.map((mk) => ({
					sharedVaultId: vault!.id,
					grantedBy: ctx.user.id,
					userId: mk.userId,
					permission: mk.permission,
					wrappedKey: mk.wrappedKey,
					wrappedKeyNonce: mk.wrappedKeyNonce,
					wrappedKeyAuthTag: mk.wrappedKeyAuthTag,
					ephemeralPublicKey: mk.ephemeralPublicKey,
					senderSignature: mk.senderSignature,
				})),
			);

			return { id: vault!.id, name: vault!.name };
		}),

	createForOrg: protectedProcedure
		.input(
			z
				.object({
					name: z.string().min(1).max(100).optional(),
					memberKeys: z.array(memberKeySchema).min(1).max(100),
				})
				.strict(),
		)
		.mutation(async ({ input, ctx }) => {
			const { orgId, role } = await getActiveOrgMembership(
				ctx.db,
				ctx.session,
				ctx.user.id,
				ctx.t,
			);
			if (role !== "owner" && role !== "admin") {
				throw forbiddenError(ctx.t, "manage");
			}

			const existing = await ctx.db.query.sharedVault.findFirst({
				where: eq(sharedVault.familyId, orgId),
			});
			const orgMembers = await ctx.db.query.member.findMany({
				where: eq(member.organizationId, orgId),
			});
			const orgUserIds = new Set(orgMembers.map((m) => m.userId));
			for (const mk of input.memberKeys) {
				if (!orgUserIds.has(mk.userId)) {
					throw badRequestError(ctx.t, "errors:sharedVault.notFamilyMember");
				}
			}

			if (existing) {
				// SECURITY (Round 4, fix #24): extending an existing vault's
				// membership is a vault-management operation, exactly like
				// addMember. Org owner/admin role alone must not let a non-member
				// insert rows — including their own — with a self-chosen
				// permission (e.g. self-grant "manage" and then rotateKey the
				// real members out).
				await requireVaultPermission(
					ctx.db,
					ctx.user.id,
					existing.id,
					"manage",
					ctx.t,
				);
				await addMissingSharedVaultMembers(
					ctx.db,
					existing.id,
					ctx.user.id,
					input.memberKeys,
				);
				return { id: existing.id, name: existing.name, existed: true };
			}

			const [vault] = await ctx.db
				.insert(sharedVault)
				.values({
					familyId: orgId,
					name: input.name ?? "Organization Vault",
					createdBy: ctx.user.id,
				})
				.returning();

			await addMissingSharedVaultMembers(
				ctx.db,
				vault!.id,
				ctx.user.id,
				input.memberKeys,
			);

			return { id: vault!.id, name: vault!.name, existed: false };
		}),

	getForOrg: protectedProcedure
		.input(
			z
				.object({ organizationId: z.string().min(1).optional() })
				.strict()
				.optional(),
		)
		.query(async ({ input, ctx }) => {
			const { orgId, role } = await getActiveOrgMembership(
				ctx.db,
				ctx.session,
				ctx.user.id,
				ctx.t,
				input?.organizationId,
			);
			const canManage = role === "owner" || role === "admin";

			const vault = await ctx.db.query.sharedVault.findFirst({
				where: eq(sharedVault.familyId, orgId),
			});
			if (!vault) {
				return {
					exists: false,
					canManage,
					vaultId: null as string | null,
					member: false,
				};
			}

			const membership = await ctx.db.query.sharedVaultMember.findFirst({
				where: and(
					eq(sharedVaultMember.sharedVaultId, vault.id),
					eq(sharedVaultMember.userId, ctx.user.id),
				),
			});
			if (!membership) {
				return {
					exists: true,
					canManage,
					vaultId: vault.id as string | null,
					member: false,
				};
			}

			const senderSigningPublicKeys = await granterSigningKeys(
				ctx.db,
				membership.grantedBy,
			);

			// needsRewrap: the member reported their device key lost, but the stale
			// envelope is still returned so the client can retry unwrapping (local
			// key or escrow) and self-heal — a sole manager would otherwise be
			// deadlocked waiting for a re-wrap only they could perform. The envelope
			// was already served to this same user before the flag; no new exposure.
			return {
				exists: true,
				canManage,
				vaultId: vault.id as string | null,
				member: true,
				name: vault.name,
				permission: membership.permission,
				...(membership.needsRewrap ? { needsRewrap: true } : {}),
				wrappedKey: {
					wrappedKey: membership.wrappedKey,
					wrappedKeyNonce: membership.wrappedKeyNonce,
					wrappedKeyAuthTag: membership.wrappedKeyAuthTag,
					ephemeralPublicKey: membership.ephemeralPublicKey,
					senderSignature: membership.senderSignature,
					senderSigningPublicKey: senderSigningPublicKeys[0] ?? null,
					senderSigningPublicKeys,
				},
			};
		}),

	/**
	 * List shared vaults the caller has access to.
	 */
	list: protectedProcedure.query(async ({ ctx }) => {
		const memberships = await ctx.db.query.sharedVaultMember.findMany({
			where: eq(sharedVaultMember.userId, ctx.user.id),
			with: {
				sharedVault: {
					with: {
						members: { columns: { id: true, userId: true, permission: true } },
					},
				},
			},
		});

		return memberships.map((m) => ({
			id: m.sharedVault.id,
			name: m.sharedVault.name,
			permission: m.permission,
			memberCount: m.sharedVault.members.length,
			members: m.sharedVault.members.map((member) => ({
				id: member.id,
				userId: member.userId,
				permission: member.permission,
			})),
			createdAt: m.sharedVault.createdAt,
		}));
	}),

	/**
	 * Get a shared vault's details including the caller's wrapped key.
	 */
	get: protectedProcedure
		.input(z.object({ vaultId: z.string().min(1) }).strict())
		.query(async ({ input, ctx }) => {
			const membership = await requireVaultPermission(
				ctx.db,
				ctx.user.id,
				input.vaultId,
				"view",
				ctx.t,
			);

			const senderSigningPublicKeys = await granterSigningKeys(
				ctx.db,
				membership.grantedBy,
			);

			const vault = await ctx.db.query.sharedVault.findFirst({
				where: eq(sharedVault.id, input.vaultId),
				with: {
					members: {
						with: {
							user: {
								columns: { id: true, name: true, email: true, image: true },
							},
						},
					},
				},
			});

			if (!vault) {
				throw notFoundError(ctx.t, "vault");
			}

			return {
				id: vault.id,
				name: vault.name,
				createdAt: vault.createdAt,
				permission: membership.permission,
				wrappedKey: {
					wrappedKey: membership.wrappedKey,
					wrappedKeyNonce: membership.wrappedKeyNonce,
					wrappedKeyAuthTag: membership.wrappedKeyAuthTag,
					ephemeralPublicKey: membership.ephemeralPublicKey,
					senderSignature: membership.senderSignature,
					senderSigningPublicKey: senderSigningPublicKeys[0] ?? null,
					senderSigningPublicKeys,
				},
				members: vault.members.map((m) => ({
					id: m.id,
					userId: m.userId,
					permission: m.permission,
					user: m.user,
				})),
			};
		}),

	/**
	 * Add a member to a shared vault. Requires manage permission.
	 *
	 * The caller unwraps the vault key on the client, re-wraps it with
	 * the new member's X25519 public key, and sends the wrapped envelope.
	 */
	addMember: protectedProcedure
		.input(
			z
				.object({
					vaultId: z.string().min(1),
					member: memberKeySchema,
				})
				.strict(),
		)
		.mutation(async ({ input, ctx }) => {
			await requireVaultPermission(
				ctx.db,
				ctx.user.id,
				input.vaultId,
				"manage",
				ctx.t,
			);

			// Verify target is a family member
			const vault = await ctx.db.query.sharedVault.findFirst({
				where: eq(sharedVault.id, input.vaultId),
			});
			if (!vault) {
				throw notFoundError(ctx.t, "vault");
			}

			const familyMembers = await ctx.db.query.member.findMany({
				where: eq(member.organizationId, vault.familyId),
			});
			const targetMember = familyMembers.find(
				(m) => m.userId === input.member.userId,
			);
			if (!targetMember) {
				throw badRequestError(ctx.t, "errors:sharedVault.notFamilyMember");
			}

			// Check not already a vault member
			const existing = await ctx.db.query.sharedVaultMember.findFirst({
				where: and(
					eq(sharedVaultMember.sharedVaultId, input.vaultId),
					eq(sharedVaultMember.userId, input.member.userId),
				),
			});
			if (existing) {
				if (!existing.needsRewrap) {
					throw new TRPCError({
						code: "CONFLICT",
						message: ctx.t("errors:sharedVault.alreadyMember"),
					});
				}
				// Re-wrap for a member who lost their device key: replace the
				// envelope, keep the EXISTING permission (no escalation/downgrade
				// via this path), clear the flag.
				await ctx.db
					.update(sharedVaultMember)
					.set({
						grantedBy: ctx.user.id,
						wrappedKey: input.member.wrappedKey,
						wrappedKeyNonce: input.member.wrappedKeyNonce,
						wrappedKeyAuthTag: input.member.wrappedKeyAuthTag,
						ephemeralPublicKey: input.member.ephemeralPublicKey,
						senderSignature: input.member.senderSignature,
						needsRewrap: false,
					})
					.where(eq(sharedVaultMember.id, existing.id));
				return { id: existing.id, userId: input.member.userId };
			}

			const [added] = await ctx.db
				.insert(sharedVaultMember)
				.values({
					sharedVaultId: input.vaultId,
					grantedBy: ctx.user.id,
					userId: input.member.userId,
					// Permission is authoritative from the target's ORG role, not the
					// client-supplied value — a stale/hostile client cannot over- or
					// under-grant. `updatePermission` is the explicit override path.
					permission: sharedVaultPermissionForOrgRole(targetMember.role),
					wrappedKey: input.member.wrappedKey,
					wrappedKeyNonce: input.member.wrappedKeyNonce,
					wrappedKeyAuthTag: input.member.wrappedKeyAuthTag,
					ephemeralPublicKey: input.member.ephemeralPublicKey,
					senderSignature: input.member.senderSignature,
				})
				.returning();

			return { id: added!.id, userId: input.member.userId };
		}),

	/**
	 * Securely remove a member from a shared vault. Requires manage permission.
	 *
	 * Removing a member is inseparable from rotating the vault key: a member who
	 * has ever held the vault key can decrypt any item encrypted under it, so
	 * simply deleting their wrapped-key row leaves the key compromised. The
	 * caller therefore generates a NEW vault key, re-encrypts the items, and
	 * re-wraps the new key for every REMAINING member; the server atomically
	 * replaces all wrapped-key rows (which also removes the departing member).
	 *
	 * `remainingMemberKeys` MUST NOT include the user being removed.
	 */
	removeMember: protectedProcedure
		.input(
			z
				.object({
					vaultId: z.string().min(1),
					userId: z.string().min(1),
					remainingMemberKeys: z.array(memberKeySchema).min(1),
				})
				.strict(),
		)
		.mutation(async ({ input, ctx }) => {
			await requireVaultPermission(
				ctx.db,
				ctx.user.id,
				input.vaultId,
				"manage",
				ctx.t,
			);

			const target = await ctx.db.query.sharedVaultMember.findFirst({
				where: and(
					eq(sharedVaultMember.sharedVaultId, input.vaultId),
					eq(sharedVaultMember.userId, input.userId),
				),
			});

			if (!target) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: ctx.t("errors:sharedVault.memberNotFound"),
				});
			}

			// SECURITY (Round 4, fix #33): only the creator may remove themselves;
			// no other manager can evict the creator and seize sole control.
			const removeVault = await getVaultOrThrow(ctx.db, input.vaultId, ctx.t);
			if (
				input.userId === removeVault.createdBy &&
				ctx.user.id !== removeVault.createdBy
			) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: ctx.t("errors:sharedVault.cannotRemoveCreator"),
				});
			}

			await assertExactRewrapRecipients(
				ctx.db,
				input.vaultId,
				input.remainingMemberKeys,
				ctx.t,
				input.userId,
			);

			// Atomically rotate: drop every wrapped key (including the removed
			// member's) and reinsert the freshly re-wrapped keys for the
			// remaining members. This guarantees no stale key for the removed
			// member survives and that the vault key is rotated in one step.
			await ctx.db.transaction(async (tx) => {
				await tx
					.delete(sharedVaultMember)
					.where(eq(sharedVaultMember.sharedVaultId, input.vaultId));

				await tx.insert(sharedVaultMember).values(
					input.remainingMemberKeys.map((mk) => ({
						sharedVaultId: input.vaultId,
						grantedBy: ctx.user.id,
						userId: mk.userId,
						permission: mk.permission,
						wrappedKey: mk.wrappedKey,
						wrappedKeyNonce: mk.wrappedKeyNonce,
						wrappedKeyAuthTag: mk.wrappedKeyAuthTag,
						ephemeralPublicKey: mk.ephemeralPublicKey,
						senderSignature: mk.senderSignature,
					})),
				);
			});

			return { success: true };
		}),

	/**
	 * List family members who are NOT yet in the given shared vault, along with
	 * their device public key, so a manager can wrap the vault key and grant
	 * access (via `addMember`). Requires manage permission.
	 *
	 * This is the server-side half of the post-accept grant flow: when a new
	 * member joins the family they get no shared-vault access automatically
	 * (the server cannot wrap keys in a zero-knowledge model), so a manager uses
	 * this to discover who needs access and obtain the public key to wrap for.
	 */
	listGrantableMembers: protectedProcedure
		.input(z.object({ vaultId: z.string().min(1) }).strict())
		.query(async ({ input, ctx }) => {
			await requireVaultPermission(
				ctx.db,
				ctx.user.id,
				input.vaultId,
				"manage",
				ctx.t,
			);

			const vault = await ctx.db.query.sharedVault.findFirst({
				where: eq(sharedVault.id, input.vaultId),
			});
			if (!vault) {
				throw notFoundError(ctx.t, "vault");
			}

			const familyMembers = await ctx.db.query.member.findMany({
				where: eq(member.organizationId, vault.familyId),
				with: {
					user: {
						columns: { id: true, name: true, email: true, image: true },
					},
				},
			});

			const vaultMembers = await ctx.db.query.sharedVaultMember.findMany({
				where: eq(sharedVaultMember.sharedVaultId, input.vaultId),
				columns: { userId: true, permission: true, needsRewrap: true },
			});
			const inVault = new Set(vaultMembers.map((m) => m.userId));
			// Members whose device key is lost: offer them for re-wrap alongside
			// never-granted members (addMember upserts + preserves permission).
			const rewrapByUser = new Map(
				vaultMembers
					.filter((m) => m.needsRewrap)
					.map((m) => [m.userId, m.permission]),
			);

			const candidates = familyMembers.filter(
				(m) => !inVault.has(m.userId) || rewrapByUser.has(m.userId),
			);
			const ids = candidates.map((m) => m.userId);
			const devices = ids.length
				? await ctx.db.query.device.findMany({
						where: inArray(device.userId, ids),
						orderBy: (d, { desc }) => [desc(d.trusted), desc(d.lastSeen)],
						columns: { userId: true, publicKey: true, signingPublicKey: true },
					})
				: [];
			const devByUser = new Map<
				string,
				{ publicKey: string; signingPublicKey: string | null }
			>();
			for (const d of devices) {
				if (!devByUser.has(d.userId))
					devByUser.set(d.userId, {
						publicKey: d.publicKey,
						signingPublicKey: d.signingPublicKey,
					});
			}

			return candidates.map((m) => {
				const role = m.role as "owner" | "admin" | "member";
				return {
					userId: m.userId,
					role,
					name: m.user.name,
					email: m.user.email,
					image: m.user.image,
					publicKey: devByUser.get(m.userId)?.publicKey ?? null,
					signingPublicKey: devByUser.get(m.userId)?.signingPublicKey ?? null,
					rewrap: rewrapByUser.has(m.userId),
					// Rewrap members keep their existing permission (no escalation);
					// never-granted members get the permission their org role warrants.
					permission:
						rewrapByUser.get(m.userId) ?? sharedVaultPermissionForOrgRole(role),
				};
			});
		}),

	/**
	 * Member self-service: flag their own membership as needing a re-wrap after
	 * their device private key was irrecoverably lost (pre-escrow grant, cleared
	 * browser storage). Keeps the row + permission; a manager's next vault open
	 * re-wraps via addMember's upsert path. No key material involved.
	 */
	requestRewrap: protectedProcedure
		.input(z.object({ vaultId: z.string().min(1) }).strict())
		.mutation(async ({ input, ctx }) => {
			const membership = await ctx.db.query.sharedVaultMember.findFirst({
				where: and(
					eq(sharedVaultMember.sharedVaultId, input.vaultId),
					eq(sharedVaultMember.userId, ctx.user.id),
				),
			});
			if (!membership) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: ctx.t("errors:sharedVault.memberNotFound"),
				});
			}

			if (!membership.needsRewrap) {
				await ctx.db
					.update(sharedVaultMember)
					.set({ needsRewrap: true })
					.where(eq(sharedVaultMember.id, membership.id));
			}

			return { success: true };
		}),

	/**
	 * Update a member's permission. Requires manage permission.
	 */
	updatePermission: protectedProcedure
		.input(
			z
				.object({
					vaultId: z.string().min(1),
					userId: z.string().min(1),
					permission: z.enum(["view", "edit", "share", "manage"]),
				})
				.strict(),
		)
		.mutation(async ({ input, ctx }) => {
			await requireVaultPermission(
				ctx.db,
				ctx.user.id,
				input.vaultId,
				"manage",
				ctx.t,
			);

			const target = await ctx.db.query.sharedVaultMember.findFirst({
				where: and(
					eq(sharedVaultMember.sharedVaultId, input.vaultId),
					eq(sharedVaultMember.userId, input.userId),
				),
			});

			if (!target) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: ctx.t("errors:sharedVault.memberNotFound"),
				});
			}

			const permVault = await getVaultOrThrow(ctx.db, input.vaultId, ctx.t);
			if (target.userId === permVault.createdBy) {
				assertCreatorNotDemoted(
					permVault.createdBy,
					ctx.user.id,
					target.permission,
					input.permission,
					ctx.t,
				);
			}

			const [updated] = await ctx.db
				.update(sharedVaultMember)
				.set({ permission: input.permission })
				.where(eq(sharedVaultMember.id, target.id))
				.returning();

			return { id: updated!.id, permission: updated!.permission };
		}),

	/**
	 * Rotate vault key — replace all member wrapped keys.
	 *
	 * Called after removing a member. The organizer generates a new vault key,
	 * re-encrypts all items with it, and re-wraps for remaining members.
	 */
	rotateKey: protectedProcedure
		.input(
			z
				.object({
					vaultId: z.string().min(1),
					memberKeys: z.array(memberKeySchema).min(1).max(100),
				})
				.strict(),
		)
		.mutation(async ({ input, ctx }) => {
			await requireVaultPermission(
				ctx.db,
				ctx.user.id,
				input.vaultId,
				"manage",
				ctx.t,
			);

			await assertExactRewrapRecipients(
				ctx.db,
				input.vaultId,
				input.memberKeys,
				ctx.t,
			);

			// SECURITY (Round 4, fix #33): a rotation must not quietly demote
			// the creator's permission via the re-wrapped member entries.
			const rotateVault = await getVaultOrThrow(ctx.db, input.vaultId, ctx.t);
			const creatorCurrent = await ctx.db.query.sharedVaultMember.findFirst({
				where: and(
					eq(sharedVaultMember.sharedVaultId, input.vaultId),
					eq(sharedVaultMember.userId, rotateVault.createdBy),
				),
			});
			const creatorNew = input.memberKeys.find(
				(mk) => mk.userId === rotateVault.createdBy,
			);
			assertCreatorNotDemoted(
				rotateVault.createdBy,
				ctx.user.id,
				creatorCurrent?.permission,
				creatorNew?.permission,
				ctx.t,
			);

			// Delete all existing wrapped keys
			await ctx.db
				.delete(sharedVaultMember)
				.where(eq(sharedVaultMember.sharedVaultId, input.vaultId));

			// Insert new wrapped keys for remaining members
			await ctx.db.insert(sharedVaultMember).values(
				input.memberKeys.map((mk) => ({
					sharedVaultId: input.vaultId,
					grantedBy: ctx.user.id,
					userId: mk.userId,
					permission: mk.permission,
					wrappedKey: mk.wrappedKey,
					wrappedKeyNonce: mk.wrappedKeyNonce,
					wrappedKeyAuthTag: mk.wrappedKeyAuthTag,
					ephemeralPublicKey: mk.ephemeralPublicKey,
					senderSignature: mk.senderSignature,
				})),
			);

			return { success: true };
		}),

	// -----------------------------------------------------------------------
	// Shared vault items — CRUD with permission enforcement
	// -----------------------------------------------------------------------

	/**
	 * List items in a shared vault. Requires view permission.
	 */
	listItems: protectedProcedure
		.input(z.object({ vaultId: z.string().min(1) }).strict())
		.query(async ({ input, ctx }) => {
			await requireVaultPermission(
				ctx.db,
				ctx.user.id,
				input.vaultId,
				"view",
				ctx.t,
			);

			const items = await ctx.db.query.sharedVaultItem.findMany({
				where: and(
					eq(sharedVaultItem.sharedVaultId, input.vaultId),
					isNull(sharedVaultItem.deletedAt),
				),
				orderBy: (i, { desc }) => [desc(i.updatedAt)],
			});

			return items.map((i) => ({
				id: i.id,
				itemType: i.itemType,
				ciphertext: i.ciphertext,
				nonce: i.nonce,
				authTag: i.authTag,
				wrappedDataKey: i.wrappedDataKey,
				wrappedDataKeyNonce: i.wrappedDataKeyNonce,
				wrappedDataKeyAuthTag: i.wrappedDataKeyAuthTag,
				version: i.version,
				createdBy: i.createdBy,
				createdAt: i.createdAt,
				updatedAt: i.updatedAt,
			}));
		}),

	/**
	 * Add an item to a shared vault. Requires edit permission.
	 *
	 * The client encrypts the item with a per-item data key, wraps the data
	 * key with the shared vault key, and sends the encrypted blob.
	 */
	addItem: protectedProcedure
		.input(
			z
				.object({
					vaultId: z.string().min(1),
					itemType: z.enum([
						"login",
						"passkey",
						"identity",
						"card",
						"note",
						"totp",
						"file",
					]),
					...encryptedItemFields,
				})
				.strict(),
		)
		.mutation(async ({ input, ctx }) => {
			await requireVaultPermission(
				ctx.db,
				ctx.user.id,
				input.vaultId,
				"edit",
				ctx.t,
			);

			const [created] = await ctx.db
				.insert(sharedVaultItem)
				.values({
					sharedVaultId: input.vaultId,
					itemType: input.itemType,
					ciphertext: input.ciphertext,
					nonce: input.nonce,
					authTag: input.authTag,
					wrappedDataKey: input.wrappedDataKey,
					wrappedDataKeyNonce: input.wrappedDataKeyNonce,
					wrappedDataKeyAuthTag: input.wrappedDataKeyAuthTag,
					createdBy: ctx.user.id,
				})
				.returning();

			return { id: created!.id };
		}),

	/**
	 * Add multiple encrypted items to a shared vault in one call.
	 *
	 * Mirrors `credentials.batchCreate` for shared vaults so a bulk import
	 * costs one round trip per 50 items instead of one per item.
	 *
	 * - `vaultId` is the caller's shared vault; edit permission on it is
	 *   checked once, before the insert.
	 * - The input is `.strict()` and every item carries only the non-secret
	 *   item type plus `encryptedItemFields`. No plaintext item data, title,
	 *   username, password, URL, note, TOTP secret, or secret-derived
	 *   metadata is accepted.
	 * - All rows are inserted in one statement scoped to `sharedVaultId` and
	 *   `createdBy`, so a caller cannot write into another vault or attribute
	 *   rows to another user.
	 * - The optional idempotency key collapses a retry of a batch that was
	 *   already committed.
	 */
	batchAddItems: protectedProcedure
		.input(
			z
				.object({
					vaultId: z.string().min(1),
					items: z
						.array(
							z
								.object({
									itemType: z.enum([
										"login",
										"passkey",
										"identity",
										"card",
										"note",
										"totp",
										"file",
									]),
									...encryptedItemFields,
								})
								.strict(),
						)
						.min(1)
						.max(50),
					idempotencyKey: idempotencyKeyZodSchema,
				})
				.strict(),
		)
		.mutation(async ({ input, ctx }) => {
			await requireVaultPermission(
				ctx.db,
				ctx.user.id,
				input.vaultId,
				"edit",
				ctx.t,
			);

			return runWithIdempotency({
				db: ctx.db,
				userId: ctx.user.id,
				router: "sharedVault",
				procedure: "batchAddItems",
				key: input.idempotencyKey,
				executor: async () => {
					const created = await ctx.db
						.insert(sharedVaultItem)
						.values(
							input.items.map((i) => ({
								sharedVaultId: input.vaultId,
								itemType: i.itemType,
								ciphertext: i.ciphertext,
								nonce: i.nonce,
								authTag: i.authTag,
								wrappedDataKey: i.wrappedDataKey,
								wrappedDataKeyNonce: i.wrappedDataKeyNonce,
								wrappedDataKeyAuthTag: i.wrappedDataKeyAuthTag,
								createdBy: ctx.user.id,
							})),
						)
						.returning({ id: sharedVaultItem.id });

					return { created: created.length };
				},
			});
		}),

	/**
	 * Update an item in a shared vault. Requires edit permission.
	 */
	updateItem: protectedProcedure
		.input(
			z
				.object({
					vaultId: z.string().min(1),
					itemId: z.string().min(1),
					...encryptedItemFields,
				})
				.strict(),
		)
		.mutation(async ({ input, ctx }) => {
			await requireVaultPermission(
				ctx.db,
				ctx.user.id,
				input.vaultId,
				"edit",
				ctx.t,
			);

			const existing = await ctx.db.query.sharedVaultItem.findFirst({
				where: and(
					eq(sharedVaultItem.id, input.itemId),
					eq(sharedVaultItem.sharedVaultId, input.vaultId),
					isNull(sharedVaultItem.deletedAt),
				),
			});

			if (!existing) {
				throw notFoundError(ctx.t, "item");
			}

			const [updated] = await ctx.db
				.update(sharedVaultItem)
				.set({
					ciphertext: input.ciphertext,
					nonce: input.nonce,
					authTag: input.authTag,
					wrappedDataKey: input.wrappedDataKey,
					wrappedDataKeyNonce: input.wrappedDataKeyNonce,
					wrappedDataKeyAuthTag: input.wrappedDataKeyAuthTag,
					version: existing.version + 1,
				})
				.where(eq(sharedVaultItem.id, input.itemId))
				.returning();

			return { id: updated!.id, version: updated!.version };
		}),

	/**
	 * Soft-delete an item. Requires edit permission.
	 */
	deleteItem: protectedProcedure
		.input(
			z
				.object({
					vaultId: z.string().min(1),
					itemId: z.string().min(1),
				})
				.strict(),
		)
		.mutation(async ({ input, ctx }) => {
			await requireVaultPermission(
				ctx.db,
				ctx.user.id,
				input.vaultId,
				"edit",
				ctx.t,
			);

			const existing = await ctx.db.query.sharedVaultItem.findFirst({
				where: and(
					eq(sharedVaultItem.id, input.itemId),
					eq(sharedVaultItem.sharedVaultId, input.vaultId),
					isNull(sharedVaultItem.deletedAt),
				),
			});

			if (!existing) {
				throw notFoundError(ctx.t, "item");
			}

			await ctx.db
				.update(sharedVaultItem)
				.set({ deletedAt: new Date() })
				.where(eq(sharedVaultItem.id, input.itemId));

			return { success: true };
		}),
});
