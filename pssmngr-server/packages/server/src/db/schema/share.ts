// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { relations } from "drizzle-orm";
import {
	boolean,
	index,
	integer,
	pgEnum,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";
import { item } from "./item";
import { user } from "./user";

export const sharePermissionEnum = pgEnum("share_permission", [
	"view",
	"edit",
	"share",
]);

export const shareEnvelope = pgTable(
	"share_envelope",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => nanoid()),
		itemId: text("item_id")
			.notNull()
			.references(() => item.id, { onDelete: "cascade" }),
		senderUserId: text("sender_user_id")
			.notNull()
			.references(() => user.id),
		recipientUserId: text("recipient_user_id")
			.notNull()
			.references(() => user.id),

		// Per-item data key wrapped with recipient's X25519 public key
		wrappedKey: text("wrapped_key").notNull(),
		wrappedKeyNonce: text("wrapped_key_nonce").notNull(),
		wrappedKeyAuthTag: text("wrapped_key_auth_tag").notNull(),

		// Ed25519 signature from sender (anti-tampering)
		senderSignature: text("sender_signature").notNull(),

		// Permissions
		permission: sharePermissionEnum("permission").notNull().default("view"),

		// Expiry (for ephemeral shares)
		expiresAt: timestamp("expires_at", { withTimezone: true }),

		// Status
		accepted: boolean("accepted").notNull().default(false),
		revokedAt: timestamp("revoked_at", { withTimezone: true }),

		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("share_envelope_item_id_idx").on(table.itemId),
		index("share_envelope_recipient_idx").on(table.recipientUserId),
		index("share_envelope_sender_idx").on(table.senderUserId),
	],
);

export const passwordHistory = pgTable(
	"password_history",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => nanoid()),
		itemId: text("item_id")
			.notNull()
			.references(() => item.id, { onDelete: "cascade" }),

		// Encrypted previous password blob
		ciphertext: text("ciphertext").notNull(),
		nonce: text("nonce").notNull(),
		authTag: text("auth_tag").notNull(),
		wrappedDataKey: text("wrapped_data_key").notNull(),
		wrappedDataKeyNonce: text("wrapped_data_key_nonce").notNull(),
		wrappedDataKeyAuthTag: text("wrapped_data_key_auth_tag").notNull(),

		// Whether this is marked as legacy
		isLegacy: boolean("is_legacy").notNull().default(false),

		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [index("password_history_item_id_idx").on(table.itemId)],
);

export const shareEnvelopeRelations = relations(shareEnvelope, ({ one }) => ({
	item: one(item, { fields: [shareEnvelope.itemId], references: [item.id] }),
	sender: one(user, {
		fields: [shareEnvelope.senderUserId],
		references: [user.id],
	}),
	recipient: one(user, {
		fields: [shareEnvelope.recipientUserId],
		references: [user.id],
	}),
}));

export const passwordHistoryRelations = relations(
	passwordHistory,
	({ one }) => ({
		item: one(item, {
			fields: [passwordHistory.itemId],
			references: [item.id],
		}),
	}),
);

// ---------------------------------------------------------------------------
// Ephemeral share links (one-time, time-boxed, optionally passphrase-protected)
// ---------------------------------------------------------------------------

export const ephemeralShare = pgTable(
	"ephemeral_share",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => nanoid()),
		senderUserId: text("sender_user_id")
			.notNull()
			.references(() => user.id),

		// Encrypted item data (server never sees plaintext)
		encryptedBlob: text("encrypted_blob").notNull(),
		nonce: text("nonce").notNull(),
		authTag: text("auth_tag").notNull(),

		// Passphrase protection (optional additional encryption layer)
		hasPassphrase: boolean("has_passphrase").notNull().default(false),
		passphraseSalt: text("passphrase_salt"),

		// Time-box expiry (required)
		expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),

		// One-time use enforcement
		maxAccesses: integer("max_accesses").notNull().default(1),
		accessCount: integer("access_count").notNull().default(0),
		firstAccessedAt: timestamp("first_accessed_at", { withTimezone: true }),

		// Optional IP restriction (CIDR or single IP)
		ipRestriction: text("ip_restriction"),

		// Label for sender's reference
		label: text("label"),

		// Revocation
		revokedAt: timestamp("revoked_at", { withTimezone: true }),

		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("ephemeral_share_sender_idx").on(table.senderUserId),
		index("ephemeral_share_expires_idx").on(table.expiresAt),
	],
);

export const ephemeralShareRelations = relations(ephemeralShare, ({ one }) => ({
	sender: one(user, {
		fields: [ephemeralShare.senderUserId],
		references: [user.id],
	}),
}));
