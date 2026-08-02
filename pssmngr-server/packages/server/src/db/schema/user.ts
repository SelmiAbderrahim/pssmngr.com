// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { relations } from "drizzle-orm";
import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";
import { z } from "zod/v3";
import { account, organization } from "./account";

export const user = pgTable("user", {
	id: text("id")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	name: text("name").notNull().default(""),
	email: text("email").notNull().unique(),
	emailVerified: boolean("email_verified").notNull(),
	image: text("image"),
	createdAt: timestamp("created_at").defaultNow(),
	updatedAt: timestamp("updated_at").notNull(),
	// Auth
	twoFactorEnabled: boolean("two_factor_enabled"),
	banned: boolean("banned"),
	banReason: text("ban_reason"),
	banExpires: timestamp("ban_expires"),
	// Admin
	role: text("role").notNull().default("user"),
	// User preferences
	preferredLanguage: text("preferredLanguage"),
	layoutTemplate: text("layoutTemplate").default("default"),
	guideMe: boolean("guide_me").notNull().default(true),
	// Profile
	lastName: text("lastName").default(""),
	allowImpersonation: boolean("allowImpersonation").default(false),
	ownerId: text("ownerId").default(""),
});

export const usersRelations = relations(user, ({ one, many }) => ({
	account: one(account, {
		fields: [user.id],
		references: [account.userId],
	}),
	organizations: many(organization),
}));

export const apiUpdateLanguage = z.object({
	preferredLanguage: z.string().min(2).max(10),
});

export const apiUpdateLayoutTemplate = z.object({
	layoutTemplate: z.enum(["default", "compact", "list"]),
});

export const apiUpdateGuideMe = z.object({
	guideMe: z.boolean(),
});
