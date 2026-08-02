// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Test context helpers for unit testing tRPC procedures.
 *
 * This module provides utilities to create mock contexts for testing
 * procedures without needing actual HTTP requests or database connections.
 *
 * @example
 * // Basic usage
 * const ctx = createTestContext({ language: 'ar' });
 *
 * // With authenticated user
 * const ctx = createAuthenticatedTestContext({ role: 'admin' });
 *
 * // Testing a procedure
 * const caller = appRouter.createCaller(ctx);
 * const result = await caller.project.one({ projectId: 'test-id' });
 */

import {
	DEFAULT_LANGUAGE,
	getTranslator,
	type SupportedLanguage,
} from "@pssmngr/server";
import type { Context } from "../trpc";

/**
 * Options for creating a test context.
 */
interface CreateTestContextOptions {
	/** Language for translations (default: 'en') */
	language?: SupportedLanguage;

	/** Mock user data */
	user?: Context["user"];

	/** Mock session data */
	session?: Context["session"];
}

/**
 * Create a test context for unit testing tRPC procedures.
 *
 * This creates a minimal context with:
 * - Language detection and translator
 * - Optional user and session (null by default)
 * - Mock req/res objects
 *
 * @param options - Configuration options
 * @returns A valid tRPC context for testing
 *
 * @example
 * // Test unauthenticated request with Arabic
 * const ctx = createTestContext({ language: 'ar' });
 *
 * // Verify translator works
 * const message = ctx.t('errors:auth.unauthorized');
 */
export function createTestContext(
	options: CreateTestContextOptions = {},
): Context {
	const language = options.language || DEFAULT_LANGUAGE;
	const t = getTranslator(language);

	return {
		req: {} as Context["req"],
		res: {} as Context["res"],
		db: {} as Context["db"], // Should be mocked in actual tests
		user: options.user || null,
		session: options.session || null,
		language,
		t,
	};
}

/**
 * Options for creating an authenticated test context.
 */
interface CreateAuthenticatedTestContextOptions
	extends Omit<CreateTestContextOptions, "user" | "session"> {
	/** User ID (default: 'test-user-id') */
	userId?: string;

	/** Organization ID (default: 'test-org-id') */
	organizationId?: string;

	/** User role (default: 'owner') */
	role?: "owner" | "admin" | "member";

	/** User email (default: 'test@example.com') */
	email?: string;
}

/**
 * Create a test context with an authenticated user.
 *
 * This is useful for testing protected procedures that require
 * authentication and specific roles.
 *
 * @param options - Configuration options
 * @returns A valid tRPC context with authenticated user
 *
 * @example
 * // Test as admin user
 * const ctx = createAuthenticatedTestContext({ role: 'admin' });
 *
 * // Test as owner with French language
 * const ctx = createAuthenticatedTestContext({
 *   role: 'owner',
 *   language: 'fr',
 * });
 *
 * // Test admin procedure
 * const caller = appRouter.createCaller(ctx);
 * await expect(caller.admin.someAction()).resolves.toBeDefined();
 */
export function createAuthenticatedTestContext(
	options: CreateAuthenticatedTestContextOptions = {},
): Context {
	const {
		language = DEFAULT_LANGUAGE,
		userId = "test-user-id",
		organizationId = "test-org-id",
		role = "owner",
		email = "test@example.com",
	} = options;

	return createTestContext({
		language,
		user: {
			id: userId,
			email,
			role,
			ownerId: organizationId,
			name: "Test User",
			createdAt: new Date(),
			updatedAt: new Date(),
			image: null,
			emailVerified: true,
		} as Context["user"],
		session: {
			id: "test-session-id",
			userId,
			activeOrganizationId: organizationId,
			createdAt: new Date(),
			updatedAt: new Date(),
			expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
			token: "test-token",
			ipAddress: "127.0.0.1",
			userAgent: "test-agent",
		} as Context["session"],
	});
}

/**
 * Helper to test translation output for a specific language.
 *
 * @param language - Language to test
 * @param key - Translation key
 * @param params - Optional interpolation parameters
 * @returns The translated string
 *
 * @example
 * const message = testTranslation('ar', 'errors:auth.unauthorized');
 * expect(message).toBe('يجب عليك تسجيل الدخول لتنفيذ هذا الإجراء');
 */
export function testTranslation(
	language: SupportedLanguage,
	key: string,
	params?: Record<string, string | number>,
): string {
	const t = getTranslator(language);
	return t(key, params);
}
