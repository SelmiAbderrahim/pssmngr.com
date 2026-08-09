// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { randomBytes } from "node:crypto";
import type Redis from "ioredis";

export interface RateLimitConfig {
	/** Time window in milliseconds */
	windowMs: number;
	/** Maximum attempts allowed per window */
	maxAttempts: number;
	/** Block duration in seconds after exceeding maxAttempts */
	blockDuration: number;
	/** Redis key prefix */
	keyPrefix: string;
}

export interface RateLimitResult {
	allowed: boolean;
	remaining: number;
	/** Seconds until the block expires (present when blocked) */
	retryAfter?: number;
	/** Total limit for the window */
	limit: number;
	/** Unix timestamp (seconds) when the current window resets */
	resetAt: number;
}

/** Rate limit presets for auth endpoints */
export const AUTH_LIMITS = {
	login: {
		windowMs: 15 * 60 * 1000,
		maxAttempts: 5,
		blockDuration: 15 * 60,
		keyPrefix: "rl:auth:login:",
	},
	register: {
		windowMs: 60 * 60 * 1000,
		maxAttempts: 3,
		blockDuration: 60 * 60,
		keyPrefix: "rl:auth:register:",
	},
	getSalt: {
		windowMs: 15 * 60 * 1000,
		maxAttempts: 20,
		blockDuration: 5 * 60,
		keyPrefix: "rl:auth:salt:",
	},
	verifyTotp: {
		windowMs: 15 * 60 * 1000,
		maxAttempts: 5,
		blockDuration: 15 * 60,
		keyPrefix: "rl:auth:totp:",
	},
	authenticated: {
		windowMs: 60 * 1000,
		maxAttempts: 120,
		blockDuration: 60,
		keyPrefix: "rl:api:auth:",
	},
} as const satisfies Record<string, RateLimitConfig>;

/**
 * Sliding-window rate limiter backed by Redis sorted sets.
 *
 * Each request is stored as a member with score = timestamp.
 * On each check we:
 *   1. Remove entries older than the window
 *   2. Check for an active block key
 *   3. Count remaining entries in the window
 *   4. If over limit, set a block key with TTL
 *
 * All operations run inside a Redis pipeline for atomicity.
 */
export async function checkRateLimit(
	redis: Redis,
	key: string,
	config: RateLimitConfig,
): Promise<RateLimitResult> {
	const now = Date.now();
	const windowStart = now - config.windowMs;
	const blockKey = `${key}:blocked`;

	// Check if currently blocked
	const blockedTtl = await redis.ttl(blockKey);
	if (blockedTtl > 0) {
		return {
			allowed: false,
			remaining: 0,
			retryAfter: blockedTtl,
			limit: config.maxAttempts,
			resetAt: Math.ceil(now / 1000) + blockedTtl,
		};
	}

	// Atomic pipeline: clean old entries, add current, count
	const pipeline = redis.pipeline();
	pipeline.zremrangebyscore(key, 0, windowStart);
	// Unique sorted-set member per request. Use a CSPRNG, not Math.random():
	// a predictable suffix lets two requests in the same millisecond collide on
	// the same member, so the second ZADD overwrites rather than inserts and the
	// ZCARD undercounts — quietly relaxing the limit under a burst. 16 random
	// bytes make collisions cryptographically negligible.
	const member = `${now}:${randomBytes(16).toString("hex")}`;
	pipeline.zadd(key, now.toString(), member);
	pipeline.zcard(key);
	pipeline.pexpire(key, config.windowMs);
	const results = await pipeline.exec();

	// results[2] is the ZCARD result: [error, count]
	const count = (results?.[2]?.[1] as number) ?? 0;
	const remaining = Math.max(0, config.maxAttempts - count);
	const resetAt = Math.ceil((now + config.windowMs) / 1000);

	if (count > config.maxAttempts) {
		// Block the key with incremental backoff
		// Check how many times this key has been blocked before
		const blockCountKey = `${key}:blockcount`;
		const blockCount = await redis.incr(blockCountKey);
		await redis.expire(blockCountKey, config.blockDuration * 4);

		// Incremental backoff: multiply block duration by block count (capped at 4x)
		const multiplier = Math.min(blockCount, 4);
		const effectiveBlockDuration = config.blockDuration * multiplier;

		await redis.setex(blockKey, effectiveBlockDuration, "1");

		return {
			allowed: false,
			remaining: 0,
			retryAfter: effectiveBlockDuration,
			limit: config.maxAttempts,
			resetAt: Math.ceil(now / 1000) + effectiveBlockDuration,
		};
	}

	return {
		allowed: true,
		remaining,
		limit: config.maxAttempts,
		resetAt,
	};
}

/**
 * Set rate-limit response headers on the HTTP response.
 */
export function setRateLimitHeaders(
	res: { setHeader(name: string, value: string | number): void },
	result: RateLimitResult,
): void {
	res.setHeader("X-RateLimit-Limit", result.limit);
	res.setHeader("X-RateLimit-Remaining", result.remaining);
	res.setHeader("X-RateLimit-Reset", result.resetAt);
	if (result.retryAfter != null) {
		res.setHeader("Retry-After", result.retryAfter);
	}
}

/**
 * Extract the client IP from a request in a way that cannot be spoofed by the
 * client.
 *
 * SECURITY: The leftmost `X-Forwarded-For` token is fully attacker-controlled
 * (the client can send any value and the reverse proxy only *appends* the real
 * peer to the right via nginx's `$proxy_add_x_forwarded_for`). Trusting it would
 * let an attacker rotate the header to evade per-IP rate limiting, satisfy
 * session IP pinning with a stolen token, or bypass share-link IP restrictions.
 *
 * Our own reverse proxy sets `X-Real-IP $remote_addr`, which it *overwrites*
 * (not appends) on every request, so it reflects the true connecting peer and
 * is safe to trust. We therefore prefer `X-Real-IP`, then fall back to the
 * *rightmost* `X-Forwarded-For` hop (the entry the closest trusted proxy added),
 * then the direct socket address. The leftmost XFF token is never trusted.
 */
export function getClientIp(req: {
	headers: Record<string, string | string[] | undefined>;
	socket?: { remoteAddress?: string };
}): string {
	const realIp = req.headers["x-real-ip"];
	const realIpValue = Array.isArray(realIp) ? realIp[0] : realIp;
	if (realIpValue) {
		const trimmed = realIpValue.trim();
		if (trimmed) return trimmed;
	}

	const forwarded = req.headers["x-forwarded-for"];
	const forwardedValue = Array.isArray(forwarded)
		? forwarded.join(",")
		: forwarded;
	if (forwardedValue) {
		const parts = forwardedValue
			.split(",")
			.map((p) => p.trim())
			.filter(Boolean);
		// Trust only the rightmost hop — the value appended by our reverse proxy.
		const rightmost = parts[parts.length - 1];
		if (rightmost) return rightmost;
	}

	return req.socket?.remoteAddress ?? "unknown";
}
