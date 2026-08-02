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
import { organization } from "./account";
import { itemTypeEnum } from "./item";
import { user } from "./user";

export const sharedVaultPermissionEnum = pgEnum("shared_vault_permission", [
	"view",
	"edit",
	"share",
	"manage",
]);

// ---------------------------------------------------------------------------
// Shared vault — belongs to a family organization
// ---------------------------------------------------------------------------

export const sharedVault = pgTable(
	"shared_vault",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => nanoid()),
		familyId: text("family_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		createdBy: text("created_by")
			.notNull()
			.references(() => user.id),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(table) => [index("shared_vault_family_id_idx").on(table.familyId)],
);

// ---------------------------------------------------------------------------
// Per-member access — wrapped vault key + permission
// ---------------------------------------------------------------------------

export const sharedVaultMember = pgTable(
	"shared_vault_member",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => nanoid()),
		sharedVaultId: text("shared_vault_id")
			.notNull()
			.references(() => sharedVault.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		permission: sharedVaultPermissionEnum("permission")
			.notNull()
			.default("view"),

		// Shared vault key wrapped with member's X25519 public key (ECDH)
		wrappedKey: text("wrapped_key").notNull(),
		wrappedKeyNonce: text("wrapped_key_nonce").notNull(),
		wrappedKeyAuthTag: text("wrapped_key_auth_tag").notNull(),
		ephemeralPublicKey: text("ephemeral_public_key").notNull(),
		senderSignature: text("sender_signature").notNull(),

		// User who wrapped/signed this member's key (for signature verification)
		grantedBy: text("granted_by"),

		// Member's device private key is irrecoverably lost; a manager must
		// re-wrap the vault key to the member's current device. Set by the
		// member (requestRewrap), cleared when addMember upserts a new envelope.
		needsRewrap: boolean("needs_rewrap").notNull().default(false),

		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("shared_vault_member_vault_idx").on(table.sharedVaultId),
		index("shared_vault_member_user_idx").on(table.userId),
	],
);

// ---------------------------------------------------------------------------
// Items stored in a shared vault
// ---------------------------------------------------------------------------

export const sharedVaultItem = pgTable(
	"shared_vault_item",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => nanoid()),
		sharedVaultId: text("shared_vault_id")
			.notNull()
			.references(() => sharedVault.id, { onDelete: "cascade" }),

		// Item type (not encrypted — needed for UI filtering)
		itemType: itemTypeEnum("item_type").notNull(),

		// Encrypted blob — ALL sensitive data is here
		ciphertext: text("ciphertext").notNull(),
		nonce: text("nonce").notNull(),
		authTag: text("auth_tag").notNull(),

		// Wrapped per-item data key (wrapped by shared vault key)
		wrappedDataKey: text("wrapped_data_key").notNull(),
		wrappedDataKeyNonce: text("wrapped_data_key_nonce").notNull(),
		wrappedDataKeyAuthTag: text("wrapped_data_key_auth_tag").notNull(),

		// Metadata
		version: integer("version").notNull().default(1),
		createdBy: text("created_by")
			.notNull()
			.references(() => user.id),
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
		index("shared_vault_item_vault_idx").on(table.sharedVaultId),
		index("shared_vault_item_type_idx").on(table.itemType),
	],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const sharedVaultRelations = relations(sharedVault, ({ one, many }) => ({
	family: one(organization, {
		fields: [sharedVault.familyId],
		references: [organization.id],
	}),
	creator: one(user, {
		fields: [sharedVault.createdBy],
		references: [user.id],
	}),
	members: many(sharedVaultMember),
	items: many(sharedVaultItem),
}));

export const sharedVaultMemberRelations = relations(
	sharedVaultMember,
	({ one }) => ({
		sharedVault: one(sharedVault, {
			fields: [sharedVaultMember.sharedVaultId],
			references: [sharedVault.id],
		}),
		user: one(user, {
			fields: [sharedVaultMember.userId],
			references: [user.id],
		}),
	}),
);

export const sharedVaultItemRelations = relations(
	sharedVaultItem,
	({ one }) => ({
		sharedVault: one(sharedVault, {
			fields: [sharedVaultItem.sharedVaultId],
			references: [sharedVault.id],
		}),
		creator: one(user, {
			fields: [sharedVaultItem.createdBy],
			references: [user.id],
		}),
	}),
);
