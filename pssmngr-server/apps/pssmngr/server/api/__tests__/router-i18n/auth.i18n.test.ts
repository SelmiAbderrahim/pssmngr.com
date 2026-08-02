// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Auth Router i18n Integration Tests.
 *
 * Tests that verify translated error messages for authentication-related
 * operations across all supported languages.
 */

import {
	badRequestError,
	getTranslator,
	initI18n,
	notFoundError,
	SUPPORTED_LANGUAGES,
	type SupportedLanguage,
	unauthorizedError,
} from "@pssmngr/server";
import { TRPCError } from "@trpc/server";
import { beforeAll, describe, expect, it } from "vitest";
import {
	expectNotTranslationKey,
	expectTranslatedError,
} from "../fixtures/i18n-test-utils";

describe("Auth Router i18n", () => {
	beforeAll(async () => {
		await initI18n();
	});

	describe("UNAUTHORIZED Errors", () => {
		it.each([
			["en", "logged in"],
			["ar", "تسجيل الدخول"],
			["fr", "connecté"],
			["de", "angemeldet"],
			["es", "sesión"],
		] as const)(
			"should return translated UNAUTHORIZED error for %s",
			(lang, expectedText) => {
				const t = getTranslator(lang as SupportedLanguage);
				const error = unauthorizedError(t);

				expectTranslatedError(error, {
					code: "UNAUTHORIZED",
					messageContains: expectedText,
				});
			},
		);
	});

	describe("Rate Limited Errors", () => {
		it.each(SUPPORTED_LANGUAGES)(
			"should translate rate limited error with interpolation for %s",
			(lang) => {
				const t = getTranslator(lang);
				const message = t("errors:auth.rateLimited", { seconds: 30 });

				expect(message).not.toContain("errors:");
				expect(message).not.toContain("{{seconds}}");
				expect(message).toContain("30");
				expect(message.length).toBeGreaterThan(3);
			},
		);

		it.each(SUPPORTED_LANGUAGES)(
			"should produce TRPCError with TOO_MANY_REQUESTS code for %s",
			(lang) => {
				const t = getTranslator(lang);
				const error = new TRPCError({
					code: "TOO_MANY_REQUESTS",
					message: t("errors:auth.rateLimited", { seconds: 60 }),
				});

				expect(error.code).toBe("TOO_MANY_REQUESTS");
				expect(error.message).toContain("60");
				expect(error.message).not.toContain("{{");
			},
		);
	});

	describe("Vault Already Exists (CONFLICT)", () => {
		it.each(SUPPORTED_LANGUAGES)(
			"should translate vault already exists error for %s",
			(lang) => {
				const t = getTranslator(lang);
				const error = new TRPCError({
					code: "CONFLICT",
					message: t("errors:auth.vaultAlreadyExists"),
				});

				expect(error.code).toBe("CONFLICT");
				expectNotTranslationKey(error);
				expect(error.message.length).toBeGreaterThan(3);
			},
		);
	});

	describe("Two-Factor Authentication Errors", () => {
		it.each(SUPPORTED_LANGUAGES)(
			"should translate 2FA enable failed error for %s",
			(lang) => {
				const t = getTranslator(lang);
				const error = new TRPCError({
					code: "BAD_REQUEST",
					message: t("errors:auth.twoFactorFailed"),
				});

				expect(error.code).toBe("BAD_REQUEST");
				expectNotTranslationKey(error);
				expect(error.message.length).toBeGreaterThan(3);
			},
		);

		it.each(SUPPORTED_LANGUAGES)(
			"should translate invalid TOTP error for %s",
			(lang) => {
				const t = getTranslator(lang);
				const error = new TRPCError({
					code: "BAD_REQUEST",
					message: t("errors:auth.invalidTotp"),
				});

				expect(error.code).toBe("BAD_REQUEST");
				expectNotTranslationKey(error);
				expect(error.message.length).toBeGreaterThan(3);
			},
		);

		it.each(SUPPORTED_LANGUAGES)(
			"should translate 2FA disable failed error for %s",
			(lang) => {
				const t = getTranslator(lang);
				const error = new TRPCError({
					code: "BAD_REQUEST",
					message: t("errors:auth.disableTwoFactorFailed"),
				});

				expect(error.code).toBe("BAD_REQUEST");
				expectNotTranslationKey(error);
				expect(error.message.length).toBeGreaterThan(3);
			},
		);
	});

	describe("Session Errors", () => {
		it.each(SUPPORTED_LANGUAGES)(
			"should translate use logout error for %s",
			(lang) => {
				const t = getTranslator(lang);
				const error = badRequestError(t, "errors:auth.useLogout");

				expect(error.code).toBe("BAD_REQUEST");
				expectNotTranslationKey(error);
				expect(error.message.length).toBeGreaterThan(3);
			},
		);

		it.each([
			["en", "not found"],
			["ar", "لم يتم العثور"],
			["fr", "introuvable"],
			["de", "nicht gefunden"],
			["es", "no encontrado"],
		] as const)(
			"should translate session not found error for %s",
			(lang, expectedText) => {
				const t = getTranslator(lang as SupportedLanguage);
				const error = notFoundError(t, "session");

				expectTranslatedError(error, {
					code: "NOT_FOUND",
					messageContains: expectedText,
				});
			},
		);
	});

	describe("Error Code Consistency", () => {
		it.each(SUPPORTED_LANGUAGES)(
			"should maintain correct error codes across %s",
			(lang) => {
				const t = getTranslator(lang);

				expect(unauthorizedError(t).code).toBe("UNAUTHORIZED");
				expect(notFoundError(t, "session").code).toBe("NOT_FOUND");
				expect(badRequestError(t, "errors:auth.useLogout").code).toBe(
					"BAD_REQUEST",
				);
			},
		);
	});
});
