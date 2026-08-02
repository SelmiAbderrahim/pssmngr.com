// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Shared test utilities for i18n integration testing.
 *
 * This module provides helper functions for creating test contexts,
 * callers, and assertions specific to i18n testing.
 *
 * @example
 * // Create a test caller with Arabic language
 * const caller = createTestCaller('ar');
 *
 * // Assert error is translated correctly
 * expectTranslatedError(error, {
 *   code: 'NOT_FOUND',
 *   messageContains: 'لم يتم العثور',
 * });
 */

import {
	DEFAULT_LANGUAGE,
	getEffectiveLanguage,
	getTranslator,
	SUPPORTED_LANGUAGES,
	type SupportedLanguage,
} from "@pssmngr/server";
import { TRPCError } from "@trpc/server";
import { expect, vi } from "vitest";
import { appRouter } from "../../root";
import type { Context } from "../../trpc";

/**
 * Options for creating a test context with i18n support.
 */
export interface CreateI18nTestContextOptions {
	/** Language for translations */
	language?: SupportedLanguage;

	/** Mock user data */
	user?: Partial<Context["user"]>;

	/** Mock session data */
	session?: Partial<Context["session"]>;

	/** Additional context properties */
	additionalContext?: Partial<Context>;
}

/**
 * Create a test context with i18n support.
 *
 * @param options - Configuration options
 * @returns A valid tRPC context for testing
 *
 * @example
 * const ctx = createI18nTestContext({ language: 'ar' });
 * expect(ctx.t('errors:auth.unauthorized')).toContain('تسجيل الدخول');
 */
export function createI18nTestContext(
	options: CreateI18nTestContextOptions = {},
): Context {
	const language = options.language || DEFAULT_LANGUAGE;
	const t = getTranslator(language);

	return {
		req: {} as Context["req"],
		res: {} as Context["res"],
		db: {} as Context["db"],
		user: options.user || null,
		session: options.session || null,
		language,
		t,
		...options.additionalContext,
	} as Context;
}

/**
 * Create a tRPC caller for testing with a specific language.
 *
 * Note: This creates a caller that can be used to call router procedures,
 * but won't have access to real database operations.
 *
 * @param language - The language for error translations
 * @returns A tRPC caller instance
 *
 * @example
 * const caller = createTestCaller('fr');
 * try {
 *   await caller.postgres.one({ postgresId: 'invalid' });
 * } catch (error) {
 *   expect(error.message).toContain('introuvable');
 * }
 */
export function createTestCaller(language: SupportedLanguage = "en") {
	const ctx = createI18nTestContext({ language });
	return appRouter.createCaller(ctx);
}

/**
 * Create an authenticated test context with i18n support.
 *
 * @param options - Configuration options
 * @returns A valid tRPC context with authenticated user
 */
export function createAuthenticatedI18nTestContext(
	options: Omit<CreateI18nTestContextOptions, "user" | "session"> & {
		userId?: string;
		organizationId?: string;
		role?: "owner" | "admin" | "member";
		email?: string;
	} = {},
): Context {
	const {
		language = DEFAULT_LANGUAGE,
		userId = "test-user-id",
		organizationId = "test-org-id",
		role = "owner",
		email = "test@example.com",
	} = options;

	return createI18nTestContext({
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
		},
		session: {
			id: "test-session-id",
			userId,
			activeOrganizationId: organizationId,
			createdAt: new Date(),
			updatedAt: new Date(),
			expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
			token: "test-token",
			ipAddress: "127.0.0.1",
			userAgent: "test-agent",
		},
	});
}

/**
 * Options for asserting translated errors.
 */
export interface ExpectTranslatedErrorOptions {
	/** Expected tRPC error code */
	code: string;

	/** Substring that should be contained in the message */
	messageContains?: string;

	/** Exact message to match (case-insensitive) */
	messageEquals?: string;

	/** Message should NOT contain this substring */
	messageNotContains?: string;
}

/**
 * Assert that an error is a TRPCError with expected translations.
 *
 * @param error - The error to check
 * @param options - Expected error properties
 *
 * @example
 * try {
 *   await caller.postgres.one({ postgresId: 'invalid' });
 * } catch (error) {
 *   expectTranslatedError(error, {
 *     code: 'NOT_FOUND',
 *     messageContains: 'not found',
 *   });
 * }
 */
export function expectTranslatedError(
	error: unknown,
	options: ExpectTranslatedErrorOptions,
): void {
	// Should be a TRPCError
	expect(error).toBeDefined();
	expect(error).toBeInstanceOf(TRPCError);

	const trpcError = error as TRPCError;

	// Check error code
	expect(trpcError.code).toBe(options.code);

	// Check message contains expected text
	if (options.messageContains) {
		expect(trpcError.message.toLowerCase()).toContain(
			options.messageContains.toLowerCase(),
		);
	}

	// Check exact message match
	if (options.messageEquals) {
		expect(trpcError.message.toLowerCase()).toBe(
			options.messageEquals.toLowerCase(),
		);
	}

	// Check message does not contain unwanted text
	if (options.messageNotContains) {
		expect(trpcError.message.toLowerCase()).not.toContain(
			options.messageNotContains.toLowerCase(),
		);
	}
}

/**
 * Assert that an error message is properly translated (not a key).
 *
 * Checks that the message doesn't start with a namespace prefix,
 * which would indicate a missing translation.
 *
 * @param error - The error to check
 *
 * @example
 * try {
 *   await someOperation();
 * } catch (error) {
 *   expectNotTranslationKey(error);
 * }
 */
export function expectNotTranslationKey(error: unknown): void {
	expect(error).toBeDefined();
	expect(error).toBeInstanceOf(TRPCError);

	const trpcError = error as TRPCError;

	// Translation keys typically start with namespace prefixes
	const keyPrefixes = [
		"errors:",
		"validation:",
		"permissions:",
		"services:",
		"emails:",
	];

	for (const prefix of keyPrefixes) {
		expect(trpcError.message).not.toContain(prefix);
	}
}

/**
 * Get expected message fragment for a specific error type and language.
 *
 * This helper provides expected message fragments for common error types
 * across all supported languages.
 *
 * @param errorType - Type of error
 * @param language - Target language
 * @returns Expected message fragment
 */
export function getExpectedErrorFragment(
	errorType:
		| "unauthorized"
		| "forbidden"
		| "notFound"
		| "createFailed"
		| "updateFailed",
	language: SupportedLanguage,
): string {
	const fragments: Record<string, Record<SupportedLanguage, string>> = {
		unauthorized: {
			en: "logged in",
			ar: "تسجيل الدخول",
			fr: "connecté",
			de: "angemeldet",
			es: "iniciar sesión",
		},
		forbidden: {
			en: "permission",
			ar: "صلاحية",
			fr: "permission",
			de: "berechtigung",
			es: "permiso",
		},
		notFound: {
			en: "not found",
			ar: "لم يتم العثور",
			fr: "introuvable",
			de: "nicht gefunden",
			es: "no encontrado",
		},
		createFailed: {
			en: "failed to create",
			ar: "فشل في إنشاء",
			fr: "échec de la création",
			de: "fehler beim erstellen",
			es: "error al crear",
		},
		updateFailed: {
			en: "failed to update",
			ar: "فشل في تحديث",
			fr: "échec de la mise à jour",
			de: "fehler beim aktualisieren",
			es: "error al actualizar",
		},
	};

	return fragments[errorType]?.[language] || fragments[errorType]?.en || "";
}

/**
 * Create test cases for all supported languages.
 *
 * Useful for creating parameterized tests that run against all languages.
 *
 * @returns Array of [language, description] tuples
 */
export function getAllLanguageTestCases(): Array<[SupportedLanguage, string]> {
	return SUPPORTED_LANGUAGES.map((lang) => {
		const descriptions: Record<SupportedLanguage, string> = {
			en: "English",
			ar: "Arabic",
			fr: "French",
			de: "German",
			es: "Spanish",
		};
		return [lang, descriptions[lang] || lang];
	});
}

/**
 * Create a mock database context for testing.
 *
 * This provides a minimal mock that can be used for tests
 * that don't require actual database operations.
 */
export function createMockDbContext() {
	return {
		query: {
			postgres: { findFirst: vi.fn() },
			project: { findFirst: vi.fn() },
			user: { findFirst: vi.fn() },
			application: { findFirst: vi.fn() },
			environment: { findFirst: vi.fn() },
		},
	};
}

/**
 * Re-export commonly used testing utilities.
 */
export {
	SUPPORTED_LANGUAGES,
	DEFAULT_LANGUAGE,
	getTranslator,
	getEffectiveLanguage,
	type SupportedLanguage,
};

/**
 * Re-export the app router for direct access.
 */
export { appRouter };
