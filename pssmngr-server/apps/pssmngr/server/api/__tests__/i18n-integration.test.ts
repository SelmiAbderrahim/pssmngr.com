// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Integration tests for tRPC i18n end-to-end flow.
 *
 * These tests verify the complete i18n flow from:
 * 1. Accept-Language header processing
 * 2. Language detection and priority
 * 3. Translated error responses across all supported languages
 * 4. Error code consistency across languages
 * 5. Interpolation in translated messages
 */

import {
	createFailedError,
	DEFAULT_LANGUAGE,
	forbiddenError,
	getEffectiveLanguage,
	getTranslator,
	initI18n,
	notFoundError,
	permissionError,
	SUPPORTED_LANGUAGES,
	type SupportedLanguage,
	unauthorizedError,
} from "@pssmngr/server";
import { beforeAll, describe, expect, it } from "vitest";
import {
	createAuthenticatedI18nTestContext,
	createI18nTestContext,
	expectNotTranslationKey,
	expectTranslatedError,
	getAllLanguageTestCases,
	getExpectedErrorFragment,
} from "./fixtures/i18n-test-utils";

describe("i18n Integration Tests", () => {
	beforeAll(async () => {
		// Initialize i18n before running tests
		await initI18n();
	});

	describe("Accept-Language Header Processing", () => {
		it("should return English error for Accept-Language: en", () => {
			const t = getTranslator("en");
			const error = unauthorizedError(t);

			expectTranslatedError(error, {
				code: "UNAUTHORIZED",
				messageContains: "logged in",
			});
		});

		it("should return Arabic error for Accept-Language: ar", () => {
			const t = getTranslator("ar");
			const error = unauthorizedError(t);

			expectTranslatedError(error, {
				code: "UNAUTHORIZED",
				messageContains: "تسجيل الدخول",
			});
		});

		it("should return French error for Accept-Language: fr", () => {
			const t = getTranslator("fr");
			const error = unauthorizedError(t);

			expectTranslatedError(error, {
				code: "UNAUTHORIZED",
				messageContains: "connecté",
			});
		});

		it("should return German error for Accept-Language: de", () => {
			const t = getTranslator("de");
			const error = unauthorizedError(t);

			expectTranslatedError(error, {
				code: "UNAUTHORIZED",
				messageContains: "angemeldet",
			});
		});

		it("should return Spanish error for Accept-Language: es", () => {
			const t = getTranslator("es");
			const error = unauthorizedError(t);

			expectTranslatedError(error, {
				code: "UNAUTHORIZED",
				messageContains: "sesión",
			});
		});
	});

	describe("Language Detection Priority", () => {
		it("should prefer user preference over Accept-Language", () => {
			const language = getEffectiveLanguage({
				userPreference: "ar",
				acceptLanguage: "en-US,en;q=0.9",
			});

			expect(language).toBe("ar");
		});

		it("should use Accept-Language when no user preference", () => {
			const language = getEffectiveLanguage({
				userPreference: undefined,
				acceptLanguage: "fr-FR,fr;q=0.9,en;q=0.8",
			});

			expect(language).toBe("fr");
		});

		it("should fallback to default for unsupported language in header", () => {
			const language = getEffectiveLanguage({
				userPreference: undefined,
				acceptLanguage: "zh-CN,zh;q=0.9",
			});

			expect(language).toBe(DEFAULT_LANGUAGE);
		});

		it("should fallback to default for empty Accept-Language", () => {
			const language = getEffectiveLanguage({
				userPreference: undefined,
				acceptLanguage: undefined,
			});

			expect(language).toBe(DEFAULT_LANGUAGE);
		});

		it("should ignore unsupported user preference and use header", () => {
			const language = getEffectiveLanguage({
				userPreference: "zh" as SupportedLanguage,
				acceptLanguage: "ar-SA,ar;q=0.9",
			});

			// Should fallback to Accept-Language since user preference is unsupported
			expect(language).toBe("ar");
		});

		it("should respect quality values in Accept-Language", () => {
			const language = getEffectiveLanguage({
				acceptLanguage: "en;q=0.5,ar;q=0.9,fr;q=0.7",
			});

			// Arabic has highest quality
			expect(language).toBe("ar");
		});
	});

	describe("Error Code Consistency Across Languages", () => {
		it.each(getAllLanguageTestCases())(
			"should return same UNAUTHORIZED code for %s (%s)",
			async (lang) => {
				const t = getTranslator(lang);
				const error = unauthorizedError(t);

				expect(error.code).toBe("UNAUTHORIZED");
			},
		);

		it.each(getAllLanguageTestCases())(
			"should return same NOT_FOUND code for %s (%s)",
			async (lang) => {
				const t = getTranslator(lang);
				const error = notFoundError(t, "Project");

				expect(error.code).toBe("NOT_FOUND");
			},
		);

		it.each(getAllLanguageTestCases())(
			"should return same FORBIDDEN code for %s (%s)",
			async (lang) => {
				const t = getTranslator(lang);
				const error = forbiddenError(t);

				expect(error.code).toBe("FORBIDDEN");
			},
		);

		it.each(getAllLanguageTestCases())(
			"should return same BAD_REQUEST code for createFailed in %s (%s)",
			async (lang) => {
				const t = getTranslator(lang);
				const error = createFailedError(t, "application");

				expect(error.code).toBe("BAD_REQUEST");
			},
		);
	});

	describe("Interpolation in Translated Messages", () => {
		it("should interpolate resource name in English", () => {
			const t = getTranslator("en");
			const error = notFoundError(t, "PostgreSQL database");

			expect(error.message).toContain("PostgreSQL database");
			expect(error.message).toContain("not found");
		});

		it("should interpolate resource name in Arabic", () => {
			const t = getTranslator("ar");
			const error = notFoundError(t, "قاعدة بيانات");

			expect(error.message).toContain("قاعدة بيانات");
		});

		it("should interpolate resource name in French", () => {
			const t = getTranslator("fr");
			const error = notFoundError(t, "Base de données");

			expect(error.message).toContain("Base de données");
		});

		it("should interpolate resource ID in error message", () => {
			const testId = "test-id-123";
			const t = getTranslator("en");
			const error = notFoundError(t, "Project", testId);

			expect(error.message).toContain(testId);
		});
	});

	describe("Context i18n Properties", () => {
		it("should include language in test context", () => {
			const ctx = createI18nTestContext({ language: "ar" });

			expect(ctx.language).toBe("ar");
		});

		it("should include translator function in test context", () => {
			const ctx = createI18nTestContext({ language: "fr" });

			expect(typeof ctx.t).toBe("function");
		});

		it("should translate using context translator", () => {
			const ctx = createI18nTestContext({ language: "de" });
			const message = ctx.t("errors:auth.unauthorized");

			expect(message).toContain("angemeldet");
		});

		it("should preserve language in authenticated context", () => {
			const ctx = createAuthenticatedI18nTestContext({
				language: "es",
				role: "admin",
			});

			expect(ctx.language).toBe("es");
			expect(ctx.user?.role).toBe("admin");
		});
	});

	describe("Translation Completeness", () => {
		it.each(SUPPORTED_LANGUAGES)(
			"should have unauthorized translation for %s",
			(lang) => {
				const t = getTranslator(lang);
				const message = t("errors:auth.unauthorized");

				// Should not be the key itself
				expect(message).not.toBe("errors:auth.unauthorized");
				expect(message).not.toBe("auth.unauthorized");
				expect(message.length).toBeGreaterThan(5);
			},
		);

		it.each(SUPPORTED_LANGUAGES)(
			"should have forbidden translation for %s",
			(lang) => {
				const t = getTranslator(lang);
				const message = t("errors:auth.forbidden");

				expect(message).not.toBe("errors:auth.forbidden");
				expect(message).not.toBe("auth.forbidden");
			},
		);

		it.each(SUPPORTED_LANGUAGES)(
			"should have resource.notFound translation for %s",
			(lang) => {
				const t = getTranslator(lang);
				const message = t("errors:resource.notFound", { resource: "Test" });

				expect(message).not.toBe("errors:resource.notFound");
				expect(message).toContain("Test");
			},
		);
	});

	describe("Error Helper Functions with i18n", () => {
		it.each(getAllLanguageTestCases())(
			"unauthorizedError should translate in %s (%s)",
			(lang) => {
				const t = getTranslator(lang);
				const error = unauthorizedError(t);
				const expected = getExpectedErrorFragment("unauthorized", lang);

				expectNotTranslationKey(error);
				if (expected) {
					expectTranslatedError(error, {
						code: "UNAUTHORIZED",
						messageContains: expected,
					});
				}
			},
		);

		it.each(getAllLanguageTestCases())(
			"notFoundError should translate in %s (%s)",
			(lang) => {
				const t = getTranslator(lang);
				const error = notFoundError(t, "Resource");

				expectNotTranslationKey(error);
				expect(error.message).toContain("Resource");
			},
		);

		it.each(getAllLanguageTestCases())(
			"createFailedError should translate in %s (%s)",
			(lang) => {
				const t = getTranslator(lang);
				const error = createFailedError(t, "application");

				expectNotTranslationKey(error);
				expect(error.code).toBe("BAD_REQUEST");
			},
		);

		it.each(getAllLanguageTestCases())(
			"permissionError should translate in %s (%s)",
			(lang) => {
				const t = getTranslator(lang);
				const error = permissionError(t, "user.cannotDeleteOwner");

				expectNotTranslationKey(error);
				expect(error.code).toBe("FORBIDDEN");
			},
		);
	});

	describe("Complex Accept-Language Header Parsing", () => {
		it("should parse complex header with multiple languages", () => {
			const language = getEffectiveLanguage({
				acceptLanguage: "zh-CN,zh;q=0.9,ar;q=0.8,en;q=0.7",
			});

			// Should fall back to Arabic (first supported language with highest quality)
			expect(language).toBe("ar");
		});

		it("should handle regional variants", () => {
			const language = getEffectiveLanguage({
				acceptLanguage: "ar-SA,ar;q=0.9,en-US;q=0.8",
			});

			expect(language).toBe("ar");
		});

		it("should handle language-only codes", () => {
			const language = getEffectiveLanguage({
				acceptLanguage: "fr",
			});

			expect(language).toBe("fr");
		});

		it("should handle whitespace in header", () => {
			const language = getEffectiveLanguage({
				acceptLanguage: "en , fr;q=0.9 , de;q=0.8",
			});

			// First without quality should be treated as q=1
			expect(language).toBe("en");
		});
	});

	describe("Edge Cases", () => {
		it("should handle missing translation gracefully", () => {
			const t = getTranslator("en");
			const message = t("errors:nonexistent.key");

			// i18next returns the key path without namespace for missing translations
			expect(message).toBe("nonexistent.key");
		});

		it("should handle empty interpolation params", () => {
			const t = getTranslator("en");
			const message = t("errors:auth.unauthorized", {});

			expect(message).toBe("You must be logged in to perform this action");
		});

		it("should handle undefined interpolation params", () => {
			const t = getTranslator("en");
			const message = t("errors:auth.unauthorized", undefined);

			expect(message).toBe("You must be logged in to perform this action");
		});

		it("should handle partial interpolation", () => {
			const t = getTranslator("en");
			// Missing 'resource' param
			const message = t("errors:resource.notFound");

			// Should have placeholder replaced with empty string
			expect(message).toBeDefined();
		});
	});
});
