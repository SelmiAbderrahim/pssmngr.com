// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * GDPR data-export tRPC router.
 *
 * All procedures require an interactive better-auth session
 * (`protectedProcedure`). The download itself is NOT a tRPC procedure
 * — it is a token-gated HTTP route (`/data-export/download/<token>`)
 * registered separately in the Next custom server so the link works
 * pasted into any browser without the user's cookie.
 */

import { badRequestError, notFoundError } from "@pssmngr/server/i18n";
import { enqueueExportJob } from "@pssmngr/server/jobs";
import {
	consumeCreateQuota,
	createExportRequest,
	DataExportConflictError,
	DataExportNotFoundError,
	getExportRequest,
	listExportRequests,
	revokeExportRequest,
} from "@pssmngr/server/services/data-export";
import { TRPCError } from "@trpc/server";
import { z } from "zod/v3";
import { createTRPCRouter, protectedProcedure } from "../trpc";

const formatSchema = z.enum(["JSON", "CSV", "BOTH"]).default("BOTH");

function clientIp(req: {
	headers: Record<string, string | string[] | undefined>;
	socket?: { remoteAddress?: string };
}): string | null {
	const realIp = req.headers["x-real-ip"];
	if (typeof realIp === "string") {
		return realIp.trim() || null;
	}
	if (Array.isArray(realIp) && realIp.length > 0) {
		return realIp[0]?.trim() || null;
	}
	return req.socket?.remoteAddress ?? null;
}

function userAgent(req: {
	headers: Record<string, string | string[] | undefined>;
}): string | null {
	const raw = req.headers["user-agent"];
	if (typeof raw === "string") return raw.slice(0, 512);
	if (Array.isArray(raw)) return raw[0]?.slice(0, 512) ?? null;
	return null;
}

export const dataExportRouter = createTRPCRouter({
	/**
	 * Kick off a new export. Enforces:
	 *   - one in-flight request per user (partial unique index +
	 *     conflict check),
	 *   - rolling window of 5 SUCCEEDED non-expired requests
	 *     (older are auto-revoked),
	 *   - 2 requests/hour rate limit (in Redis when available).
	 *
	 * Returns the new request id immediately; the bundle is built in
	 * the background and the user receives a signed download URL by
	 * email when it's ready.
	 */
	create: protectedProcedure
		.input(z.object({ format: formatSchema }).strict())
		.mutation(async ({ ctx, input }) => {
			const allowed = await consumeCreateQuota(ctx.user.id);
			if (!allowed) {
				throw new TRPCError({
					code: "TOO_MANY_REQUESTS",
					message: ctx.t("errors:dataExport.rateLimited"),
				});
			}

			try {
				const row = await createExportRequest({
					db: ctx.db,
					userId: ctx.user.id,
					format: input.format,
					ipAddress: clientIp(ctx.req),
					userAgent: userAgent(ctx.req),
				});

				// Dispatch the build off the response thread.
				enqueueExportJob(row.id);

				return { requestId: row.id };
			} catch (err) {
				if (err instanceof DataExportConflictError) {
					throw new TRPCError({
						code: "CONFLICT",
						message: ctx.t("errors:dataExport.inProgress"),
					});
				}
				throw err;
			}
		}),

	/** Last 10 requests for the calling user. */
	list: protectedProcedure
		.input(
			z
				.object({ limit: z.number().int().min(1).max(50).default(10) })
				.strict()
				.optional(),
		)
		.query(async ({ ctx, input }) => {
			const rows = await listExportRequests({
				db: ctx.db,
				userId: ctx.user.id,
				limit: input?.limit ?? 10,
			});
			// Only the authenticated owner can list these rows. Return the
			// capability token for completed exports so the client can use the
			// token-gated download route; never substitute the guessable row id.
			return rows.map((r) => ({
				id: r.id,
				status: r.status,
				requestedAt: r.requestedAt,
				startedAt: r.startedAt,
				completedAt: r.completedAt,
				expiresAt: r.expiresAt,
				bundleSizeBytes:
					typeof r.bundleSizeBytes === "bigint"
						? Number(r.bundleSizeBytes)
						: (r.bundleSizeBytes as unknown as number),
				downloadCount: r.downloadCount,
				requestedFormat: r.requestedFormat,
				errorMessage: r.errorMessage,
				downloadToken: r.status === "SUCCEEDED" ? r.downloadToken : null,
			}));
		}),

	/** Full state for one request (still scoped to the caller). */
	getById: protectedProcedure
		.input(z.object({ requestId: z.string().min(1) }).strict())
		.query(async ({ ctx, input }) => {
			try {
				const row = await getExportRequest({
					db: ctx.db,
					userId: ctx.user.id,
					requestId: input.requestId,
				});
				return {
					id: row.id,
					status: row.status,
					requestedAt: row.requestedAt,
					startedAt: row.startedAt,
					completedAt: row.completedAt,
					expiresAt: row.expiresAt,
					bundleSizeBytes:
						typeof row.bundleSizeBytes === "bigint"
							? Number(row.bundleSizeBytes)
							: (row.bundleSizeBytes as unknown as number),
					downloadCount: row.downloadCount,
					requestedFormat: row.requestedFormat,
					errorMessage: row.errorMessage,
				};
			} catch (err) {
				if (err instanceof DataExportNotFoundError) {
					throw notFoundError(ctx.t, "dataExport", input.requestId);
				}
				throw err;
			}
		}),

	/**
	 * Lightweight polling endpoint — wire into TanStack Query with
	 * `refetchInterval` while status is PENDING/RUNNING.
	 */
	status: protectedProcedure
		.input(z.object({ requestId: z.string().min(1) }).strict())
		.query(async ({ ctx, input }) => {
			try {
				const row = await getExportRequest({
					db: ctx.db,
					userId: ctx.user.id,
					requestId: input.requestId,
				});
				return {
					status: row.status,
					bundleSizeBytes:
						typeof row.bundleSizeBytes === "bigint"
							? Number(row.bundleSizeBytes)
							: (row.bundleSizeBytes as unknown as number),
					expiresAt: row.expiresAt,
				};
			} catch (err) {
				if (err instanceof DataExportNotFoundError) {
					throw notFoundError(ctx.t, "dataExport", input.requestId);
				}
				throw err;
			}
		}),

	/**
	 * Revoke a request and delete the bundle from disk. Idempotent —
	 * calling twice is a no-op success.
	 */
	revoke: protectedProcedure
		.input(z.object({ requestId: z.string().min(1) }).strict())
		.mutation(async ({ ctx, input }) => {
			try {
				await revokeExportRequest({
					db: ctx.db,
					userId: ctx.user.id,
					requestId: input.requestId,
				});
				return { success: true };
			} catch (err) {
				if (err instanceof DataExportNotFoundError) {
					throw notFoundError(ctx.t, "dataExport", input.requestId);
				}
				if (err instanceof Error && err.message.includes("invalid")) {
					throw badRequestError(ctx.t, "errors:dataExport.invalidRequest");
				}
				throw err;
			}
		}),
});
