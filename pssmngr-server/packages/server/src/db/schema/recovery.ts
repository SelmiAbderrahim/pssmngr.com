// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { relations } from "drizzle-orm";
import { index, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";
import { organization } from "./account";
import { user } from "./user";

export const recoveryStatusEnum = pgEnum("recovery_status", [
	"pending",
	"approved",
	"completing",
	"completed",
	"rejected",
	"expired",
]);

// ---------------------------------------------------------------------------
// Delegated recovery request — tracks the lifecycle of a family recovery
// ---------------------------------------------------------------------------

export const recoveryRequest = pgTable(
	"recovery_request",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => nanoid()),
		familyId: text("family_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),

		// The member who lost access and is requesting recovery
		requesterId: text("requester_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),

		// The organizer who approves/rejects the request
		approverId: text("approver_id").references(() => user.id),

		status: recoveryStatusEnum("status").notNull().default("pending"),

		// Member's new X25519 public key (set when member starts recovery)
		newPublicKey: text("new_public_key"),

		// Member's new Ed25519 signing public key
		newSigningPublicKey: text("new_signing_public_key"),

		// Timestamps for lifecycle tracking
		requestedAt: timestamp("requested_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		approvedAt: timestamp("approved_at", { withTimezone: true }),
		completedAt: timestamp("completed_at", { withTimezone: true }),
		rejectedAt: timestamp("rejected_at", { withTimezone: true }),
		expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
	},
	(table) => [
		index("recovery_request_family_idx").on(table.familyId),
		index("recovery_request_requester_idx").on(table.requesterId),
		index("recovery_request_status_idx").on(table.status),
	],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const recoveryRequestRelations = relations(
	recoveryRequest,
	({ one }) => ({
		family: one(organization, {
			fields: [recoveryRequest.familyId],
			references: [organization.id],
		}),
		requester: one(user, {
			fields: [recoveryRequest.requesterId],
			references: [user.id],
		}),
	}),
);
