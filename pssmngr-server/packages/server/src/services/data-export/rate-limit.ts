// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Per-user rate limit for `dataExport.create`.
 *
 * Spec: 2 requests per hour per user. The 3rd in the same hour
 * raises `TOO_MANY_REQUESTS`. Backed by Redis when REDIS_URL is
 * configured; falls back to an in-process counter for unit tests
 * (no Redis container required there).
 */
import { getRedisClient } from "../../utils/redis";

const WINDOW_SECONDS = 60 * 60;
const MAX_REQUESTS = 2;

interface BucketEntry {
	count: number;
	resetAt: number; // ms epoch
}

const memoryBuckets = new Map<string, BucketEntry>();

/**
 * Returns true when the call should be allowed; false when the user
 * exceeded their quota. Increments on every call.
 */
export async function consumeCreateQuota(userId: string): Promise<boolean> {
	const key = `rl:dataExport:create:${userId}`;
	const useRedis = Boolean(process.env.REDIS_URL || process.env.REDIS_HOST);
	if (useRedis) {
		try {
			const redis = getRedisClient();
			const count = await redis.incr(key);
			if (count === 1) {
				await redis.expire(key, WINDOW_SECONDS);
			}
			return count <= MAX_REQUESTS;
		} catch {
			// Fall through to in-memory if redis is unreachable mid-test.
		}
	}

	const now = Date.now();
	const existing = memoryBuckets.get(key);
	if (!existing || existing.resetAt <= now) {
		memoryBuckets.set(key, {
			count: 1,
			resetAt: now + WINDOW_SECONDS * 1000,
		});
		return true;
	}
	existing.count += 1;
	return existing.count <= MAX_REQUESTS;
}

/** Test seam — wipes both Redis and in-memory state for a user. */
export async function __resetCreateQuotaForTests(
	userId: string,
): Promise<void> {
	const key = `rl:dataExport:create:${userId}`;
	memoryBuckets.delete(key);
	if (!process.env.REDIS_URL && !process.env.REDIS_HOST) return;
	try {
		const redis = getRedisClient();
		await redis.del(key);
	} catch {
		// ignore — redis may be unavailable in unit tests
	}
}
