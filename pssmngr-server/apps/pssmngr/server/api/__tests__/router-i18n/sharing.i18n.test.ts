// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Sharing Router i18n Integration Tests.
 *
 * Tests that verify translated error messages for credential sharing
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

describe("Sharing Router i18n", () => {
	beforeAll(async () => {
		await initI18n();
	});

	describe("NOT_FOUND Errors", () => {
		const resources = ["item", "share", "link"];

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
	});

	describe("FORBIDDEN Errors", () => {
		const forbiddenKeys = [
			"errors:sharing.revoked",
			"errors:sharing.expired",
			"errors:sharing.notRecipient",
			"errors:sharing.onlySenderCanRevoke",
			"errors:sharing.onlyCreatorCanRevoke",
			"errors:sharing.linkUnavailable",
		];

		forbiddenKeys.forEach((key) => {
			const shortKey = key.split(".").pop();

			it.each(SUPPORTED_LANGUAGES)(
				`should translate ${shortKey} FORBIDDEN error for %s`,
				(lang) => {
					const t = getTranslator(lang);
					const error = new TRPCError({
						code: "FORBIDDEN",
						message: t(key),
					});

					expect(error.code).toBe("FORBIDDEN");
					expectNotTranslationKey(error);
					expect(error.message.length).toBeGreaterThan(3);
				},
			);
		});
	});

	describe("BAD_REQUEST Errors", () => {
		const badRequestKeys = [
			"errors:sharing.cannotShareWithSelf",
			"errors:sharing.alreadyRevoked",
			"errors:sharing.linkAlreadyRevoked",
		];

		badRequestKeys.forEach((key) => {
			const shortKey = key.split(".").pop();

			it.each(SUPPORTED_LANGUAGES)(
				`should translate ${shortKey} BAD_REQUEST error for %s`,
				(lang) => {
					const t = getTranslator(lang);
					const error = badRequestError(t, key);

					expect(error.code).toBe("BAD_REQUEST");
					expectNotTranslationKey(error);
					expect(error.message.length).toBeGreaterThan(3);
				},
			);
		});
	});

	describe("Error Code Consistency", () => {
		it.each(SUPPORTED_LANGUAGES)(
			"should maintain correct error codes across %s",
			(lang) => {
				const t = getTranslator(lang);

				expect(notFoundError(t, "item").code).toBe("NOT_FOUND");
				expect(notFoundError(t, "share").code).toBe("NOT_FOUND");
				expect(
					badRequestError(t, "errors:sharing.cannotShareWithSelf").code,
				).toBe("BAD_REQUEST");
			},
		);
	});
});
