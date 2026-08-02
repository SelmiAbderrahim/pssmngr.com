// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors

import {
	AUTH_LIMITS,
	checkRateLimit,
	getClientIp,
	type RateLimitConfig,
	setRateLimitHeaders,
} from "@pssmngr/server/middleware/rate-limiter";
import { beforeEach, describe, expect, test, vi } from "vitest";

/**
 * Creates a mock Redis client with an in-memory sorted set
 * implementation for testing the sliding window rate limiter.
 */
function createMockRedis() {
	const store = new Map<
		string,
		| { type: "zset"; members: Map<string, number> }
		| { type: "string"; value: string; expiresAt: number }
	>();

	function getZset(key: string) {
		let entry = store.get(key);
		if (!entry) {
			entry = { type: "zset", members: new Map() };
			store.set(key, entry);
		}
		if (entry.type !== "zset") return new Map<string, number>();
		return entry.members;
	}

	const pipelineOps: Array<() => [null, unknown]> = [];

	const mockPipeline = {
		zremrangebyscore(key: string, min: number, max: number) {
			pipelineOps.push(() => {
				const members = getZset(key);
				for (const [member, score] of members) {
					if (score >= min && score <= max) {
						members.delete(member);
					}
				}
				return [null, 0];
			});
			return mockPipeline;
		},
		zadd(key: string, score: string, member: string) {
			pipelineOps.push(() => {
				const members = getZset(key);
				members.set(member, Number(score));
				return [null, 1];
			});
			return mockPipeline;
		},
		zcard(key: string) {
			pipelineOps.push(() => {
				const members = getZset(key);
				return [null, members.size];
			});
			return mockPipeline;
		},
		pexpire(_key: string, _ms: number) {
			pipelineOps.push(() => [null, 1]);
			return mockPipeline;
		},
		async exec() {
			const results = pipelineOps.map((op) => op());
			pipelineOps.length = 0;
			return results;
		},
	};

	const redis = {
		pipeline: () => mockPipeline,
		async ttl(key: string) {
			const entry = store.get(key);
			if (!entry || entry.type !== "string") return -2;
			const remaining = Math.ceil((entry.expiresAt - Date.now()) / 1000);
			if (remaining <= 0) {
				store.delete(key);
				return -2;
			}
			return remaining;
		},
		async incr(key: string) {
			const entry = store.get(key);
			if (!entry || entry.type !== "string") {
				store.set(key, {
					type: "string",
					value: "1",
					expiresAt: Date.now() + 3600000,
				});
				return 1;
			}
			const newVal = Number.parseInt(entry.value, 10) + 1;
			entry.value = String(newVal);
			return newVal;
		},
		async expire(key: string, seconds: number) {
			const entry = store.get(key);
			if (entry && entry.type === "string") {
				entry.expiresAt = Date.now() + seconds * 1000;
			}
			return 1;
		},
		async setex(key: string, seconds: number, value: string) {
			store.set(key, {
				type: "string",
				value,
				expiresAt: Date.now() + seconds * 1000,
			});
			return "OK";
		},
		_store: store,
		_clear() {
			store.clear();
		},
	};

	return redis;
}

const TEST_CONFIG: RateLimitConfig = {
	windowMs: 60 * 1000, // 1 minute
	maxAttempts: 3,
	blockDuration: 60, // 60 seconds
	keyPrefix: "rl:test:",
};

// ─── checkRateLimit ──────────────────────────────────────────────────

describe("checkRateLimit", () => {
	let redis: ReturnType<typeof createMockRedis>;

	beforeEach(() => {
		redis = createMockRedis();
	});

	test("allows requests under limit", async () => {
		const result = await checkRateLimit(
			redis as any,
			"rl:test:user1",
			TEST_CONFIG,
		);
		expect(result.allowed).toBe(true);
		expect(result.remaining).toBe(2); // 3 max - 1 current
	});

	test("tracks remaining attempts correctly", async () => {
		const r1 = await checkRateLimit(redis as any, "rl:test:user1", TEST_CONFIG);
		expect(r1.remaining).toBe(2);

		const r2 = await checkRateLimit(redis as any, "rl:test:user1", TEST_CONFIG);
		expect(r2.remaining).toBe(1);

		const r3 = await checkRateLimit(redis as any, "rl:test:user1", TEST_CONFIG);
		expect(r3.remaining).toBe(0);
	});

	test("blocks requests over limit", async () => {
		// Exhaust the limit
		for (let i = 0; i < 3; i++) {
			await checkRateLimit(redis as any, "rl:test:user1", TEST_CONFIG);
		}

		// 4th request should be blocked
		const result = await checkRateLimit(
			redis as any,
			"rl:test:user1",
			TEST_CONFIG,
		);
		expect(result.allowed).toBe(false);
		expect(result.remaining).toBe(0);
		expect(result.retryAfter).toBeGreaterThan(0);
	});

	test("returns retryAfter when blocked", async () => {
		for (let i = 0; i < 4; i++) {
			await checkRateLimit(redis as any, "rl:test:user1", TEST_CONFIG);
		}

		const result = await checkRateLimit(
			redis as any,
			"rl:test:user1",
			TEST_CONFIG,
		);
		expect(result.allowed).toBe(false);
		expect(result.retryAfter).toBeDefined();
		expect(result.retryAfter).toBeGreaterThan(0);
		expect(result.retryAfter).toBeLessThanOrEqual(TEST_CONFIG.blockDuration);
	});

	test("different keys are independent", async () => {
		// Exhaust limit for user1
		for (let i = 0; i < 4; i++) {
			await checkRateLimit(redis as any, "rl:test:user1", TEST_CONFIG);
		}

		// user2 should still be allowed
		const result = await checkRateLimit(
			redis as any,
			"rl:test:user2",
			TEST_CONFIG,
		);
		expect(result.allowed).toBe(true);
		expect(result.remaining).toBe(2);
	});

	test("returns correct limit value", async () => {
		const result = await checkRateLimit(
			redis as any,
			"rl:test:user1",
			TEST_CONFIG,
		);
		expect(result.limit).toBe(TEST_CONFIG.maxAttempts);
	});

	test("returns resetAt timestamp", async () => {
		const before = Math.ceil(Date.now() / 1000);
		const result = await checkRateLimit(
			redis as any,
			"rl:test:user1",
			TEST_CONFIG,
		);
		const after = Math.ceil((Date.now() + TEST_CONFIG.windowMs) / 1000);

		expect(result.resetAt).toBeGreaterThanOrEqual(before);
		expect(result.resetAt).toBeLessThanOrEqual(after + 1);
	});

	test("incremental backoff increases block duration", async () => {
		// First block
		for (let i = 0; i < 4; i++) {
			await checkRateLimit(redis as any, "rl:test:user1", TEST_CONFIG);
		}
		const firstBlock = await checkRateLimit(
			redis as any,
			"rl:test:user1",
			TEST_CONFIG,
		);

		// Clear the block to simulate expiry, but keep blockcount
		redis._store.delete("rl:test:user1:blocked");
		redis._store.delete("rl:test:user1");

		// Second block
		for (let i = 0; i < 4; i++) {
			await checkRateLimit(redis as any, "rl:test:user1", TEST_CONFIG);
		}
		const secondBlock = await checkRateLimit(
			redis as any,
			"rl:test:user1",
			TEST_CONFIG,
		);

		// Second block should have longer duration (2x)
		expect(secondBlock.retryAfter).toBeGreaterThan(firstBlock.retryAfter!);
	});

	test("incremental backoff caps at 4x multiplier", async () => {
		// Generate 6 consecutive blocks to verify cap
		const blockDurations: number[] = [];

		for (let round = 0; round < 6; round++) {
			// Clear block and attempts to simulate expiry
			redis._store.delete("rl:test:capped:blocked");
			redis._store.delete("rl:test:capped");

			// Exhaust limit
			for (let i = 0; i < 4; i++) {
				await checkRateLimit(redis as any, "rl:test:capped", TEST_CONFIG);
			}
			const blocked = await checkRateLimit(
				redis as any,
				"rl:test:capped",
				TEST_CONFIG,
			);
			if (blocked.retryAfter) {
				blockDurations.push(blocked.retryAfter);
			}
		}

		// After 4th block, duration should cap
		// blockDurations: [60, 120, 180, 240, 240, 240]
		const maxDuration = TEST_CONFIG.blockDuration * 4;
		for (const duration of blockDurations.slice(3)) {
			expect(duration).toBeLessThanOrEqual(maxDuration);
		}
	});

	test("lockout expires after block duration", async () => {
		// Block the user
		for (let i = 0; i < 4; i++) {
			await checkRateLimit(redis as any, "rl:test:expiry", TEST_CONFIG);
		}
		const blocked = await checkRateLimit(
			redis as any,
			"rl:test:expiry",
			TEST_CONFIG,
		);
		expect(blocked.allowed).toBe(false);

		// Simulate expiry by removing the block key
		redis._store.delete("rl:test:expiry:blocked");
		redis._store.delete("rl:test:expiry");

		// After expiry, should be allowed again
		const afterExpiry = await checkRateLimit(
			redis as any,
			"rl:test:expiry",
			TEST_CONFIG,
		);
		expect(afterExpiry.allowed).toBe(true);
		expect(afterExpiry.remaining).toBe(2);
	});

	test("blocked request returns correct resetAt in the future", async () => {
		for (let i = 0; i < 4; i++) {
			await checkRateLimit(redis as any, "rl:test:user1", TEST_CONFIG);
		}

		const blocked = await checkRateLimit(
			redis as any,
			"rl:test:user1",
			TEST_CONFIG,
		);
		expect(blocked.allowed).toBe(false);
		expect(blocked.resetAt).toBeGreaterThan(Math.ceil(Date.now() / 1000));
	});

	test("concurrent users do not interfere with each other", async () => {
		// Simulate concurrent requests from different users
		const results = await Promise.all([
			checkRateLimit(redis as any, "rl:test:concurrent1", TEST_CONFIG),
			checkRateLimit(redis as any, "rl:test:concurrent2", TEST_CONFIG),
			checkRateLimit(redis as any, "rl:test:concurrent3", TEST_CONFIG),
		]);

		// All should be allowed with same remaining count
		for (const result of results) {
			expect(result.allowed).toBe(true);
			expect(result.remaining).toBe(2);
		}
	});

	test("account lockout escalates on repeated failures", async () => {
		const durations: number[] = [];

		for (let round = 0; round < 3; round++) {
			redis._store.delete("rl:test:escalate:blocked");
			redis._store.delete("rl:test:escalate");

			for (let i = 0; i < 4; i++) {
				await checkRateLimit(redis as any, "rl:test:escalate", TEST_CONFIG);
			}
			const blocked = await checkRateLimit(
				redis as any,
				"rl:test:escalate",
				TEST_CONFIG,
			);
			if (blocked.retryAfter) {
				durations.push(blocked.retryAfter);
			}
		}

		// Each subsequent block should be longer
		expect(durations[1]!).toBeGreaterThan(durations[0]!);
		expect(durations[2]!).toBeGreaterThan(durations[1]!);
	});
});

// ─── AUTH_LIMITS Configuration ───────────────────────────────────────

describe("AUTH_LIMITS", () => {
	test("login has 5 max attempts in 15 min window", () => {
		expect(AUTH_LIMITS.login.maxAttempts).toBe(5);
		expect(AUTH_LIMITS.login.windowMs).toBe(15 * 60 * 1000);
	});

	test("login blocks for 15 minutes", () => {
		expect(AUTH_LIMITS.login.blockDuration).toBe(15 * 60);
	});

	test("register has 3 max attempts in 1 hour window", () => {
		expect(AUTH_LIMITS.register.maxAttempts).toBe(3);
		expect(AUTH_LIMITS.register.windowMs).toBe(60 * 60 * 1000);
	});

	test("register blocks for 1 hour", () => {
		expect(AUTH_LIMITS.register.blockDuration).toBe(60 * 60);
	});

	test("getSalt has 20 max attempts in 15 min window", () => {
		expect(AUTH_LIMITS.getSalt.maxAttempts).toBe(20);
		expect(AUTH_LIMITS.getSalt.windowMs).toBe(15 * 60 * 1000);
	});

	test("getSalt blocks for 5 minutes", () => {
		expect(AUTH_LIMITS.getSalt.blockDuration).toBe(5 * 60);
	});

	test("verifyTotp has 5 max attempts in 15 min window", () => {
		expect(AUTH_LIMITS.verifyTotp.maxAttempts).toBe(5);
		expect(AUTH_LIMITS.verifyTotp.windowMs).toBe(15 * 60 * 1000);
	});

	test("verifyTotp blocks for 15 minutes", () => {
		expect(AUTH_LIMITS.verifyTotp.blockDuration).toBe(15 * 60);
	});

	test("all configs have unique key prefixes", () => {
		const prefixes = Object.values(AUTH_LIMITS).map((c) => c.keyPrefix);
		expect(new Set(prefixes).size).toBe(prefixes.length);
	});

	test("all configs have positive blockDuration", () => {
		for (const config of Object.values(AUTH_LIMITS)) {
			expect(config.blockDuration).toBeGreaterThan(0);
		}
	});

	test("all configs have positive windowMs", () => {
		for (const config of Object.values(AUTH_LIMITS)) {
			expect(config.windowMs).toBeGreaterThan(0);
		}
	});

	test("all configs have positive maxAttempts", () => {
		for (const config of Object.values(AUTH_LIMITS)) {
			expect(config.maxAttempts).toBeGreaterThan(0);
		}
	});

	test("getSalt has higher maxAttempts than login (legitimate use is more frequent)", () => {
		expect(AUTH_LIMITS.getSalt.maxAttempts).toBeGreaterThan(
			AUTH_LIMITS.login.maxAttempts,
		);
	});

	test("register has the most restrictive maxAttempts", () => {
		const allMaxAttempts = Object.values(AUTH_LIMITS).map((c) => c.maxAttempts);
		expect(AUTH_LIMITS.register.maxAttempts).toBe(Math.min(...allMaxAttempts));
	});
});

// ─── setRateLimitHeaders ─────────────────────────────────────────────

describe("setRateLimitHeaders", () => {
	test("sets standard rate limit headers", () => {
		const headers: Record<string, string | number> = {};
		const res = {
			setHeader: (name: string, value: string | number) => {
				headers[name] = value;
			},
		};

		setRateLimitHeaders(res, {
			allowed: true,
			remaining: 4,
			limit: 5,
			resetAt: 1700000000,
		});

		expect(headers["X-RateLimit-Limit"]).toBe(5);
		expect(headers["X-RateLimit-Remaining"]).toBe(4);
		expect(headers["X-RateLimit-Reset"]).toBe(1700000000);
		expect(headers["Retry-After"]).toBeUndefined();
	});

	test("includes Retry-After when blocked", () => {
		const headers: Record<string, string | number> = {};
		const res = {
			setHeader: (name: string, value: string | number) => {
				headers[name] = value;
			},
		};

		setRateLimitHeaders(res, {
			allowed: false,
			remaining: 0,
			retryAfter: 120,
			limit: 5,
			resetAt: 1700000120,
		});

		expect(headers["Retry-After"]).toBe(120);
		expect(headers["X-RateLimit-Remaining"]).toBe(0);
	});

	test("sets all three standard headers", () => {
		const headers: Record<string, string | number> = {};
		const res = {
			setHeader: (name: string, value: string | number) => {
				headers[name] = value;
			},
		};

		setRateLimitHeaders(res, {
			allowed: true,
			remaining: 19,
			limit: 20,
			resetAt: 1700000900,
		});

		expect(headers).toHaveProperty("X-RateLimit-Limit");
		expect(headers).toHaveProperty("X-RateLimit-Remaining");
		expect(headers).toHaveProperty("X-RateLimit-Reset");
	});

	test("does not set Retry-After when retryAfter is undefined", () => {
		const headers: Record<string, string | number> = {};
		const res = {
			setHeader: (name: string, value: string | number) => {
				headers[name] = value;
			},
		};

		setRateLimitHeaders(res, {
			allowed: true,
			remaining: 3,
			limit: 5,
			resetAt: 1700000060,
		});

		expect(headers["Retry-After"]).toBeUndefined();
	});
});

// ─── getClientIp ─────────────────────────────────────────────────────

describe("getClientIp", () => {
	test("prefers trusted X-Real-IP set by the reverse proxy", () => {
		const ip = getClientIp({
			headers: {
				"x-real-ip": "203.0.113.50",
				// Attacker-supplied spoof; must be ignored in favour of X-Real-IP.
				"x-forwarded-for": "1.2.3.4, 203.0.113.50",
			},
		});
		expect(ip).toBe("203.0.113.50");
	});

	test("uses the rightmost X-Forwarded-For hop, not the client-controlled leftmost", () => {
		// nginx appends the real peer to the right via $proxy_add_x_forwarded_for,
		// so the rightmost entry is the trustworthy one.
		const ip = getClientIp({
			headers: { "x-forwarded-for": "1.2.3.4, 70.41.3.18" },
		});
		expect(ip).toBe("70.41.3.18");
	});

	test("ignores spoofed leftmost X-Forwarded-For tokens (rate-limit evasion)", () => {
		// Even if an attacker rotates the leftmost token on every request, the
		// resolved IP stays pinned to the real proxy-appended peer.
		const a = getClientIp({
			headers: { "x-forwarded-for": "9.9.9.9, 70.41.3.18" },
		});
		const b = getClientIp({
			headers: { "x-forwarded-for": "8.8.8.8, 70.41.3.18" },
		});
		expect(a).toBe("70.41.3.18");
		expect(b).toBe("70.41.3.18");
		expect(a).toBe(b);
	});

	test("handles single X-Forwarded-For value", () => {
		const ip = getClientIp({
			headers: { "x-forwarded-for": "192.168.1.1" },
		});
		expect(ip).toBe("192.168.1.1");
	});

	test("falls back to socket remoteAddress", () => {
		const ip = getClientIp({
			headers: {},
			socket: { remoteAddress: "127.0.0.1" },
		});
		expect(ip).toBe("127.0.0.1");
	});

	test("returns unknown when no IP available", () => {
		const ip = getClientIp({ headers: {} });
		expect(ip).toBe("unknown");
	});

	test("handles array X-Real-IP", () => {
		const ip = getClientIp({
			headers: { "x-real-ip": ["203.0.113.50", "1.2.3.4"] },
		});
		expect(ip).toBe("203.0.113.50");
	});

	test("handles array X-Forwarded-For by taking the rightmost hop", () => {
		const ip = getClientIp({
			headers: { "x-forwarded-for": ["10.0.0.1, 10.0.0.2", "10.0.0.3"] },
		});
		expect(ip).toBe("10.0.0.3");
	});

	test("trims whitespace from extracted IP", () => {
		const ip = getClientIp({
			headers: { "x-forwarded-for": "  1.2.3.4  ,  203.0.113.50  " },
		});
		expect(ip).toBe("203.0.113.50");
	});

	test("extracts proxy-appended IP from multi-proxy chain", () => {
		// X-Forwarded-For: client, proxy1, realPeer(appended by our nginx)
		const ip = getClientIp({
			headers: { "x-forwarded-for": "10.0.0.1, 172.16.0.1, 192.168.1.1" },
		});
		expect(ip).toBe("192.168.1.1");
	});

	test("handles IPv6 addresses", () => {
		const ip = getClientIp({
			headers: {},
			socket: { remoteAddress: "::1" },
		});
		expect(ip).toBe("::1");
	});
});

// ─── Rate Limiting Security Properties ───────────────────────────────

describe("rate limiting - security properties", () => {
	let redis: ReturnType<typeof createMockRedis>;

	beforeEach(() => {
		redis = createMockRedis();
	});

	test("brute force protection: blocks after maxAttempts exceeded", async () => {
		const config: RateLimitConfig = {
			windowMs: 60 * 1000,
			maxAttempts: 5,
			blockDuration: 300,
			keyPrefix: "rl:brute:",
		};

		// 5 attempts should be allowed
		for (let i = 0; i < 5; i++) {
			const result = await checkRateLimit(
				redis as any,
				"rl:brute:target",
				config,
			);
			expect(result.allowed).toBe(true);
		}

		// 6th attempt should be blocked
		const blocked = await checkRateLimit(
			redis as any,
			"rl:brute:target",
			config,
		);
		expect(blocked.allowed).toBe(false);
	});

	test("distributed attack: different IPs tracked independently", async () => {
		// Attacker uses multiple IPs but targets same account
		// IP-based rate limiting: each IP gets its own counter
		for (let i = 0; i < 3; i++) {
			const r = await checkRateLimit(
				redis as any,
				"rl:test:ip-1.1.1.1",
				TEST_CONFIG,
			);
			expect(r.allowed).toBe(true);
		}

		// Different IP starts fresh
		const r = await checkRateLimit(
			redis as any,
			"rl:test:ip-2.2.2.2",
			TEST_CONFIG,
		);
		expect(r.allowed).toBe(true);
		expect(r.remaining).toBe(2);
	});

	test("blocked response includes sufficient information for client", async () => {
		for (let i = 0; i < 4; i++) {
			await checkRateLimit(redis as any, "rl:test:info", TEST_CONFIG);
		}

		const blocked = await checkRateLimit(
			redis as any,
			"rl:test:info",
			TEST_CONFIG,
		);
		expect(blocked).toHaveProperty("allowed", false);
		expect(blocked).toHaveProperty("remaining", 0);
		expect(blocked).toHaveProperty("retryAfter");
		expect(blocked).toHaveProperty("limit");
		expect(blocked).toHaveProperty("resetAt");
		expect(blocked.retryAfter).toBeGreaterThan(0);
	});

	test("same-millisecond requests get distinct sorted-set members (CSPRNG, no undercount)", async () => {
		// Freeze the clock so every request shares the same `now` prefix; only the
		// random suffix can keep the ZSET members distinct. A predictable/colliding
		// suffix would make the second ZADD overwrite the first member, so ZCARD
		// would undercount and the limiter would silently let extra attempts
		// through under a same-tick burst.
		const fixed = 1_700_000_000_000;
		const spy = vi.spyOn(Date, "now").mockReturnValue(fixed);
		try {
			const config: RateLimitConfig = {
				windowMs: 60_000,
				maxAttempts: 10_000,
				blockDuration: 60,
				keyPrefix: "rl:uniq:",
			};
			const N = 64;
			for (let i = 0; i < N; i++) {
				await checkRateLimit(redis as any, "rl:uniq:same-ms", config);
			}
			const entry = redis._store.get("rl:uniq:same-ms");
			expect(entry?.type).toBe("zset");
			if (entry?.type === "zset") {
				// N inserts within one millisecond → N distinct members.
				expect(entry.members.size).toBe(N);
			}
		} finally {
			spy.mockRestore();
		}
	});
});
