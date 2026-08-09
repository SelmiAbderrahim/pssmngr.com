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
import { vault } from "./vault";

export const itemTypeEnum = pgEnum("item_type", [
	"login",
	"passkey",
	"identity",
	"card",
	"note",
	"totp",
	"file",
]);

export const item = pgTable(
	"item",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => nanoid()),
		vaultId: text("vault_id")
			.notNull()
			.references(() => vault.id, { onDelete: "cascade" }),

		// Item type (not encrypted — needed for UI filtering)
		itemType: itemTypeEnum("item_type").notNull(),

		// Encrypted blob — ALL sensitive data is here
		ciphertext: text("ciphertext").notNull(),
		nonce: text("nonce").notNull(),
		authTag: text("auth_tag").notNull(),

		// Wrapped per-item data key (envelope encryption)
		wrappedDataKey: text("wrapped_data_key").notNull(),
		wrappedDataKeyNonce: text("wrapped_data_key_nonce").notNull(),
		wrappedDataKeyAuthTag: text("wrapped_data_key_auth_tag").notNull(),

		// Non-sensitive metadata
		version: integer("version").notNull().default(1),
		isFavorite: boolean("is_favorite").notNull().default(false),

		// Soft delete (trash)
		deletedAt: timestamp("deleted_at", { withTimezone: true }),

		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		index("item_vault_id_idx").on(table.vaultId),
		index("item_type_idx").on(table.itemType),
		index("item_deleted_at_idx").on(table.deletedAt),
	],
);

export const itemVersion = pgTable(
	"item_version",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => nanoid()),
		itemId: text("item_id")
			.notNull()
			.references(() => item.id, { onDelete: "cascade" }),
		version: integer("version").notNull(),

		// Snapshot of encrypted data at this version
		ciphertext: text("ciphertext").notNull(),
		nonce: text("nonce").notNull(),
		authTag: text("auth_tag").notNull(),
		wrappedDataKey: text("wrapped_data_key").notNull(),
		wrappedDataKeyNonce: text("wrapped_data_key_nonce").notNull(),
		wrappedDataKeyAuthTag: text("wrapped_data_key_auth_tag").notNull(),

		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [index("item_version_item_id_idx").on(table.itemId)],
);

export const itemRelations = relations(item, ({ one, many }) => ({
	vault: one(vault, { fields: [item.vaultId], references: [vault.id] }),
	versions: many(itemVersion),
}));

export const itemVersionRelations = relations(itemVersion, ({ one }) => ({
	item: one(item, { fields: [itemVersion.itemId], references: [item.id] }),
}));
