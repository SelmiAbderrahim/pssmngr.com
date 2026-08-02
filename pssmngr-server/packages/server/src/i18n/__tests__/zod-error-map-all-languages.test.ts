// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Cross-language Zod error map regression tests.
 *
 * zod-error-map.test.ts already exercises English in depth and has a small
 * Arabic section.  This file extends coverage to French, German, and Spanish,
 * and adds a systematic "no raw key" guard that runs against all 5 languages
 * for the most critical validators.
 *
 * Design goals:
 *   1. Every supported language produces a translated (non-key) message for
 *      each critical Zod issue type.
 *   2. Interpolated numbers/values appear verbatim in the translated output.
 *   3. Messages never contain a raw "namespace:key" pattern.
 *   4. The validateWithLocalizedErrors helper works correctly with each
 *      language's translator.
 */

import type { TFunction } from "i18next";
import { beforeAll, describe, expect, it } from "vitest";
import { z } from "zod/v3";
import { getTranslator, initI18n, SUPPORTED_LANGUAGES } from "../index";
import { validateWithLocalizedErrors } from "../zod-error-map";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Raw key prefixes that must never appear in a translated message. */
const RAW_KEY_PREFIXES = ["validation:", "errors:", "permissions:", "emails:"];

function assertNotRawKey(message: string, context: string): void {
	for (const prefix of RAW_KEY_PREFIXES) {
		expect(
			message,
			`${context}: message looks like a raw translation key ("${message}")`,
		).not.toContain(prefix);
	}
}

function assertTranslatedMessage(message: string, context: string): void {
	expect(message, `${context}: message must be defined`).toBeDefined();
	expect(
		message.length,
		`${context}: message too short ("${message}")`,
	).toBeGreaterThan(3);
	assertNotRawKey(message, context);
}

/** Run a schema against invalid input and return the first issue message. */
function firstMessage(
	schema: z.ZodTypeAny,
	input: unknown,
	t: TFunction,
): string {
	const result = validateWithLocalizedErrors(schema, input, t);
	if (result.success) {
		throw new Error("Expected validation to fail but it succeeded");
	}
	return result.error.issues[0].message;
}

// ---------------------------------------------------------------------------
// Critical validators table
// ---------------------------------------------------------------------------

/** Each entry describes one Zod scenario with an invalid input. */
const CRITICAL_CASES = [
	{
		name: "required string (undefined)",
		schema: z.object({ v: z.string() }),
		input: {},
	},
	{
		name: "required string (empty, min 1)",
		schema: z.object({ v: z.string().min(1) }),
		input: { v: "" },
	},
	{
		name: "email",
		schema: z.object({ v: z.string().email() }),
		input: { v: "not-an-email" },
	},
	{
		name: "url",
		schema: z.object({ v: z.string().url() }),
		input: { v: "not-a-url" },
	},
	{
		name: "minLength string",
		schema: z.object({ v: z.string().min(8) }),
		input: { v: "short" },
	},
	{
		name: "maxLength string",
		schema: z.object({ v: z.string().max(5) }),
		input: { v: "toolongvalue" },
	},
	{
		name: "required number (undefined)",
		schema: z.object({ v: z.number() }),
		input: {},
	},
	{
		name: "number min (inclusive)",
		schema: z.object({ v: z.number().min(1) }),
		input: { v: 0 },
	},
	{
		name: "number max (inclusive)",
		schema: z.object({ v: z.number().max(100) }),
		input: { v: 101 },
	},
	{
		name: "invalid date",
		schema: z.object({ v: z.date() }),
		input: { v: new Date("invalid") },
	},
	{
		name: "array required (min 1)",
		schema: z.object({ v: z.array(z.string()).min(1) }),
		input: { v: [] },
	},
	{
		name: "invalid enum value",
		schema: z.object({ v: z.enum(["a", "b", "c"]) }),
		input: { v: "x" as never },
	},
] as const;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Zod error map — all languages (no raw keys)", () => {
	beforeAll(async () => {
		await initI18n();
	});

	describe("systematic no-raw-key guard", () => {
		for (const lang of SUPPORTED_LANGUAGES) {
			describe(`language: ${lang}`, () => {
				let t: TFunction;

				beforeAll(() => {
					t = getTranslator(lang);
				});

				for (const testCase of CRITICAL_CASES) {
					it(`translates "${testCase.name}"`, () => {
						const message = firstMessage(testCase.schema, testCase.input, t);
						assertTranslatedMessage(message, `${lang}/${testCase.name}`);
					});
				}
			});
		}
	});

	// -------------------------------------------------------------------------
	// Interpolation: numbers / values must appear in translated output
	// -------------------------------------------------------------------------

	describe("interpolation values appear in translated output", () => {
		for (const lang of SUPPORTED_LANGUAGES) {
			describe(`language: ${lang}`, () => {
				let t: TFunction;

				beforeAll(() => {
					t = getTranslator(lang);
				});

				it("minLength interpolates the minimum value", () => {
					const schema = z.object({ v: z.string().min(12) });
					const message = firstMessage(schema, { v: "hi" }, t);
					assertTranslatedMessage(message, `${lang}/minLength interpolation`);
					expect(message).toContain("12");
				});

				it("maxLength interpolates the maximum value", () => {
					const schema = z.object({ v: z.string().max(3) });
					const message = firstMessage(schema, { v: "toolong" }, t);
					assertTranslatedMessage(message, `${lang}/maxLength interpolation`);
					expect(message).toContain("3");
				});

				it("number.min interpolates the minimum value", () => {
					const schema = z.object({ v: z.number().min(5) });
					const message = firstMessage(schema, { v: 2 }, t);
					assertTranslatedMessage(message, `${lang}/number.min interpolation`);
					expect(message).toContain("5");
				});

				it("number.max interpolates the maximum value", () => {
					const schema = z.object({ v: z.number().max(10) });
					const message = firstMessage(schema, { v: 99 }, t);
					assertTranslatedMessage(message, `${lang}/number.max interpolation`);
					expect(message).toContain("10");
				});

				it("enum interpolates the option list", () => {
					const schema = z.object({ v: z.enum(["foo", "bar"]) });
					const message = firstMessage(schema, { v: "baz" as never }, t);
					assertTranslatedMessage(message, `${lang}/enum interpolation`);
					// At least one of the valid options must appear in the message
					const hasOption = message.includes("foo") || message.includes("bar");
					expect(
						hasOption,
						`${lang}/enum: expected options in message ("${message}")`,
					).toBe(true);
				});
			});
		}
	});

	// -------------------------------------------------------------------------
	// Per-language spot-checks: verify actual translations differ from English
	// This catches accidental fallback to English for all non-English langs.
	// -------------------------------------------------------------------------

	describe("French translations differ from English baseline", () => {
		let tEn: TFunction;
		let tFr: TFunction;

		beforeAll(() => {
			tEn = getTranslator("en");
			tFr = getTranslator("fr");
		});

		it("required string message is different from English", () => {
			const schema = z.object({ v: z.string().min(1) });
			const enMsg = firstMessage(schema, { v: "" }, tEn);
			const frMsg = firstMessage(schema, { v: "" }, tFr);
			assertTranslatedMessage(frMsg, "fr/required string");
			expect(frMsg).not.toBe(enMsg);
		});

		it("email message is different from English", () => {
			const schema = z.object({ v: z.string().email() });
			const enMsg = firstMessage(schema, { v: "bad" }, tEn);
			const frMsg = firstMessage(schema, { v: "bad" }, tFr);
			assertTranslatedMessage(frMsg, "fr/email");
			expect(frMsg).not.toBe(enMsg);
		});
	});

	describe("German translations differ from English baseline", () => {
		let tEn: TFunction;
		let tDe: TFunction;

		beforeAll(() => {
			tEn = getTranslator("en");
			tDe = getTranslator("de");
		});

		it("required string message is different from English", () => {
			const schema = z.object({ v: z.string().min(1) });
			const enMsg = firstMessage(schema, { v: "" }, tEn);
			const deMsg = firstMessage(schema, { v: "" }, tDe);
			assertTranslatedMessage(deMsg, "de/required string");
			expect(deMsg).not.toBe(enMsg);
		});

		it("url message is different from English", () => {
			const schema = z.object({ v: z.string().url() });
			const enMsg = firstMessage(schema, { v: "not-url" }, tEn);
			const deMsg = firstMessage(schema, { v: "not-url" }, tDe);
			assertTranslatedMessage(deMsg, "de/url");
			expect(deMsg).not.toBe(enMsg);
		});
	});

	describe("Spanish translations differ from English baseline", () => {
		let tEn: TFunction;
		let tEs: TFunction;

		beforeAll(() => {
			tEn = getTranslator("en");
			tEs = getTranslator("es");
		});

		it("required string message is different from English", () => {
			const schema = z.object({ v: z.string().min(1) });
			const enMsg = firstMessage(schema, { v: "" }, tEn);
			const esMsg = firstMessage(schema, { v: "" }, tEs);
			assertTranslatedMessage(esMsg, "es/required string");
			expect(esMsg).not.toBe(enMsg);
		});

		it("minLength message is different from English", () => {
			const schema = z.object({ v: z.string().min(6) });
			const enMsg = firstMessage(schema, { v: "hi" }, tEn);
			const esMsg = firstMessage(schema, { v: "hi" }, tEs);
			assertTranslatedMessage(esMsg, "es/minLength");
			expect(esMsg).not.toBe(enMsg);
			// Number must still be present regardless of language
			expect(esMsg).toContain("6");
		});
	});

	describe("Arabic translations differ from English baseline", () => {
		let tEn: TFunction;
		let tAr: TFunction;

		beforeAll(() => {
			tEn = getTranslator("en");
			tAr = getTranslator("ar");
		});

		it("required string message is different from English", () => {
			const schema = z.object({ v: z.string().min(1) });
			const enMsg = firstMessage(schema, { v: "" }, tEn);
			const arMsg = firstMessage(schema, { v: "" }, tAr);
			assertTranslatedMessage(arMsg, "ar/required string");
			expect(arMsg).not.toBe(enMsg);
		});

		it("email message contains Arabic characters", () => {
			const schema = z.object({ v: z.string().email() });
			const arMsg = firstMessage(schema, { v: "bad" }, tAr);
			assertTranslatedMessage(arMsg, "ar/email");
			// Arabic messages should contain at least one Arabic character (Unicode range 0600–06FF)
			expect(/[\u0600-\u06FF]/.test(arMsg)).toBe(true);
		});

		it("minLength message contains the interpolated number", () => {
			const schema = z.object({ v: z.string().min(10) });
			const arMsg = firstMessage(schema, { v: "short" }, tAr);
			assertTranslatedMessage(arMsg, "ar/minLength");
			expect(arMsg).toContain("10");
		});
	});

	// -------------------------------------------------------------------------
	// Edge cases: helpers that should work across all languages
	// -------------------------------------------------------------------------

	describe("edge cases — all languages", () => {
		for (const lang of SUPPORTED_LANGUAGES) {
			describe(`language: ${lang}`, () => {
				let t: TFunction;

				beforeAll(() => {
					t = getTranslator(lang);
				});

				it("valid input passes without errors", () => {
					const schema = z.object({
						name: z.string().min(1),
						email: z.string().email(),
						age: z.number().min(0),
					});
					const result = validateWithLocalizedErrors(
						schema,
						{ name: "Alice", email: "alice@example.com", age: 25 },
						t,
					);
					expect(result.success).toBe(true);
				});

				it("multiple field errors all get translated messages", () => {
					const schema = z.object({
						name: z.string().min(1),
						email: z.string().email(),
					});
					const result = validateWithLocalizedErrors(
						schema,
						{ name: "", email: "bad" },
						t,
					);
					expect(result.success).toBe(false);
					if (!result.success) {
						expect(result.error.issues).toHaveLength(2);
						for (const issue of result.error.issues) {
							assertTranslatedMessage(
								issue.message,
								`${lang}/multiple field errors — ${issue.path.join(".")}`,
							);
						}
					}
				});

				it("uuid validation error is translated", () => {
					const schema = z.object({ id: z.string().uuid() });
					const message = firstMessage(schema, { id: "not-a-uuid" }, t);
					assertTranslatedMessage(message, `${lang}/uuid`);
				});

				it("number.finite error is translated", () => {
					const schema = z.object({ v: z.number().finite() });
					const message = firstMessage(
						schema,
						{ v: Number.POSITIVE_INFINITY },
						t,
					);
					assertTranslatedMessage(message, `${lang}/number.finite`);
				});
			});
		}
	});
});
