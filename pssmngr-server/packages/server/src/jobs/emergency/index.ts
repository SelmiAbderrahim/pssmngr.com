// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Emergency Access Scheduled Jobs
 *
 * Background job that checks for expired pending emergency access requests
 * and auto-grants them.
 *
 * Schedule: Every hour at minute 0.
 *
 * @module @pssmngr/server/jobs/emergency
 */

import { type Job, scheduledJobs, scheduleJob } from "node-schedule";
import { runAutoGrantCheck } from "./auto-grant";

export const JOB_NAMES = {
	AUTO_GRANT: "emergency-auto-grant",
} as const;

export const CRON_SCHEDULES = {
	// Every hour at minute 0
	AUTO_GRANT: "0 * * * *",
} as const;

const jobs: Map<string, Job> = new Map();

/**
 * Initialize emergency access background jobs.
 * Call once at server startup.
 */
export function initializeEmergencyJobs(): void {
	const isEnabled = process.env.EMERGENCY_JOBS_ENABLED !== "false";

	if (!isEnabled) {
		console.log(
			"[emergency-jobs] Emergency jobs disabled via EMERGENCY_JOBS_ENABLED",
		);
		return;
	}

	console.log("[emergency-jobs] Initializing emergency scheduled jobs");

	cancelAllJobs();

	const autoGrantJob = scheduleJob(
		JOB_NAMES.AUTO_GRANT,
		{ rule: CRON_SCHEDULES.AUTO_GRANT, tz: "UTC" },
		async () => {
			try {
				const result = await runAutoGrantCheck();
				if (!result.success) {
					console.error("[emergency-jobs] Auto-grant check failed", result);
				} else if (result.requestsProcessed > 0) {
					console.log("[emergency-jobs] Auto-grant check completed", {
						processed: result.requestsProcessed,
						granted: result.requestsGranted,
						skipped: result.requestsSkipped,
					});
				}
			} catch (error) {
				console.error("[emergency-jobs] Auto-grant check error", {
					error: error instanceof Error ? error.message : String(error),
				});
			}
		},
	);

	if (autoGrantJob) {
		jobs.set(JOB_NAMES.AUTO_GRANT, autoGrantJob);
	}

	console.log("[emergency-jobs] All emergency jobs scheduled successfully", {
		jobs: Object.values(JOB_NAMES),
		schedules: CRON_SCHEDULES,
	});
}

export function cancelAllJobs(): void {
	for (const [name, job] of jobs) {
		job.cancel();
		console.log(`[emergency-jobs] Cancelled job: ${name}`);
	}
	jobs.clear();

	for (const name of Object.values(JOB_NAMES)) {
		const existingJob = scheduledJobs[name];
		if (existingJob) {
			existingJob.cancel();
		}
	}
}

export function getJobsStatus(): {
	name: string;
	scheduled: boolean;
	nextInvocation: Date | null;
}[] {
	return Object.values(JOB_NAMES).map((name) => {
		const job = jobs.get(name) || scheduledJobs[name];
		return {
			name,
			scheduled: Boolean(job),
			nextInvocation: job?.nextInvocation() || null,
		};
	});
}

export async function runJobManually(jobName: "auto-grant"): Promise<unknown> {
	console.log(`[emergency-jobs] Manually running job: ${jobName}`);
	switch (jobName) {
		case "auto-grant":
			return runAutoGrantCheck();
		default:
			throw new Error(`Unknown job name: ${jobName}`);
	}
}

export { runAutoGrantCheck } from "./auto-grant";
