// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Idempotency-key cleanup scheduled job.
 *
 * Removes `idempotency_key` rows older than 30 days. Rationale: offline
 * clients should have surfaced any replay errors and either retried or
 * given up long before that horizon, so the rows have served their
 * purpose. Keeping them around grows the table without bound.
 *
 * Schedule: every day at 03:17 local time (off-peak; staggered against
 * the emergency-auto-grant hourly job).
 *
 * @module @pssmngr/server/jobs/idempotency
 */
import { type Job, scheduleJob } from "node-schedule";
import { db } from "../../db";
import { purgeStaleIdempotencyKeys } from "../../idempotency";

export const JOB_NAMES = {
	PURGE_STALE: "idempotency-purge-stale",
} as const;

export const CRON_SCHEDULES = {
	PURGE_STALE: "17 3 * * *",
} as const;

const jobs: Map<string, Job> = new Map();

/** Default retention window (30 days). */
export const DEFAULT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export async function runPurgeStaleIdempotencyKeys(): Promise<number> {
	const removed = await purgeStaleIdempotencyKeys(db, DEFAULT_RETENTION_MS);
	if (removed > 0) {
		console.log(
			`[idempotency-jobs] purged ${removed} stale idempotency_key rows`,
		);
	}
	return removed;
}

export function initializeIdempotencyJobs(): void {
	const isEnabled = process.env.IDEMPOTENCY_JOBS_ENABLED !== "false";
	if (!isEnabled) {
		console.log("[idempotency-jobs] disabled via IDEMPOTENCY_JOBS_ENABLED");
		return;
	}

	const existing = jobs.get(JOB_NAMES.PURGE_STALE);
	if (existing) existing.cancel();

	const job = scheduleJob(CRON_SCHEDULES.PURGE_STALE, () => {
		void runPurgeStaleIdempotencyKeys().catch((err) => {
			console.error("[idempotency-jobs] purge failed", err);
		});
	});

	jobs.set(JOB_NAMES.PURGE_STALE, job);
	console.log(
		`[idempotency-jobs] purge scheduled at ${CRON_SCHEDULES.PURGE_STALE}`,
	);
}

export function cancelAllJobs(): void {
	for (const job of jobs.values()) job.cancel();
	jobs.clear();
}
