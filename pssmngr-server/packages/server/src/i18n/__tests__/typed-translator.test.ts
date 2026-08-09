// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { beforeAll, describe, expect, it } from "vitest";
import { getTranslator, initI18n } from "../index";
import {
	buildKey,
	createNamespacedTranslator,
	createTypedTranslator,
	extractKeyPath,
	extractNamespace,
	isValidTranslationKey,
} from "../typed-translator";

describe("Typed Translator", () => {
	beforeAll(async () => {
		await initI18n();
	});

	describe("createTypedTranslator", () => {
		it("should create a typed translator function", () => {
			const baseT = getTranslator("en");
			const t = createTypedTranslator(baseT);
			expect(typeof t).toBe("function");
		});

		it("should translate valid keys", () => {
			const baseT = getTranslator("en");
			const t = createTypedTranslator(baseT);
			const result = t("errors:auth.unauthorized");
			expect(result).toBe("You must be logged in to perform this action");
		});

		it("should translate keys with parameters", () => {
			const baseT = getTranslator("en");
			const t = createTypedTranslator(baseT);
			const result = t("errors:resource.notFound", { resource: "Database" });
			expect(result).toBe("Database not found");
		});

		it("should work with all namespaces", () => {
			const baseT = getTranslator("en");
			const t = createTypedTranslator(baseT);

			expect(t("errors:auth.forbidden")).toBe(
				"You don't have permission to access this resource",
			);
			expect(t("validation:string.required")).toBe("This field is required");
			expect(t("permissions:generic.accessDenied")).toBe("Access denied");
			expect(t("emails:common.greeting")).toBe("Hello");
		});
	});

	describe("createNamespacedTranslator", () => {
		it("should create a namespaced translator", () => {
			const baseT = getTranslator("en");
			const tErrors = createNamespacedTranslator(baseT, "errors");
			expect(typeof tErrors).toBe("function");
		});

		it("should translate keys within the namespace", () => {
			const baseT = getTranslator("en");
			const tErrors = createNamespacedTranslator(baseT, "errors");
			// Note: The namespaced translator adds the namespace prefix
			const result = tErrors("auth.unauthorized");
			expect(result).toBe("You must be logged in to perform this action");
		});

		it("should work with parameters", () => {
			const baseT = getTranslator("en");
			const tErrors = createNamespacedTranslator(baseT, "errors");
			const result = tErrors("resource.notFound", { resource: "Project" });
			expect(result).toBe("Project not found");
		});

		it("should work for all namespaces", () => {
			const baseT = getTranslator("en");

			const tValidation = createNamespacedTranslator(baseT, "validation");
			expect(tValidation("string.email")).toBe(
				"Please enter a valid email address",
			);

			const tEmails = createNamespacedTranslator(baseT, "emails");
			expect(tEmails("invitation.title")).toBe("Team Invitation");
		});
	});

	describe("isValidTranslationKey", () => {
		it("should return true for valid keys", () => {
			expect(isValidTranslationKey("errors:auth.unauthorized")).toBe(true);
			expect(isValidTranslationKey("validation:string.required")).toBe(true);
			expect(isValidTranslationKey("emails:invitation.subject")).toBe(true);
		});

		it("should return false for invalid keys", () => {
			expect(isValidTranslationKey("invalid")).toBe(false);
			expect(isValidTranslationKey("no:spaces allowed")).toBe(false);
			expect(isValidTranslationKey("unknown:namespace.key")).toBe(false);
			expect(isValidTranslationKey("")).toBe(false);
		});

		it("should return false for keys without namespace separator", () => {
			expect(isValidTranslationKey("auth.unauthorized")).toBe(false);
			expect(isValidTranslationKey("string.required")).toBe(false);
		});

		it("should validate namespace", () => {
			// Valid namespaces: errors, validation, permissions, emails
			expect(isValidTranslationKey("errors:test")).toBe(true);
			expect(isValidTranslationKey("validation:test")).toBe(true);
			expect(isValidTranslationKey("permissions:test")).toBe(true);
			expect(isValidTranslationKey("emails:test")).toBe(true);

			// Invalid namespaces
			expect(isValidTranslationKey("unknown:test")).toBe(false);
			expect(isValidTranslationKey("common:test")).toBe(false);
		});
	});

	describe("buildKey", () => {
		it("should build namespaced keys", () => {
			expect(buildKey("errors", "auth.unauthorized")).toBe(
				"errors:auth.unauthorized",
			);
			expect(buildKey("validation", "string.required")).toBe(
				"validation:string.required",
			);
			expect(buildKey("emails", "invitation.title")).toBe(
				"emails:invitation.title",
			);
		});

		it("should work with deeply nested keys", () => {
			expect(buildKey("errors", "resource.notFound")).toBe(
				"errors:resource.notFound",
			);
			expect(buildKey("emails", "emailVerification.subject")).toBe(
				"emails:emailVerification.subject",
			);
		});
	});

	describe("extractNamespace", () => {
		it("should extract namespace from key", () => {
			expect(extractNamespace("errors:auth.unauthorized")).toBe("errors");
			expect(extractNamespace("validation:string.required")).toBe("validation");
			expect(extractNamespace("emails:invitation.subject")).toBe("emails");
		});
	});

	describe("extractKeyPath", () => {
		it("should extract key path from key", () => {
			expect(extractKeyPath("errors:auth.unauthorized")).toBe(
				"auth.unauthorized",
			);
			expect(extractKeyPath("validation:string.required")).toBe(
				"string.required",
			);
			expect(extractKeyPath("emails:invitation.subject")).toBe(
				"invitation.subject",
			);
		});

		it("should handle deeply nested paths", () => {
			expect(extractKeyPath("emails:emailVerification.subject")).toBe(
				"emailVerification.subject",
			);
		});
	});
});
