// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { relations } from "drizzle-orm";
import {
	index,
	integer,
	pgEnum,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";
import { user } from "./user";

// ---------------------------------------------------------------------------
// Audit event enum
// ---------------------------------------------------------------------------

export const emergencyAuditEventEnum = pgEnum("emergency_audit_event", [
	"request_created",
	"request_denied",
	"request_granted",
	"request_auto_granted",
	"request_expired",
	"signature_verified",
	"signature_failed",
	"cooldown_blocked",
]);

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const emergencyRequestStatusEnum = pgEnum("emergency_request_status", [
	"pending",
	"denied",
	"approved",
	"expired",
]);

// ---------------------------------------------------------------------------
// Trusted contact — a user the vault owner designates for emergency access
// ---------------------------------------------------------------------------

export const trustedContact = pgTable(
	"trusted_contact",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => nanoid()),

		/** The vault owner who set up this contact. */
		ownerId: text("owner_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),

		/** The designated trusted contact. */
		contactId: text("contact_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),

		/** Configurable waiting period in days (1-30, default 7). */
		waitingPeriodDays: integer("waiting_period_days").notNull().default(7),

		// Pre-stored escrow — vault key encrypted for the contact's public key.
		// Created at contact-addition time. Copied to request on auto-grant.
		escrowBlob: text("escrow_blob"),
		escrowNonce: text("escrow_nonce"),
		escrowAuthTag: text("escrow_auth_tag"),
		ephemeralPublicKey: text("ephemeral_public_key"),
		escrowSignature: text("escrow_signature"),

		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("trusted_contact_owner_idx").on(table.ownerId),
		index("trusted_contact_contact_idx").on(table.contactId),
	],
);

// ---------------------------------------------------------------------------
// Emergency access request — tracks the time-locked request lifecycle
// ---------------------------------------------------------------------------

export const emergencyAccessRequest = pgTable(
	"emergency_access_request",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => nanoid()),

		/** The trusted contact relationship this request belongs to. */
		trustedContactId: text("trusted_contact_id")
			.notNull()
			.references(() => trustedContact.id, { onDelete: "cascade" }),

		/** The vault owner whose vault is being requested. */
		ownerId: text("owner_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),

		/** The contact requesting access. */
		contactId: text("contact_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),

		status: emergencyRequestStatusEnum("status").notNull().default("pending"),

		/** Waiting period locked at request time (cannot be shortened). */
		waitingPeriodDays: integer("waiting_period_days").notNull(),

		requestedAt: timestamp("requested_at", { withTimezone: true })
			.defaultNow()
			.notNull(),

		/** When the waiting period expires and access can be granted. */
		expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),

		deniedAt: timestamp("denied_at", { withTimezone: true }),
		grantedAt: timestamp("granted_at", { withTimezone: true }),

		/** HMAC-SHA256 signature of requestedAt+expiresAt — tamper-proof. */
		timestampSignature: text("timestamp_signature").notNull(),

		/** If denied, the contact cannot retry until after this timestamp. */
		denialCooldownUntil: timestamp("denial_cooldown_until", {
			withTimezone: true,
		}),

		// Escrow blob — vault key pre-encrypted for the contact's public key.
		// Copied from trustedContact on auto-grant, or supplied by owner on manual grant.
		escrowBlob: text("escrow_blob"),
		escrowNonce: text("escrow_nonce"),
		escrowAuthTag: text("escrow_auth_tag"),
		ephemeralPublicKey: text("ephemeral_public_key"),
		escrowSignature: text("escrow_signature"),
	},
	(table) => [
		index("emergency_request_owner_idx").on(table.ownerId),
		index("emergency_request_contact_idx").on(table.contactId),
		index("emergency_request_status_idx").on(table.status),
		index("emergency_request_trusted_contact_idx").on(table.trustedContactId),
	],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const trustedContactRelations = relations(
	trustedContact,
	({ one, many }) => ({
		owner: one(user, {
			fields: [trustedContact.ownerId],
			references: [user.id],
			relationName: "trustedContactOwner",
		}),
		contact: one(user, {
			fields: [trustedContact.contactId],
			references: [user.id],
			relationName: "trustedContactContact",
		}),
		requests: many(emergencyAccessRequest),
	}),
);

export const emergencyAccessRequestRelations = relations(
	emergencyAccessRequest,
	({ one, many }) => ({
		trustedContact: one(trustedContact, {
			fields: [emergencyAccessRequest.trustedContactId],
			references: [trustedContact.id],
		}),
		owner: one(user, {
			fields: [emergencyAccessRequest.ownerId],
			references: [user.id],
			relationName: "emergencyRequestOwner",
		}),
		contact: one(user, {
			fields: [emergencyAccessRequest.contactId],
			references: [user.id],
			relationName: "emergencyRequestContact",
		}),
		auditLogs: many(emergencyAuditLog),
	}),
);

// ---------------------------------------------------------------------------
// Immutable audit log for emergency access events
// ---------------------------------------------------------------------------

export const emergencyAuditLog = pgTable(
	"emergency_audit_log",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => nanoid()),

		/** The request this event belongs to. */
		requestId: text("request_id")
			.notNull()
			.references(() => emergencyAccessRequest.id, { onDelete: "cascade" }),

		event: emergencyAuditEventEnum("event").notNull(),

		/** The user who triggered the event (null for system/cron events). */
		actorId: text("actor_id").references(() => user.id, {
			onDelete: "set null",
		}),

		/** Additional context (e.g. reason for denial, IP address). */
		metadata: text("metadata"),

		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("emergency_audit_request_idx").on(table.requestId),
		index("emergency_audit_event_idx").on(table.event),
	],
);

export const emergencyAuditLogRelations = relations(
	emergencyAuditLog,
	({ one }) => ({
		request: one(emergencyAccessRequest, {
			fields: [emergencyAuditLog.requestId],
			references: [emergencyAccessRequest.id],
		}),
		actor: one(user, {
			fields: [emergencyAuditLog.actorId],
			references: [user.id],
			relationName: "emergencyAuditActor",
		}),
	}),
);
