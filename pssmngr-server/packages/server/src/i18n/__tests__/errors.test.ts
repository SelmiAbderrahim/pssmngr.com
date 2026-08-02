// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { TRPCError } from "@trpc/server";
import { beforeAll, describe, expect, it } from "vitest";
import {
	badRequestError,
	createFailedError,
	deleteFailedError,
	forbiddenError,
	internalError,
	notFoundError,
	permissionError,
	unauthorizedError,
	updateFailedError,
	wrapError,
} from "../errors";
import { getTranslator, initI18n, SUPPORTED_LANGUAGES } from "../index";

describe("translated error helpers", () => {
	beforeAll(async () => {
		await initI18n();
	});

	it("creates the expected tRPC error codes", () => {
		const t = getTranslator("en");

		expect(unauthorizedError(t).code).toBe("UNAUTHORIZED");
		expect(forbiddenError(t).code).toBe("FORBIDDEN");
		expect(notFoundError(t, "Vault").code).toBe("NOT_FOUND");
		expect(badRequestError(t, "validation:string.required").code).toBe(
			"BAD_REQUEST",
		);
		expect(internalError(t).code).toBe("INTERNAL_SERVER_ERROR");
	});

	it("interpolates resources and identifiers", () => {
		const t = getTranslator("en");

		expect(notFoundError(t, "Vault", "vault-123").message).toContain(
			"vault-123",
		);
		expect(createFailedError(t, "vault").message).toContain("vault");
		expect(updateFailedError(t, "profile").message).toContain("profile");
		expect(deleteFailedError(t, "account").message).toContain("account");
	});

	it("preserves causes and existing tRPC codes", () => {
		const t = getTranslator("en");
		const cause = new Error("database unavailable");
		expect(internalError(t, cause).cause).toBe(cause);

		const original = new TRPCError({ code: "NOT_FOUND", message: "missing" });
		const wrapped = wrapError(t, original, "errors:resource.notFound", {
			resource: "Vault",
		});
		expect(wrapped.code).toBe("NOT_FOUND");
		expect(wrapped.message).toBe("Vault not found");
	});

	it("returns translated messages in every supported language", () => {
		for (const language of SUPPORTED_LANGUAGES) {
			const t = getTranslator(language);
			const errors = [
				unauthorizedError(t),
				forbiddenError(t),
				notFoundError(t, "vault"),
				permissionError(t, "user.cannotDeleteOwner"),
			];

			for (const error of errors) {
				expect(error).toBeInstanceOf(TRPCError);
				expect(error.message.length).toBeGreaterThan(3);
				expect(error.message).not.toMatch(
					/^(errors|validation|permissions|emails):/,
				);
			}
		}
	});
});
