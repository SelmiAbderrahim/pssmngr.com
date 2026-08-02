// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { describe, expect, it } from "vitest";
import {
	getEffectiveLanguage,
	isLanguageSupported,
	normalizeLanguage,
	parseAcceptLanguage,
	parseAcceptLanguageHeader,
} from "../language-detection";

describe("Language Detection", () => {
	describe("parseAcceptLanguageHeader", () => {
		it("should parse simple language codes", () => {
			const result = parseAcceptLanguageHeader("en");
			expect(result).toHaveLength(1);
			expect(result[0].code).toBe("en");
			expect(result[0].quality).toBe(1);
		});

		it("should parse language with region", () => {
			const result = parseAcceptLanguageHeader("en-US");
			expect(result).toHaveLength(1);
			expect(result[0].code).toBe("en");
			expect(result[0].region).toBe("US");
		});

		it("should parse multiple languages", () => {
			const result = parseAcceptLanguageHeader("en-US,ar,fr");
			expect(result).toHaveLength(3);
			expect(result.map((r) => r.code)).toEqual(["en", "ar", "fr"]);
		});

		it("should parse quality values", () => {
			const result = parseAcceptLanguageHeader("en;q=0.9,ar;q=0.8");
			expect(result[0].code).toBe("en");
			expect(result[0].quality).toBe(0.9);
			expect(result[1].code).toBe("ar");
			expect(result[1].quality).toBe(0.8);
		});

		it("should sort by quality (descending)", () => {
			const result = parseAcceptLanguageHeader("en;q=0.5,ar;q=0.9,fr;q=0.7");
			expect(result.map((r) => r.code)).toEqual(["ar", "fr", "en"]);
		});

		it("should handle complex Accept-Language header", () => {
			const result = parseAcceptLanguageHeader(
				"en-US,en;q=0.9,ar-SA;q=0.8,ar;q=0.7,fr;q=0.6",
			);
			expect(result).toHaveLength(5);
			expect(result[0].code).toBe("en"); // en-US, quality 1
			expect(result[1].code).toBe("en"); // en, quality 0.9
			expect(result[2].code).toBe("ar"); // ar-SA, quality 0.8
		});

		it("should handle whitespace", () => {
			const result = parseAcceptLanguageHeader("  en-US , ar ; q=0.8 ");
			expect(result).toHaveLength(2);
			expect(result[0].code).toBe("en");
			expect(result[1].code).toBe("ar");
		});

		it("should handle empty string", () => {
			const result = parseAcceptLanguageHeader("");
			expect(result).toEqual([]);
		});

		it("should handle malformed entries gracefully", () => {
			const result = parseAcceptLanguageHeader("en,,,ar");
			expect(result).toHaveLength(2);
			expect(result.map((r) => r.code)).toEqual(["en", "ar"]);
		});

		it("should handle invalid quality values", () => {
			const result = parseAcceptLanguageHeader("en;q=invalid,ar;q=2.0");
			expect(result[0].quality).toBe(1); // Falls back to default
			expect(result[1].quality).toBe(1); // q=2.0 is out of range
		});

		it("should prefer language with region for equal quality", () => {
			const result = parseAcceptLanguageHeader("en,en-US");
			expect(result[0].region).toBe("US"); // en-US comes first (has region)
			expect(result[1].region).toBeUndefined(); // en comes second
		});

		it("should handle wildcard *", () => {
			const result = parseAcceptLanguageHeader("en,*;q=0.5");
			expect(result).toHaveLength(2);
			expect(result[0].code).toBe("en");
			expect(result[1].code).toBe("*");
		});
	});

	describe("parseAcceptLanguage", () => {
		it("should return first supported language", () => {
			expect(parseAcceptLanguage("en-US,ar;q=0.9")).toBe("en");
			expect(parseAcceptLanguage("ar,en;q=0.9")).toBe("ar");
			expect(parseAcceptLanguage("fr-FR,de;q=0.9")).toBe("fr");
		});

		it("should skip unsupported languages", () => {
			expect(parseAcceptLanguage("zh-CN,en;q=0.8")).toBe("en");
			expect(parseAcceptLanguage("ja,ko,ar;q=0.5")).toBe("ar");
		});

		it("should return default for all unsupported", () => {
			expect(parseAcceptLanguage("zh-CN,ja,ko")).toBe("en");
		});

		it("should return default for undefined", () => {
			expect(parseAcceptLanguage(undefined)).toBe("en");
		});

		it("should return default for null", () => {
			expect(parseAcceptLanguage(null)).toBe("en");
		});

		it("should return default for empty string", () => {
			expect(parseAcceptLanguage("")).toBe("en");
		});

		it("should respect quality ordering", () => {
			// ar has higher quality, should be selected even though en comes first
			expect(parseAcceptLanguage("en;q=0.5,ar;q=0.9")).toBe("ar");
		});

		it("should handle all supported languages", () => {
			expect(parseAcceptLanguage("en")).toBe("en");
			expect(parseAcceptLanguage("ar")).toBe("ar");
			expect(parseAcceptLanguage("fr")).toBe("fr");
			expect(parseAcceptLanguage("de")).toBe("de");
			expect(parseAcceptLanguage("es")).toBe("es");
		});
	});

	describe("normalizeLanguage", () => {
		it("should normalize language codes", () => {
			expect(normalizeLanguage("EN")).toBe("en");
			expect(normalizeLanguage("AR-SA")).toBe("ar");
			expect(normalizeLanguage("fr-FR")).toBe("fr");
		});

		it("should return default for unsupported", () => {
			expect(normalizeLanguage("zh")).toBe("en");
			expect(normalizeLanguage("invalid")).toBe("en");
		});

		it("should handle undefined/null", () => {
			expect(normalizeLanguage(undefined)).toBe("en");
			expect(normalizeLanguage(null)).toBe("en");
		});

		it("should handle empty string", () => {
			expect(normalizeLanguage("")).toBe("en");
		});
	});

	describe("isLanguageSupported", () => {
		it("should return true for supported languages", () => {
			expect(isLanguageSupported("en")).toBe(true);
			expect(isLanguageSupported("ar")).toBe(true);
			expect(isLanguageSupported("fr")).toBe(true);
			expect(isLanguageSupported("de")).toBe(true);
			expect(isLanguageSupported("es")).toBe(true);
		});

		it("should return false for unsupported languages", () => {
			expect(isLanguageSupported("zh")).toBe(false);
			expect(isLanguageSupported("ja")).toBe(false);
			expect(isLanguageSupported("invalid")).toBe(false);
		});

		it("should return false for empty string", () => {
			expect(isLanguageSupported("")).toBe(false);
		});
	});

	describe("getEffectiveLanguage", () => {
		it("should prioritize user preference", () => {
			expect(
				getEffectiveLanguage({
					userPreference: "ar",
					acceptLanguage: "en-US",
				}),
			).toBe("ar");
		});

		it("should fallback to Accept-Language", () => {
			expect(
				getEffectiveLanguage({
					userPreference: null,
					acceptLanguage: "fr-FR,en;q=0.9",
				}),
			).toBe("fr");
		});

		it("should fallback to default", () => {
			expect(
				getEffectiveLanguage({
					userPreference: null,
					acceptLanguage: null,
				}),
			).toBe("en");
		});

		it("should normalize user preference", () => {
			expect(
				getEffectiveLanguage({
					userPreference: "AR-SA",
					acceptLanguage: "en",
				}),
			).toBe("ar");
		});

		it("should skip invalid user preference", () => {
			expect(
				getEffectiveLanguage({
					userPreference: "invalid",
					acceptLanguage: "fr",
				}),
			).toBe("fr");
		});

		it("should handle empty options", () => {
			expect(getEffectiveLanguage({})).toBe("en");
		});

		it("should handle undefined options", () => {
			expect(
				getEffectiveLanguage({
					userPreference: undefined,
					acceptLanguage: undefined,
				}),
			).toBe("en");
		});

		it("should prefer en when user explicitly sets en", () => {
			expect(
				getEffectiveLanguage({
					userPreference: "en",
					acceptLanguage: "ar",
				}),
			).toBe("en");
		});

		it("should prefer en-US when user explicitly sets it", () => {
			expect(
				getEffectiveLanguage({
					userPreference: "en-US",
					acceptLanguage: "ar",
				}),
			).toBe("en");
		});
	});
});
