// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * GDPR Data Export Schema — pssmngr
 *
 * Tracks user-initiated data-export requests, the background-job state
 * machine for building the archive, and the signed-token contract for
 * downloading it.
 *
 * The archive itself is ciphertext-only (zero-knowledge). The server
 * never decrypts vault data; this table just records request metadata,
 * the on-disk bundle path, expiry, and download token.
 *
 *   user → data_export_request
 */
import { relations, sql } from "drizzle-orm";
import {
	bigint,
	index,
	integer,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";
import { user } from "./user";

/**
 * Status of a data-export request.
 *
 * Lifecycle:
 *   PENDING   → enqueued, waiting for a worker
 *   RUNNING   → worker actively building the bundle
 *   SUCCEEDED → bundle written, signed token issued, email sent
 *   FAILED    → worker raised; errorMessage populated
 *   EXPIRED   → past expiresAt; bundle deleted, token invalid
 *   REVOKED   → user explicitly revoked; bundle deleted, token invalid
 */
export const DATA_EXPORT_STATUSES = [
	"PENDING",
	"RUNNING",
	"SUCCEEDED",
	"FAILED",
	"EXPIRED",
	"REVOKED",
] as const;
export type DataExportStatus = (typeof DATA_EXPORT_STATUSES)[number];

export const DATA_EXPORT_FORMATS = ["JSON", "CSV", "BOTH"] as const;
export type DataExportFormat = (typeof DATA_EXPORT_FORMATS)[number];

export const dataExportRequests = pgTable(
	"data_export_request",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => nanoid()),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),

		// Enum-constrained at the DB level via CHECK in the SQL migration.
		// We model it as `text` here to keep migrations stable across
		// drizzle-kit versions and avoid a separate pgEnum dependency.
		status: text("status").notNull().default("PENDING"),

		requestedAt: timestamp("requested_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		startedAt: timestamp("started_at", { withTimezone: true }),
		completedAt: timestamp("completed_at", { withTimezone: true }),
		expiresAt: timestamp("expires_at", { withTimezone: true }),

		// On-disk path *relative* to EXPORT_STORAGE_DIR.
		// Empty string until status = SUCCEEDED.
		bundlePath: text("bundle_path").notNull().default(""),

		// Size of the produced ZIP in bytes. `bigint` because, in pathological
		// cases (very large vaults with many file-type items), an export
		// could exceed the safe-integer range. Use mode "bigint" so values
		// outside JS safe-int range round-trip correctly.
		// NOTE: the default is expressed as raw SQL rather than the JS literal
		// `0n` because drizzle-kit cannot serialize a BigInt into its snapshot.
		bundleSizeBytes: bigint("bundle_size_bytes", { mode: "bigint" })
			.notNull()
			.default(sql`0`),

		// 256-bit URL-safe random token. NULL until SUCCEEDED; cleared on
		// REVOKED/EXPIRED. UNIQUE so the download route can look up by token.
		downloadToken: text("download_token"),

		downloadCount: integer("download_count").notNull().default(0),

		// Free-form, but MUST NOT contain ciphertext or internals — these
		// rows are surfaced to the user via the `list` query.
		errorMessage: text("error_message").notNull().default(""),

		// Audit context captured at request time.
		ipAddress: text("ip_address"),
		userAgent: text("user_agent"),

		// Stored as text rather than enum for the same migration-stability
		// reasons as `status`.
		requestedFormat: text("requested_format").notNull().default("BOTH"),
	},
	(table) => [
		index("data_export_request_user_id_idx").on(table.userId),
		index("data_export_request_status_idx").on(table.status),
		index("data_export_request_expires_at_idx").on(table.expiresAt),

		// Enforce "at most one in-flight request per user". Partial unique
		// index: only rows with PENDING or RUNNING participate, so completed
		// rows don't block future requests.
		uniqueIndex("data_export_request_user_active_uniq")
			.on(table.userId)
			.where(sql`${table.status} IN ('PENDING','RUNNING')`),

		// Token uniqueness — never indexed for NULL so collisions are
		// impossible for the lookup path.
		uniqueIndex("data_export_request_download_token_uniq")
			.on(table.downloadToken)
			.where(sql`${table.downloadToken} IS NOT NULL`),
	],
);

export const dataExportRequestsRelations = relations(
	dataExportRequests,
	({ one }) => ({
		user: one(user, {
			fields: [dataExportRequests.userId],
			references: [user.id],
		}),
	}),
);

export type DataExportRequest = typeof dataExportRequests.$inferSelect;
export type NewDataExportRequest = typeof dataExportRequests.$inferInsert;
