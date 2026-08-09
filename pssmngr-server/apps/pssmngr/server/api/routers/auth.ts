// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors

import { createHmac } from "node:crypto";
import { session as sessionTable, vault } from "@pssmngr/server/db/schema";
import { badRequestError, notFoundError } from "@pssmngr/server/i18n/errors";
import { auth } from "@pssmngr/server/lib/auth";
import {
	AUTH_LIMITS,
	checkRateLimit,
	getClientIp,
	setRateLimitHeaders,
} from "@pssmngr/server/middleware/rate-limiter";
import { getRedisClient } from "@pssmngr/server/utils/redis";
import { TRPCError } from "@trpc/server";
import { and, eq, gt, isNull, ne } from "drizzle-orm";
import type { TFunction } from "i18next";
import { z } from "zod/v3";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";

/**
 * Generate a deterministic dummy salt for non-existent emails.
 * Uses HMAC-SHA256 with the server's ENCRYPTION_KEY so the output
 * is stable per email but unpredictable without the secret.
 * Returns a base64-encoded 16-byte value (same length as real salts).
 */
function generateDummySalt(email: string): string {
	const secret = process.env.ENCRYPTION_KEY;
	if (!secret) {
		throw new Error("ENCRYPTION_KEY is required for anti-enumeration salt");
	}
	return createHmac("sha256", secret)
		.update(email)
		.digest("base64")
		.slice(0, 24); // 24 base64 chars ≈ 16 bytes
}

/**
 * Generate a deterministic dummy verification blob for emails that have no
 * vault (non-existent account, or an account that never finished vault setup).
 *
 * SECURITY (anti-enumeration): a real `encryptedVerificationBlob` is the
 * base64 of `[24-byte nonce][16-byte sentinel ciphertext][16-byte tag]` = 56
 * bytes. If we returned `null` for unknown emails, the presence/absence of the
 * blob would reveal which addresses are registered. We instead return an
 * indistinguishable 56-byte HMAC-derived value: stable per email, unpredictable
 * without the server secret, and — having no valid key — it simply fails to
 * decrypt on the client exactly like a wrong master password would.
 */
function generateDummyVerificationBlob(email: string): string {
	const secret = process.env.ENCRYPTION_KEY;
	if (!secret) {
		throw new Error("ENCRYPTION_KEY is required for anti-enumeration blob");
	}
	const block0 = createHmac("sha256", secret)
		.update(`vblob:0:${email}`)
		.digest();
	const block1 = createHmac("sha256", secret)
		.update(`vblob:1:${email}`)
		.digest();
	return Buffer.concat([block0, block1]).subarray(0, 56).toString("base64");
}

/**
 * Helper to enforce rate limiting inside a tRPC procedure.
 * Throws TOO_MANY_REQUESTS and sets response headers when blocked.
 */
async function enforceRateLimit(
	key: string,
	config: (typeof AUTH_LIMITS)[keyof typeof AUTH_LIMITS],
	res: { setHeader(name: string, value: string | number): void },
	t: TFunction,
) {
	const redis = getRedisClient();
	const result = await checkRateLimit(redis, key, config);
	setRateLimitHeaders(res, result);

	if (!result.allowed) {
		throw new TRPCError({
			code: "TOO_MANY_REQUESTS",
			message: t("errors:auth.rateLimited", { seconds: result.retryAfter }),
		});
	}
}

export const authRouter = createTRPCRouter({
	/**
	 * Fetch the KDF salt for a given email address.
	 * Rate limited by IP to prevent enumeration scraping.
	 */
	getSalt: publicProcedure
		.input(z.object({ email: z.string().email() }).strict())
		.query(async ({ input, ctx }) => {
			const ip = getClientIp(ctx.req);
			await enforceRateLimit(
				`${AUTH_LIMITS.getSalt.keyPrefix}${ip}`,
				AUTH_LIMITS.getSalt,
				ctx.res,
				ctx.t,
			);

			const userRecord = await ctx.db.query.user.findFirst({
				where: (u, { eq }) => eq(u.email, input.email),
				columns: { id: true },
			});

			if (!userRecord) {
				return {
					salt: generateDummySalt(input.email),
					encryptedVerificationBlob: generateDummyVerificationBlob(input.email),
				};
			}

			const userVault = await ctx.db.query.vault.findFirst({
				where: eq(vault.userId, userRecord.id),
				columns: { kdfSalt: true, encryptedVerificationBlob: true },
			});

			// NOTE: a registered user who has not finished vault setup (e.g. an
			// invited member before onboarding) intentionally returns a null blob
			// so the client proceeds to vault creation instead of failing
			// pre-auth verification. The primary enumeration oracle — telling an
			// unknown email apart from a fully set-up account — is closed because
			// both now return a non-null blob of identical shape.
			return {
				salt: userVault?.kdfSalt ?? generateDummySalt(input.email),
				encryptedVerificationBlob: userVault?.encryptedVerificationBlob ?? null,
			};
		}),

	/**
	 * Create a vault for the authenticated user with the provided KDF salt.
	 * Called once after first login to initialize client-side encryption.
	 */
	setupVault: protectedProcedure
		.input(
			z
				.object({
					kdfSalt: z
						.string()
						.min(24, "Salt must be at least 24 base64 characters"),
					vaultName: z.string().min(1).max(100).optional(),
					encryptedVerificationBlob: z.string().min(1).optional(),
				})
				.strict(),
		)
		.mutation(async ({ input, ctx }) => {
			const organizationId = ctx.session.activeOrganizationId || null;
			const existing = await ctx.db.query.vault.findFirst({
				where: and(
					eq(vault.userId, ctx.user.id),
					organizationId
						? eq(vault.organizationId, organizationId)
						: isNull(vault.organizationId),
				),
				columns: { id: true },
			});

			if (existing) {
				throw new TRPCError({
					code: "CONFLICT",
					message: ctx.t("errors:auth.vaultAlreadyExists"),
				});
			}

			const [created] = await ctx.db
				.insert(vault)
				.values({
					userId: ctx.user.id,
					organizationId,
					name: input.vaultName ?? ctx.t("errors:defaults.personalVaultName"),
					kdfSalt: input.kdfSalt,
					encryptedVerificationBlob: input.encryptedVerificationBlob ?? null,
				})
				.returning();

			return created;
		}),

	/**
	 * Verify a TOTP code to complete 2FA enrollment or login challenge.
	 * Rate limited by userId to prevent brute force.
	 */
	verifyTotp: protectedProcedure
		.input(z.object({ code: z.string().length(6) }).strict())
		.mutation(async ({ input, ctx }) => {
			await enforceRateLimit(
				`${AUTH_LIMITS.verifyTotp.keyPrefix}${ctx.user.id}`,
				AUTH_LIMITS.verifyTotp,
				ctx.res,
				ctx.t,
			);

			const headers = new Headers({
				cookie: ctx.req.headers.cookie || "",
			});
			try {
				const result = await auth.api.verifyTOTP({
					body: { code: input.code },
					headers,
				});
				return result;
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: ctx.t("errors:auth.invalidTotp"),
				});
			}
		}),

	/**
	 * List all active sessions for the current user.
	 * Returns session metadata (IP, user agent, timestamps) for the settings UI.
	 */
	listSessions: protectedProcedure.query(async ({ ctx }) => {
		const sessions = await ctx.db
			.select({
				id: sessionTable.id,
				createdAt: sessionTable.createdAt,
				expiresAt: sessionTable.expiresAt,
				ipAddress: sessionTable.ipAddress,
				userAgent: sessionTable.userAgent,
			})
			.from(sessionTable)
			.where(
				and(
					eq(sessionTable.userId, ctx.user.id),
					gt(sessionTable.expiresAt, new Date()),
				),
			);

		return sessions.map((s) => ({
			...s,
			isCurrent: s.id === ctx.session.id,
		}));
	}),

	/**
	 * Revoke a specific session by ID. Only the session owner can revoke it.
	 */
	revokeSession: protectedProcedure
		.input(z.object({ sessionId: z.string().min(1) }).strict())
		.mutation(async ({ input, ctx }) => {
			// Prevent revoking own current session via this endpoint
			if (input.sessionId === ctx.session.id) {
				throw badRequestError(ctx.t, "errors:auth.useLogout");
			}

			const target = await ctx.db.query.session.findFirst({
				where: and(
					eq(sessionTable.id, input.sessionId),
					eq(sessionTable.userId, ctx.user.id),
				),
			});

			if (!target) {
				throw notFoundError(ctx.t, "session");
			}

			await ctx.db
				.delete(sessionTable)
				.where(eq(sessionTable.id, input.sessionId));

			return { success: true };
		}),

	/**
	 * Revoke all sessions except the current one.
	 * Useful when a user suspects account compromise.
	 */
	revokeAllSessions: protectedProcedure.mutation(async ({ ctx }) => {
		const result = await ctx.db
			.delete(sessionTable)
			.where(
				and(
					eq(sessionTable.userId, ctx.user.id),
					ne(sessionTable.id, ctx.session.id),
				),
			);

		return { success: true };
	}),
});
