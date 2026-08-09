// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { relations } from "drizzle-orm";
import { boolean, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";
import { user } from "./user";

export const device = pgTable(
	"device",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => nanoid()),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),

		// Device identification
		deviceName: text("device_name").notNull(),
		deviceType: text("device_type").notNull().default("browser"),

		// X25519 public key for this device (used in sharing / ECDH key wrap)
		publicKey: text("public_key").notNull(),

		// Ed25519 public key for this device (verifies signed share envelopes).
		// Nullable: devices enrolled before signing keys existed have none until
		// the client lazily upgrades them (see keypair-manager.ensureDeviceSigningKey).
		signingPublicKey: text("signing_public_key"),

		// Trust status
		trusted: boolean("trusted").notNull().default(false),

		// Device-key escrow (self-healing shared-vault access). Opaque,
		// client-produced JSON.stringify({ ciphertext, nonce, authTag }) of this
		// device's X25519 / Ed25519 PRIVATE key encrypted client-side with the
		// user's vault key (XChaCha20-Poly1305). The server never decrypts these;
		// a browser that can unlock the vault fetches them to recover its device
		// identity after losing IndexedDB.
		encryptedPrivateKey: text("encrypted_private_key"),
		encryptedSigningPrivateKey: text("encrypted_signing_private_key"),

		// Persistent unlock (trusted-device wrapped-at-rest vault key).
		// The server holds ONLY this expiry timestamp — no key material, no
		// wrap, no ciphertext. The wrap itself lives in IndexedDB on the
		// client and is bound to a non-extractable browser CryptoKey (see
		// client/src/lib/persistent-unlock.ts). Null / past = revoked or
		// never enabled; the client bootstrap check clears any local wrap
		// when this doesn't line up.
		persistentUnlockExpiresAt: timestamp("persistent_unlock_expires_at", {
			withTimezone: true,
		}),

		// Session binding
		lastIp: text("last_ip"),
		lastUserAgent: text("last_user_agent"),
		lastSeen: timestamp("last_seen", { withTimezone: true }),

		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [index("device_user_id_idx").on(table.userId)],
);

export const deviceRelations = relations(device, ({ one }) => ({
	user: one(user, { fields: [device.userId], references: [user.id] }),
}));
