// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Vault Router i18n Integration Tests.
 *
 * Tests that verify translated error messages for vault-related
 * operations across all supported languages.
 */

import {
	badRequestError,
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

describe("Vault Router i18n", () => {
	beforeAll(async () => {
		await initI18n();
	});

	describe("NOT_FOUND Errors", () => {
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
			"should include resource name in NOT_FOUND for %s",
			(lang) => {
				const t = getTranslator(lang);
				const error = notFoundError(t, "vault");

				expectNotTranslationKey(error);
				expect(error.message.toLowerCase()).toContain("vault");
			},
		);

		it.each(SUPPORTED_LANGUAGES)(
			"should interpolate vault ID in NOT_FOUND for %s",
			(lang) => {
				const t = getTranslator(lang);
				const testId = "vault-abc-123";
				const error = notFoundError(t, "vault", testId);

				expectNotTranslationKey(error);
				expect(error.message).toContain(testId);
			},
		);
	});

	describe("Delete Not Confirmed (BAD_REQUEST)", () => {
		it.each(SUPPORTED_LANGUAGES)(
			"should translate delete not confirmed error for %s",
			(lang) => {
				const t = getTranslator(lang);
				const error = badRequestError(t, "errors:vault.deleteNotConfirmed");

				expect(error.code).toBe("BAD_REQUEST");
				expectNotTranslationKey(error);
				expect(error.message.length).toBeGreaterThan(3);
			},
		);
	});

	describe("Error Code Consistency", () => {
		it.each(SUPPORTED_LANGUAGES)(
			"should maintain NOT_FOUND code across %s",
			(lang) => {
				const t = getTranslator(lang);
				expect(notFoundError(t, "vault").code).toBe("NOT_FOUND");
				expect(notFoundError(t, "vault", "test-id").code).toBe("NOT_FOUND");
			},
		);

		it.each(SUPPORTED_LANGUAGES)(
			"should maintain BAD_REQUEST code across %s",
			(lang) => {
				const t = getTranslator(lang);
				expect(badRequestError(t, "errors:vault.deleteNotConfirmed").code).toBe(
					"BAD_REQUEST",
				);
			},
		);
	});
});
