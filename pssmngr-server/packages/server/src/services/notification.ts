// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * In-app notification service for password-manager.
 *
 * Handles CRUD operations for user notifications stored in PostgreSQL.
 * External providers (Slack, Discord, Telegram, etc.) are deferred to a future release.
 */

import { and, count, desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "../db";
import { notifications } from "../db/schema";

export interface CreateNotificationParams {
	userId: string;
	category: "security" | "sharing" | "system";
	title: string;
	message: string;
}

export interface GetUserNotificationsParams {
	userId: string;
	limit?: number;
	offset?: number;
	unreadOnly?: boolean;
}

/**
 * Create a new in-app notification for a user.
 */
export async function createNotification(params: CreateNotificationParams) {
	const [created] = await db
		.insert(notifications)
		.values({
			notificationId: nanoid(),
			userId: params.userId,
			category: params.category,
			title: params.title,
			message: params.message,
		})
		.returning();

	return created!;
}

/**
 * Get paginated notifications for a user, newest first.
 */
export async function getUserNotifications(params: GetUserNotificationsParams) {
	const conditions = [eq(notifications.userId, params.userId)];

	if (params.unreadOnly) {
		conditions.push(eq(notifications.read, false));
	}

	const where = and(...conditions);

	const [rows, [total]] = await Promise.all([
		db
			.select()
			.from(notifications)
			.where(where)
			.orderBy(desc(notifications.createdAt))
			.limit(params.limit ?? 20)
			.offset(params.offset ?? 0),
		db.select({ count: count() }).from(notifications).where(where),
	]);

	return { notifications: rows, total: total!.count };
}

/**
 * Count unread notifications for a user.
 */
export async function getUnreadCount(userId: string): Promise<number> {
	const [result] = await db
		.select({ count: count() })
		.from(notifications)
		.where(
			and(eq(notifications.userId, userId), eq(notifications.read, false)),
		);

	return result!.count;
}

/**
 * Mark a single notification as read. Verifies ownership.
 */
export async function markAsRead(
	notificationId: string,
	userId: string,
): Promise<boolean> {
	const [updated] = await db
		.update(notifications)
		.set({ read: true })
		.where(
			and(
				eq(notifications.notificationId, notificationId),
				eq(notifications.userId, userId),
			),
		)
		.returning({ notificationId: notifications.notificationId });

	return !!updated;
}

/**
 * Mark all unread notifications for a user as read.
 */
export async function markAllAsRead(userId: string): Promise<void> {
	await db
		.update(notifications)
		.set({ read: true })
		.where(
			and(eq(notifications.userId, userId), eq(notifications.read, false)),
		);
}

/**
 * Delete a notification. Verifies ownership.
 */
export async function deleteNotification(
	notificationId: string,
	userId: string,
): Promise<boolean> {
	const [deleted] = await db
		.delete(notifications)
		.where(
			and(
				eq(notifications.notificationId, notificationId),
				eq(notifications.userId, userId),
			),
		)
		.returning({ notificationId: notifications.notificationId });

	return !!deleted;
}
