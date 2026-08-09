// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { passkey } from "@pssmngr/server/db/schema";
import { notFoundError } from "@pssmngr/server/i18n/errors";
import { auth } from "@pssmngr/server/lib/auth";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod/v3";
import { createTRPCRouter, protectedProcedure } from "../trpc";

export const passkeysRouter = createTRPCRouter({
	/**
	 * Generate WebAuthn registration options for the authenticated user.
	 * The client uses these to prompt the browser's passkey creation flow.
	 */
	beginRegistration: protectedProcedure.mutation(async ({ ctx }) => {
		const headers = new Headers({
			cookie: ctx.req.headers.cookie || "",
		});
		try {
			const result = await auth.api.generatePasskeyRegistrationOptions({
				headers,
			});
			return result;
		} catch (error) {
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: ctx.t("errors:passkey.registrationOptionsFailed"),
			});
		}
	}),

	/**
	 * Complete passkey registration by verifying the authenticator response.
	 * Stores the new passkey credential in the database.
	 */
	finishRegistration: protectedProcedure
		.input(
			z
				.object({
					name: z.string().min(1).max(100).optional(),
					credential: z.any(),
				})
				.strict(),
		)
		.mutation(async ({ input, ctx }) => {
			const headers = new Headers({
				cookie: ctx.req.headers.cookie || "",
			});
			try {
				const result = await auth.api.verifyPasskeyRegistration({
					body: {
						response: input.credential,
						name: input.name,
					},
					headers,
				});
				return result;
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: ctx.t("errors:passkey.verificationFailed"),
				});
			}
		}),

	/**
	 * List all passkeys registered by the current user.
	 */
	list: protectedProcedure.query(async ({ ctx }) => {
		const passkeys = await ctx.db.query.passkey.findMany({
			where: eq(passkey.userId, ctx.user.id),
			orderBy: (p, { desc }) => [desc(p.createdAt)],
			columns: {
				id: true,
				name: true,
				credentialID: true,
				deviceType: true,
				backedUp: true,
				transports: true,
				createdAt: true,
			},
		});
		return passkeys;
	}),

	/**
	 * Delete a passkey. Only the owner can delete their own passkeys.
	 */
	delete: protectedProcedure
		.input(z.object({ passkeyId: z.string().min(1) }).strict())
		.mutation(async ({ input, ctx }) => {
			const existing = await ctx.db.query.passkey.findFirst({
				where: and(
					eq(passkey.id, input.passkeyId),
					eq(passkey.userId, ctx.user.id),
				),
			});

			if (!existing) {
				throw notFoundError(ctx.t, "passkey");
			}

			await ctx.db.delete(passkey).where(eq(passkey.id, input.passkeyId));

			return { success: true };
		}),
});
