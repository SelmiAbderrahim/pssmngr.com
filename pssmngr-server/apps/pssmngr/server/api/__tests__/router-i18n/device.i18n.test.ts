// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Device Router i18n Integration Tests.
 *
 * Tests that verify translated error messages for device management
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

describe("Device Router i18n", () => {
	beforeAll(async () => {
		await initI18n();
	});

	describe("NOT_FOUND Errors (helper)", () => {
		it.each([
			["en", "not found"],
			["ar", "لم يتم العثور"],
			["fr", "introuvable"],
			["de", "nicht gefunden"],
			["es", "no encontrado"],
		] as const)(
			"should return translated device NOT_FOUND error for %s",
			(lang, expectedText) => {
				const t = getTranslator(lang as SupportedLanguage);
				const error = notFoundError(t, "device");

				expectTranslatedError(error, {
					code: "NOT_FOUND",
					messageContains: expectedText,
				});
			},
		);

		it.each(SUPPORTED_LANGUAGES)(
			"should include device resource name for %s",
			(lang) => {
				const t = getTranslator(lang);
				const error = notFoundError(t, "device");

				expectNotTranslationKey(error);
				expect(error.message.toLowerCase()).toContain("device");
			},
		);
	});

	describe("NOT_FOUND Errors (direct key)", () => {
		it.each(SUPPORTED_LANGUAGES)(
			"should translate noDeviceForUser error for %s",
			(lang) => {
				const t = getTranslator(lang);
				const error = new TRPCError({
					code: "NOT_FOUND",
					message: t("errors:device.noDeviceForUser"),
				});

				expect(error.code).toBe("NOT_FOUND");
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
				expect(notFoundError(t, "device").code).toBe("NOT_FOUND");
			},
		);
	});
});
