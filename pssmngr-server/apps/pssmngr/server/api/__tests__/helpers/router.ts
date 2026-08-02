// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Router test utilities for tRPC integration tests.
 *
 * Provides utilities for creating callers and testing router procedures.
 */

import type { AnyRouter } from "@trpc/server";
import type { TestContext } from "./context";

/**
 * Create a caller for a router with a given context.
 *
 * This creates a tRPC caller that can be used to call router procedures
 * in tests without going through HTTP.
 *
 * @example
 * const caller = createCaller(wordpressRouter, createAdminContext());
 * const result = await caller.getStack({ composeId: 'test-id' });
 */
export function createCaller<TRouter extends AnyRouter>(
	router: TRouter,
	ctx: TestContext,
): ReturnType<TRouter["createCaller"]> {
	return router.createCaller(ctx as any) as ReturnType<TRouter["createCaller"]>;
}

/**
 * Helper to expect a TRPCError with specific code.
 *
 * @example
 * await expectTRPCError(
 *   () => caller.getStack({ composeId: 'nonexistent' }),
 *   'NOT_FOUND'
 * );
 */
export async function expectTRPCError(
	fn: () => Promise<unknown>,
	expectedCode: string,
): Promise<void> {
	try {
		await fn();
		throw new Error(
			`Expected TRPCError with code ${expectedCode}, but no error was thrown`,
		);
	} catch (error: any) {
		if (error.code !== expectedCode) {
			throw new Error(
				`Expected TRPCError with code ${expectedCode}, got ${error.code || "unknown"}`,
			);
		}
	}
}

/**
 * Helper to assert error message doesn't contain unresolved i18n variables.
 *
 * @example
 * await expectValidI18nError(
 *   () => caller.getStack({ composeId: 'test' }),
 *   'NOT_FOUND'
 * );
 */
export async function expectValidI18nError(
	fn: () => Promise<unknown>,
	expectedCode: string,
): Promise<string> {
	try {
		await fn();
		throw new Error(`Expected TRPCError with code ${expectedCode}`);
	} catch (error: any) {
		if (error.code !== expectedCode) {
			throw error;
		}

		// Check message doesn't contain unresolved variables
		if (error.message?.includes("{{")) {
			throw new Error(
				`Error message contains unresolved i18n variable: ${error.message}`,
			);
		}

		// Check message is not empty or just the key
		if (!error.message || error.message.length < 3) {
			throw new Error(`Error message is empty or too short: ${error.message}`);
		}

		return error.message;
	}
}
