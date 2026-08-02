// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
	DEFAULT_LANGUAGE,
	getI18nInstance,
	getNamespacedTranslator,
	getTranslator,
	initI18n,
	isInitialized,
	isSupportedLanguage,
	NAMESPACES,
	resetI18nForTesting,
	SUPPORTED_LANGUAGES,
} from "../index";

describe("i18n Service", () => {
	beforeAll(async () => {
		await initI18n();
	});

	afterEach(() => {
		// Don't reset between tests to avoid reinitialization overhead
		// Only reset if explicitly testing reset behavior
	});

	describe("initialization", () => {
		it("should initialize successfully", () => {
			expect(isInitialized()).toBe(true);
		});

		it("should be idempotent (multiple calls safe)", async () => {
			const result = await initI18n();
			expect(result).toBeDefined();
			expect(isInitialized()).toBe(true);
		});

		it("should return i18next instance", async () => {
			const instance = await initI18n();
			expect(instance).toBeDefined();
			expect(typeof instance.t).toBe("function");
		});
	});

	describe("getTranslator", () => {
		it("should return a translator for supported language", () => {
			const t = getTranslator("en");
			expect(t).toBeDefined();
			expect(typeof t).toBe("function");
		});

		it("should return a translator for each supported language", () => {
			for (const lang of SUPPORTED_LANGUAGES) {
				const t = getTranslator(lang);
				expect(t).toBeDefined();
			}
		});

		it("should fallback to default for unsupported language", () => {
			const t = getTranslator("zh");
			expect(t).toBeDefined();
			// Should work like default (English)
			const result = t("errors:auth.unauthorized");
			expect(result).toBe("You must be logged in to perform this action");
		});

		it("should translate keys correctly", () => {
			const t = getTranslator("en");
			const result = t("errors:auth.unauthorized");
			expect(result).toBe("You must be logged in to perform this action");
		});

		it("should interpolate variables", () => {
			const t = getTranslator("en");
			const result = t("errors:resource.notFound", {
				resource: "Project",
			});
			expect(result).toBe("Project not found");
		});

		it("should handle nested keys", () => {
			const t = getTranslator("en");
			const result = t("emails:common.greeting");
			expect(result).toBe("Hello");
		});
	});

	describe("getNamespacedTranslator", () => {
		it("should return translator for specific namespace", () => {
			const t = getNamespacedTranslator("en", "validation");
			expect(t).toBeDefined();
		});

		it("should translate from correct namespace", () => {
			const t = getNamespacedTranslator("en", "validation");
			const result = t("string.required");
			expect(result).toBe("This field is required");
		});

		it("should work with all namespaces", () => {
			for (const ns of NAMESPACES) {
				const t = getNamespacedTranslator("en", ns);
				expect(t).toBeDefined();
			}
		});
	});

	describe("isSupportedLanguage", () => {
		it("should return true for supported languages", () => {
			expect(isSupportedLanguage("en")).toBe(true);
			expect(isSupportedLanguage("ar")).toBe(true);
			expect(isSupportedLanguage("fr")).toBe(true);
			expect(isSupportedLanguage("de")).toBe(true);
			expect(isSupportedLanguage("es")).toBe(true);
		});

		it("should return false for unsupported languages", () => {
			expect(isSupportedLanguage("zh")).toBe(false);
			expect(isSupportedLanguage("ja")).toBe(false);
			expect(isSupportedLanguage("invalid")).toBe(false);
		});

		it("should be a type guard", () => {
			const lang = "en" as string;
			if (isSupportedLanguage(lang)) {
				// TypeScript should know lang is SupportedLanguage here
				const supported: (typeof SUPPORTED_LANGUAGES)[number] = lang;
				expect(supported).toBe("en");
			}
		});
	});

	describe("getI18nInstance", () => {
		it("should return the i18next instance when initialized", () => {
			const instance = getI18nInstance();
			expect(instance).toBeDefined();
			expect(typeof instance.t).toBe("function");
		});
	});

	describe("constants", () => {
		it("should have correct supported languages", () => {
			expect(SUPPORTED_LANGUAGES).toContain("en");
			expect(SUPPORTED_LANGUAGES).toContain("ar");
			expect(SUPPORTED_LANGUAGES).toContain("fr");
			expect(SUPPORTED_LANGUAGES).toContain("de");
			expect(SUPPORTED_LANGUAGES).toContain("es");
			expect(SUPPORTED_LANGUAGES).toHaveLength(5);
		});

		it("should have English as default language", () => {
			expect(DEFAULT_LANGUAGE).toBe("en");
		});

		it("should have correct namespaces", () => {
			expect(NAMESPACES).toContain("errors");
			expect(NAMESPACES).toContain("validation");
			expect(NAMESPACES).toContain("permissions");
			expect(NAMESPACES).toContain("emails");
			expect(NAMESPACES).toHaveLength(4);
		});
	});

	describe("resetI18nForTesting", () => {
		it("should reset initialization state", async () => {
			// Verify initialized
			expect(isInitialized()).toBe(true);

			// Reset
			resetI18nForTesting();
			expect(isInitialized()).toBe(false);

			// Re-initialize
			await initI18n();
			expect(isInitialized()).toBe(true);
		});
	});

	describe("error handling", () => {
		it("should return key for missing translations", () => {
			const t = getTranslator("en");
			const result = t("errors:nonexistent.key");
			// i18next returns the key path (without namespace) when translation is not found
			expect(result).toBe("nonexistent.key");
		});

		it("should handle undefined parameters gracefully", () => {
			const t = getTranslator("en");
			const result = t("errors:auth.unauthorized", undefined);
			expect(result).toBe("You must be logged in to perform this action");
		});

		it("should handle empty parameters object", () => {
			const t = getTranslator("en");
			const result = t("errors:auth.unauthorized", {});
			expect(result).toBe("You must be logged in to perform this action");
		});

		it("should handle missing interpolation variables", () => {
			const t = getTranslator("en");
			// When resource is not provided, i18next replaces {{resource}} with empty string
			// resulting in " not found" (note the leading space)
			const result = t("errors:resource.notFound");
			expect(result).toBe(" not found");
		});
	});
});
