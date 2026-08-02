// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Emergency Router i18n Integration Tests.
 *
 * Tests that verify translated error messages for emergency access
 * operations across all supported languages.
 */

import {
	badRequestError,
	getTranslator,
	initI18n,
	SUPPORTED_LANGUAGES,
} from "@pssmngr/server";
import { TRPCError } from "@trpc/server";
import { beforeAll, describe, expect, it } from "vitest";
import { expectNotTranslationKey } from "../fixtures/i18n-test-utils";

describe("Emergency Router i18n", () => {
	beforeAll(async () => {
		await initI18n();
	});

	describe("NOT_FOUND Errors", () => {
		const notFoundKeys = [
			"errors:emergency.userNotFound",
			"errors:emergency.contactNotFound",
			"errors:emergency.relationshipNotFound",
			"errors:emergency.requestNotFound",
		];

		notFoundKeys.forEach((key) => {
			const shortKey = key.split(".").pop();

			it.each(SUPPORTED_LANGUAGES)(
				`should translate ${shortKey} NOT_FOUND error for %s`,
				(lang) => {
					const t = getTranslator(lang);
					const error = new TRPCError({
						code: "NOT_FOUND",
						message: t(key),
					});

					expect(error.code).toBe("NOT_FOUND");
					expectNotTranslationKey(error);
					expect(error.message.length).toBeGreaterThan(3);
				},
			);
		});
	});

	describe("CONFLICT Errors", () => {
		const conflictKeys = [
			"errors:emergency.alreadyTrusted",
			"errors:emergency.requestPending",
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

	describe("TOO_MANY_REQUESTS Errors", () => {
		it.each(SUPPORTED_LANGUAGES)(
			"should translate cooldownBlocked with interpolation for %s",
			(lang) => {
				const t = getTranslator(lang);
				const until = "2026-04-03T12:00:00Z";
				const error = new TRPCError({
					code: "TOO_MANY_REQUESTS",
					message: t("errors:emergency.cooldownBlocked", { until }),
				});

				expect(error.code).toBe("TOO_MANY_REQUESTS");
				expectNotTranslationKey(error);
				expect(error.message).toContain(until);
				expect(error.message).not.toContain("{{until}}");
			},
		);
	});

	describe("BAD_REQUEST Errors", () => {
		const simpleKeys = [
			"errors:emergency.cannotAddSelf",
			"errors:emergency.signatureVerificationFailed",
			"errors:emergency.waitingPeriodNotExpired",
			"errors:emergency.accessNotGranted",
		];

		simpleKeys.forEach((key) => {
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
			"should translate cannotDenyStatus with interpolation for %s",
			(lang) => {
				const t = getTranslator(lang);
				const error = badRequestError(t, "errors:emergency.cannotDenyStatus", {
					status: "granted",
				});

				expect(error.code).toBe("BAD_REQUEST");
				expectNotTranslationKey(error);
				expect(error.message).toContain("granted");
				expect(error.message).not.toContain("{{status}}");
			},
		);

		it.each(SUPPORTED_LANGUAGES)(
			"should translate cannotGrantStatus with interpolation for %s",
			(lang) => {
				const t = getTranslator(lang);
				const error = badRequestError(t, "errors:emergency.cannotGrantStatus", {
					status: "denied",
				});

				expect(error.code).toBe("BAD_REQUEST");
				expectNotTranslationKey(error);
				expect(error.message).toContain("denied");
				expect(error.message).not.toContain("{{status}}");
			},
		);
	});

	describe("INTERNAL_SERVER_ERROR Errors", () => {
		it.each(SUPPORTED_LANGUAGES)(
			"should translate escrowDataMissing error for %s",
			(lang) => {
				const t = getTranslator(lang);
				const error = new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: t("errors:emergency.escrowDataMissing"),
				});

				expect(error.code).toBe("INTERNAL_SERVER_ERROR");
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

				expect(badRequestError(t, "errors:emergency.cannotAddSelf").code).toBe(
					"BAD_REQUEST",
				);
				expect(
					new TRPCError({
						code: "NOT_FOUND",
						message: t("errors:emergency.requestNotFound"),
					}).code,
				).toBe("NOT_FOUND");
			},
		);
	});
});
