// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Data-export background job runner.
 *
 * Two responsibilities:
 *
 *  1. **Enqueue** — a tRPC mutation calls `enqueueExportJob(requestId)`
 *     after inserting a PENDING row. We dispatch the actual bundle
 *     build to the next tick via `setImmediate`, which keeps the HTTP
 *     response under 100 ms while the worker grinds in the background.
 *     If the process crashes mid-build, the row stays at PENDING/RUNNING
 *     and the `recoverInflight` sweeper (registered at server start)
 *     picks it up on next boot.
 *
 *  2. **Scheduled sweeps** — hourly `expireOldExports`, daily
 *     `purgeStaleFailedExports`. Both wired into `node-schedule`.
 *
 * No Redis queue, no external worker — keeps the deploy single-process
 * and matches the existing emergency / idempotency job style. If the
 * deployment ever grows to a separate worker, swap `setImmediate` for
 * a Redis `LPUSH` and a worker process pulling from that list.
 */

import { eq, inArray } from "drizzle-orm";
import { type Job, scheduleJob } from "node-schedule";
import { db } from "../db";
import { dataExportRequests } from "../db/schema/data-export";
import { user as userTable } from "../db/schema/user";
import {
	expireOldExports,
	purgeStaleFailedExports,
	runExportJob,
	sendDataExportFailedEmail,
	sendDataExportReadyEmail,
} from "../services/data-export";
import { BUNDLE_DEFAULT_EXPIRY_DAYS } from "../services/data-export/types";

export const JOB_NAMES = {
	EXPIRE_OLD: "data-export-expire-old",
	PURGE_STALE: "data-export-purge-stale",
	RECOVER_INFLIGHT: "data-export-recover-inflight",
} as const;

export const CRON_SCHEDULES = {
	/** Every hour at minute 7 — staggered from idempotency (17). */
	EXPIRE_OLD: "7 * * * *",
	/** Daily at 03:33 — off-peak. */
	PURGE_STALE: "33 3 * * *",
} as const;

const jobs: Map<string, Job> = new Map();

function getAppBaseUrl(): string {
	return (
		process.env.APP_PUBLIC_BASE_URL ||
		process.env.SITE_URL ||
		process.env.BETTER_AUTH_URL ||
		process.env.VITE_APP_URL ||
		"http://localhost:42789"
	).replace(/\/$/, "");
}

function getApiBaseUrl(): string {
	return (
		process.env.API_PUBLIC_BASE_URL ||
		process.env.SITE_URL ||
		process.env.BETTER_AUTH_URL ||
		process.env.VITE_API_URL ||
		getAppBaseUrl()
	).replace(/\/$/, "");
}

/**
 * Dispatch a build for `requestId`. Returns immediately; the actual
 * work runs on `setImmediate`. Safe to call multiple times for the
 * same id — `runExportJob` is idempotent on non-PENDING rows.
 */
export function enqueueExportJob(requestId: string): void {
	setImmediate(() => {
		void executeOnce(requestId).catch((err) => {
			console.error("[data-export-job] enqueue handler failed", err);
		});
	});
}

async function executeOnce(requestId: string): Promise<void> {
	const finished = await runExportJob({ db, requestId });
	if (!finished) return;

	const row = await db.query.user.findFirst({
		where: eq(userTable.id, finished.userId),
		columns: { id: true, email: true },
	});
	if (!row) return;

	const app = getAppBaseUrl();
	const api = getApiBaseUrl();

	if (finished.status === "SUCCEEDED" && finished.downloadToken) {
		await sendDataExportReadyEmail({
			to: row.email,
			userId: row.id,
			downloadUrl: `${api}/data-export/download/${finished.downloadToken}`,
			revokeUrl: `${app}/dashboard/settings/data-export?revoke=${encodeURIComponent(finished.id)}`,
			expiresAt:
				finished.expiresAt?.toISOString() ??
				new Date(
					Date.now() + BUNDLE_DEFAULT_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
				).toISOString(),
			requestId: finished.id,
		});
	} else if (finished.status === "FAILED") {
		await sendDataExportFailedEmail({
			to: row.email,
			userId: row.id,
			retryUrl: `${app}/dashboard/settings/data-export`,
		});
	}
}

/**
 * On boot, pick up any rows left in PENDING/RUNNING by a previous
 * crashed process and re-enqueue them. RUNNING rows are flipped back
 * to PENDING first so the idempotency guard in `runExportJob` lets
 * them proceed.
 */
export async function recoverInflightJobs(): Promise<number> {
	const rows = await db
		.select({ id: dataExportRequests.id, status: dataExportRequests.status })
		.from(dataExportRequests)
		.where(inArray(dataExportRequests.status, ["PENDING", "RUNNING"]));

	if (rows.length === 0) return 0;

	for (const row of rows) {
		if (row.status === "RUNNING") {
			await db
				.update(dataExportRequests)
				.set({ status: "PENDING", startedAt: null })
				.where(eq(dataExportRequests.id, row.id));
		}
		enqueueExportJob(row.id);
	}

	console.log(`[data-export-job] recovered ${rows.length} in-flight jobs`);
	return rows.length;
}

export async function runExpireOldExports(): Promise<number> {
	const removed = await expireOldExports({ db });
	if (removed > 0) {
		console.log(`[data-export-job] expired ${removed} export bundles`);
	}
	return removed;
}

export async function runPurgeStaleFailedExports(): Promise<number> {
	const removed = await purgeStaleFailedExports({ db });
	if (removed > 0) {
		console.log(`[data-export-job] purged ${removed} stale export rows`);
	}
	return removed;
}

/** Idempotent scheduler bootstrap. Safe to re-invoke. */
export function initializeDataExportJobs(): void {
	const enabled = process.env.DATA_EXPORT_JOBS_ENABLED !== "false";
	if (!enabled) {
		console.log("[data-export-job] disabled via DATA_EXPORT_JOBS_ENABLED");
		return;
	}

	const expire = jobs.get(JOB_NAMES.EXPIRE_OLD);
	if (expire) expire.cancel();
	jobs.set(
		JOB_NAMES.EXPIRE_OLD,
		scheduleJob(CRON_SCHEDULES.EXPIRE_OLD, () => {
			void runExpireOldExports().catch((err) => {
				console.error("[data-export-job] expire failed", err);
			});
		}),
	);

	const purge = jobs.get(JOB_NAMES.PURGE_STALE);
	if (purge) purge.cancel();
	jobs.set(
		JOB_NAMES.PURGE_STALE,
		scheduleJob(CRON_SCHEDULES.PURGE_STALE, () => {
			void runPurgeStaleFailedExports().catch((err) => {
				console.error("[data-export-job] purge failed", err);
			});
		}),
	);

	console.log(
		`[data-export-job] scheduled expire=${CRON_SCHEDULES.EXPIRE_OLD} purge=${CRON_SCHEDULES.PURGE_STALE}`,
	);

	// Pick up anything left behind by a previous crash.
	void recoverInflightJobs().catch((err) => {
		console.error("[data-export-job] recovery failed", err);
	});
}

export function cancelAllJobs(): void {
	for (const job of jobs.values()) job.cancel();
	jobs.clear();
}
