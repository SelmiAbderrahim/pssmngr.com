// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Scheduled Jobs
 *
 * Central export for all scheduled background jobs.
 *
 * @module @pssmngr/server/jobs
 */

// GDPR data-export jobs
export {
	CRON_SCHEDULES as DATA_EXPORT_CRON_SCHEDULES,
	cancelAllJobs as cancelAllDataExportJobs,
	enqueueExportJob,
	initializeDataExportJobs,
	JOB_NAMES as DATA_EXPORT_JOB_NAMES,
	recoverInflightJobs as recoverInflightDataExportJobs,
	runExpireOldExports,
	runPurgeStaleFailedExports,
} from "./data-export-job";
// Emergency Access Jobs
export {
	CRON_SCHEDULES as EMERGENCY_CRON_SCHEDULES,
	cancelAllJobs as cancelAllEmergencyJobs,
	getJobsStatus as getEmergencyJobsStatus,
	initializeEmergencyJobs,
	JOB_NAMES as EMERGENCY_JOB_NAMES,
	runAutoGrantCheck,
	runJobManually as runEmergencyJobManually,
} from "./emergency";
// Idempotency-key cleanup for offline sync
export {
	CRON_SCHEDULES as IDEMPOTENCY_CRON_SCHEDULES,
	cancelAllJobs as cancelAllIdempotencyJobs,
	initializeIdempotencyJobs,
	JOB_NAMES as IDEMPOTENCY_JOB_NAMES,
	runPurgeStaleIdempotencyKeys,
} from "./idempotency";
