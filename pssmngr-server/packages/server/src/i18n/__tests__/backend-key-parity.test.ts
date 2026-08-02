// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Backend Translation Key Parity Tests.
 *
 * Verifies that all 5 backend namespaces have identical key sets
 * across all 5 supported languages, and that no values are empty.
 *
 * This catches:
 *   - Missing keys in non-English languages
 *   - Extra/orphaned keys in non-English languages
 *   - Empty string values (untranslated placeholders)
 *   - Structural mismatches between language files
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { initI18n, NAMESPACES, SUPPORTED_LANGUAGES } from "../index";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOCALES_DIR = path.join(__dirname, "../locales");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface TranslationData {
	[key: string]: string | TranslationData;
}

function loadJson(lang: string, ns: string): TranslationData {
	const filePath = path.join(LOCALES_DIR, lang, `${ns}.json`);
	if (!fs.existsSync(filePath)) {
		throw new Error(`Translation file missing: ${filePath}`);
	}
	return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function getKeys(obj: TranslationData, prefix = ""): string[] {
	const keys: string[] = [];
	for (const [key, value] of Object.entries(obj)) {
		const fullKey = prefix ? `${prefix}.${key}` : key;
		if (typeof value === "string") {
			keys.push(fullKey);
		} else if (typeof value === "object" && value !== null) {
			keys.push(...getKeys(value, fullKey));
		}
	}
	return keys.sort();
}

function findEmptyValues(obj: TranslationData, prefix = ""): string[] {
	const emptyKeys: string[] = [];
	for (const [key, value] of Object.entries(obj)) {
		const fullKey = prefix ? `${prefix}.${key}` : key;
		if (typeof value === "string") {
			if (value.trim() === "") {
				emptyKeys.push(fullKey);
			}
		} else if (typeof value === "object" && value !== null) {
			emptyKeys.push(...findEmptyValues(value, fullKey));
		}
	}
	return emptyKeys;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Backend translation key parity", () => {
	beforeAll(async () => {
		await initI18n();
	});

	describe("All locale files exist", () => {
		for (const lang of SUPPORTED_LANGUAGES) {
			for (const ns of NAMESPACES) {
				it(`${lang}/${ns}.json exists`, () => {
					const filePath = path.join(LOCALES_DIR, lang, `${ns}.json`);
					expect(fs.existsSync(filePath), `Missing: ${filePath}`).toBe(true);
				});
			}
		}
	});

	for (const ns of NAMESPACES) {
		describe(`${ns} namespace`, () => {
			it("all languages have the same keys as English", () => {
				const enKeys = getKeys(loadJson("en", ns));
				expect(enKeys.length).toBeGreaterThan(0);

				for (const lang of SUPPORTED_LANGUAGES.filter((l) => l !== "en")) {
					const langKeys = getKeys(loadJson(lang, ns));
					const missing = enKeys.filter((k) => !langKeys.includes(k));
					const extra = langKeys.filter((k) => !enKeys.includes(k));

					expect(
						missing,
						`Missing in ${lang}/${ns}: ${missing.join(", ")}`,
					).toEqual([]);
					expect(extra, `Extra in ${lang}/${ns}: ${extra.join(", ")}`).toEqual(
						[],
					);
				}
			});

			for (const lang of SUPPORTED_LANGUAGES) {
				it(`${lang}/${ns}.json has no empty values`, () => {
					const data = loadJson(lang, ns);
					const emptyKeys = findEmptyValues(data);
					expect(
						emptyKeys,
						`Empty values in ${lang}/${ns}: ${emptyKeys.join(", ")}`,
					).toEqual([]);
				});
			}

			it("all languages have the same key count as English", () => {
				const enCount = getKeys(loadJson("en", ns)).length;

				for (const lang of SUPPORTED_LANGUAGES.filter((l) => l !== "en")) {
					const langCount = getKeys(loadJson(lang, ns)).length;
					expect(
						langCount,
						`${lang}/${ns} has ${langCount} keys but en has ${enCount}`,
					).toBe(enCount);
				}
			});
		});
	}

	describe("JSON validity", () => {
		for (const lang of SUPPORTED_LANGUAGES) {
			for (const ns of NAMESPACES) {
				it(`${lang}/${ns}.json is valid JSON`, () => {
					const filePath = path.join(LOCALES_DIR, lang, `${ns}.json`);
					const content = fs.readFileSync(filePath, "utf-8");

					expect(() => JSON.parse(content)).not.toThrow();
				});
			}
		}
	});

	describe("Interpolation placeholder consistency", () => {
		it("all languages have matching interpolation placeholders per key", () => {
			const placeholderRegex = /\{\{(\w+)\}\}/g;
			const mismatches: string[] = [];

			for (const ns of NAMESPACES) {
				const enData = loadJson("en", ns);
				const enKeys = getKeys(enData);

				for (const lang of SUPPORTED_LANGUAGES.filter((l) => l !== "en")) {
					const langData = loadJson(lang, ns);

					for (const key of enKeys) {
						const enValue = getNestedValue(enData, key);
						const langValue = getNestedValue(langData, key);

						if (typeof enValue !== "string" || typeof langValue !== "string") {
							continue;
						}

						const enPlaceholders = [...enValue.matchAll(placeholderRegex)]
							.map((m) => m[1])
							.sort();
						const langPlaceholders = [...langValue.matchAll(placeholderRegex)]
							.map((m) => m[1])
							.sort();

						if (
							JSON.stringify(enPlaceholders) !==
							JSON.stringify(langPlaceholders)
						) {
							mismatches.push(
								`${lang}/${ns}:${key} — en: {${enPlaceholders.join(",")}} vs ${lang}: {${langPlaceholders.join(",")}}`,
							);
						}
					}
				}
			}

			expect(
				mismatches,
				`Placeholder mismatches:\n${mismatches.join("\n")}`,
			).toEqual([]);
		});
	});
});

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function getNestedValue(
	obj: TranslationData,
	keyPath: string,
): string | TranslationData | undefined {
	const parts = keyPath.split(".");
	let current: string | TranslationData | undefined = obj;

	for (const part of parts) {
		if (typeof current !== "object" || current === null) {
			return undefined;
		}
		current = current[part];
	}

	return current;
}
