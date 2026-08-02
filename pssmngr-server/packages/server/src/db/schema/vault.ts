// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { relations } from "drizzle-orm";
import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";
import { organization } from "./account";
import { item } from "./item";
import { user } from "./user";

export const vault = pgTable(
	"vault",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => nanoid()),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		organizationId: text("organization_id").references(() => organization.id, {
			onDelete: "cascade",
		}),
		name: text("name").notNull().default("Personal Vault"),
		// Encrypted search index blob — opaque to server
		encryptedSearchIndex: text("encrypted_search_index"),
		// Encrypted watchtower scan state — opaque to server
		encryptedWatchtowerState: text("encrypted_watchtower_state"),
		// Argon2id salt for this vault's key derivation
		kdfSalt: text("kdf_salt").notNull(),
		// Encrypted sentinel for master password verification at unlock time
		encryptedVerificationBlob: text("encrypted_verification_blob"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		index("vault_user_id_idx").on(table.userId),
		index("vault_user_organization_idx").on(table.userId, table.organizationId),
	],
);

export const vaultRelations = relations(vault, ({ one, many }) => ({
	user: one(user, { fields: [vault.userId], references: [user.id] }),
	organization: one(organization, {
		fields: [vault.organizationId],
		references: [organization.id],
	}),
	items: many(item),
}));
