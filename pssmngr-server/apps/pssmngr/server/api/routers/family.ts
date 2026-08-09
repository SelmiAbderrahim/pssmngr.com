// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors

import { createPublicKey, verify as edVerify } from "node:crypto";
import {
	invitation,
	member,
	notifications,
	organization,
	recoveryRequest,
	sharedVault,
	sharedVaultMember,
	user,
} from "@pssmngr/server/db/schema";
import { badRequestError, notFoundError } from "@pssmngr/server/i18n/errors";
import { encryptedField } from "@pssmngr/server/lib/encrypted-payload";
import {
	AlreadyMemberError,
	acquireOrganizationLock,
	InvitationAlreadyExistsError,
	reserveInvitationGuarded,
} from "@pssmngr/server/lib/org-membership";
import { TRPCError } from "@trpc/server";
import { and, count, eq, inArray, lt } from "drizzle-orm";
import type { TFunction } from "i18next";
import { z } from "zod/v3";
import { WEBSITE_URL } from "@/server/utils/site-url";
import { type Context, createTRPCRouter, protectedProcedure } from "../trpc";

type FamilyDb = Context["db"];

/**
 * Best-effort notification insert. Notifications are non-critical side effects:
 * a failure to notify (e.g. transient DB error or a notification-table schema
 * mismatch) must never abort a security-critical mutation such as recovery
 * approval or completion.
 */
async function safeNotify(
	db: FamilyDb,
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
			"[family] notification insert skipped:",
			(err as Error).message,
		);
	}
}

/**
 * Verify that the recovering member controls the new Ed25519 signing key they
 * submitted, by checking a detached signature over a canonical proof message.
 * This prevents an attacker who hijacked an approved request from injecting
 * keys they do not own.
 */
function verifyRecoveryProof(
	requestId: string,
	newPublicKey: string,
	newSigningPublicKey: string,
	signature: string,
): boolean {
	try {
		const pub = createPublicKey({
			key: {
				kty: "OKP",
				crv: "Ed25519",
				x: Buffer.from(newSigningPublicKey, "base64").toString("base64url"),
			},
			format: "jwk",
		});
		const message = Buffer.from(`recovery:${requestId}:${newPublicKey}`);
		return edVerify(null, message, pub, Buffer.from(signature, "base64"));
	} catch {
		return false;
	}
}

/** Recovery requests expire after 7 days. */
const RECOVERY_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

const FAMILY_TYPE = "family";

function invitationLink(invitationId: string): string {
	return `${WEBSITE_URL.replace(/\/$/, "")}/invitation?token=${encodeURIComponent(invitationId)}`;
}

/** Parse organization metadata JSON, returning null on failure. */
function parseMeta(raw: string | null): Record<string, unknown> | null {
	if (!raw) return null;
	try {
		return JSON.parse(raw) as Record<string, unknown>;
	} catch {
		return null;
	}
}

/** Check if an organization is a family. */
function isFamily(org: { metadata: string | null }): boolean {
	const meta = parseMeta(org.metadata);
	return meta?.type === FAMILY_TYPE;
}

/**
 * Find the family organization the user belongs to.
 * Returns the member record with the organization attached.
 */
async function getUserFamily(db: FamilyDb, userId: string, t: TFunction) {
	const members = await db.query.member.findMany({
		where: eq(member.userId, userId),
		with: { organization: true },
	});

	const familyMember = members.find((m) => isFamily(m.organization));
	if (!familyMember) {
		throw notFoundError(t, "family");
	}

	return familyMember;
}

/**
 * Non-throwing variant for list endpoints.
 * Returns null instead of throwing when user has no family.
 */
async function tryGetUserFamily(db: FamilyDb, userId: string) {
	const members = await db.query.member.findMany({
		where: eq(member.userId, userId),
		with: { organization: true },
	});
	return members.find((m) => isFamily(m.organization)) || null;
}

/**
 * Verify the user is the organizer (owner) of the given family.
 */
async function requireOrganizer(
	db: FamilyDb,
	userId: string,
	organizationId: string,
	t: TFunction,
) {
	const m = await db.query.member.findFirst({
		where: and(
			eq(member.userId, userId),
			eq(member.organizationId, organizationId),
			eq(member.role, "owner"),
		),
	});

	if (!m) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: t("errors:family.organizerOnly"),
		});
	}

	return m;
}

export const familyRouter = createTRPCRouter({
	/**
	 * Create a family with the current user as organizer.
	 */
	create: protectedProcedure
		.input(
			z
				.object({
					name: z.string().min(1).max(100),
				})
				.strict(),
		)
		.mutation(async ({ input, ctx }) => {
			const org = await ctx.db.transaction(async (tx) => {
				await acquireOrganizationLock(tx, `owner:${ctx.user.id}`);

				// Re-check the one-family capacity while holding the account lock.
				const existing = await tx.query.member.findMany({
					where: eq(member.userId, ctx.user.id),
					with: { organization: true },
				});
				if (existing.some((m) => isFamily(m.organization))) {
					throw new TRPCError({
						code: "CONFLICT",
						message: ctx.t("errors:family.alreadyInFamily"),
					});
				}

				const [created] = await tx
					.insert(organization)
					.values({
						name: input.name,
						ownerId: ctx.user.id,
						createdAt: new Date(),
						metadata: JSON.stringify({ type: FAMILY_TYPE }),
					})
					.returning();
				if (!created) throw new Error("Failed to create family");

				await tx.insert(member).values({
					organizationId: created.id,
					userId: ctx.user.id,
					role: "owner",
					createdAt: new Date(),
				});
				return created;
			});

			return { id: org.id, name: org.name };
		}),

	/**
	 * Get family details for the current user's family.
	 */
	get: protectedProcedure.query(async ({ ctx }) => {
		const familyMember = await getUserFamily(ctx.db, ctx.user.id, ctx.t);
		const org = familyMember.organization;

		const [memberCount] = await ctx.db
			.select({ value: count() })
			.from(member)
			.where(eq(member.organizationId, org.id));
		return {
			id: org.id,
			name: org.name,
			createdAt: org.createdAt,
			memberCount: memberCount?.value ?? 0,
			maxMembers: null,
			role: familyMember.role as "owner" | "member" | "admin",
		};
	}),

	/**
	 * Invite a member to the family by email. Organizer only.
	 */
	inviteMember: protectedProcedure
		.input(
			z
				.object({
					email: z.string().email(),
					role: z.enum(["member", "admin"]).default("member"),
				})
				.strict(),
		)
		.mutation(async ({ input, ctx }) => {
			const familyMember = await getUserFamily(ctx.db, ctx.user.id, ctx.t);
			await requireOrganizer(
				ctx.db,
				ctx.user.id,
				familyMember.organization.id,
				ctx.t,
			);

			const orgId = familyMember.organization.id;

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
					resolveMemberLimit: async () => Number.POSITIVE_INFINITY,
				});
			} catch (error) {
				if (error instanceof AlreadyMemberError) {
					throw new TRPCError({
						code: "CONFLICT",
						message: ctx.t("errors:family.alreadyMember"),
					});
				}
				if (error instanceof InvitationAlreadyExistsError) {
					throw new TRPCError({
						code: "CONFLICT",
						message: ctx.t("errors:family.invitationPending"),
					});
				}
				throw error;
			}

			return {
				id: inv.id,
				email: input.email,
				role: inv.role,
				status: inv.status,
				expiresAt: inv.expiresAt.toISOString(),
				inviteLink: invitationLink(inv.id),
			};
		}),

	/**
	 * List invitations for the current user's family. Organizer only.
	 * Includes accepted/declined/cancelled rows so lifecycle changes are visible
	 * immediately after actions and can be audited from the UI.
	 */
	listInvitations: protectedProcedure.query(async ({ ctx }) => {
		const familyMember = await getUserFamily(ctx.db, ctx.user.id, ctx.t);
		await requireOrganizer(
			ctx.db,
			ctx.user.id,
			familyMember.organization.id,
			ctx.t,
		);

		await ctx.db
			.update(invitation)
			.set({ status: "expired" })
			.where(
				and(
					eq(invitation.organizationId, familyMember.organization.id),
					eq(invitation.status, "pending"),
					lt(invitation.expiresAt, new Date()),
				),
			);

		const invitations = await ctx.db.query.invitation.findMany({
			where: eq(invitation.organizationId, familyMember.organization.id),
			orderBy: (inv, { desc }) => [desc(inv.expiresAt)],
		});

		return invitations.map((inv) => ({
			id: inv.id,
			email: inv.email,
			role: inv.role as "owner" | "admin" | "member" | null,
			status: inv.status,
			expiresAt: inv.expiresAt.toISOString(),
			inviteLink: invitationLink(inv.id),
		}));
	}),

	/**
	 * Refresh an invitation expiry and return its invite link. Organizer only.
	 * This is QA-safe for local/dev flows where outbound email may be disabled:
	 * the UI copies the link, while the server still enforces family scoping.
	 */
	resendInvitation: protectedProcedure
		.input(z.object({ invitationId: z.string().min(1) }).strict())
		.mutation(async ({ input, ctx }) => {
			const familyMember = await getUserFamily(ctx.db, ctx.user.id, ctx.t);
			await requireOrganizer(
				ctx.db,
				ctx.user.id,
				familyMember.organization.id,
				ctx.t,
			);

			const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
			let updated: typeof invitation.$inferSelect;
			try {
				updated = await ctx.db.transaction(async (tx) => {
					const organizationId = familyMember.organization.id;
					await acquireOrganizationLock(tx, organizationId);
					const inv = await tx.query.invitation.findFirst({
						where: and(
							eq(invitation.id, input.invitationId),
							eq(invitation.organizationId, organizationId),
						),
					});

					if (!inv) throw notFoundError(ctx.t, "invitation");
					if (inv.status !== "pending" && inv.status !== "expired") {
						throw badRequestError(
							ctx.t,
							"errors:organization.invitationNotPending",
						);
					}
					const [row] = await tx
						.update(invitation)
						.set({ status: "pending", expiresAt })
						.where(eq(invitation.id, inv.id))
						.returning();
					return row!;
				});
			} catch (error) {
				throw error;
			}

			return {
				id: updated!.id,
				email: updated!.email,
				role: updated!.role,
				status: updated!.status,
				expiresAt: updated!.expiresAt.toISOString(),
				inviteLink: invitationLink(updated!.id),
			};
		}),

	/**
	 * Cancel a pending family invitation. Organizer only.
	 */
	cancelInvitation: protectedProcedure
		.input(z.object({ invitationId: z.string().min(1) }).strict())
		.mutation(async ({ input, ctx }) => {
			const familyMember = await getUserFamily(ctx.db, ctx.user.id, ctx.t);
			await requireOrganizer(
				ctx.db,
				ctx.user.id,
				familyMember.organization.id,
				ctx.t,
			);

			const inv = await ctx.db.query.invitation.findFirst({
				where: and(
					eq(invitation.id, input.invitationId),
					eq(invitation.organizationId, familyMember.organization.id),
				),
			});

			if (!inv) {
				throw notFoundError(ctx.t, "invitation");
			}

			if (inv.status !== "pending") {
				throw badRequestError(
					ctx.t,
					"errors:organization.invitationNotPending",
				);
			}

			await ctx.db
				.update(invitation)
				.set({ status: "cancelled" })
				.where(eq(invitation.id, input.invitationId));

			return { success: true };
		}),

	/**
	 * Remove a member from the family. Organizer only.
	 * Cannot remove self (use `leave` instead).
	 */
	removeMember: protectedProcedure
		.input(z.object({ memberId: z.string().min(1) }).strict())
		.mutation(async ({ input, ctx }) => {
			const familyMember = await getUserFamily(ctx.db, ctx.user.id, ctx.t);
			const organizationId = familyMember.organization.id;
			await ctx.db.transaction(async (tx) => {
				await acquireOrganizationLock(tx, organizationId);
				await requireOrganizer(tx, ctx.user.id, organizationId, ctx.t);

				const target = await tx.query.member.findFirst({
					where: and(
						eq(member.id, input.memberId),
						eq(member.organizationId, organizationId),
					),
				});
				if (!target) throw notFoundError(ctx.t, "member");
				if (target.userId === ctx.user.id || target.role === "owner") {
					throw badRequestError(ctx.t, "errors:family.cannotRemoveSelf");
				}

				const [removed] = await tx
					.delete(member)
					.where(
						and(
							eq(member.id, target.id),
							eq(member.organizationId, organizationId),
							eq(member.userId, target.userId),
						),
					)
					.returning({ id: member.id });
				if (!removed) throw notFoundError(ctx.t, "member");
			});

			return { success: true };
		}),

	/**
	 * List all members of the current user's family.
	 */
	listMembers: protectedProcedure.query(async ({ ctx }) => {
		const familyMember = await tryGetUserFamily(ctx.db, ctx.user.id);
		if (!familyMember) return [];

		const members = await ctx.db.query.member.findMany({
			where: eq(member.organizationId, familyMember.organization.id),
			with: {
				user: {
					columns: { id: true, name: true, email: true, image: true },
				},
			},
			orderBy: (m, { asc }) => [asc(m.createdAt)],
		});

		return members.map((m) => ({
			id: m.id,
			userId: m.userId,
			role: m.role as "owner" | "member" | "admin",
			joinedAt: m.createdAt,
			user: {
				id: m.user.id,
				name: m.user.name,
				email: m.user.email,
				image: m.user.image,
			},
		}));
	}),

	/**
	 * Change a member's role. Organizer only.
	 * Cannot change own role or set someone as owner.
	 */
	setRole: protectedProcedure
		.input(
			z
				.object({
					memberId: z.string().min(1),
					role: z.enum(["member", "admin"]),
				})
				.strict(),
		)
		.mutation(async ({ input, ctx }) => {
			const familyMember = await getUserFamily(ctx.db, ctx.user.id, ctx.t);
			await requireOrganizer(
				ctx.db,
				ctx.user.id,
				familyMember.organization.id,
				ctx.t,
			);

			const target = await ctx.db.query.member.findFirst({
				where: and(
					eq(member.id, input.memberId),
					eq(member.organizationId, familyMember.organization.id),
				),
			});

			if (!target) {
				throw notFoundError(ctx.t, "member");
			}

			if (target.userId === ctx.user.id) {
				throw badRequestError(ctx.t, "errors:family.cannotChangeSelfRole");
			}

			if (target.role === "owner") {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: ctx.t("errors:family.cannotChangeOrganizerRole"),
				});
			}

			const [updated] = await ctx.db
				.update(member)
				.set({ role: input.role })
				.where(eq(member.id, input.memberId))
				.returning();

			return { id: updated!.id, role: updated!.role };
		}),

	/**
	 * Update family name and settings. Organizer only.
	 */
	updateSettings: protectedProcedure
		.input(
			z
				.object({
					name: z.string().min(1).max(100).optional(),
				})
				.strict(),
		)
		.mutation(async ({ input, ctx }) => {
			const familyMember = await getUserFamily(ctx.db, ctx.user.id, ctx.t);
			await requireOrganizer(
				ctx.db,
				ctx.user.id,
				familyMember.organization.id,
				ctx.t,
			);

			const updates: Partial<{ name: string }> = {};
			if (input.name) updates.name = input.name;

			if (Object.keys(updates).length === 0) {
				throw badRequestError(ctx.t, "errors:family.noSettingsToUpdate");
			}

			const [updated] = await ctx.db
				.update(organization)
				.set(updates)
				.where(eq(organization.id, familyMember.organization.id))
				.returning();

			return { id: updated!.id, name: updated!.name };
		}),

	/**
	 * Leave the family. Non-organizer only.
	 * The organizer must transfer ownership or delete the family instead.
	 */
	leave: protectedProcedure.mutation(async ({ ctx }) => {
		const familyMember = await getUserFamily(ctx.db, ctx.user.id, ctx.t);
		const organizationId = familyMember.organization.id;
		await ctx.db.transaction(async (tx) => {
			await acquireOrganizationLock(tx, organizationId);
			const lockedMember = await tx.query.member.findFirst({
				where: and(
					eq(member.userId, ctx.user.id),
					eq(member.organizationId, organizationId),
				),
				with: { organization: true },
			});
			if (!lockedMember || !isFamily(lockedMember.organization)) {
				throw notFoundError(ctx.t, "family");
			}
			if (
				lockedMember.role === "owner" ||
				lockedMember.organization.ownerId === ctx.user.id
			) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: ctx.t("errors:family.organizerCannotLeave"),
				});
			}

			const [removed] = await tx
				.delete(member)
				.where(
					and(
						eq(member.id, lockedMember.id),
						eq(member.userId, ctx.user.id),
						eq(member.organizationId, organizationId),
					),
				)
				.returning({ id: member.id });
			if (!removed) throw notFoundError(ctx.t, "family");
		});

		return { success: true };
	}),

	// -----------------------------------------------------------------------
	// Delegated Recovery
	// -----------------------------------------------------------------------

	/**
	 * Member requests account recovery from the family organizer.
	 * Creates a pending recovery request and notifies the organizer.
	 */
	requestRecovery: protectedProcedure.mutation(async ({ ctx }) => {
		const familyMember = await getUserFamily(ctx.db, ctx.user.id, ctx.t);
		const orgId = familyMember.organization.id;

		if (familyMember.role === "owner") {
			throw badRequestError(
				ctx.t,
				"errors:family.organizerCannotRequestRecovery",
			);
		}

		// Check no active recovery request already exists
		const existing = await ctx.db.query.recoveryRequest.findFirst({
			where: and(
				eq(recoveryRequest.requesterId, ctx.user.id),
				eq(recoveryRequest.familyId, orgId),
				inArray(recoveryRequest.status, ["pending", "approved", "completing"]),
			),
		});

		if (existing) {
			throw new TRPCError({
				code: "CONFLICT",
				message: ctx.t("errors:family.recoveryAlreadyActive"),
			});
		}

		const expiresAt = new Date(Date.now() + RECOVERY_EXPIRY_MS);

		const [req] = await ctx.db
			.insert(recoveryRequest)
			.values({
				familyId: orgId,
				requesterId: ctx.user.id,
				expiresAt,
			})
			.returning();

		// Notify the organizer
		const organizer = await ctx.db.query.member.findFirst({
			where: and(eq(member.organizationId, orgId), eq(member.role, "owner")),
		});

		if (organizer) {
			await safeNotify(ctx.db, {
				userId: organizer.userId,
				category: "security",
				title: ctx.t("errors:family.notifications.recoveryRequestTitle"),
				message: ctx.t("errors:family.notifications.recoveryRequestMessage", {
					name: ctx.user.name || ctx.user.email || "",
				}),
			});
		}

		return {
			id: req!.id,
			status: req!.status,
			expiresAt: req!.expiresAt.toISOString(),
		};
	}),

	/**
	 * Organizer lists pending recovery requests for their family.
	 */
	listRecoveryRequests: protectedProcedure.query(async ({ ctx }) => {
		const familyMember = await tryGetUserFamily(ctx.db, ctx.user.id);
		if (!familyMember) return [];

		const isOrganizer = await ctx.db.query.member.findFirst({
			where: and(
				eq(member.userId, ctx.user.id),
				eq(member.organizationId, familyMember.organization.id),
				eq(member.role, "owner"),
			),
		});
		if (!isOrganizer) return [];

		const requests = await ctx.db.query.recoveryRequest.findMany({
			where: eq(recoveryRequest.familyId, familyMember.organization.id),
			with: {
				requester: {
					columns: { id: true, name: true, email: true, image: true },
				},
			},
			orderBy: (r, { desc }) => [desc(r.requestedAt)],
		});

		return requests.map((r) => ({
			id: r.id,
			status: r.status,
			requestedAt: r.requestedAt.toISOString(),
			expiresAt: r.expiresAt.toISOString(),
			approvedAt: r.approvedAt?.toISOString() ?? null,
			completedAt: r.completedAt?.toISOString() ?? null,
			rejectedAt: r.rejectedAt?.toISOString() ?? null,
			requester: {
				id: r.requester.id,
				name: r.requester.name,
				email: r.requester.email,
				image: r.requester.image,
			},
		}));
	}),

	/**
	 * Organizer approves a recovery request.
	 * The member will then be prompted to create a new master password.
	 */
	approveRecovery: protectedProcedure
		.input(z.object({ requestId: z.string().min(1) }).strict())
		.mutation(async ({ input, ctx }) => {
			const familyMember = await getUserFamily(ctx.db, ctx.user.id, ctx.t);
			await requireOrganizer(
				ctx.db,
				ctx.user.id,
				familyMember.organization.id,
				ctx.t,
			);

			const req = await ctx.db.query.recoveryRequest.findFirst({
				where: and(
					eq(recoveryRequest.id, input.requestId),
					eq(recoveryRequest.familyId, familyMember.organization.id),
				),
			});

			if (!req) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: ctx.t("errors:family.recoveryNotFound"),
				});
			}

			if (req.status !== "pending") {
				throw badRequestError(ctx.t, "errors:family.cannotApproveStatus", {
					status: req.status,
				});
			}

			if (req.expiresAt < new Date()) {
				await ctx.db
					.update(recoveryRequest)
					.set({ status: "expired" })
					.where(eq(recoveryRequest.id, req.id));

				throw badRequestError(ctx.t, "errors:family.recoveryExpired");
			}

			const [updated] = await ctx.db
				.update(recoveryRequest)
				.set({
					status: "approved",
					approverId: ctx.user.id,
					approvedAt: new Date(),
				})
				.where(eq(recoveryRequest.id, req.id))
				.returning();

			// Notify the member
			await safeNotify(ctx.db, {
				userId: req.requesterId,
				category: "security",
				title: ctx.t("errors:family.notifications.recoveryApprovedTitle"),
				message: ctx.t("errors:family.notifications.recoveryApprovedMessage"),
			});

			return {
				id: updated!.id,
				status: updated!.status,
			};
		}),

	/**
	 * Organizer rejects a recovery request.
	 */
	rejectRecovery: protectedProcedure
		.input(z.object({ requestId: z.string().min(1) }).strict())
		.mutation(async ({ input, ctx }) => {
			const familyMember = await getUserFamily(ctx.db, ctx.user.id, ctx.t);
			await requireOrganizer(
				ctx.db,
				ctx.user.id,
				familyMember.organization.id,
				ctx.t,
			);

			const req = await ctx.db.query.recoveryRequest.findFirst({
				where: and(
					eq(recoveryRequest.id, input.requestId),
					eq(recoveryRequest.familyId, familyMember.organization.id),
				),
			});

			if (!req) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: ctx.t("errors:family.recoveryNotFound"),
				});
			}

			if (req.status !== "pending") {
				throw badRequestError(ctx.t, "errors:family.cannotRejectStatus", {
					status: req.status,
				});
			}

			const [updated] = await ctx.db
				.update(recoveryRequest)
				.set({ status: "rejected", rejectedAt: new Date() })
				.where(eq(recoveryRequest.id, req.id))
				.returning();

			// Notify the member
			await safeNotify(ctx.db, {
				userId: req.requesterId,
				category: "security",
				title: ctx.t("errors:family.notifications.recoveryRejectedTitle"),
				message: ctx.t("errors:family.notifications.recoveryRejectedMessage"),
			});

			return { id: updated!.id, status: updated!.status };
		}),

	/**
	 * Member checks their current recovery status.
	 */
	getRecoveryStatus: protectedProcedure.query(async ({ ctx }) => {
		const familyMember = await getUserFamily(ctx.db, ctx.user.id, ctx.t);

		const req = await ctx.db.query.recoveryRequest.findFirst({
			where: and(
				eq(recoveryRequest.requesterId, ctx.user.id),
				eq(recoveryRequest.familyId, familyMember.organization.id),
				inArray(recoveryRequest.status, ["pending", "approved", "completing"]),
			),
			orderBy: (r, { desc }) => [desc(r.requestedAt)],
		});

		if (!req) {
			return null;
		}

		// Auto-expire stale requests
		if (req.expiresAt < new Date()) {
			await ctx.db
				.update(recoveryRequest)
				.set({ status: "expired" })
				.where(eq(recoveryRequest.id, req.id));
			return null;
		}

		return {
			id: req.id,
			status: req.status,
			requestedAt: req.requestedAt.toISOString(),
			expiresAt: req.expiresAt.toISOString(),
			approvedAt: req.approvedAt?.toISOString() ?? null,
		};
	}),

	/**
	 * Member submits new public keys after creating a new master password.
	 * This transitions the request to "completing" so the organizer can
	 * re-wrap shared vault keys.
	 */
	submitNewKeys: protectedProcedure
		.input(
			z
				.object({
					requestId: z.string().min(1),
					newPublicKey: encryptedField,
					newSigningPublicKey: encryptedField,
					// Detached Ed25519 signature (base64) over
					// `recovery:<requestId>:<newPublicKey>`, proving the member
					// controls the new signing key being submitted.
					signature: encryptedField,
				})
				.strict(),
		)
		.mutation(async ({ input, ctx }) => {
			const familyMember = await getUserFamily(ctx.db, ctx.user.id, ctx.t);

			const req = await ctx.db.query.recoveryRequest.findFirst({
				where: and(
					eq(recoveryRequest.id, input.requestId),
					eq(recoveryRequest.requesterId, ctx.user.id),
					eq(recoveryRequest.familyId, familyMember.organization.id),
				),
			});

			if (!req) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: ctx.t("errors:family.recoveryNotFound"),
				});
			}

			if (req.status !== "approved") {
				throw badRequestError(ctx.t, "errors:family.recoveryMustBeApproved");
			}

			// Cryptographically verify the member controls the new signing key.
			if (
				!verifyRecoveryProof(
					req.id,
					input.newPublicKey,
					input.newSigningPublicKey,
					input.signature,
				)
			) {
				throw badRequestError(ctx.t, "errors:family.invalidRecoveryProof");
			}

			const [updated] = await ctx.db
				.update(recoveryRequest)
				.set({
					status: "completing",
					newPublicKey: input.newPublicKey,
					newSigningPublicKey: input.newSigningPublicKey,
				})
				.where(eq(recoveryRequest.id, req.id))
				.returning();

			// Notify organizer to re-wrap shared vault keys
			const organizer = await ctx.db.query.member.findFirst({
				where: and(
					eq(member.organizationId, familyMember.organization.id),
					eq(member.role, "owner"),
				),
			});

			if (organizer) {
				await safeNotify(ctx.db, {
					userId: organizer.userId,
					category: "security",
					title: ctx.t("errors:family.notifications.keysSubmittedTitle"),
					message: ctx.t("errors:family.notifications.keysSubmittedMessage", {
						name: ctx.user.name || ctx.user.email || "",
					}),
				});
			}

			return { id: updated!.id, status: updated!.status };
		}),

	/**
	 * Organizer completes recovery by submitting re-wrapped shared vault keys
	 * for the recovering member. Updates shared_vault_member rows with new
	 * wrapped key envelopes.
	 */
	completeRecovery: protectedProcedure
		.input(
			z
				.object({
					requestId: z.string().min(1),
					rewrappedKeys: z
						.array(
							z.object({
								sharedVaultId: z.string().min(1),
								wrappedKey: encryptedField,
								wrappedKeyNonce: encryptedField,
								wrappedKeyAuthTag: encryptedField,
								ephemeralPublicKey: encryptedField,
								senderSignature: encryptedField,
							}),
						)
						.max(100),
				})
				.strict(),
		)
		.mutation(async ({ input, ctx }) => {
			const familyMember = await getUserFamily(ctx.db, ctx.user.id, ctx.t);
			await requireOrganizer(
				ctx.db,
				ctx.user.id,
				familyMember.organization.id,
				ctx.t,
			);

			const req = await ctx.db.query.recoveryRequest.findFirst({
				where: and(
					eq(recoveryRequest.id, input.requestId),
					eq(recoveryRequest.familyId, familyMember.organization.id),
				),
			});

			if (!req) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: ctx.t("errors:family.recoveryNotFound"),
				});
			}

			if (req.status !== "completing") {
				throw badRequestError(ctx.t, "errors:family.recoveryMustBeCompleting");
			}

			// The recovering user must still belong to THIS family. The expected
			// vault set is derived strictly from the family below, but verifying
			// membership first gives a clear error and closes the case where the
			// member was removed mid-recovery.
			const recoveringMembership = await ctx.db.query.member.findFirst({
				where: and(
					eq(member.userId, req.requesterId),
					eq(member.organizationId, req.familyId),
				),
			});
			if (!recoveringMembership) {
				throw badRequestError(ctx.t, "errors:family.recoveryNotFamilyMember");
			}

			// Reject duplicate vault IDs in the untrusted input up front: a
			// duplicate could otherwise sneak past the exact-set comparison.
			const submittedIds = input.rewrappedKeys.map((rk) => rk.sharedVaultId);
			const submittedSet = new Set(submittedIds);
			if (submittedSet.size !== submittedIds.length) {
				throw badRequestError(ctx.t, "errors:family.recoveryDuplicateVault");
			}

			// Build the authoritative expected set SERVER-SIDE: shared vaults that
			// (a) belong to this family and (b) the recovering member currently
			// belongs to. This is the ONLY set of envelopes recovery may rewrap;
			// vaults outside req.familyId (cross-tenant) are never reachable.
			const expectedRows = await ctx.db
				.select({ sharedVaultId: sharedVaultMember.sharedVaultId })
				.from(sharedVaultMember)
				.innerJoin(
					sharedVault,
					eq(sharedVault.id, sharedVaultMember.sharedVaultId),
				)
				.where(
					and(
						eq(sharedVaultMember.userId, req.requesterId),
						eq(sharedVault.familyId, req.familyId),
					),
				);
			const expectedSet = new Set(expectedRows.map((r) => r.sharedVaultId));

			// An empty key list may only complete recovery when the member has no
			// family shared vaults to rewrap. Otherwise recovery would be marked
			// done while leaving the member without access.
			if (submittedSet.size === 0 && expectedSet.size > 0) {
				throw badRequestError(ctx.t, "errors:family.recoveryNoKeys");
			}

			// The submitted set must EXACTLY match the expected family vault set:
			// no extras (outside-family / non-member vaults) and no missing vaults.
			const setsMatch =
				submittedSet.size === expectedSet.size &&
				[...submittedSet].every((id) => expectedSet.has(id));
			if (!setsMatch) {
				throw badRequestError(ctx.t, "errors:family.recoveryVaultMismatch");
			}

			// Validate-and-write atomically: every envelope update must affect
			// exactly one row, and the request is only marked completed once all
			// updates succeed. Any failure rolls the whole transaction back.
			const updated = await ctx.db.transaction(async (tx) => {
				for (const rk of input.rewrappedKeys) {
					const rows = await tx
						.update(sharedVaultMember)
						.set({
							wrappedKey: rk.wrappedKey,
							wrappedKeyNonce: rk.wrappedKeyNonce,
							wrappedKeyAuthTag: rk.wrappedKeyAuthTag,
							ephemeralPublicKey: rk.ephemeralPublicKey,
							senderSignature: rk.senderSignature,
							// Recovery envelopes are signed by the organizer; record
							// them as the granter so clients verify senderSignature
							// against the organizer's signing key.
							grantedBy: ctx.user.id,
						})
						.where(
							and(
								eq(sharedVaultMember.sharedVaultId, rk.sharedVaultId),
								eq(sharedVaultMember.userId, req.requesterId),
							),
						)
						.returning({ id: sharedVaultMember.id });
					if (rows.length !== 1) {
						throw badRequestError(ctx.t, "errors:family.recoveryRewrapFailed");
					}
				}

				const [row] = await tx
					.update(recoveryRequest)
					.set({ status: "completed", completedAt: new Date() })
					.where(eq(recoveryRequest.id, req.id))
					.returning();
				return row;
			});

			// Notify the member
			await safeNotify(ctx.db, {
				userId: req.requesterId,
				category: "security",
				title: ctx.t("errors:family.notifications.recoveryCompleteTitle"),
				message: ctx.t("errors:family.notifications.recoveryCompleteMessage"),
			});

			return { id: updated!.id, status: updated!.status };
		}),
});
