// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { relations } from "drizzle-orm";
import {
	boolean,
	index,
	pgEnum,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";
import { user } from "./user";

// "notification_category" (without suffix) is taken by the push-category
// table in notifications.ts — a table reserves a composite type of the same
// name, so the enum needs a distinct one.
export const notificationCategory = pgEnum("notification_category_enum", [
	"security",
	"sharing",
	"system",
]);

export const notifications = pgTable(
	"notification",
	{
		notificationId: text("notificationId")
			.notNull()
			.primaryKey()
			.$defaultFn(() => nanoid()),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		category: notificationCategory("category").notNull(),
		title: text("title").notNull(),
		message: text("message").notNull(),
		read: boolean("read").notNull().default(false),
		createdAt: timestamp("created_at").defaultNow(),
	},
	(table) => [index("notification_user_id_idx").on(table.userId)],
);

export const notificationsRelations = relations(notifications, ({ one }) => ({
	user: one(user, {
		fields: [notifications.userId],
		references: [user.id],
	}),
}));
