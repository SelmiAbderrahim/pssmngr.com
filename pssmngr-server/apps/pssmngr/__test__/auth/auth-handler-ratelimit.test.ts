// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors

import type { NextApiRequest, NextApiResponse } from "next";
import { beforeEach, describe, expect, test, vi } from "vitest";

// ─── Mocks ───────────────────────────────────────────────────────────
// The auth catch-all handler wires together better-auth, Redis and the
// rate-limiter. We mock those so we can exercise the rate-limit decision
// logic (which paths are limited, and the fail-closed behaviour) in isolation.

const { betterAuthHandler, getRedisClient, checkRateLimit } = vi.hoisted(
	() => ({
		betterAuthHandler: vi.fn(),
		getRedisClient: vi.fn(() => ({}) as never),
		checkRateLimit: vi.fn(),
	}),
);

vi.mock("better-auth/node", () => ({
	toNodeHandler: () => betterAuthHandler,
}));

vi.mock("@pssmngr/server/index", () => ({
	auth: { handler: vi.fn() },
}));

vi.mock("@pssmngr/server/utils/redis", () => ({
	getRedisClient: () => getRedisClient(),
}));

vi.mock("@pssmngr/server/middleware/rate-limiter", async () => {
	const actual = await vi.importActual<
		typeof import("@pssmngr/server/middleware/rate-limiter")
	>("@pssmngr/server/middleware/rate-limiter");
	return {
		...actual,
		checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
	};
});

import handler from "../../pages/api/auth/[...all]";

function makeReqRes(
	slug: string,
	headers: Record<string, string> = {},
	method = "POST",
) {
	const req = {
		query: { all: slug.split("/").filter(Boolean) },
		method,
		headers: { "x-real-ip": "203.0.113.7", ...headers },
	} as unknown as NextApiRequest;

	const res = {
		statusCode: 200,
		body: undefined as unknown,
		status(code: number) {
			this.statusCode = code;
			return this;
		},
		json(payload: unknown) {
			this.body = payload;
			return this;
		},
		setHeader: vi.fn(),
	};
	return { req, res: res as unknown as NextApiResponse & typeof res };
}

const allowed = { allowed: true, remaining: 4, limit: 5, resetAt: 0 };
const blocked = {
	allowed: false,
	remaining: 0,
	limit: 5,
	resetAt: 0,
	retryAfter: 900,
};

beforeEach(() => {
	vi.clearAllMocks();
	getRedisClient.mockReturnValue({} as never);
});

describe("auth catch-all rate limiting", () => {
	test.each([
		"/sign-in/email",
		"/sign-up/email",
		"/sign-in/social",
		"/two-factor/verify-totp",
		"/two-factor/verify-backup-code",
		"/two-factor/verify-otp",
		"/two-factor/enable",
		"/two-factor/disable",
		"/two-factor/generate-backup-codes",
	])("rate-limits the sensitive path %s", async (path) => {
		checkRateLimit.mockResolvedValue(blocked);
		const { req, res } = makeReqRes(path);

		await handler(req, res);

		expect(checkRateLimit).toHaveBeenCalledTimes(1);
		expect(res.statusCode).toBe(429);
		expect(betterAuthHandler).not.toHaveBeenCalled();
	});

	test("2FA verification endpoints are covered (brute-force protection)", async () => {
		// Regression guard: these must remain in the rate-limited set.
		checkRateLimit.mockResolvedValue(allowed);
		for (const path of [
			"/two-factor/verify-totp",
			"/two-factor/verify-backup-code",
			"/two-factor/verify-otp",
			"/two-factor/enable",
			"/two-factor/disable",
			"/two-factor/generate-backup-codes",
		]) {
			checkRateLimit.mockClear();
			const { req, res } = makeReqRes(path);
			await handler(req, res);
			expect(checkRateLimit).toHaveBeenCalledTimes(1);
		}
	});

	test("fails CLOSED with 503 when the rate-limiter backend is unavailable", async () => {
		// SECURITY: a Redis outage must not silently disable brute-force protection.
		checkRateLimit.mockRejectedValue(new Error("redis down"));
		const { req, res } = makeReqRes("/sign-in/email");

		await handler(req, res);

		expect(res.statusCode).toBe(503);
		expect(betterAuthHandler).not.toHaveBeenCalled();
	});

	test("allows the request through when under the limit", async () => {
		checkRateLimit.mockResolvedValue(allowed);
		const { req, res } = makeReqRes("/sign-in/email");

		await handler(req, res);

		expect(betterAuthHandler).toHaveBeenCalledTimes(1);
	});

	test("does not rate-limit non-sensitive auth paths", async () => {
		const { req, res } = makeReqRes("/get-session");

		await handler(req, res);

		expect(checkRateLimit).not.toHaveBeenCalled();
		expect(betterAuthHandler).toHaveBeenCalledTimes(1);
	});

	test.each(["/callback/google", "/callback/github"])(
		"does not rate-limit the OAuth GET callback %s (state is validated by better-auth)",
		async (path) => {
			const { req, res } = makeReqRes(path, {}, "GET");

			await handler(req, res);

			expect(checkRateLimit).not.toHaveBeenCalled();
			expect(betterAuthHandler).toHaveBeenCalledTimes(1);
		},
	);
});

describe("organization mutation boundary", () => {
	test.each([
		"/organization/create",
		"/organization/update",
		"/organization/delete",
		"/organization/add-member",
		"/organization/remove-member",
		"/organization/update-member-role",
		"/organization/leave",
		"/organization/invite-member",
		"/organization/accept-invitation",
		"/organization/reject-invitation",
		"/organization/cancel-invitation",
	])("routes %s writes through guarded tRPC procedures", async (path) => {
		const { req, res } = makeReqRes(path);

		await handler(req, res);

		expect(res.statusCode).toBe(403);
		expect(res.body).toEqual({
			error: "Use the application organization API for this action.",
		});
		expect(betterAuthHandler).not.toHaveBeenCalled();
	});

	test.each([
		["/get-session", "GET"],
		["/organization/list", "GET"],
		["/organization/list-members", "GET"],
		["/organization/set-active", "POST"],
	])("preserves Better Auth session/read route %s", async (path, method) => {
		const { req, res } = makeReqRes(path, {}, method);

		await handler(req, res);

		expect(res.statusCode).toBe(200);
		expect(betterAuthHandler).toHaveBeenCalledTimes(1);
	});
});
