// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Shared Vault Router i18n Integration Tests.
 *
 * Tests that verify translated error messages for shared vault
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
import { TRPCError } from "@trpc/server";
import { beforeAll, describe, expect, it } from "vitest";
import {
	expectNotTranslationKey,
	expectTranslatedError,
} from "../fixtures/i18n-test-utils";

describe("Shared Vault Router i18n", () => {
	beforeAll(async () => {
		await initI18n();
	});

	describe("NOT_FOUND Errors", () => {
		const resources = ["family", "vault", "item"];

		resources.forEach((resource) => {
			it.each([
				["en", "not found"],
				["ar", "لم يتم العثور"],
				["fr", "introuvable"],
				["de", "nicht gefunden"],
				["es", "no encontrado"],
			] as const)(
				`should translate ${resource} NOT_FOUND error for %s`,
				(lang, expectedText) => {
					const t = getTranslator(lang as SupportedLanguage);
					const error = notFoundError(t, resource);

					expectTranslatedError(error, {
						code: "NOT_FOUND",
						messageContains: expectedText,
					});
				},
			);
		});

		it.each(SUPPORTED_LANGUAGES)(
			"should translate memberNotFound error for %s",
			(lang) => {
				const t = getTranslator(lang);
				const error = new TRPCError({
					code: "NOT_FOUND",
					message: t("errors:sharedVault.memberNotFound"),
				});

				expect(error.code).toBe("NOT_FOUND");
				expectNotTranslationKey(error);
				expect(error.message.length).toBeGreaterThan(3);
			},
		);
	});

	describe("FORBIDDEN Errors", () => {
		it.each(SUPPORTED_LANGUAGES)(
			"should translate insufficientRole error for %s",
			(lang) => {
				const t = getTranslator(lang);
				const error = new TRPCError({
					code: "FORBIDDEN",
					message: t("errors:sharedVault.insufficientRole"),
				});

				expect(error.code).toBe("FORBIDDEN");
				expectNotTranslationKey(error);
				expect(error.message.length).toBeGreaterThan(3);
			},
		);

		it.each(SUPPORTED_LANGUAGES)(
			"should translate requiresPermission with interpolation for %s",
			(lang) => {
				const t = getTranslator(lang);
				const error = new TRPCError({
					code: "FORBIDDEN",
					message: t("errors:sharedVault.requiresPermission", {
						permission: "write",
					}),
				});

				expect(error.code).toBe("FORBIDDEN");
				expectNotTranslationKey(error);
				expect(error.message).toContain("write");
				expect(error.message).not.toContain("{{permission}}");
			},
		);
	});

	describe("CONFLICT Errors", () => {
		it.each(SUPPORTED_LANGUAGES)(
			"should translate alreadyMember error for %s",
			(lang) => {
				const t = getTranslator(lang);
				const error = new TRPCError({
					code: "CONFLICT",
					message: t("errors:sharedVault.alreadyMember"),
				});

				expect(error.code).toBe("CONFLICT");
				expectNotTranslationKey(error);
				expect(error.message.length).toBeGreaterThan(3);
			},
		);
	});

	describe("BAD_REQUEST Errors", () => {
		it.each(SUPPORTED_LANGUAGES)(
			"should translate notFamilyMember error for %s",
			(lang) => {
				const t = getTranslator(lang);
				const error = badRequestError(t, "errors:sharedVault.notFamilyMember");

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

				expect(notFoundError(t, "vault").code).toBe("NOT_FOUND");
				expect(notFoundError(t, "family").code).toBe("NOT_FOUND");
				expect(
					badRequestError(t, "errors:sharedVault.notFamilyMember").code,
				).toBe("BAD_REQUEST");
			},
		);
	});
});
