// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * User Router i18n Integration Tests.
 *
 * Tests that verify translated error messages for user management
 * operations across all supported languages.
 *
 * Covers:
 * - Permission errors (cannotDeleteOwner, cannotDeleteSelf, etc.)
 * - Auth errors (invalidCredentials, sessionExpired, etc.)
 * - Organization membership errors
 */

import {
	badRequestError,
	forbiddenError,
	getTranslator,
	initI18n,
	// Error helpers
	permissionError,
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

describe("User Router i18n", () => {
	beforeAll(async () => {
		await initI18n();
	});

	describe("Permission Errors", () => {
		describe("cannotDeleteOwner", () => {
			it.each([
				["en", "owner"],
				["ar", "مالك"],
				["fr", "propriétaire"],
				["de", "eigentümer"],
				["es", "propietario"],
			] as const)(
				"should translate cannotDeleteOwner in %s",
				async (lang, expectedText) => {
					const t = getTranslator(lang as SupportedLanguage);
					const error = permissionError(t, "user.cannotDeleteOwner");

					expectTranslatedError(error, {
						code: "FORBIDDEN",
						messageContains: expectedText,
					});
				},
			);
		});

		describe("cannotDeleteSelf", () => {
			it.each([
				["en", "own account"],
				["ar", "حسابك"],
				["fr", "votre propre compte"],
				["de", "eigenes konto"],
				["es", "tu propia cuenta"],
			] as const)(
				"should translate cannotDeleteSelf in %s",
				async (lang, expectedText) => {
					const t = getTranslator(lang as SupportedLanguage);
					const error = permissionError(t, "user.cannotDeleteSelf");

					expectTranslatedError(error, {
						code: "FORBIDDEN",
						messageContains: expectedText,
					});
				},
			);
		});

		describe("onlyOwnerCanDeleteAdmins", () => {
			it.each([
				["en", "owner"],
				["ar", "المالك"],
				["fr", "propriétaire"],
				["de", "eigentümer"],
				["es", "propietario"],
			] as const)(
				"should translate onlyOwnerCanDeleteAdmins in %s",
				async (lang, expectedText) => {
					const t = getTranslator(lang as SupportedLanguage);
					const error = permissionError(t, "user.onlyOwnerCanDeleteAdmins");

					expectTranslatedError(error, {
						code: "FORBIDDEN",
						messageContains: expectedText,
					});
				},
			);
		});

		describe("adminsCannotDeleteSelf", () => {
			it.each(SUPPORTED_LANGUAGES)(
				"should translate adminsCannotDeleteSelf in %s",
				(lang) => {
					const t = getTranslator(lang);
					const error = permissionError(t, "user.adminsCannotDeleteSelf");

					expectNotTranslationKey(error);
					expect(error.code).toBe("FORBIDDEN");
				},
			);
		});

		describe("cannotModifySelf", () => {
			it.each(SUPPORTED_LANGUAGES)(
				"should translate cannotModifySelf in %s",
				(lang) => {
					const t = getTranslator(lang);
					const error = permissionError(t, "user.cannotModifySelf");

					expectNotTranslationKey(error);
					expect(error.code).toBe("FORBIDDEN");
				},
			);
		});

		describe("cannotModifyOwner", () => {
			it.each(SUPPORTED_LANGUAGES)(
				"should translate cannotModifyOwner in %s",
				(lang) => {
					const t = getTranslator(lang);
					const error = permissionError(t, "user.cannotModifyOwner");

					expectNotTranslationKey(error);
					expect(error.code).toBe("FORBIDDEN");
				},
			);
		});

		describe("cannotInvite", () => {
			it.each(SUPPORTED_LANGUAGES)(
				"should translate cannotInvite in %s",
				(lang) => {
					const t = getTranslator(lang);
					const error = permissionError(t, "user.cannotInvite");

					expectNotTranslationKey(error);
					expect(error.code).toBe("FORBIDDEN");
				},
			);
		});

		describe("cannotRemove", () => {
			it.each(SUPPORTED_LANGUAGES)(
				"should translate cannotRemove in %s",
				(lang) => {
					const t = getTranslator(lang);
					const error = permissionError(t, "user.cannotRemove");

					expectNotTranslationKey(error);
					expect(error.code).toBe("FORBIDDEN");
				},
			);
		});
	});

	describe("Auth Errors", () => {
		describe("invalidCredentials", () => {
			it.each([
				["en", "invalid email or password"],
				["ar", "البريد الإلكتروني أو كلمة المرور غير صحيحة"],
				["fr", "email ou mot de passe invalide"],
				["de", "ungültige e-mail oder passwort"],
				["es", "correo electrónico o contraseña inválidos"],
			] as const)(
				"should translate invalidCredentials in %s",
				async (lang, expectedText) => {
					const t = getTranslator(lang as SupportedLanguage);
					const error = badRequestError(t, "errors:auth.invalidCredentials");

					expectTranslatedError(error, {
						code: "BAD_REQUEST",
						messageContains: expectedText,
					});
				},
			);
		});

		describe("sessionExpired", () => {
			it.each([
				["en", "expired"],
				["ar", "انتهت"],
				["fr", "expiré"],
				["de", "abgelaufen"],
				["es", "expirado"],
			] as const)(
				"should translate sessionExpired in %s",
				async (lang, expectedText) => {
					const t = getTranslator(lang as SupportedLanguage);
					const error = unauthorizedError(t);
					// For session expired, use specific key
					const sessionError = new TRPCError({
						code: "UNAUTHORIZED",
						message: t("errors:auth.sessionExpired"),
					});

					expectTranslatedError(sessionError, {
						code: "UNAUTHORIZED",
						messageContains: expectedText,
					});
				},
			);
		});

		describe("accountDisabled", () => {
			it.each(SUPPORTED_LANGUAGES)(
				"should translate accountDisabled in %s",
				(lang) => {
					const t = getTranslator(lang);
					const message = t("errors:auth.accountDisabled");

					expect(message).not.toBe("errors:auth.accountDisabled");
					expect(message).not.toBe("auth.accountDisabled");
				},
			);
		});

		describe("emailNotVerified", () => {
			it.each(SUPPORTED_LANGUAGES)(
				"should translate emailNotVerified in %s",
				(lang) => {
					const t = getTranslator(lang);
					const message = t("errors:auth.emailNotVerified");

					expect(message).not.toBe("errors:auth.emailNotVerified");
					expect(message).not.toBe("auth.emailNotVerified");
				},
			);
		});

		describe("twoFactorRequired", () => {
			it.each(SUPPORTED_LANGUAGES)(
				"should translate twoFactorRequired in %s",
				(lang) => {
					const t = getTranslator(lang);
					const message = t("errors:auth.twoFactorRequired");

					expect(message).not.toBe("errors:auth.twoFactorRequired");
					expect(message).not.toBe("auth.twoFactorRequired");
				},
			);
		});

		describe("twoFactorInvalid", () => {
			it.each(SUPPORTED_LANGUAGES)(
				"should translate twoFactorInvalid in %s",
				(lang) => {
					const t = getTranslator(lang);
					const message = t("errors:auth.twoFactorInvalid");

					expect(message).not.toBe("errors:auth.twoFactorInvalid");
					expect(message).not.toBe("auth.twoFactorInvalid");
				},
			);
		});
	});

	describe("User Update Errors", () => {
		describe("updateFailed", () => {
			it.each(SUPPORTED_LANGUAGES)(
				"should translate user updateFailed in %s",
				(lang) => {
					const t = getTranslator(lang);
					const message = t("errors:user.updateFailed");

					expect(message).not.toBe("errors:user.updateFailed");
					expect(message).not.toBe("user.updateFailed");
				},
			);
		});
	});

	describe("Organization Membership Errors", () => {
		describe("notMember", () => {
			it.each([
				["en", "member"],
				["ar", "عضو"],
				["fr", "membre"],
				["de", "mitglied"],
				["es", "miembro"],
			] as const)(
				"should translate notMember in %s",
				async (lang, expectedText) => {
					const t = getTranslator(lang as SupportedLanguage);
					const message = t("errors:organization.notMember");

					expect(message.toLowerCase()).toContain(expectedText.toLowerCase());
				},
			);
		});

		describe("userNotMember", () => {
			it.each(SUPPORTED_LANGUAGES)(
				"should translate userNotMember in %s",
				(lang) => {
					const t = getTranslator(lang);
					const message = t("errors:organization.userNotMember");

					expect(message).not.toBe("errors:organization.userNotMember");
					expect(message).not.toBe("organization.userNotMember");
				},
			);
		});

		describe("onlyOwnersAdmins", () => {
			it.each(SUPPORTED_LANGUAGES)(
				"should translate onlyOwnersAdmins in %s",
				(lang) => {
					const t = getTranslator(lang);
					const message = t("errors:organization.onlyOwnersAdmins");

					expect(message).not.toBe("errors:organization.onlyOwnersAdmins");
					expect(message).not.toBe("organization.onlyOwnersAdmins");
				},
			);
		});
	});

	describe("Error Code Consistency", () => {
		it.each(SUPPORTED_LANGUAGES)(
			"permission errors should always use FORBIDDEN in %s",
			(lang) => {
				const t = getTranslator(lang);

				const errors = [
					permissionError(t, "user.cannotDeleteOwner"),
					permissionError(t, "user.cannotDeleteSelf"),
					permissionError(t, "user.cannotModifySelf"),
				];

				for (const error of errors) {
					expect(error.code).toBe("FORBIDDEN");
				}
			},
		);

		it.each(SUPPORTED_LANGUAGES)(
			"auth errors should use appropriate codes in %s",
			(lang) => {
				const t = getTranslator(lang);

				const unauthorizedErr = unauthorizedError(t);
				expect(unauthorizedErr.code).toBe("UNAUTHORIZED");

				const forbiddenErr = forbiddenError(t);
				expect(forbiddenErr.code).toBe("FORBIDDEN");
			},
		);
	});
});
