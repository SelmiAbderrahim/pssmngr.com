// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * YOU PROBABLY DON'T NEED TO EDIT THIS FILE, UNLESS:
 * 1. You want to modify request context (see Part 1).
 * 2. You want to create a new middleware or type of procedure (see Part 3).
 *
 * TL;DR - This is where all the tRPC server stuff is created and plugged in. The pieces you will
 * need to use are documented accordingly near the end.
 */

import {
	getEffectiveLanguage,
	getTranslator,
	type SupportedLanguage,
} from "@pssmngr/server";
import { validateRequest } from "@pssmngr/server/lib/auth";
import { initTRPC, TRPCError } from "@trpc/server";
import type { CreateNextContextOptions } from "@trpc/server/adapters/next";
import {
	experimental_createMemoryUploadHandler,
	experimental_isMultipartFormDataRequest,
	experimental_parseMultipartFormData,
} from "@trpc/server/adapters/node-http/content-type/form-data";
import type { Session, User } from "better-auth";
import type { TFunction } from "i18next";
import superjson from "superjson";
import { ZodError } from "zod/v3";
// import { getServerAuthSession } from "@/server/auth";
import { db } from "@/server/db";

/**
 * 1. CONTEXT
 *
 * This section defines the "contexts" that are available in the backend API.
 *
 * These allow you to access things when processing a request, like the database, the session, etc.
 */

interface CreateContextOptions {
	/** Authenticated user (null if anonymous) */
	user: (User & { role: "member" | "admin" | "owner"; ownerId: string }) | null;
	/** Active session (null if anonymous) */
	session:
		| (Session & { activeOrganizationId: string; impersonatedBy?: string })
		| null;
	/** HTTP request object */
	req: CreateNextContextOptions["req"];
	/** HTTP response object */
	res: CreateNextContextOptions["res"];
	/** Detected language for this request */
	language: SupportedLanguage;
	/** Translator function bound to the detected language */
	t: TFunction;
}

/**
 * This helper generates the "internals" for a tRPC context. If you need to use it, you can export
 * it from here.
 *
 * Examples of things you may need it for:
 * - testing, so we don't have to mock Next.js' req/res
 * - tRPC's `createSSGHelpers`, where we don't have req/res
 *
 * @see https://create.t3.gg/en/usage/trpc#-serverapitrpcts
 */
const createInnerTRPCContext = (opts: CreateContextOptions) => {
	return {
		session: opts.session,
		db,
		req: opts.req,
		res: opts.res,
		user: opts.user,
		// i18n context
		language: opts.language,
		t: opts.t,
	};
};

/** Type of the tRPC context */
export type Context = ReturnType<typeof createInnerTRPCContext>;

/**
 * This is the actual context you will use in your router. It will be used to process every request
 * that goes through your tRPC endpoint.
 *
 * This function sets up:
 * - Authentication state (user, session)
 * - Language detection and translator for i18n support
 *
 * @see https://trpc.io/docs/context
 */
export const createTRPCContext = async (opts: CreateNextContextOptions) => {
	const { req, res } = opts;

	// 1. Validate authentication
	const { session, user } = await validateRequest(req);

	// 2. Detect language
	// Priority: user preference > Accept-Language header > default
	const acceptLanguage = req.headers["accept-language"] as string | undefined;

	// Get user's preferred language if authenticated
	// Note: user.preferredLanguage should be added to user schema if not present
	const userPreference = (user as any)?.preferredLanguage as string | undefined;

	const language = getEffectiveLanguage({
		userPreference,
		acceptLanguage,
	});

	// 3. Create translator function bound to detected language
	const t = getTranslator(language);

	// 4. Log language detection in development
	if (process.env.NODE_ENV === "development") {
		const truncatedHeader = acceptLanguage?.slice(0, 30) || "none";
		console.log(
			`[tRPC] Request language: ${language} (header: ${truncatedHeader}, user: ${userPreference || "none"})`,
		);
	}

	return createInnerTRPCContext({
		req,
		res,
		session: session
			? ({
					...session,
					activeOrganizationId:
						(session as Session & { activeOrganizationId?: string })
							.activeOrganizationId || "",
				} as CreateContextOptions["session"])
			: null,
		user: user
			? ({
					...user,
					email: user.email,
					role:
						(user as User & { role?: "owner" | "member" | "admin" }).role ??
						"member",
					id: user.id,
					ownerId: (user as User & { ownerId?: string }).ownerId ?? user.id,
				} as CreateContextOptions["user"])
			: null,
		// i18n context
		language,
		t,
	});
};

/**
 * 2. INITIALIZATION
 *
 * This is where the tRPC API is initialized, connecting the context and transformer. We also parse
 * ZodErrors so that you get typesafety on the frontend if your procedure fails due to validation
 * errors on the backend.
 */

const t = initTRPC.context<typeof createTRPCContext>().create({
	transformer: superjson,
	errorFormatter({ shape, error }) {
		return {
			...shape,
			data: {
				...shape.data,
				zodError:
					error.cause instanceof ZodError ? error.cause.flatten() : null,
			},
		};
	},
});

/**
 * 3. ROUTER & PROCEDURE (THE IMPORTANT BIT)
 *
 * These are the pieces you use to build your tRPC API. You should import these a lot in the
 * "/src/server/api/routers" directory.
 */

/**
 * This is how you create new routers and sub-routers in your tRPC API.
 *
 * @see https://trpc.io/docs/router
 */
export const createTRPCRouter = t.router;

/**
 * Public (unauthenticated) procedure
 *
 * This is the base piece you use to build new queries and mutations on your tRPC API. It does not
 * guarantee that a user querying is authorized, but you can still access user session data if they
 * are logged in.
 */
export const publicProcedure = t.procedure;

/**
 * Protected (authenticated) procedure
 *
 * If you want a query or mutation to ONLY be accessible to logged in users, use this. It verifies
 * the session is valid and guarantees `ctx.session.user` is not null.
 *
 * @see https://trpc.io/docs/procedures
 */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
	if (!ctx.session || !ctx.user) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			// Use translated error message
			message: ctx.t("errors:auth.unauthorized"),
		});
	}
	return next({
		ctx: {
			// infers the `session` as non-nullable
			session: ctx.session,
			user: ctx.user,
			// Preserve i18n context
			language: ctx.language,
			t: ctx.t,
		},
	});
});

export const uploadProcedure = async (opts: any) => {
	if (!experimental_isMultipartFormDataRequest(opts.ctx.req)) {
		return opts.next();
	}

	const formData = await experimental_parseMultipartFormData(
		opts.ctx.req,
		experimental_createMemoryUploadHandler({
			// 2GB
			maxPartSize: 1024 * 1024 * 1024 * 2,
		}),
	);

	return opts.next({
		rawInput: formData,
	});
};

export const adminProcedure = t.procedure.use(({ ctx, next }) => {
	if (!ctx.session || !ctx.user) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: ctx.t("errors:auth.unauthorized"),
		});
	}
	if (ctx.user.role !== "owner" && ctx.user.role !== "admin") {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: ctx.t("errors:auth.forbidden"),
		});
	}
	return next({
		ctx: {
			// infers the `session` as non-nullable
			session: ctx.session,
			user: ctx.user,
			// Preserve i18n context
			language: ctx.language,
			t: ctx.t,
		},
	});
});
