// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors

import { sendLocalizedInvitation } from "@pssmngr/server";
import {
	invitation,
	member,
	notifications,
	organization,
	session as sessionTable,
	sharedVault,
	sharedVaultMember,
	user,
} from "@pssmngr/server/db/schema";
import { badRequestError, notFoundError } from "@pssmngr/server/i18n/errors";
import {
	AlreadyMemberError,
	acceptMembershipGuarded,
	acquireOrganizationLock,
	createOwnedOrganizationGuarded,
	InvitationAlreadyExistsError,
	InvitationNotAcceptableError,
	reserveInvitationGuarded,
} from "@pssmngr/server/lib/org-membership";
import {
	requirePermission,
	sharedVaultPermissionForOrgRole,
} from "@pssmngr/server/lib/org-permissions";
import { TRPCError } from "@trpc/server";
import { and, asc, count, desc, eq, inArray, lt } from "drizzle-orm";
import { z } from "zod/v3";
import { slugify } from "@/lib/slug";
import { WEBSITE_URL } from "@/server/utils/site-url";
import { type Context, createTRPCRouter, protectedProcedure } from "../trpc";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type DbType = Context["db"];
type ProtectedCtx = Context & {
	user: NonNullable<Context["user"]>;
	session: NonNullable<Context["session"]>;
};

async function listOrganizationsForUser(ctx: ProtectedCtx) {
	const memberships = await ctx.db.query.member.findMany({
		where: eq(member.userId, ctx.user.id),
		with: { organization: true },
		orderBy: [desc(member.isDefault), asc(member.createdAt)],
	});
	const organizationMemberships = memberships.filter(
		(m) => !isFamilyOrganization(m.organization),
	);

	return Promise.all(
		organizationMemberships.map(async (m) => {
			const org = m.organization;
			const [memberCountResult] = await ctx.db
				.select({ value: count() })
				.from(member)
				.where(eq(member.organizationId, org.id));

			return {
				id: org.id,
				name: org.name,
				slug: org.slug,
				logo: org.logo,
				ownerId: org.ownerId,
				createdAt: org.createdAt,
				members: [m],
				memberCount: memberCountResult?.value ?? 0,
				maxMembers: null,
				role: m.role as "owner" | "admin" | "member",
				isDefault: m.isDefault,
				isPersonal:
					parseMeta(org.metadata)?.type === "personal" ||
					(org.name === "My Organization" &&
						org.ownerId === ctx.user.id &&
						(memberCountResult?.value ?? 0) <= 1),
			};
		}),
	);
}

async function revokeSharedVaultAccessForOrgMember(
	dbCtx: Context["db"],
	organizationId: string,
	userId: string,
) {
	const orgVaults = await dbCtx.query.sharedVault.findMany({
		where: eq(sharedVault.familyId, organizationId),
		columns: { id: true },
	});
	const vaultIds = orgVaults.map((vault) => vault.id);

	if (vaultIds.length === 0) return;

	await dbCtx
		.delete(sharedVaultMember)
		.where(
			and(
				inArray(sharedVaultMember.sharedVaultId, vaultIds),
				eq(sharedVaultMember.userId, userId),
			),
		);
}

/**
 * Keep a member's shared-vault permission in sync with their org role. Called
 * after an org role change: promoting member→admin lifts `view`→`manage`,
 * demoting reverses. Only touches EXISTING grant rows (authz-only, no key
 * material); a member with no shared-vault access is unaffected.
 */
async function syncSharedVaultPermissionForOrgRole(
	dbCtx: Context["db"],
	organizationId: string,
	userId: string,
	role: "owner" | "admin" | "member",
) {
	const orgVaults = await dbCtx.query.sharedVault.findMany({
		where: eq(sharedVault.familyId, organizationId),
		columns: { id: true },
	});
	const vaultIds = orgVaults.map((vault) => vault.id);

	if (vaultIds.length === 0) return;

	await dbCtx
		.update(sharedVaultMember)
		.set({ permission: sharedVaultPermissionForOrgRole(role) })
		.where(
			and(
				inArray(sharedVaultMember.sharedVaultId, vaultIds),
				eq(sharedVaultMember.userId, userId),
			),
		);
}

async function getOrganizationForUser(
	ctx: ProtectedCtx,
	organizationId: string,
) {
	const orgMember = await requireOrgMembership(
		ctx.db,
		ctx.user.id,
		organizationId,
		ctx.t,
	);

	requirePermission(orgMember.role, "self:viewProfile", ctx.t);

	const org = orgMember.organization;
	const [memberCountResult] = await ctx.db
		.select({ value: count() })
		.from(member)
		.where(eq(member.organizationId, org.id));

	return {
		id: org.id,
		name: org.name,
		slug: org.slug,
		logo: org.logo,
		ownerId: org.ownerId,
		createdAt: org.createdAt,
		memberCount: memberCountResult?.value ?? 0,
		maxMembers: null,
		role: orgMember.role as "owner" | "admin" | "member",
	};
}

async function safeNotify(
	db: DbType,
	value: {
		userId: string;
		category: "security" | "sharing" | "system";
		title: string;
		message: string;
	},
): Promise<void> {
	try {
		await db.insert(notifications).values(value);
	} catch (err) {
		console.warn(
			"[organization] notification insert skipped:",
			(err as Error).message,
		);
	}
}

function parseMeta(raw: string | null): Record<string, unknown> | null {
	if (!raw) return null;
	try {
		return JSON.parse(raw) as Record<string, unknown>;
	} catch {
		return null;
	}
}

function isFamilyOrganization(org: { metadata: string | null }): boolean {
	return parseMeta(org.metadata)?.type === "family";
}

/**
 * Verify that the current user is a member of the specified organization.
 * Returns the member record with the organization attached.
 * Throws FORBIDDEN if the user is not a member.
 */
async function requireOrgMembership(
	db: DbType,
	userId: string,
	organizationId: string,
	t: Context["t"],
) {
	const orgMember = await db.query.member.findFirst({
		where: and(
			eq(member.userId, userId),
			eq(member.organizationId, organizationId),
		),
		with: { organization: true },
	});

	if (!orgMember) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: t("errors:organization.notMember"),
		});
	}

	return orgMember;
}

/**
 * Both public creation names route through the same locked capacity mutation.
 */
async function createOrganizationForUser(
	ctx: ProtectedCtx,
	input: { name: string; slug: string; logo?: string | null },
) {
	try {
		return await createOwnedOrganizationGuarded(ctx.db, {
			userId: ctx.user.id,
			name: input.name,
			slug: input.slug,
			logo: input.logo,
			resolveLimit: () => Promise.resolve(Number.POSITIVE_INFINITY),
		});
	} catch (error) {
		throw error;
	}
}

async function deleteOrganizationRows(
	ctx: ProtectedCtx,
	organizationId: string,
): Promise<void> {
	await ctx.db.transaction(async (tx) => {
		await acquireOrganizationLock(tx, organizationId);
		const ownedOrganization = await tx.query.organization.findFirst({
			where: and(
				eq(organization.id, organizationId),
				eq(organization.ownerId, ctx.user.id),
			),
			columns: { id: true },
		});
		if (!ownedOrganization) {
			throw new TRPCError({
				code: "FORBIDDEN",
				message: ctx.t("errors:organization.notOwner"),
			});
		}

		await tx
			.delete(invitation)
			.where(eq(invitation.organizationId, organizationId));
		await tx.delete(member).where(eq(member.organizationId, organizationId));
		await tx.delete(organization).where(eq(organization.id, organizationId));
	});
}

/**
 * Mark all past-due "pending" invitations as "expired".
 * Called lazily during getMyPendingInvitations so stale rows
 * never surface to users.
 */
async function expireStaleInvitations(db: DbType): Promise<number> {
	const result = await db
		.update(invitation)
		.set({ status: "expired" })
		.where(
			and(
				eq(invitation.status, "pending"),
				lt(invitation.expiresAt, new Date()),
			),
		)
		.returning({ id: invitation.id });

	return result.length;
}

export const organizationRouter = createTRPCRouter({
	// -----------------------------------------------------------------------
	// Multi-org procedures
	// -----------------------------------------------------------------------

	/**
	 * List all organizations the current user is a member of.
	 * Returns organization metadata, membership role, and member count.
	 * Ordered by isDefault DESC, createdAt ASC.
	 */
	listMyOrganizations: protectedProcedure.query(async ({ ctx }) => {
		return listOrganizationsForUser(ctx);
	}),

	all: protectedProcedure.query(async ({ ctx }) => {
		return listOrganizationsForUser(ctx);
	}),

	/**
	 * Create a new organization.
	 * Available to every authenticated user.
	 */
	createOrganization: protectedProcedure
		.input(
			z
				.object({
					name: z.string().min(1).max(100),
					slug: z.string().min(1).max(50).optional(),
				})
				.strict(),
		)
		.mutation(async ({ ctx, input }) => {
			const orgSlug = input.slug ? slugify(input.slug) : slugify(input.name);
			const result = await createOrganizationForUser(ctx, {
				name: input.name,
				slug: orgSlug,
			});

			return {
				id: result.id,
				name: result.name,
				slug: result.slug,
			};
		}),

	create: protectedProcedure
		.input(
			z
				.object({
					name: z.string().min(1).max(100),
					logo: z.string().optional(),
				})
				.strict(),
		)
		.mutation(async ({ ctx, input }) => {
			const result = await createOrganizationForUser(ctx, {
				name: input.name,
				slug: slugify(input.name),
				logo: input.logo || null,
			});

			return { id: result.id, name: result.name, slug: result.slug };
		}),

	/**
	 * Delete an organization. Owner only.
	 * Cascade deletes members and invitations.
	 * Reassigns default if the deleted org was the default.
	 */
	deleteOrganization: protectedProcedure
		.input(z.object({ organizationId: z.string().min(1) }).strict())
		.mutation(async ({ ctx, input }) => {
			const orgMember = await requireOrgMembership(
				ctx.db,
				ctx.user.id,
				input.organizationId,
				ctx.t,
			);

			requirePermission(orgMember.role, "org:delete", ctx.t);

			const wasDefault = orgMember.isDefault;
			const orgId = input.organizationId;

			await deleteOrganizationRows(ctx, orgId);

			// If this was the default org, set another one as default
			if (wasDefault) {
				const nextMembership = await ctx.db.query.member.findFirst({
					where: eq(member.userId, ctx.user.id),
					orderBy: [asc(member.createdAt)],
				});

				if (nextMembership) {
					await ctx.db
						.update(member)
						.set({ isDefault: true })
						.where(eq(member.id, nextMembership.id));
				}
			}

			return { success: true };
		}),

	delete: protectedProcedure
		.input(z.object({ organizationId: z.string().min(1) }).strict())
		.mutation(async ({ ctx, input }) => {
			const orgMember = await requireOrgMembership(
				ctx.db,
				ctx.user.id,
				input.organizationId,
				ctx.t,
			);
			requirePermission(orgMember.role, "org:delete", ctx.t);

			await deleteOrganizationRows(ctx, input.organizationId);

			return { success: true };
		}),

	/**
	 * Set a specific organization as the user's default.
	 * Verifies the user is a member of the target org.
	 */
	setDefaultOrganization: protectedProcedure
		.input(z.object({ organizationId: z.string().min(1) }).strict())
		.mutation(async ({ ctx, input }) => {
			// Verify user is a member
			await requireOrgMembership(
				ctx.db,
				ctx.user.id,
				input.organizationId,
				ctx.t,
			);

			// Unset all defaults for this user, then set the target
			await ctx.db.transaction(async (tx) => {
				// Get all memberships for user
				const allMemberships = await tx.query.member.findMany({
					where: eq(member.userId, ctx.user.id),
				});

				// Unset all defaults
				for (const m of allMemberships) {
					if (m.isDefault) {
						await tx
							.update(member)
							.set({ isDefault: false })
							.where(eq(member.id, m.id));
					}
				}

				// Set the target as default
				const target = allMemberships.find(
					(m) => m.organizationId === input.organizationId,
				);
				if (target) {
					await tx
						.update(member)
						.set({ isDefault: true })
						.where(eq(member.id, target.id));
				}
			});

			return { success: true };
		}),

	setDefault: protectedProcedure
		.input(z.object({ organizationId: z.string().min(1) }).strict())
		.mutation(async ({ ctx, input }) => {
			await requireOrgMembership(
				ctx.db,
				ctx.user.id,
				input.organizationId,
				ctx.t,
			);

			await ctx.db.transaction(async (tx) => {
				const allMemberships = await tx.query.member.findMany({
					where: eq(member.userId, ctx.user.id),
				});

				for (const m of allMemberships) {
					await tx
						.update(member)
						.set({ isDefault: m.organizationId === input.organizationId })
						.where(eq(member.id, m.id));
				}
			});

			return { success: true };
		}),

	setActiveWorkspace: protectedProcedure
		.input(z.object({ organizationId: z.string().min(1) }).strict())
		.mutation(async ({ ctx, input }) => {
			await requireOrgMembership(
				ctx.db,
				ctx.user.id,
				input.organizationId,
				ctx.t,
			);

			await ctx.db
				.update(sessionTable)
				.set({
					activeOrganizationId: input.organizationId,
					updatedAt: new Date(),
				})
				.where(
					and(
						eq(sessionTable.id, ctx.session.id),
						eq(sessionTable.userId, ctx.user.id),
					),
				);

			return { organizationId: input.organizationId };
		}),

	// -----------------------------------------------------------------------
	// Existing procedures (updated to accept explicit organizationId)
	// -----------------------------------------------------------------------

	/**
	 * Get a specific organization with the user's role.
	 * Requires explicit organizationId.
	 */
	getMyOrganization: protectedProcedure
		.input(
			z
				.object({
					organizationId: z.string().min(1),
				})
				.strict(),
		)
		.query(async ({ ctx, input }) => {
			return getOrganizationForUser(ctx, input.organizationId);
		}),

	one: protectedProcedure
		.input(z.object({ organizationId: z.string().min(1) }).strict())
		.query(async ({ ctx, input }) => {
			return getOrganizationForUser(ctx, input.organizationId);
		}),

	/**
	 * Update organization name/slug. Owner or admin only.
	 */
	updateOrganization: protectedProcedure
		.input(
			z
				.object({
					organizationId: z.string().min(1),
					name: z.string().min(1).max(100).optional(),
					slug: z.string().min(1).max(50).optional(),
				})
				.strict(),
		)
		.mutation(async ({ ctx, input }) => {
			const orgMember = await requireOrgMembership(
				ctx.db,
				ctx.user.id,
				input.organizationId,
				ctx.t,
			);

			requirePermission(orgMember.role, "org:update", ctx.t);

			const updates: Partial<{ name: string; slug: string }> = {};
			if (input.name) updates.name = input.name;
			if (input.slug) updates.slug = input.slug;

			if (Object.keys(updates).length === 0) {
				throw badRequestError(ctx.t, "errors:organization.noSettingsToUpdate");
			}

			const [updated] = await ctx.db
				.update(organization)
				.set(updates)
				.where(eq(organization.id, input.organizationId))
				.returning();

			return { id: updated!.id, name: updated!.name, slug: updated!.slug };
		}),

	update: protectedProcedure
		.input(
			z
				.object({
					organizationId: z.string().min(1),
					name: z.string().min(1).max(100).optional(),
					logo: z.string().optional(),
				})
				.strict(),
		)
		.mutation(async ({ ctx, input }) => {
			const orgMember = await requireOrgMembership(
				ctx.db,
				ctx.user.id,
				input.organizationId,
				ctx.t,
			);
			requirePermission(orgMember.role, "org:update", ctx.t);

			const [updated] = await ctx.db
				.update(organization)
				.set({
					...(input.name
						? { name: input.name, slug: slugify(input.name) }
						: {}),
					...(input.logo !== undefined ? { logo: input.logo || null } : {}),
				})
				.where(eq(organization.id, input.organizationId))
				.returning();

			return { id: updated!.id, name: updated!.name, slug: updated!.slug };
		}),

	/**
	 * List members of a specific organization with user details.
	 */
	listMembers: protectedProcedure
		.input(
			z
				.object({
					organizationId: z.string().min(1),
					limit: z.number().min(1).max(50).default(20),
					offset: z.number().min(0).default(0),
				})
				.strict(),
		)
		.query(async ({ ctx, input }) => {
			const orgMember = await requireOrgMembership(
				ctx.db,
				ctx.user.id,
				input.organizationId,
				ctx.t,
			);

			requirePermission(orgMember.role, "member:list", ctx.t);

			const orgId = input.organizationId;

			const [totalCount] = await ctx.db
				.select({ value: count() })
				.from(member)
				.where(eq(member.organizationId, orgId));

			const members = await ctx.db.query.member.findMany({
				where: eq(member.organizationId, orgId),
				with: {
					user: {
						columns: { id: true, name: true, email: true, image: true },
					},
				},
				orderBy: (m, { asc: a }) => [a(m.createdAt)],
				limit: input.limit,
				offset: input.offset,
			});

			return {
				members: members.map((m) => ({
					id: m.id,
					userId: m.userId,
					role: m.role as "owner" | "admin" | "member",
					joinedAt: m.createdAt,
					user: {
						id: m.user.id,
						name: m.user.name,
						email: m.user.email,
						image: m.user.image,
					},
				})),
				total: totalCount?.value ?? 0,
			};
		}),

	/**
	 * Invite a new member to the organization by email.
	 * Owner or admin only.
	 */
	inviteMember: protectedProcedure
		.input(
			z
				.object({
					organizationId: z.string().min(1),
					email: z.string().email(),
					role: z.enum(["member", "admin"]).default("member"),
				})
				.strict(),
		)
		.mutation(async ({ ctx, input }) => {
			const orgMember = await requireOrgMembership(
				ctx.db,
				ctx.user.id,
				input.organizationId,
				ctx.t,
			);

			const orgId = input.organizationId;
			requirePermission(orgMember.role, "member:invite", ctx.t);

			// Check not already a member
			const existingUser = await ctx.db.query.user.findFirst({
				where: eq(user.email, input.email),
			});

			// Create invitation (expires in 7 days)
			const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
			let inv: typeof invitation.$inferSelect;
			try {
				inv = await reserveInvitationGuarded(ctx.db, {
					id: crypto.randomUUID(),
					organizationId: orgId,
					email: input.email,
					role: input.role,
					inviterId: ctx.user.id,
					expiresAt,
					userId: existingUser?.id,
					resolveMemberLimit: () => Promise.resolve(Number.POSITIVE_INFINITY),
				});
			} catch (error) {
				if (error instanceof AlreadyMemberError) {
					throw new TRPCError({
						code: "CONFLICT",
						message: ctx.t("errors:organization.alreadyMember"),
					});
				}
				if (error instanceof InvitationAlreadyExistsError) {
					throw new TRPCError({
						code: "CONFLICT",
						message: ctx.t("errors:organization.inviteAlreadyExists"),
					});
				}
				throw error;
			}

			// Brand-new invitees sign up themselves from the acceptance page;
			// no account is provisioned here.
			const inviteeUserId = existingUser?.id ?? null;

			// Send the invitation email (best-effort; never block the invite on mail failure)
			try {
				const inviteLink = `${WEBSITE_URL}/invitation?token=${inv.id}`;
				await sendLocalizedInvitation({
					to: input.email,
					inviteeUserId,
					organization: orgMember.organization.name,
					inviter: ctx.user.name || ctx.user.email || "",
					role: input.role,
					actionUrl: inviteLink,
				});
			} catch (err) {
				console.error(
					"[organization.inviteMember] invitation email failed:",
					err,
				);
			}

			// Notify invitee if they have an account
			if (existingUser) {
				await safeNotify(ctx.db, {
					userId: existingUser.id,
					category: "sharing",
					title: ctx.t("errors:organization.notifications.inviteTitle"),
					message: ctx.t("errors:organization.notifications.inviteMessage", {
						orgName: orgMember.organization.name,
					}),
				});
			}

			return {
				id: inv.id,
				email: input.email,
				expiresAt: inv.expiresAt.toISOString(),
			};
		}),

	/**
	 * Remove a member from the organization. Owner or admin only.
	 * Cannot remove the owner.
	 */
	removeMember: protectedProcedure
		.input(
			z
				.object({
					organizationId: z.string().min(1),
					memberId: z.string().min(1),
				})
				.strict(),
		)
		.mutation(async ({ ctx, input }) => {
			const orgId = input.organizationId;
			const { target, organizationName } = await ctx.db.transaction(
				async (tx) => {
					await acquireOrganizationLock(tx, orgId);
					const actor = await requireOrgMembership(
						tx,
						ctx.user.id,
						orgId,
						ctx.t,
					);
					requirePermission(actor.role, "member:remove", ctx.t);

					const target = await tx.query.member.findFirst({
						where: and(
							eq(member.id, input.memberId),
							eq(member.organizationId, orgId),
						),
						with: {
							user: {
								columns: { id: true, name: true, email: true },
							},
						},
					});
					if (!target) throw notFoundError(ctx.t, "member");
					if (
						target.role === "owner" ||
						actor.organization.ownerId === target.userId
					) {
						throw new TRPCError({
							code: "FORBIDDEN",
							message: ctx.t("errors:organization.cannotRemoveOwner"),
						});
					}

					await revokeSharedVaultAccessForOrgMember(tx, orgId, target.userId);
					const [removed] = await tx
						.delete(member)
						.where(
							and(
								eq(member.id, target.id),
								eq(member.organizationId, orgId),
								eq(member.userId, target.userId),
							),
						)
						.returning({ id: member.id });
					if (!removed) throw notFoundError(ctx.t, "member");

					return {
						target,
						organizationName: actor.organization.name,
					};
				},
			);

			// Notify removed member
			await safeNotify(ctx.db, {
				userId: target.userId,
				category: "system",
				title: ctx.t("errors:organization.notifications.removedTitle"),
				message: ctx.t("errors:organization.notifications.removedMessage", {
					orgName: organizationName,
				}),
			});

			return { success: true };
		}),

	/**
	 * Update a member's role. Owner only.
	 * Cannot change the owner's role.
	 */
	updateMemberRole: protectedProcedure
		.input(
			z
				.object({
					organizationId: z.string().min(1).optional(),
					memberId: z.string().min(1),
					role: z.enum(["member", "admin"]),
				})
				.strict(),
		)
		.mutation(async ({ ctx, input }) => {
			const orgId = input.organizationId || ctx.session.activeOrganizationId;
			const orgMember = await requireOrgMembership(
				ctx.db,
				ctx.user.id,
				orgId,
				ctx.t,
			);

			requirePermission(orgMember.role, "member:updateRole", ctx.t);

			const target = await ctx.db.query.member.findFirst({
				where: and(
					eq(member.id, input.memberId),
					eq(member.organizationId, orgId),
				),
			});

			if (!target) {
				throw notFoundError(ctx.t, "member");
			}

			if (target.role === "owner") {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: ctx.t("errors:organization.cannotChangeOwnerRole"),
				});
			}

			const [updated] = await ctx.db
				.update(member)
				.set({ role: input.role })
				.where(eq(member.id, input.memberId))
				.returning();

			// Keep the member's shared-vault access in step with their new role.
			await syncSharedVaultPermissionForOrgRole(
				ctx.db,
				orgId,
				target.userId,
				input.role,
			);

			return { id: updated!.id, role: updated!.role };
		}),

	/**
	 * List pending and expired invitations for a specific organization.
	 */
	listInvitations: protectedProcedure
		.input(
			z
				.object({
					organizationId: z.string().min(1).optional(),
				})
				.strict()
				.optional(),
		)
		.query(async ({ ctx, input }) => {
			const orgId = input?.organizationId || ctx.session.activeOrganizationId;
			const orgMember = await requireOrgMembership(
				ctx.db,
				ctx.user.id,
				orgId,
				ctx.t,
			);

			requirePermission(orgMember.role, "invitation:list", ctx.t);

			const invitations = await ctx.db.query.invitation.findMany({
				where: eq(invitation.organizationId, orgId),
				orderBy: (inv, { desc: d }) => [d(inv.expiresAt)],
			});
			const now = new Date();

			return invitations.map((inv) => ({
				id: inv.id,
				email: inv.email,
				role: inv.role as "owner" | "admin" | "member" | null,
				status:
					inv.status === "pending" && inv.expiresAt <= now
						? "expired"
						: inv.status,
				expiresAt: inv.expiresAt.toISOString(),
				inviterId: inv.inviterId,
			}));
		}),

	allInvitations: protectedProcedure.query(async ({ ctx }) => {
		const orgId = ctx.session.activeOrganizationId;
		if (!orgId) return [];

		const orgMember = await requireOrgMembership(
			ctx.db,
			ctx.user.id,
			orgId,
			ctx.t,
		);
		requirePermission(orgMember.role, "invitation:list", ctx.t);

		const invitations = await ctx.db.query.invitation.findMany({
			where: eq(invitation.organizationId, orgId),
			orderBy: (inv, { desc: d }) => [d(inv.expiresAt)],
		});
		const now = new Date();

		return invitations.map((inv) => ({
			id: inv.id,
			email: inv.email,
			role: inv.role as "owner" | "admin" | "member" | null,
			status:
				inv.status === "pending" && inv.expiresAt <= now
					? "expired"
					: inv.status,
			expiresAt: inv.expiresAt.toISOString(),
			inviterId: inv.inviterId,
		}));
	}),

	/**
	 * Cancel a pending invitation. Owner or admin only.
	 */
	cancelInvitation: protectedProcedure
		.input(
			z
				.object({
					organizationId: z.string().min(1),
					invitationId: z.string().min(1),
				})
				.strict(),
		)
		.mutation(async ({ ctx, input }) => {
			const orgMember = await requireOrgMembership(
				ctx.db,
				ctx.user.id,
				input.organizationId,
				ctx.t,
			);

			const orgId = input.organizationId;
			requirePermission(orgMember.role, "invitation:cancel", ctx.t);

			const inv = await ctx.db.query.invitation.findFirst({
				where: and(
					eq(invitation.id, input.invitationId),
					eq(invitation.organizationId, orgId),
				),
			});

			if (!inv) {
				throw notFoundError(ctx.t, "invitation");
			}

			if (inv.status !== "pending") {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: ctx.t("errors:organization.invitationNotPending"),
				});
			}

			await ctx.db
				.update(invitation)
				.set({ status: "cancelled" })
				.where(eq(invitation.id, input.invitationId));

			return { success: true };
		}),

	removeInvitation: protectedProcedure
		.input(z.object({ invitationId: z.string().min(1) }).strict())
		.mutation(async ({ ctx, input }) => {
			const inv = await ctx.db.query.invitation.findFirst({
				where: eq(invitation.id, input.invitationId),
			});

			if (!inv) {
				throw notFoundError(ctx.t, "invitation");
			}

			const orgMember = await requireOrgMembership(
				ctx.db,
				ctx.user.id,
				inv.organizationId,
				ctx.t,
			);
			requirePermission(orgMember.role, "invitation:cancel", ctx.t);

			await ctx.db
				.update(invitation)
				.set({ status: "cancelled" })
				.where(eq(invitation.id, input.invitationId));

			return { success: true };
		}),

	// -----------------------------------------------------------------------
	// Invitation handling (unchanged, user-scoped by email)
	// -----------------------------------------------------------------------

	/**
	 * Get all pending invitations for the current user's email.
	 * Lazily expires stale invitations before querying.
	 */
	getMyPendingInvitations: protectedProcedure.query(async ({ ctx }) => {
		const userEmail = ctx.user.email;

		// Expire stale invitations first
		await expireStaleInvitations(ctx.db);

		const pendingInvitations = await ctx.db.query.invitation.findMany({
			where: and(
				eq(invitation.email, userEmail),
				eq(invitation.status, "pending"),
			),
			with: {
				organization: {
					columns: { id: true, name: true, logo: true, metadata: true },
				},
			},
			orderBy: (inv, { desc: d }) => [d(inv.expiresAt)],
		});

		return pendingInvitations.map((inv) => ({
			id: inv.id,
			email: inv.email,
			role: inv.role as "owner" | "admin" | "member" | null,
			status: inv.status,
			expiresAt: inv.expiresAt.toISOString(),
			organization: {
				id: inv.organization.id,
				name: inv.organization.name,
				logo: inv.organization.logo,
				isFamily: isFamilyOrganization(inv.organization),
			},
		}));
	}),

	/**
	 * Accept a pending invitation. Creates a member record and marks the
	 * invitation as accepted.
	 */
	acceptInvitation: protectedProcedure
		.input(z.object({ invitationId: z.string().min(1) }).strict())
		.mutation(async ({ ctx, input }) => {
			// 1. Find the invitation
			const inv = await ctx.db.query.invitation.findFirst({
				where: eq(invitation.id, input.invitationId),
				with: {
					organization: {
						columns: { id: true, name: true, logo: true, metadata: true },
					},
				},
			});

			if (!inv) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: ctx.t("errors:organization.invitationNotFound"),
				});
			}

			// 2. Validate email matches
			if (inv.email !== ctx.user.email) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: ctx.t("errors:organization.emailMismatch"),
				});
			}

			// 3. Validate status is pending
			if (inv.status !== "pending") {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: ctx.t("errors:organization.invitationExpired"),
				});
			}

			// 4. Validate not expired
			if (inv.expiresAt < new Date()) {
				// Mark as expired in DB
				await ctx.db
					.update(invitation)
					.set({ status: "expired" })
					.where(eq(invitation.id, inv.id));

				throw new TRPCError({
					code: "BAD_REQUEST",
					message: ctx.t("errors:organization.invitationExpired"),
				});
			}

			// 5+6. Membership check, dynamic member-limit check, and insert run in
			//    ONE transaction holding the org's advisory lock (see
			//    @pssmngr/server/lib/org-membership): concurrent acceptances
			//    would otherwise both pass the count check and race past the
			//    limit (or insert duplicate member rows).
			//
			//    Count ACTUAL members only (not pending invitations): the
			//    invitation being accepted is itself still "pending" at this
			//    point, so counting pending rows would always block the final
			//    slot and a family could never reach its full size.
			try {
				await acceptMembershipGuarded(ctx.db, {
					organizationId: inv.organizationId,
					userId: ctx.user.id,
					email: ctx.user.email,
					invitationId: inv.id,
					resolveMemberLimit: () => Promise.resolve(Number.POSITIVE_INFINITY),
				});
			} catch (err) {
				if (err instanceof InvitationNotAcceptableError) {
					if (err.reason === "email_mismatch") {
						throw new TRPCError({
							code: "FORBIDDEN",
							message: ctx.t("errors:organization.emailMismatch"),
						});
					}
					if (
						err.reason === "not_found" ||
						err.reason === "organization_mismatch"
					) {
						throw new TRPCError({
							code: "NOT_FOUND",
							message: ctx.t("errors:organization.invitationNotFound"),
						});
					}
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: ctx.t("errors:organization.invitationExpired"),
					});
				}
				if (err instanceof AlreadyMemberError) {
					throw new TRPCError({
						code: "CONFLICT",
						message: ctx.t("errors:organization.alreadyMember"),
					});
				}
				throw err;
			}

			return {
				organization: {
					id: inv.organization.id,
					name: inv.organization.name,
					logo: inv.organization.logo,
					isFamily: isFamilyOrganization(inv.organization),
				},
			};
		}),

	/**
	 * Transfer organization ownership to another member.
	 * Only the current owner can transfer ownership.
	 * The current owner becomes an admin after transfer.
	 */
	transferOwnership: protectedProcedure
		.input(
			z
				.object({
					organizationId: z.string().min(1),
					newOwnerId: z.string().min(1),
				})
				.strict(),
		)
		.mutation(async ({ ctx, input }) => {
			const orgMember = await requireOrgMembership(
				ctx.db,
				ctx.user.id,
				input.organizationId,
				ctx.t,
			);

			const orgId = input.organizationId;
			requirePermission(orgMember.role, "org:transfer", ctx.t);

			// Cannot transfer to yourself
			if (input.newOwnerId === ctx.user.id) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: ctx.t("errors:organization.transferTargetNotMember"),
				});
			}

			try {
				await ctx.db.transaction(async (tx) => {
					await acquireOrganizationLock(tx, `owner:${input.newOwnerId}`);
					await acquireOrganizationLock(tx, orgId);

					const currentOwner = await tx.query.member.findFirst({
						where: and(
							eq(member.userId, ctx.user.id),
							eq(member.organizationId, orgId),
						),
					});
					if (!currentOwner) {
						throw new TRPCError({
							code: "FORBIDDEN",
							message: ctx.t("errors:organization.notMember"),
						});
					}
					requirePermission(currentOwner.role, "org:transfer", ctx.t);

					const ownedOrganization = await tx.query.organization.findFirst({
						where: and(
							eq(organization.id, orgId),
							eq(organization.ownerId, ctx.user.id),
						),
						columns: { metadata: true },
					});
					if (!ownedOrganization) {
						throw new TRPCError({
							code: "FORBIDDEN",
							message: ctx.t("errors:organization.notOwner"),
						});
					}

					const targetMember = await tx.query.member.findFirst({
						where: and(
							eq(member.userId, input.newOwnerId),
							eq(member.organizationId, orgId),
						),
					});
					if (!targetMember) {
						throw new TRPCError({
							code: "BAD_REQUEST",
							message: ctx.t("errors:organization.transferTargetNotMember"),
						});
					}

					await tx
						.update(member)
						.set({ role: "admin" })
						.where(eq(member.id, currentOwner.id));
					await tx
						.update(member)
						.set({ role: "owner" })
						.where(eq(member.id, targetMember.id));
					await tx
						.update(organization)
						.set({ ownerId: input.newOwnerId })
						.where(
							and(
								eq(organization.id, orgId),
								eq(organization.ownerId, ctx.user.id),
							),
						);
				});
			} catch (error) {
				throw error;
			}

			// Notify the new owner
			await safeNotify(ctx.db, {
				userId: input.newOwnerId,
				category: "system",
				title: ctx.t(
					"errors:organization.notifications.ownershipTransferredTitle",
				),
				message: ctx.t(
					"errors:organization.notifications.ownershipTransferredMessage",
					{
						orgName: orgMember.organization.name,
					},
				),
			});

			return { success: true };
		}),

	/**
	 * Leave an organization. Only non-owner members can leave.
	 * Owners must transfer ownership before leaving.
	 */
	leaveOrganization: protectedProcedure
		.input(
			z
				.object({
					organizationId: z.string().min(1),
				})
				.strict(),
		)
		.mutation(async ({ ctx, input }) => {
			await ctx.db.transaction(async (tx) => {
				await acquireOrganizationLock(tx, input.organizationId);
				const orgMember = await requireOrgMembership(
					tx,
					ctx.user.id,
					input.organizationId,
					ctx.t,
				);

				// Check both denormalized owner markers while holding the same
				// lock as ownership transfer.
				requirePermission(
					orgMember.organization.ownerId === ctx.user.id
						? "owner"
						: orgMember.role,
					"self:leave",
					ctx.t,
				);

				await revokeSharedVaultAccessForOrgMember(
					tx,
					input.organizationId,
					ctx.user.id,
				);
				const [removed] = await tx
					.delete(member)
					.where(
						and(
							eq(member.id, orgMember.id),
							eq(member.userId, ctx.user.id),
							eq(member.organizationId, input.organizationId),
						),
					)
					.returning({ id: member.id });
				if (!removed) throw notFoundError(ctx.t, "member");
			});

			return { success: true };
		}),

	/**
	 * Decline a pending invitation. Marks the invitation as "declined".
	 */
	declineInvitation: protectedProcedure
		.input(z.object({ invitationId: z.string().min(1) }).strict())
		.mutation(async ({ ctx, input }) => {
			const inv = await ctx.db.query.invitation.findFirst({
				where: eq(invitation.id, input.invitationId),
			});

			if (!inv) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: ctx.t("errors:organization.invitationNotFound"),
				});
			}

			// Validate email matches
			if (inv.email !== ctx.user.email) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: ctx.t("errors:organization.emailMismatch"),
				});
			}

			await ctx.db
				.update(invitation)
				.set({ status: "declined" })
				.where(eq(invitation.id, inv.id));

			return { success: true };
		}),
});
