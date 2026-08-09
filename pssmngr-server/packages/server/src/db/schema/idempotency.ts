// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Idempotency Key Schema — pssmngr
 *
 * Stores response envelopes for completed mutations so client retries
 * (especially the offline-sync queue) collapse to a single logical
 * change. The stored response is non-sensitive metadata only — never
 * plaintext vault contents (the body itself is already ciphertext).
 *
 *   user → idempotency_key
 */
import { relations } from "drizzle-orm";
import {
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	varchar,
} from "drizzle-orm/pg-core";
import { user } from "./user";

export const idempotencyKey = pgTable(
	"idempotency_key",
	{
		key: varchar("key", { length: 128 }).primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		router: varchar("router", { length: 64 }).notNull(),
		procedure: varchar("procedure", { length: 64 }).notNull(),
		responseStatus: integer("response_status").notNull(),
		responseBody: jsonb("response_body").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("idempotency_key_user_id_idx").on(table.userId),
		index("idempotency_key_created_at_idx").on(table.createdAt),
	],
);

export const idempotencyKeyRelations = relations(idempotencyKey, ({ one }) => ({
	user: one(user, {
		fields: [idempotencyKey.userId],
		references: [user.id],
	}),
}));
