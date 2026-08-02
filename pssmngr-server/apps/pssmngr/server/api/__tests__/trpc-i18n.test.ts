// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Integration tests for tRPC Context i18n Integration.
 *
 * These tests verify that:
 * 1. Language is correctly detected and added to context
 * 2. Translator function works correctly
 * 3. All supported languages work
 * 4. User preference overrides Accept-Language header
 */

import {
	DEFAULT_LANGUAGE,
	getEffectiveLanguage,
	initI18n,
	SUPPORTED_LANGUAGES,
} from "@pssmngr/server";
import { beforeAll, describe, expect, it } from "vitest";
import {
	createAuthenticatedTestContext,
	createTestContext,
	testTranslation,
} from "./test-context";

describe("tRPC Context i18n Integration", () => {
	beforeAll(async () => {
		// Initialize i18n before running tests
		await initI18n();
	});

	describe("createTestContext", () => {
		it("should create context with default language (en)", () => {
			const ctx = createTestContext();

			expect(ctx.language).toBe("en");
			expect(typeof ctx.t).toBe("function");
		});

		it("should create context with specified language", () => {
			const ctx = createTestContext({ language: "ar" });

			expect(ctx.language).toBe("ar");
			expect(typeof ctx.t).toBe("function");
		});

		it("should have null user and session by default", () => {
			const ctx = createTestContext();

			expect(ctx.user).toBeNull();
			expect(ctx.session).toBeNull();
		});
	});

	describe("createAuthenticatedTestContext", () => {
		it("should create context with authenticated user", () => {
			const ctx = createAuthenticatedTestContext();

			expect(ctx.user).not.toBeNull();
			expect(ctx.session).not.toBeNull();
			expect(ctx.user?.id).toBe("test-user-id");
			expect(ctx.user?.role).toBe("owner");
		});

		it("should respect custom role", () => {
			const ctx = createAuthenticatedTestContext({ role: "admin" });

			expect(ctx.user?.role).toBe("admin");
		});

		it("should respect custom language", () => {
			const ctx = createAuthenticatedTestContext({ language: "fr" });

			expect(ctx.language).toBe("fr");
		});

		it("should set active organization ID", () => {
			const ctx = createAuthenticatedTestContext({
				organizationId: "custom-org-id",
			});

			expect(ctx.session?.activeOrganizationId).toBe("custom-org-id");
		});
	});

	describe("Translator Function", () => {
		it("should translate auth.unauthorized correctly in English", () => {
			const ctx = createTestContext({ language: "en" });
			const message = ctx.t("errors:auth.unauthorized");

			expect(message).toBe("You must be logged in to perform this action");
		});

		it("should translate auth.unauthorized correctly in Arabic", () => {
			const ctx = createTestContext({ language: "ar" });
			const message = ctx.t("errors:auth.unauthorized");

			expect(message).toBe("يجب عليك تسجيل الدخول لتنفيذ هذا الإجراء");
		});

		it("should translate auth.unauthorized correctly in French", () => {
			const ctx = createTestContext({ language: "fr" });
			const message = ctx.t("errors:auth.unauthorized");

			expect(message).toBe(
				"Vous devez être connecté pour effectuer cette action",
			);
		});

		it("should translate auth.unauthorized correctly in German", () => {
			const ctx = createTestContext({ language: "de" });
			const message = ctx.t("errors:auth.unauthorized");

			expect(message).toBe(
				"Sie müssen angemeldet sein, um diese Aktion durchzuführen",
			);
		});

		it("should translate auth.unauthorized correctly in Spanish", () => {
			const ctx = createTestContext({ language: "es" });
			const message = ctx.t("errors:auth.unauthorized");

			expect(message).toBe("Debe iniciar sesión para realizar esta acción");
		});

		it("should translate with interpolation", () => {
			const ctx = createTestContext({ language: "en" });
			const message = ctx.t("errors:auth.rateLimited", {
				seconds: 30,
			});

			expect(message).toBe("Too many requests. Try again in 30 seconds.");
		});

		it("should translate forbidden error correctly", () => {
			const ctx = createTestContext({ language: "en" });
			const message = ctx.t("errors:auth.forbidden");

			expect(message).toBe("You don't have permission to access this resource");
		});
	});

	describe("Language Detection", () => {
		it("should return default language for empty header", () => {
			const language = getEffectiveLanguage({
				acceptLanguage: undefined,
			});

			expect(language).toBe(DEFAULT_LANGUAGE);
		});

		it("should detect English from Accept-Language header", () => {
			const language = getEffectiveLanguage({
				acceptLanguage: "en-US,en;q=0.9",
			});

			expect(language).toBe("en");
		});

		it("should detect Arabic from Accept-Language header", () => {
			const language = getEffectiveLanguage({
				acceptLanguage: "ar-SA,ar;q=0.9,en;q=0.8",
			});

			expect(language).toBe("ar");
		});

		it("should detect French from Accept-Language header", () => {
			const language = getEffectiveLanguage({
				acceptLanguage: "fr-FR,fr;q=0.9,en;q=0.8",
			});

			expect(language).toBe("fr");
		});

		it("should default to English for unsupported language", () => {
			const language = getEffectiveLanguage({
				acceptLanguage: "zh-CN,zh;q=0.9",
			});

			expect(language).toBe("en");
		});

		it("should prefer user preference over Accept-Language", () => {
			const language = getEffectiveLanguage({
				userPreference: "fr",
				acceptLanguage: "ar-SA,ar;q=0.9",
			});

			expect(language).toBe("fr");
		});

		it("should respect quality values in Accept-Language", () => {
			const language = getEffectiveLanguage({
				acceptLanguage: "en;q=0.5,ar;q=0.9,fr;q=0.7",
			});

			expect(language).toBe("ar");
		});
	});

	describe("All Supported Languages", () => {
		it.each(SUPPORTED_LANGUAGES)("should support %s language", async (lang) => {
			const ctx = createTestContext({ language: lang });

			expect(ctx.language).toBe(lang);
			expect(typeof ctx.t).toBe("function");

			// Verify basic translation works
			const message = ctx.t("errors:auth.unauthorized");
			expect(typeof message).toBe("string");
			expect(message.length).toBeGreaterThan(0);
		});
	});

	describe("testTranslation helper", () => {
		it("should return correct translation", () => {
			const message = testTranslation("en", "errors:auth.unauthorized");
			expect(message).toBe("You must be logged in to perform this action");
		});

		it("should work with interpolation", () => {
			const message = testTranslation("en", "errors:resource.notFound", {
				resource: "Project",
			});
			expect(message).toBe("Project not found");
		});
	});
});
