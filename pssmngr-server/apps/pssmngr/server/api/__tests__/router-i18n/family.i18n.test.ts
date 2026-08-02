// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Family Router i18n Integration Tests.
 *
 * Tests that verify translated error messages for family
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

describe("Family Router i18n", () => {
	beforeAll(async () => {
		await initI18n();
	});

	describe("NOT_FOUND Errors", () => {
		const resources = ["family", "member"];

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
			"should translate recoveryNotFound error for %s",
			(lang) => {
				const t = getTranslator(lang);
				const error = new TRPCError({
					code: "NOT_FOUND",
					message: t("errors:family.recoveryNotFound"),
				});

				expect(error.code).toBe("NOT_FOUND");
				expectNotTranslationKey(error);
				expect(error.message.length).toBeGreaterThan(3);
			},
		);
	});

	describe("CONFLICT Errors", () => {
		const conflictKeys = [
			"errors:family.alreadyInFamily",
			"errors:family.alreadyMember",
			"errors:family.invitationPending",
			"errors:family.recoveryAlreadyActive",
		];

		conflictKeys.forEach((key) => {
			const shortKey = key.split(".").pop();

			it.each(SUPPORTED_LANGUAGES)(
				`should translate ${shortKey} CONFLICT error for %s`,
				(lang) => {
					const t = getTranslator(lang);
					const error = new TRPCError({
						code: "CONFLICT",
						message: t(key),
					});

					expect(error.code).toBe("CONFLICT");
					expectNotTranslationKey(error);
					expect(error.message.length).toBeGreaterThan(3);
				},
			);
		});
	});

	describe("FORBIDDEN Errors", () => {
		it.each(SUPPORTED_LANGUAGES)(
			"should translate organizerOnly error for %s",
			(lang) => {
				const t = getTranslator(lang);
				const error = new TRPCError({
					code: "FORBIDDEN",
					message: t("errors:family.organizerOnly"),
				});

				expect(error.code).toBe("FORBIDDEN");
				expectNotTranslationKey(error);
				expect(error.message.length).toBeGreaterThan(3);
			},
		);

		it.each(SUPPORTED_LANGUAGES)(
			"should translate cannotChangeOrganizerRole error for %s",
			(lang) => {
				const t = getTranslator(lang);
				const error = new TRPCError({
					code: "FORBIDDEN",
					message: t("errors:family.cannotChangeOrganizerRole"),
				});

				expect(error.code).toBe("FORBIDDEN");
				expectNotTranslationKey(error);
				expect(error.message.length).toBeGreaterThan(3);
			},
		);

		it.each(SUPPORTED_LANGUAGES)(
			"should translate organizerCannotLeave error for %s",
			(lang) => {
				const t = getTranslator(lang);
				const error = new TRPCError({
					code: "FORBIDDEN",
					message: t("errors:family.organizerCannotLeave"),
				});

				expect(error.code).toBe("FORBIDDEN");
				expectNotTranslationKey(error);
				expect(error.message.length).toBeGreaterThan(3);
			},
		);
	});

	describe("BAD_REQUEST Errors", () => {
		const badRequestKeys = [
			"errors:family.cannotRemoveSelf",
			"errors:family.cannotChangeSelfRole",
			"errors:family.noSettingsToUpdate",
			"errors:family.organizerCannotRequestRecovery",
			"errors:family.recoveryMustBeApproved",
			"errors:family.recoveryMustBeCompleting",
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

		it.each(SUPPORTED_LANGUAGES)(
			"should translate cannotApproveStatus with interpolation for %s",
			(lang) => {
				const t = getTranslator(lang);
				const error = badRequestError(t, "errors:family.cannotApproveStatus", {
					status: "denied",
				});

				expect(error.code).toBe("BAD_REQUEST");
				expectNotTranslationKey(error);
				expect(error.message).toContain("denied");
				expect(error.message).not.toContain("{{status}}");
			},
		);

		it.each(SUPPORTED_LANGUAGES)(
			"should translate cannotRejectStatus with interpolation for %s",
			(lang) => {
				const t = getTranslator(lang);
				const error = badRequestError(t, "errors:family.cannotRejectStatus", {
					status: "approved",
				});

				expect(error.code).toBe("BAD_REQUEST");
				expectNotTranslationKey(error);
				expect(error.message).toContain("approved");
				expect(error.message).not.toContain("{{status}}");
			},
		);

		it.each(SUPPORTED_LANGUAGES)(
			"should translate recoveryExpired error for %s",
			(lang) => {
				const t = getTranslator(lang);
				const error = badRequestError(t, "errors:family.recoveryExpired");

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

				expect(notFoundError(t, "family").code).toBe("NOT_FOUND");
				expect(notFoundError(t, "member").code).toBe("NOT_FOUND");
				expect(badRequestError(t, "errors:family.cannotRemoveSelf").code).toBe(
					"BAD_REQUEST",
				);
			},
		);
	});
});
