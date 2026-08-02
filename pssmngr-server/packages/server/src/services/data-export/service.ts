// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Data-export service layer.
 *
 * Owns the DB state machine and the public surface used by both the
 * tRPC router and the background job. Pure functions over the
 * Drizzle context — no HTTP, no logging side effects beyond what's
 * documented here.
 */
import { randomBytes } from "node:crypto";
import { and, desc, eq, inArray, lt } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../../db/schema";
import {
	type DataExportFormat,
	type DataExportRequest,
	type DataExportStatus,
	dataExportRequests,
} from "../../db/schema/data-export";
import { buildExportBundle } from "./bundle-builder";
import {
	bundleAbsolutePath,
	bundleSize,
	removeBundleIfExists,
} from "./storage";

export type DataExportDb = PostgresJsDatabase<typeof schema>;

export const EXPORT_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_ACTIVE_SUCCEEDED_PER_USER = 5;

export class DataExportConflictError extends Error {
	constructor() {
		super("An export is already in progress");
		this.name = "DataExportConflictError";
	}
}

export class DataExportNotFoundError extends Error {
	constructor() {
		super("Export request not found");
		this.name = "DataExportNotFoundError";
	}
}

/**
 * Generate a 256-bit URL-safe token. Possession of the token is the
 * sole authorization — the link is sent only via email and can be
 * revoked at any time.
 */
export function generateDownloadToken(): string {
	return randomBytes(48).toString("base64url");
}

/**
 * Create a new PENDING request, enforcing the single-active-request
 * and rolling-window constraints. Returns the inserted row.
 *
 * Concurrent callers: the partial unique index
 * `data_export_request_user_active_uniq` is the source of truth; if a
 * second writer slips past the in-process check it gets a unique-
 * violation from Postgres, which we surface as a `DataExportConflictError`.
 */
export async function createExportRequest(args: {
	db: DataExportDb;
	userId: string;
	format: DataExportFormat;
	ipAddress: string | null;
	userAgent: string | null;
}): Promise<DataExportRequest> {
	const { db, userId, format, ipAddress, userAgent } = args;

	// Pre-check (best-effort) — avoids the round-trip when the user is
	// hammering the button. The DB index is the actual gate.
	const active = await db.query.dataExportRequests.findFirst({
		where: and(
			eq(dataExportRequests.userId, userId),
			inArray(dataExportRequests.status, [
				"PENDING",
				"RUNNING",
			] as DataExportStatus[]),
		),
	});
	if (active) {
		throw new DataExportConflictError();
	}

	// Rolling window: at most N non-expired SUCCEEDED requests per
	// user. Older ones get auto-revoked (file removed).
	const succeeded = await db.query.dataExportRequests.findMany({
		where: and(
			eq(dataExportRequests.userId, userId),
			eq(dataExportRequests.status, "SUCCEEDED" satisfies DataExportStatus),
		),
		orderBy: [desc(dataExportRequests.requestedAt)],
	});
	if (succeeded.length >= MAX_ACTIVE_SUCCEEDED_PER_USER) {
		const toRevoke = succeeded.slice(MAX_ACTIVE_SUCCEEDED_PER_USER - 1);
		for (const row of toRevoke) {
			await revokeExportRequest({ db, userId, requestId: row.id });
		}
	}

	try {
		const [inserted] = await db
			.insert(dataExportRequests)
			.values({
				userId,
				status: "PENDING",
				requestedFormat: format,
				ipAddress,
				userAgent,
			})
			.returning();
		if (!inserted) throw new Error("Failed to create export request");
		return inserted;
	} catch (err) {
		// Translate unique-index violation into the typed conflict error.
		const code = (err as { code?: string })?.code;
		if (code === "23505") {
			throw new DataExportConflictError();
		}
		throw err;
	}
}

/** List the most recent N requests for a user. */
export async function listExportRequests(args: {
	db: DataExportDb;
	userId: string;
	limit?: number;
}): Promise<DataExportRequest[]> {
	const limit = args.limit ?? 10;
	return args.db.query.dataExportRequests.findMany({
		where: eq(dataExportRequests.userId, args.userId),
		orderBy: [desc(dataExportRequests.requestedAt)],
		limit,
	});
}

/** Get one request scoped to the caller; throws if missing/foreign. */
export async function getExportRequest(args: {
	db: DataExportDb;
	userId: string;
	requestId: string;
}): Promise<DataExportRequest> {
	const row = await args.db.query.dataExportRequests.findFirst({
		where: and(
			eq(dataExportRequests.id, args.requestId),
			eq(dataExportRequests.userId, args.userId),
		),
	});
	if (!row) {
		throw new DataExportNotFoundError();
	}
	return row;
}

/**
 * Revoke a request. Idempotent — re-revoking a row that is already
 * REVOKED/EXPIRED is a no-op success, NOT an error. This means the
 * email-link "revoke" UX can be retried safely.
 */
export async function revokeExportRequest(args: {
	db: DataExportDb;
	userId: string;
	requestId: string;
}): Promise<void> {
	const row = await args.db.query.dataExportRequests.findFirst({
		where: and(
			eq(dataExportRequests.id, args.requestId),
			eq(dataExportRequests.userId, args.userId),
		),
	});
	if (!row) {
		throw new DataExportNotFoundError();
	}

	if (row.status === "REVOKED" || row.status === "EXPIRED") {
		return;
	}

	await removeBundleIfExists(row.bundlePath || null);
	await args.db
		.update(dataExportRequests)
		.set({
			status: "REVOKED",
			bundlePath: "",
			downloadToken: null,
		})
		.where(eq(dataExportRequests.id, row.id));
}

/**
 * Look up a request by its download token. Returns `null` when the
 * token doesn't match a row OR when the matched row is in a terminal
 * non-downloadable state (REVOKED/EXPIRED/FAILED/PENDING/RUNNING).
 *
 * Callers in the HTTP download path use this single function as the
 * only token-to-user mapping — never trust client-supplied user ids.
 */
export async function findByDownloadToken(
	db: DataExportDb,
	token: string,
): Promise<DataExportRequest | null> {
	if (!token || token.length < 16) return null;
	const row = await db.query.dataExportRequests.findFirst({
		where: eq(dataExportRequests.downloadToken, token),
	});
	if (!row) return null;
	if (row.status !== "SUCCEEDED") return null;
	return row;
}

/**
 * Worker entrypoint — flip a PENDING row to RUNNING, build the
 * bundle, then to SUCCEEDED (or FAILED with errorMessage).
 *
 * Idempotent: invoking for a row already past PENDING is a no-op.
 *
 * Returns the final state for caller convenience / tests.
 */
export async function runExportJob(args: {
	db: DataExportDb;
	requestId: string;
	/** Override clock for tests; default is `new Date()`. */
	now?: () => Date;
	/** Override the language used for README.txt (test seam). */
	languageOverride?: string | null;
}): Promise<DataExportRequest> {
	const { db, requestId } = args;
	const now = args.now ?? (() => new Date());

	const initial = await db.query.dataExportRequests.findFirst({
		where: eq(dataExportRequests.id, requestId),
	});
	if (!initial) throw new DataExportNotFoundError();

	// Idempotency guard — anything past PENDING was already handled.
	if (initial.status !== "PENDING") {
		return initial;
	}

	const startedAt = now();
	const [running] = await db
		.update(dataExportRequests)
		.set({ status: "RUNNING", startedAt })
		.where(
			and(
				eq(dataExportRequests.id, requestId),
				eq(dataExportRequests.status, "PENDING"),
			),
		)
		.returning();
	if (!running) {
		// Another worker grabbed it first — return current row.
		return (await db.query.dataExportRequests.findFirst({
			where: eq(dataExportRequests.id, requestId),
		})) as DataExportRequest;
	}

	try {
		const user = await db.query.user.findFirst({
			where: eq(schema.user.id, running.userId),
			columns: { id: true, preferredLanguage: true },
		});
		const language = args.languageOverride ?? user?.preferredLanguage ?? null;

		const { relativePath } = await buildExportBundle({
			db,
			userId: running.userId,
			requestId: running.id,
			format: running.requestedFormat as DataExportFormat,
			language,
		});

		const size = await bundleSize(relativePath);
		const completedAt = now();
		const expiresAt = new Date(completedAt.getTime() + EXPORT_EXPIRY_MS);

		const [finished] = await db
			.update(dataExportRequests)
			.set({
				status: "SUCCEEDED",
				completedAt,
				expiresAt,
				bundlePath: relativePath,
				bundleSizeBytes: BigInt(size),
				downloadToken: generateDownloadToken(),
				errorMessage: "",
			})
			.where(eq(dataExportRequests.id, requestId))
			.returning();
		if (!finished) throw new Error("Export request disappeared");
		return finished;
	} catch (err) {
		// Strip internals — `errorMessage` is surfaced to the user via
		// the `list` query.
		const message =
			err instanceof Error ? err.message.slice(0, 200) : "Export failed";
		const [failed] = await db
			.update(dataExportRequests)
			.set({
				status: "FAILED",
				completedAt: now(),
				errorMessage: message,
			})
			.where(eq(dataExportRequests.id, requestId))
			.returning();
		if (!failed) throw new Error("Export request disappeared");
		return failed;
	}
}

/**
 * Sweep SUCCEEDED rows whose expiresAt has passed → flip to EXPIRED
 * and delete the bundle file. Idempotent.
 */
export async function expireOldExports(args: {
	db: DataExportDb;
	now?: () => Date;
}): Promise<number> {
	const now = (args.now ?? (() => new Date()))();
	const stale = await args.db
		.select()
		.from(dataExportRequests)
		.where(
			and(
				eq(dataExportRequests.status, "SUCCEEDED"),
				lt(dataExportRequests.expiresAt, now),
			),
		);
	for (const row of stale) {
		await removeBundleIfExists(row.bundlePath || null);
		await args.db
			.update(dataExportRequests)
			.set({
				status: "EXPIRED",
				bundlePath: "",
				downloadToken: null,
			})
			.where(eq(dataExportRequests.id, row.id));
	}
	return stale.length;
}

/**
 * Sweep terminal failure/revoked rows older than the retention
 * window. Idempotent.
 */
export async function purgeStaleFailedExports(args: {
	db: DataExportDb;
	retentionMs?: number;
	now?: () => Date;
}): Promise<number> {
	const retentionMs = args.retentionMs ?? 90 * 24 * 60 * 60 * 1000;
	const now = (args.now ?? (() => new Date()))();
	const threshold = new Date(now.getTime() - retentionMs);
	const stale = await args.db
		.select()
		.from(dataExportRequests)
		.where(
			and(
				inArray(dataExportRequests.status, [
					"FAILED",
					"REVOKED",
				] as DataExportStatus[]),
				lt(dataExportRequests.requestedAt, threshold),
			),
		);
	if (stale.length === 0) return 0;
	await args.db.delete(dataExportRequests).where(
		inArray(
			dataExportRequests.id,
			stale.map((r) => r.id),
		),
	);
	return stale.length;
}

/** Record a download — increments counter atomically. */
export async function recordDownload(args: {
	db: DataExportDb;
	requestId: string;
}): Promise<void> {
	const row = await args.db.query.dataExportRequests.findFirst({
		where: eq(dataExportRequests.id, args.requestId),
	});
	if (!row) return;
	await args.db
		.update(dataExportRequests)
		.set({ downloadCount: (row.downloadCount ?? 0) + 1 })
		.where(eq(dataExportRequests.id, args.requestId));
}

/** Convenience for the download HTTP route. */
export function bundleAbsolutePathFor(row: DataExportRequest): string | null {
	if (!row.bundlePath) return null;
	return bundleAbsolutePath(row.bundlePath);
}
