// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors

import { auth } from "@pssmngr/server/index";
import {
	AUTH_LIMITS,
	checkRateLimit,
	getClientIp,
	setRateLimitHeaders,
} from "@pssmngr/server/middleware/rate-limiter";
import { getRedisClient } from "@pssmngr/server/utils/redis";
import { toNodeHandler } from "better-auth/node";
import type { NextApiRequest, NextApiResponse } from "next";

// Disallow body parsing, we will parse it manually
export const config = { api: { bodyParser: false } };

/** Paths that need rate limiting and their config + key strategy */
const RATE_LIMITED_PATHS: Record<
	string,
	{
		config: (typeof AUTH_LIMITS)[keyof typeof AUTH_LIMITS];
		keyFn: (ip: string) => string;
	}
> = {
	"/sign-in/email": {
		config: AUTH_LIMITS.login,
		keyFn: (ip) => `${AUTH_LIMITS.login.keyPrefix}${ip}`,
	},
	"/sign-up/email": {
		config: AUTH_LIMITS.register,
		keyFn: (ip) => `${AUTH_LIMITS.register.keyPrefix}${ip}`,
	},
	// Social sign-in initiation (Google/GitHub). The OAuth callbacks are GETs
	// and stay unlimited — better-auth validates the state server-side.
	"/sign-in/social": {
		config: AUTH_LIMITS.login,
		keyFn: (ip) => `${AUTH_LIMITS.login.keyPrefix}${ip}`,
	},
	// Two-factor verification at the login step. Without an explicit limit a
	// 6-digit TOTP / backup code could be brute-forced. better-auth's two-factor
	// plugin exposes these endpoints under the auth catch-all route.
	"/two-factor/verify-totp": {
		config: AUTH_LIMITS.verifyTotp,
		keyFn: (ip) => `${AUTH_LIMITS.verifyTotp.keyPrefix}${ip}`,
	},
	"/two-factor/verify-backup-code": {
		config: AUTH_LIMITS.verifyTotp,
		keyFn: (ip) => `${AUTH_LIMITS.verifyTotp.keyPrefix}${ip}`,
	},
	"/two-factor/verify-otp": {
		config: AUTH_LIMITS.verifyTotp,
		keyFn: (ip) => `${AUTH_LIMITS.verifyTotp.keyPrefix}${ip}`,
	},
	"/two-factor/enable": {
		config: AUTH_LIMITS.verifyTotp,
		keyFn: (ip) => `${AUTH_LIMITS.verifyTotp.keyPrefix}change:${ip}`,
	},
	"/two-factor/disable": {
		config: AUTH_LIMITS.verifyTotp,
		keyFn: (ip) => `${AUTH_LIMITS.verifyTotp.keyPrefix}change:${ip}`,
	},
	"/two-factor/generate-backup-codes": {
		config: AUTH_LIMITS.verifyTotp,
		keyFn: (ip) => `${AUTH_LIMITS.verifyTotp.keyPrefix}change:${ip}`,
	},
};

/**
 * Organization writes are owned by the tRPC router, where plan capacity,
 * ownership re-checks, and advisory locks are enforced. Keep Better Auth's
 * organization reads and set-active endpoint for session management only.
 */
const TRPC_ONLY_ORGANIZATION_WRITES = new Set([
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
]);

const betterAuthHandler = toNodeHandler(auth.handler);

export default async function handler(
	req: NextApiRequest,
	res: NextApiResponse,
) {
	// Extract the sub-path from the catch-all route
	const slug = Array.isArray(req.query.all)
		? req.query.all.join("/")
		: req.query.all || "";
	const subPath = `/${slug}`;

	if (req.method !== "GET" && TRPC_ONLY_ORGANIZATION_WRITES.has(subPath)) {
		res.status(403).json({
			error: "Use the application organization API for this action.",
		});
		return;
	}

	const rateLimitEntry = RATE_LIMITED_PATHS[subPath];
	if (rateLimitEntry && req.method === "POST") {
		try {
			const redis = getRedisClient();
			const ip = getClientIp(req);
			const result = await checkRateLimit(
				redis,
				rateLimitEntry.keyFn(ip),
				rateLimitEntry.config,
			);
			setRateLimitHeaders(res, result);

			if (!result.allowed) {
				res.status(429).json({
					error: `Too many requests. Try again in ${result.retryAfter} seconds.`,
				});
				return;
			}
		} catch {
			// SECURITY: fail closed. These are sensitive credential/2FA endpoints,
			// so if the rate-limiter backend (Redis) is unavailable we must not let
			// requests through unthrottled — that would silently remove the only
			// per-IP brute-force protection. Reject with 503 instead.
			res.status(503).json({
				error: "Service temporarily unavailable. Please try again shortly.",
			});
			return;
		}
	}

	return betterAuthHandler(req, res);
}
