// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import {
	DEFAULT_LANGUAGE,
	initI18n,
	NAMESPACES,
	SUPPORTED_LANGUAGES,
} from "../index";

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOCALES_DIR = path.join(__dirname, "../locales");

interface TranslationData {
	[key: string]: string | TranslationData;
}

/**
 * Recursively get all translation keys from an object
 */
function getAllKeys(obj: TranslationData, prefix = ""): string[] {
	const keys: string[] = [];

	for (const [key, value] of Object.entries(obj)) {
		const fullKey = prefix ? `${prefix}.${key}` : key;

		if (typeof value === "string") {
			keys.push(fullKey);
		} else if (typeof value === "object" && value !== null) {
			keys.push(...getAllKeys(value, fullKey));
		}
	}

	return keys;
}

/**
 * Load translation file for a language and namespace
 */
function loadTranslation(lang: string, namespace: string): TranslationData {
	const filePath = path.join(LOCALES_DIR, lang, `${namespace}.json`);

	if (!fs.existsSync(filePath)) {
		return {};
	}

	const content = fs.readFileSync(filePath, "utf-8");
	return JSON.parse(content);
}

/**
 * Get all keys from reference language (English)
 */
function getReferenceKeys(namespace: string): string[] {
	const data = loadTranslation(DEFAULT_LANGUAGE, namespace);
	return getAllKeys(data);
}

/**
 * Find keys with empty string values
 */
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

/**
 * Get nested value from object by dot notation key
 */
function getNestedValue(
	obj: TranslationData,
	key: string,
): string | TranslationData | undefined {
	const parts = key.split(".");
	let current: TranslationData | string = obj;

	for (const part of parts) {
		if (typeof current === "string" || current === undefined) {
			return undefined;
		}
		current = current[part];
	}

	return current;
}

/**
 * Extract interpolation variables from a string
 * Matches: {{variable}}
 */
function extractInterpolationVariables(str: string): string[] {
	const regex = /\{\{(\w+)\}\}/g;
	const variables: string[] = [];
	let match: RegExpExecArray | null = regex.exec(str);
	while (match !== null) {
		variables.push(match[1]);
		match = regex.exec(str);
	}

	return variables;
}

/**
 * Compare two arrays for equality (order-independent)
 */
function arraysEqual(a: string[], b: string[]): boolean {
	if (a.length !== b.length) return false;
	const sortedA = [...a].sort();
	const sortedB = [...b].sort();
	return sortedA.every((val, idx) => val === sortedB[idx]);
}

describe("Translation Completeness", () => {
	beforeAll(async () => {
		await initI18n();
	});

	describe("File Existence", () => {
		for (const lang of SUPPORTED_LANGUAGES) {
			for (const namespace of NAMESPACES) {
				it(`should have ${namespace}.json for ${lang}`, () => {
					const filePath = path.join(LOCALES_DIR, lang, `${namespace}.json`);
					expect(
						fs.existsSync(filePath),
						`Missing file: ${lang}/${namespace}.json`,
					).toBe(true);
				});
			}
		}
	});

	describe("Key Completeness", () => {
		for (const namespace of NAMESPACES) {
			const referenceKeys = getReferenceKeys(namespace);

			describe(`${namespace} namespace`, () => {
				for (const lang of SUPPORTED_LANGUAGES) {
					if (lang === DEFAULT_LANGUAGE) continue; // Skip reference language

					it(`should have all keys in ${lang}`, () => {
						const data = loadTranslation(lang, namespace);
						const keys = getAllKeys(data);

						const missingKeys = referenceKeys.filter(
							(key) => !keys.includes(key),
						);

						if (missingKeys.length > 0) {
							console.log(`Missing keys in ${lang}/${namespace}:`, missingKeys);
						}

						expect(
							missingKeys,
							`Missing ${missingKeys.length} keys in ${lang}/${namespace}: ${missingKeys.slice(0, 5).join(", ")}${missingKeys.length > 5 ? "..." : ""}`,
						).toEqual([]);
					});
				}
			});
		}
	});

	describe("No Extra Keys", () => {
		for (const namespace of NAMESPACES) {
			const referenceKeys = getReferenceKeys(namespace);

			describe(`${namespace} namespace`, () => {
				for (const lang of SUPPORTED_LANGUAGES) {
					if (lang === DEFAULT_LANGUAGE) continue;

					it(`should not have extra keys in ${lang}`, () => {
						const data = loadTranslation(lang, namespace);
						const keys = getAllKeys(data);

						const extraKeys = keys.filter(
							(key) => !referenceKeys.includes(key),
						);

						if (extraKeys.length > 0) {
							console.warn(`Extra keys in ${lang}/${namespace}:`, extraKeys);
						}

						// Warning only - extra keys are allowed but logged
						// They may be used for language-specific formatting
					});
				}
			});
		}
	});

	describe("JSON Validity", () => {
		for (const lang of SUPPORTED_LANGUAGES) {
			for (const namespace of NAMESPACES) {
				it(`should have valid JSON in ${lang}/${namespace}.json`, () => {
					const filePath = path.join(LOCALES_DIR, lang, `${namespace}.json`);

					if (!fs.existsSync(filePath)) {
						return; // File existence tested elsewhere
					}

					const content = fs.readFileSync(filePath, "utf-8");

					expect(() => JSON.parse(content)).not.toThrow();
				});
			}
		}
	});

	describe("No Empty Values", () => {
		for (const lang of SUPPORTED_LANGUAGES) {
			for (const namespace of NAMESPACES) {
				it(`should not have empty values in ${lang}/${namespace}`, () => {
					const data = loadTranslation(lang, namespace);
					const emptyKeys = findEmptyValues(data);

					if (emptyKeys.length > 0) {
						console.log(`Empty values in ${lang}/${namespace}:`, emptyKeys);
					}

					expect(
						emptyKeys,
						`Found ${emptyKeys.length} empty values in ${lang}/${namespace}: ${emptyKeys.slice(0, 5).join(", ")}${emptyKeys.length > 5 ? "..." : ""}`,
					).toEqual([]);
				});
			}
		}
	});

	describe("Interpolation Variables", () => {
		for (const namespace of NAMESPACES) {
			describe(`${namespace} namespace`, () => {
				it("should have matching interpolation variables across languages", () => {
					const referenceData = loadTranslation(DEFAULT_LANGUAGE, namespace);
					const referenceKeys = getAllKeys(referenceData);

					for (const lang of SUPPORTED_LANGUAGES) {
						if (lang === DEFAULT_LANGUAGE) continue;

						const data = loadTranslation(lang, namespace);

						for (const key of referenceKeys) {
							const refValue = getNestedValue(referenceData, key);
							const langValue = getNestedValue(data, key);

							if (
								typeof refValue === "string" &&
								typeof langValue === "string"
							) {
								const refVars = extractInterpolationVariables(refValue);
								const langVars = extractInterpolationVariables(langValue);

								if (!arraysEqual(refVars, langVars)) {
									console.log(
										`Variable mismatch in ${lang}/${namespace}/${key}:`,
										{ expected: refVars, actual: langVars },
									);
								}

								expect(
									langVars.sort(),
									`Interpolation variable mismatch in ${lang}/${namespace}/${key}: expected [${refVars.join(", ")}], got [${langVars.join(", ")}]`,
								).toEqual(refVars.sort());
							}
						}
					}
				});
			});
		}
	});

	describe("Statistics", () => {
		it("should report translation statistics", () => {
			let totalKeys = 0;
			const stats: Record<
				string,
				{ total: number; perNamespace: Record<string, number> }
			> = {};

			for (const lang of SUPPORTED_LANGUAGES) {
				stats[lang] = { total: 0, perNamespace: {} };

				for (const namespace of NAMESPACES) {
					const data = loadTranslation(lang, namespace);
					const keys = getAllKeys(data);
					stats[lang].perNamespace[namespace] = keys.length;
					stats[lang].total += keys.length;

					if (lang === DEFAULT_LANGUAGE) {
						totalKeys += keys.length;
					}
				}
			}

			console.log("\n=== Translation Statistics ===");
			console.log(`Total keys (${DEFAULT_LANGUAGE}): ${totalKeys}`);
			console.log("\nPer language:");
			for (const lang of SUPPORTED_LANGUAGES) {
				const coverage = Math.round((stats[lang].total / totalKeys) * 100);
				console.log(`  ${lang}: ${stats[lang].total} keys (${coverage}%)`);
			}

			// This test always passes - it's for reporting only
			expect(true).toBe(true);
		});
	});
});
