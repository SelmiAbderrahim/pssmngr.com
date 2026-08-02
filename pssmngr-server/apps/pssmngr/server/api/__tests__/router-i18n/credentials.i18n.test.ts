// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Credentials Router i18n Integration Tests.
 *
 * Tests that verify translated error messages for credential-related
 * operations across all supported languages.
 */

import {
	getTranslator,
	initI18n,
	notFoundError,
	SUPPORTED_LANGUAGES,
	type SupportedLanguage,
} from "@pssmngr/server";
import { beforeAll, describe, expect, it } from "vitest";
import {
	expectNotTranslationKey,
	expectTranslatedError,
} from "../fixtures/i18n-test-utils";

describe("Credentials Router i18n", () => {
	beforeAll(async () => {
		await initI18n();
	});

	describe("Vault NOT_FOUND Errors", () => {
		it.each([
			["en", "not found"],
			["ar", "لم يتم العثور"],
			["fr", "introuvable"],
			["de", "nicht gefunden"],
			["es", "no encontrado"],
		] as const)(
			"should return translated vault NOT_FOUND error for %s",
			(lang, expectedText) => {
				const t = getTranslator(lang as SupportedLanguage);
				const error = notFoundError(t, "vault");

				expectTranslatedError(error, {
					code: "NOT_FOUND",
					messageContains: expectedText,
				});
			},
		);

		it.each(SUPPORTED_LANGUAGES)(
			"should include vault resource name for %s",
			(lang) => {
				const t = getTranslator(lang);
				const error = notFoundError(t, "vault");

				expectNotTranslationKey(error);
				expect(error.message.toLowerCase()).toContain("vault");
			},
		);
	});

	describe("Item NOT_FOUND Errors", () => {
		it.each([
			["en", "not found"],
			["ar", "لم يتم العثور"],
			["fr", "introuvable"],
			["de", "nicht gefunden"],
			["es", "no encontrado"],
		] as const)(
			"should return translated item NOT_FOUND error for %s",
			(lang, expectedText) => {
				const t = getTranslator(lang as SupportedLanguage);
				const error = notFoundError(t, "item");

				expectTranslatedError(error, {
					code: "NOT_FOUND",
					messageContains: expectedText,
				});
			},
		);

		it.each(SUPPORTED_LANGUAGES)(
			"should include item resource name for %s",
			(lang) => {
				const t = getTranslator(lang);
				const error = notFoundError(t, "item");

				expectNotTranslationKey(error);
				expect(error.message.toLowerCase()).toContain("item");
			},
		);
	});

	describe("Interpolation", () => {
		it.each(SUPPORTED_LANGUAGES)(
			"should interpolate item ID in NOT_FOUND for %s",
			(lang) => {
				const t = getTranslator(lang);
				const testId = "cred-xyz-789";
				const error = notFoundError(t, "item", testId);

				expectNotTranslationKey(error);
				expect(error.message).toContain(testId);
			},
		);
	});

	describe("Error Code Consistency", () => {
		it.each(SUPPORTED_LANGUAGES)(
			"should maintain NOT_FOUND code across %s",
			(lang) => {
				const t = getTranslator(lang);
				expect(notFoundError(t, "vault").code).toBe("NOT_FOUND");
				expect(notFoundError(t, "item").code).toBe("NOT_FOUND");
			},
		);
	});
});
