// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import {
	badRequestError,
	getSystemEmailProvider,
	getUserEmailLanguage,
	IS_CLOUD,
	internalError,
	isEmailConfigured,
	notFoundError,
	permissionError,
	renderLocalizedEmail,
	// i18n error helpers
	unauthorizedError,
	updateFailedError,
} from "@pssmngr/server";
import { db } from "@pssmngr/server/db";
import {
	apiUpdateGuideMe,
	apiUpdateLanguage,
	apiUpdateLayoutTemplate,
	invitation,
	member,
	organization as organizationTable,
	user,
} from "@pssmngr/server/db/schema";
import {
	buildSearchPattern,
	calculateOffset,
	createPaginatedResponse,
	paginationInputSchema,
} from "@pssmngr/server/utils/pagination";
import { TRPCError } from "@trpc/server";
import { and, asc, count, desc, eq, gt, inArray, like, or } from "drizzle-orm";
import { z } from "zod/v3";
import { WEBSITE_URL } from "@/server/utils/site-url";
import { adminProcedure, createTRPCRouter, protectedProcedure } from "../trpc";

const userProfileUpdateSchema = z
	.object({
		image: z.string().nullable().optional(),
		name: z.string().trim().min(1).max(100),
	})
	.strict();

async function findOrganizationById(organizationId: string) {
	return db.query.organization.findFirst({
		where: eq(organizationTable.id, organizationId),
		with: { owner: true },
	});
}

export const userRouter = createTRPCRouter({
	all: adminProcedure
		.input(
			z
				.object({
					role: z.enum(["admin", "member", "owner"]).optional(),
				})
				.merge(paginationInputSchema)
				.strict()
				.optional(),
		)
		.query(async ({ input, ctx }) => {
			const { page, limit, search, sortBy, sortOrder, role } =
				paginationInputSchema
					.extend({
						role: z.enum(["admin", "member", "owner"]).optional(),
					})
					.parse(input ?? {});
			const offset = calculateOffset(page, limit);

			// Build where conditions for the member table
			const conditions: ReturnType<typeof eq>[] = [];

			// Organization filter (multi-tenant isolation)
			conditions.push(
				eq(member.organizationId, ctx.session.activeOrganizationId),
			);

			// Role filter on member table
			if (role) {
				conditions.push(eq(member.role, role));
			}

			// Search filter on related user fields (email, name, lastName)
			// Uses a subquery to find matching user IDs
			if (search) {
				const searchPattern = buildSearchPattern(search);
				const matchingUserIds = db
					.select({ id: user.id })
					.from(user)
					.where(
						or(
							like(user.email, searchPattern),
							like(user.name, searchPattern),
							like(user.lastName, searchPattern),
						),
					);
				conditions.push(inArray(member.userId, matchingUserIds));
			}

			const whereCondition =
				conditions.length > 0 ? and(...conditions) : undefined;

			// Get total count
			const [countResult] = await db
				.select({ total: count() })
				.from(member)
				.where(whereCondition);

			const total = countResult?.total ?? 0;

			// Determine sort column and direction
			// Allow sorting by member fields (role, createdAt) or user fields via a mapping
			const memberSortColumns: Record<
				string,
				typeof member.createdAt | typeof member.role
			> = {
				createdAt: member.createdAt,
				role: member.role,
			};

			const orderColumn = memberSortColumns[sortBy] || member.createdAt;
			const orderDirection =
				sortOrder === "asc" ? asc(orderColumn) : desc(orderColumn);

			// Get paginated data with user relation
			const data = await db.query.member.findMany({
				where: whereCondition,
				with: {
					user: true,
				},
				limit,
				offset,
				orderBy: [orderDirection],
			});

			const response = createPaginatedResponse(data, total, page, limit);
			return {
				...response,
				totalItems: response.pagination.total,
			};
		}),
	one: protectedProcedure
		.input(
			z
				.object({
					userId: z.string(),
				})
				.strict(),
		)
		.query(async ({ input, ctx }) => {
			const memberResult = await db.query.member.findFirst({
				where: and(
					eq(member.userId, input.userId),
					eq(member.organizationId, ctx.session?.activeOrganizationId || ""),
				),
				with: {
					user: true,
				},
			});

			// If user not found in the organization, deny access
			if (!memberResult) {
				throw notFoundError(ctx.t, "user");
			}

			// Allow access if:
			// 1. User is requesting their own information
			// 2. User has owner role (admin permissions) AND user is in the same organization
			if (
				memberResult.userId !== ctx.user.id &&
				ctx.user.role !== "owner" &&
				ctx.user.role !== "admin"
			) {
				throw unauthorizedError(ctx.t, "user");
			}

			if (!memberResult) return null;

			return {
				...memberResult,
				id: memberResult.userId,
				user: {
					...memberResult.user,
					firstName: memberResult.user.name,
					lastName: memberResult.user.lastName ?? "",
				},
			};
		}),
	get: protectedProcedure.query(async ({ ctx }) => {
		const memberResult = await db.query.member.findFirst({
			where: and(
				eq(member.userId, ctx.user.id),
				eq(member.organizationId, ctx.session?.activeOrganizationId || ""),
			),
			with: { user: true },
		});

		if (!memberResult) return null;

		return {
			...memberResult,
			id: memberResult.userId,
			user: {
				...memberResult.user,
				firstName: memberResult.user.name,
				lastName: memberResult.user.lastName ?? "",
			},
		};
	}),
	haveRootAccess: protectedProcedure.query(async ({ ctx }) => {
		if (!IS_CLOUD) {
			return false;
		}
		if (
			process.env.USER_ADMIN_ID === ctx.user.id ||
			ctx.session?.impersonatedBy === process.env.USER_ADMIN_ID
		) {
			return true;
		}
		return false;
	}),
	updateProfile: protectedProcedure
		.input(userProfileUpdateSchema)
		.mutation(async ({ input, ctx }) => {
			try {
				const [updated] = await db
					.update(user)
					.set({
						name: input.name,
						image: input.image,
						updatedAt: new Date(),
					})
					.where(eq(user.id, ctx.user.id))
					.returning();
				if (!updated) throw new Error("User not found");
				return updated;
			} catch (error) {
				throw updateFailedError(ctx.t, "user", error);
			}
		}),
	remove: protectedProcedure
		.input(
			z
				.object({
					userId: z.string(),
				})
				.strict(),
		)
		.mutation(async ({ input, ctx }) => {
			if (IS_CLOUD) {
				return true;
			}

			// Ensure the acting user has admin privileges in the active organization
			if (ctx.user.role !== "owner" && ctx.user.role !== "admin") {
				throw badRequestError(ctx.t, "errors:organization.onlyOwnersAdmins");
			}

			// Fetch target member within the active organization
			const targetMember = await db.query.member.findFirst({
				where: and(
					eq(member.userId, input.userId),
					eq(member.organizationId, ctx.session?.activeOrganizationId || ""),
				),
			});

			if (!targetMember) {
				throw notFoundError(ctx.t, "user");
			}

			// Never allow deleting the organization owner via this endpoint
			if (targetMember.role === "owner") {
				throw permissionError(ctx.t, "user.cannotDeleteOwner");
			}

			// Admin self-protection: an admin cannot delete themselves
			if (targetMember.role === "admin" && input.userId === ctx.user.id) {
				throw permissionError(ctx.t, "user.adminsCannotDeleteSelf");
			}

			// Only owners can delete admins
			// Admins can only delete members
			if (ctx.user.role === "admin" && targetMember.role === "admin") {
				throw permissionError(ctx.t, "user.onlyOwnerCanDeleteAdmins");
			}

			await db
				.delete(member)
				.where(
					and(
						eq(member.userId, input.userId),
						eq(member.organizationId, ctx.session.activeOrganizationId),
					),
				);

			return { success: true };
		}),
	assignPermissions: adminProcedure
		.input(
			z
				.object({
					id: z.string(),
					// SECURITY: "owner" is intentionally NOT assignable here. Ownership
					// transfer must go through `organization.transferOwnership`, which
					// atomically demotes the previous owner. Allowing "owner" on this
					// admin-level endpoint let any admin self-promote to organization
					// owner (full privilege escalation).
					role: z.enum(["admin", "member"]),
				})
				.strict(),
		)
		.mutation(async ({ input, ctx }) => {
			const org = await findOrganizationById(ctx.session.activeOrganizationId);

			if (org?.ownerId !== ctx.user.ownerId) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: ctx.t("errors:permissions.forbidden"),
				});
			}

			// The target must be a member of the caller's active organization, and
			// the organization owner can never be demoted through this path (that
			// would let an admin strip the real owner's privileges).
			const targetMember = await db.query.member.findFirst({
				where: and(
					eq(member.userId, input.id),
					eq(member.organizationId, ctx.session.activeOrganizationId),
				),
			});
			if (!targetMember) {
				throw notFoundError(ctx.t, "user");
			}
			if (targetMember.role === "owner") {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: ctx.t("errors:organization.cannotChangeOwnerRole"),
				});
			}

			await db
				.update(member)
				.set({ role: input.role })
				.where(
					and(
						eq(member.userId, input.id),
						eq(member.organizationId, ctx.session.activeOrganizationId),
					),
				);

			return { success: true };
		}),
	getInvitations: protectedProcedure.query(async ({ ctx }) => {
		return await db.query.invitation.findMany({
			where: and(
				eq(invitation.email, ctx.user.email),
				gt(invitation.expiresAt, new Date()),
				eq(invitation.status, "pending"),
			),
			with: {
				organization: true,
			},
		});
	}),

	checkUserOrganizations: protectedProcedure
		.input(
			z
				.object({
					userId: z.string(),
				})
				.strict(),
		)
		.query(async ({ input, ctx }) => {
			// Users can check their own organizations
			// Admins and owners can check organizations of members in their active organization
			if (input.userId !== ctx.user.id) {
				// Verify the target user is a member of the active organization
				const targetMember = await db.query.member.findFirst({
					where: and(
						eq(member.userId, input.userId),
						eq(member.organizationId, ctx.session?.activeOrganizationId || ""),
					),
				});

				if (!targetMember) {
					throw badRequestError(ctx.t, "errors:organization.userNotMember");
				}

				// Only admins and owners can check other users' organizations
				if (ctx.user.role !== "owner" && ctx.user.role !== "admin") {
					throw badRequestError(ctx.t, "errors:organization.onlyOwnersAdmins");
				}
			}

			const organizations = await db.query.member.findMany({
				where: eq(member.userId, input.userId),
			});

			return organizations.length;
		}),
	sendInvitation: adminProcedure
		.input(
			z
				.object({
					invitationId: z.string().min(1),
					notificationId: z.string().optional(),
				})
				.strict(),
		)
		.mutation(async ({ input, ctx }) => {
			if (IS_CLOUD) {
				return;
			}

			const currentInvitation = await db.query.invitation.findFirst({
				where: eq(invitation.id, input.invitationId),
			});

			if (!currentInvitation?.email) {
				throw badRequestError(ctx.t, "errors:email.invitationNotFound");
			}

			// Use SITE_URL environment variable for invitation links
			const inviteLink = `${WEBSITE_URL}/invitation?token=${input.invitationId}`;

			const organization = await findOrganizationById(
				ctx.session.activeOrganizationId,
			);

			// Get invitee's language preference (if they have an account)
			const inviteeUser = await db.query.user.findFirst({
				where: eq(user.email, currentInvitation.email),
				columns: { id: true },
			});
			const inviteeLanguage = await getUserEmailLanguage(inviteeUser?.id);

			// Render localized email content
			const rendered = await renderLocalizedEmail(
				"invitation",
				inviteeLanguage,
				{
					organization: organization?.name || "Password Manager",
					role: currentInvitation.role || "",
					inviter: ctx.user.name || ctx.user.email || "",
					actionUrl: inviteLink,
				},
			);

			const { subject, html: htmlContent, text: textContent } = rendered;

			if (!isEmailConfigured()) {
				throw badRequestError(ctx.t, "errors:email.notConfigured");
			}

			try {
				const provider = getSystemEmailProvider();
				const result = await provider.send({
					to: currentInvitation.email,
					subject,
					html: htmlContent,
					text: textContent,
				});

				if (!result.success) {
					throw new Error(result.error);
				}
			} catch (error) {
				console.error(
					"[sendInvitation] Failed to send invitation email:",
					error,
				);
				throw internalError(ctx.t, error);
			}

			return inviteLink;
		}),

	// Language preference endpoints
	getLanguage: protectedProcedure.query(async ({ ctx }) => {
		const result = await db.query.user.findFirst({
			where: eq(user.id, ctx.user.id),
			columns: { preferredLanguage: true },
		});
		return result?.preferredLanguage || null;
	}),

	updateLanguage: protectedProcedure
		.input(apiUpdateLanguage)
		.mutation(async ({ input, ctx }) => {
			try {
				await db
					.update(user)
					.set({ preferredLanguage: input.preferredLanguage })
					.where(eq(user.id, ctx.user.id));
				return { success: true };
			} catch (error) {
				throw updateFailedError(ctx.t, "language preference", error);
			}
		}),

	// Layout template preference endpoints
	getLayoutTemplate: protectedProcedure.query(async ({ ctx }) => {
		const result = await db.query.user.findFirst({
			where: eq(user.id, ctx.user.id),
			columns: { layoutTemplate: true },
		});
		return result?.layoutTemplate || "default";
	}),

	updateLayoutTemplate: protectedProcedure
		.input(apiUpdateLayoutTemplate)
		.mutation(async ({ input, ctx }) => {
			try {
				await db
					.update(user)
					.set({ layoutTemplate: input.layoutTemplate })
					.where(eq(user.id, ctx.user.id));
				return { success: true };
			} catch (error) {
				throw updateFailedError(ctx.t, "layout template", error);
			}
		}),

	// Guided-tour (Guide me) opt-in preference. Default true when absent.
	getGuideMe: protectedProcedure.query(async ({ ctx }) => {
		const result = await db.query.user.findFirst({
			where: eq(user.id, ctx.user.id),
			columns: { guideMe: true },
		});
		return result?.guideMe ?? true;
	}),

	updateGuideMe: protectedProcedure
		.input(apiUpdateGuideMe)
		.mutation(async ({ input, ctx }) => {
			try {
				await db
					.update(user)
					.set({ guideMe: input.guideMe })
					.where(eq(user.id, ctx.user.id));
				return { success: true };
			} catch (error) {
				throw updateFailedError(ctx.t, "guide me preference", error);
			}
		}),
});
