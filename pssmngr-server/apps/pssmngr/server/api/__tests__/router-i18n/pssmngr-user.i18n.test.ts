// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * User Router i18n Integration Tests (Password Manager).
 *
 * Tests that verify translated error messages for password-manager specific
 * user operations across all supported languages.
 *
 * Note: Named pssmngr-user to distinguish from the platform user.i18n.test.ts.
 */

import {
	badRequestError,
	getTranslator,
	initI18n,
	notFoundError,
	permissionError,
	SUPPORTED_LANGUAGES,
	type SupportedLanguage,
	unauthorizedError,
	updateFailedError,
} from "@pssmngr/server";
import { beforeAll, describe, expect, it } from "vitest";
import {
	expectNotTranslationKey,
	expectTranslatedError,
} from "../fixtures/i18n-test-utils";

describe("User Router i18n (Password Manager)", () => {
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
			"should return translated user NOT_FOUND error for %s",
			(lang, expectedText) => {
				const t = getTranslator(lang as SupportedLanguage);
				const error = notFoundError(t, "user");

				expectTranslatedError(error, {
					code: "NOT_FOUND",
					messageContains: expectedText,
				});
			},
		);
	});

	describe("UNAUTHORIZED Errors", () => {
		it.each(SUPPORTED_LANGUAGES)(
			"should translate user access denied for %s",
			(lang) => {
				const t = getTranslator(lang);
				const error = unauthorizedError(t, "user");

				expect(error.code).toBe("UNAUTHORIZED");
				expectNotTranslationKey(error);
				expect(error.message.toLowerCase()).toContain("user");
			},
		);
	});

	describe("Password Errors (BAD_REQUEST)", () => {
		it.each(SUPPORTED_LANGUAGES)(
			"should translate currentPasswordIncorrect error for %s",
			(lang) => {
				const t = getTranslator(lang);
				const error = badRequestError(
					t,
					"errors:user.currentPasswordIncorrect",
				);

				expect(error.code).toBe("BAD_REQUEST");
				expectNotTranslationKey(error);
				expect(error.message.length).toBeGreaterThan(3);
			},
		);

		it.each(SUPPORTED_LANGUAGES)(
			"should translate newPasswordRequired error for %s",
			(lang) => {
				const t = getTranslator(lang);
				const error = badRequestError(t, "errors:user.newPasswordRequired");

				expect(error.code).toBe("BAD_REQUEST");
				expectNotTranslationKey(error);
				expect(error.message.length).toBeGreaterThan(3);
			},
		);
	});

	describe("Update Failed Errors", () => {
		it.each([
			["en", "failed to update"],
			["ar", "فشل في تحديث"],
			["fr", "échec de la mise à jour"],
			["de", "fehler beim aktualisieren"],
			["es", "error al actualizar"],
		] as const)(
			"should translate user update failed error for %s",
			(lang, expectedText) => {
				const t = getTranslator(lang as SupportedLanguage);
				const error = updateFailedError(t, "user");

				expectTranslatedError(error, {
					code: "BAD_REQUEST",
					messageContains: expectedText,
				});
			},
		);

		it.each(SUPPORTED_LANGUAGES)(
			"should translate language preference update failed for %s",
			(lang) => {
				const t = getTranslator(lang);
				const error = updateFailedError(t, "language preference");

				expect(error.code).toBe("BAD_REQUEST");
				expectNotTranslationKey(error);
				expect(error.message).toContain("language preference");
			},
		);
	});

	describe("Permission Errors (FORBIDDEN)", () => {
		const permissionKeys = [
			"user.cannotDeleteOwner",
			"user.adminsCannotDeleteSelf",
			"user.onlyOwnerCanDeleteAdmins",
			"generic.actionNotAllowed",
		];

		permissionKeys.forEach((key) => {
			const shortKey = key.split(".").pop();

			it.each(SUPPORTED_LANGUAGES)(
				`should translate ${shortKey} permission error for %s`,
				(lang) => {
					const t = getTranslator(lang);
					const error = permissionError(t, key);

					expect(error.code).toBe("FORBIDDEN");
					expectNotTranslationKey(error);
					expect(error.message.length).toBeGreaterThan(3);
				},
			);
		});
	});

	describe("Organization Errors", () => {
		const orgKeys = [
			"errors:organization.notMember",
			"errors:organization.userNotMember",
			"errors:organization.onlyOwnersAdmins",
		];

		orgKeys.forEach((key) => {
			const shortKey = key.split(".").pop();

			it.each(SUPPORTED_LANGUAGES)(
				`should translate ${shortKey} organization error for %s`,
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

	describe("Email Errors", () => {
		const emailKeys = [
			"errors:email.invitationNotFound",
			"errors:email.providerNotEmail",
			"errors:email.notConfigured",
		];

		emailKeys.forEach((key) => {
			const shortKey = key.split(".").pop();

			it.each(SUPPORTED_LANGUAGES)(
				`should translate ${shortKey} email error for %s`,
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

				expect(notFoundError(t, "user").code).toBe("NOT_FOUND");
				expect(unauthorizedError(t).code).toBe("UNAUTHORIZED");
				expect(updateFailedError(t, "user").code).toBe("BAD_REQUEST");
				expect(permissionError(t, "user.cannotDeleteOwner").code).toBe(
					"FORBIDDEN",
				);
			},
		);
	});
});
