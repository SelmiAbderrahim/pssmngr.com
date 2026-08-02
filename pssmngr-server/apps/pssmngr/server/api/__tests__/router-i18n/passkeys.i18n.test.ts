// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Passkeys Router i18n Integration Tests.
 *
 * Tests that verify translated error messages for passkey-related
 * operations across all supported languages.
 */

import {
	getTranslator,
	initI18n,
	notFoundError,
	SUPPORTED_LANGUAGES,
	type SupportedLanguage,
} from "@pssmngr/server";
import { TRPCError } from "@trpc/server";
import { beforeAll, describe, expect, it } from "vitest";
import {
	expectNotTranslationKey,
	expectTranslatedError,
} from "../fixtures/i18n-test-utils";

describe("Passkeys Router i18n", () => {
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
			"should return translated passkey NOT_FOUND error for %s",
			(lang, expectedText) => {
				const t = getTranslator(lang as SupportedLanguage);
				const error = notFoundError(t, "passkey");

				expectTranslatedError(error, {
					code: "NOT_FOUND",
					messageContains: expectedText,
				});
			},
		);
	});

	describe("INTERNAL_SERVER_ERROR Errors", () => {
		it.each(SUPPORTED_LANGUAGES)(
			"should translate registrationOptionsFailed error for %s",
			(lang) => {
				const t = getTranslator(lang);
				const error = new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: t("errors:passkey.registrationOptionsFailed"),
				});

				expect(error.code).toBe("INTERNAL_SERVER_ERROR");
				expectNotTranslationKey(error);
				expect(error.message.length).toBeGreaterThan(3);
			},
		);

		it.each(SUPPORTED_LANGUAGES)(
			"should translate authOptionsFailed error for %s",
			(lang) => {
				const t = getTranslator(lang);
				const error = new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: t("errors:passkey.authOptionsFailed"),
				});

				expect(error.code).toBe("INTERNAL_SERVER_ERROR");
				expectNotTranslationKey(error);
				expect(error.message.length).toBeGreaterThan(3);
			},
		);
	});

	describe("BAD_REQUEST Errors", () => {
		it.each(SUPPORTED_LANGUAGES)(
			"should translate verificationFailed error for %s",
			(lang) => {
				const t = getTranslator(lang);
				const error = new TRPCError({
					code: "BAD_REQUEST",
					message: t("errors:passkey.verificationFailed"),
				});

				expect(error.code).toBe("BAD_REQUEST");
				expectNotTranslationKey(error);
				expect(error.message.length).toBeGreaterThan(3);
			},
		);

		it.each(SUPPORTED_LANGUAGES)(
			"should translate authVerificationFailed error for %s",
			(lang) => {
				const t = getTranslator(lang);
				const error = new TRPCError({
					code: "BAD_REQUEST",
					message: t("errors:passkey.authVerificationFailed"),
				});

				expect(error.code).toBe("BAD_REQUEST");
				expectNotTranslationKey(error);
				expect(error.message.length).toBeGreaterThan(3);
			},
		);
	});

	describe("Error Code Consistency", () => {
		it.each(SUPPORTED_LANGUAGES)(
			"should maintain correct error codes across %s",
			(lang) => {
				const t = getTranslator(lang);

				expect(notFoundError(t, "passkey").code).toBe("NOT_FOUND");
			},
		);
	});
});
