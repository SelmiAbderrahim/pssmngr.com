// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * In-app notifications tRPC router.
 *
 * All procedures require authentication. Ownership is enforced —
 * users can only access their own notifications.
 *
 */

import { isEmailConfigured } from "@pssmngr/server";
import {
	deleteNotification,
	getUnreadCount,
	getUserNotifications,
	markAllAsRead,
	markAsRead,
} from "@pssmngr/server/services/notification";
import { TRPCError } from "@trpc/server";
import { z } from "zod/v3";
import { createTRPCRouter, protectedProcedure } from "../trpc";

export const notificationsRouter = createTRPCRouter({
	getEmailProviders: protectedProcedure.query(() => {
		if (!isEmailConfigured()) return [];

		return [{ notificationId: "system", name: "System email provider" }];
	}),

	/** Paginated list of notifications for the current user. */
	list: protectedProcedure
		.input(
			z
				.object({
					limit: z.number().min(1).max(50).default(20),
					offset: z.number().min(0).default(0),
					unreadOnly: z.boolean().default(false),
				})
				.strict(),
		)
		.query(async ({ ctx, input }) => {
			return getUserNotifications({
				userId: ctx.user.id,
				limit: input.limit,
				offset: input.offset,
				unreadOnly: input.unreadOnly,
			});
		}),

	/** Number of unread notifications for the current user. */
	getUnreadCount: protectedProcedure.query(async ({ ctx }) => {
		const unreadCount = await getUnreadCount(ctx.user.id);
		return { count: unreadCount };
	}),

	/** Mark a single notification as read. */
	markAsRead: protectedProcedure
		.input(z.object({ notificationId: z.string().min(1) }).strict())
		.mutation(async ({ ctx, input }) => {
			const updated = await markAsRead(input.notificationId, ctx.user.id);
			if (!updated) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: ctx.t("errors:notification.notFound"),
				});
			}
			return { success: true };
		}),

	/** Mark all notifications as read for the current user. */
	markAllAsRead: protectedProcedure.mutation(async ({ ctx }) => {
		await markAllAsRead(ctx.user.id);
		return { success: true };
	}),

	/** Delete a notification. */
	delete: protectedProcedure
		.input(z.object({ notificationId: z.string().min(1) }).strict())
		.mutation(async ({ ctx, input }) => {
			const deleted = await deleteNotification(
				input.notificationId,
				ctx.user.id,
			);
			if (!deleted) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: ctx.t("errors:notification.notFound"),
				});
			}
			return { success: true };
		}),
});
