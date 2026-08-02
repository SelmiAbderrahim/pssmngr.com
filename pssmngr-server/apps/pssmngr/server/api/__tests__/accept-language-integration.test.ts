// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Accept-Language Integration Tests.
 *
 * Tests that verify the language detection pipeline works correctly
 * end-to-end: from HTTP Accept-Language header to context language
 * to translated error messages.
 */

import {
	DEFAULT_LANGUAGE,
	getEffectiveLanguage,
	getTranslator,
	initI18n,
	parseAcceptLanguage,
	SUPPORTED_LANGUAGES,
} from "@pssmngr/server";
import { beforeAll, describe, expect, it } from "vitest";

describe("Accept-Language Integration", () => {
	beforeAll(async () => {
		await initI18n();
	});

	describe("Direct language resolution", () => {
		SUPPORTED_LANGUAGES.forEach((lang) => {
			it(`Accept-Language: ${lang} resolves to ${lang}`, () => {
				const resolved = parseAcceptLanguage(lang);
				expect(resolved).toBe(lang);
			});
		});
	});

	describe("Effective language with Accept-Language header", () => {
		SUPPORTED_LANGUAGES.forEach((lang) => {
			it(`Accept-Language: ${lang} sets effective language to ${lang}`, () => {
				const language = getEffectiveLanguage({ acceptLanguage: lang });
				expect(language).toBe(lang);
			});
		});
	});

	describe("Missing Accept-Language", () => {
		it("defaults to English when Accept-Language is missing", () => {
			const language = getEffectiveLanguage({});
			expect(language).toBe(DEFAULT_LANGUAGE);
		});

		it("defaults to English when Accept-Language is undefined", () => {
			const language = getEffectiveLanguage({ acceptLanguage: undefined });
			expect(language).toBe(DEFAULT_LANGUAGE);
		});

		it("defaults to English when Accept-Language is empty", () => {
			const language = getEffectiveLanguage({ acceptLanguage: "" });
			expect(language).toBe(DEFAULT_LANGUAGE);
		});
	});

	describe("Unsupported language fallback", () => {
		it("falls back to English for Japanese (ja)", () => {
			const language = getEffectiveLanguage({ acceptLanguage: "ja" });
			expect(language).toBe("en");
		});

		it("falls back to English for Chinese (zh)", () => {
			const language = getEffectiveLanguage({ acceptLanguage: "zh" });
			expect(language).toBe("en");
		});

		it("falls back to English for Korean (ko)", () => {
			const language = getEffectiveLanguage({ acceptLanguage: "ko" });
			expect(language).toBe("en");
		});

		it("falls back to English for Portuguese (pt)", () => {
			const language = getEffectiveLanguage({ acceptLanguage: "pt" });
			expect(language).toBe("en");
		});
	});

	describe("Quality value ordering", () => {
		it("respects quality ordering (ar highest)", () => {
			const language = getEffectiveLanguage({
				acceptLanguage: "fr;q=0.8, ar;q=0.9, en;q=0.5",
			});
			expect(language).toBe("ar");
		});

		it("respects quality ordering (fr highest)", () => {
			const language = getEffectiveLanguage({
				acceptLanguage: "en;q=0.5, fr;q=0.9, de;q=0.7",
			});
			expect(language).toBe("fr");
		});

		it("respects quality ordering (de highest)", () => {
			const language = getEffectiveLanguage({
				acceptLanguage: "de;q=1.0, es;q=0.8, en;q=0.5",
			});
			expect(language).toBe("de");
		});

		it("treats missing q as 1.0 (implicit highest)", () => {
			const language = getEffectiveLanguage({
				acceptLanguage: "es, en;q=0.5, fr;q=0.8",
			});
			expect(language).toBe("es");
		});

		it("picks first supported when unsupported has higher quality", () => {
			const language = getEffectiveLanguage({
				acceptLanguage: "ja;q=1.0, zh;q=0.9, fr;q=0.8",
			});
			expect(language).toBe("fr");
		});
	});

	describe("Region subtags normalization", () => {
		it("normalizes fr-FR to fr", () => {
			const language = getEffectiveLanguage({ acceptLanguage: "fr-FR" });
			expect(language).toBe("fr");
		});

		it("normalizes en-US to en", () => {
			const language = getEffectiveLanguage({ acceptLanguage: "en-US" });
			expect(language).toBe("en");
		});

		it("normalizes ar-SA to ar", () => {
			const language = getEffectiveLanguage({ acceptLanguage: "ar-SA" });
			expect(language).toBe("ar");
		});

		it("normalizes de-DE to de", () => {
			const language = getEffectiveLanguage({ acceptLanguage: "de-DE" });
			expect(language).toBe("de");
		});

		it("normalizes es-MX to es", () => {
			const language = getEffectiveLanguage({ acceptLanguage: "es-MX" });
			expect(language).toBe("es");
		});

		it("normalizes en-GB to en", () => {
			const language = getEffectiveLanguage({ acceptLanguage: "en-GB" });
			expect(language).toBe("en");
		});
	});

	describe("User preference overrides Accept-Language", () => {
		it("user preference de overrides Accept-Language fr", () => {
			const language = getEffectiveLanguage({
				userPreference: "de",
				acceptLanguage: "fr",
			});
			expect(language).toBe("de");
		});

		it("user preference ar overrides Accept-Language en", () => {
			const language = getEffectiveLanguage({
				userPreference: "ar",
				acceptLanguage: "en",
			});
			expect(language).toBe("ar");
		});

		it("user preference es overrides Accept-Language de;q=1.0", () => {
			const language = getEffectiveLanguage({
				userPreference: "es",
				acceptLanguage: "de;q=1.0, en;q=0.9",
			});
			expect(language).toBe("es");
		});

		it("falls back to Accept-Language when user preference is unsupported", () => {
			const language = getEffectiveLanguage({
				userPreference: "ja",
				acceptLanguage: "fr",
			});
			expect(language).toBe("fr");
		});

		it("falls back to Accept-Language when user preference is undefined", () => {
			const language = getEffectiveLanguage({
				userPreference: undefined,
				acceptLanguage: "ar",
			});
			expect(language).toBe("ar");
		});
	});

	describe("Translator produces correct language output", () => {
		SUPPORTED_LANGUAGES.forEach((lang) => {
			it(`translator for ${lang} produces translated auth error`, () => {
				const t = getTranslator(lang);
				const message = t("errors:auth.unauthorized");

				expect(message).not.toContain("errors:");
				expect(message.length).toBeGreaterThan(3);
			});
		});

		it("different languages produce different translations", () => {
			const enMessage = getTranslator("en")("errors:auth.unauthorized");
			const arMessage = getTranslator("ar")("errors:auth.unauthorized");
			const frMessage = getTranslator("fr")("errors:auth.unauthorized");

			// At least some languages should differ from English
			const allSame = arMessage === enMessage && frMessage === enMessage;
			expect(allSame).toBe(false);
		});
	});

	describe("Complex Accept-Language headers", () => {
		it("handles realistic browser header", () => {
			const language = getEffectiveLanguage({
				acceptLanguage: "en-US,en;q=0.9,fr-FR;q=0.8,fr;q=0.7",
			});
			expect(language).toBe("en");
		});

		it("handles header with many unsupported + one supported", () => {
			const language = getEffectiveLanguage({
				acceptLanguage: "ja;q=1.0, zh-CN;q=0.9, ko;q=0.8, ar;q=0.7",
			});
			expect(language).toBe("ar");
		});

		it("handles wildcard with supported languages", () => {
			const language = getEffectiveLanguage({
				acceptLanguage: "*;q=0.1, de;q=0.9",
			});
			expect(language).toBe("de");
		});
	});
});
