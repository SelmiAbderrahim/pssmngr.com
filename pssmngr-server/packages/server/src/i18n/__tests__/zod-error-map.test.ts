// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors

import type { TFunction } from "i18next";
import { beforeAll, describe, expect, it } from "vitest";
import { z } from "zod/v3";
import { getTranslator, initI18n } from "../index";
import {
	applyLocalizedZodErrorMap,
	createZodErrorMap,
	formatZodErrorsWithTranslations,
	getLocalizedIssues,
	parseWithLocalizedErrors,
	validateWithLocalizedErrors,
} from "../zod-error-map";

describe("Zod Error Map", () => {
	let tEn: TFunction;
	let tAr: TFunction;

	beforeAll(async () => {
		await initI18n();
		tEn = getTranslator("en");
		tAr = getTranslator("ar");
	});

	describe("createZodErrorMap", () => {
		it("should create an error map function", () => {
			const errorMap = createZodErrorMap(tEn);
			expect(errorMap).toBeDefined();
			expect(typeof errorMap).toBe("function");
		});
	});

	describe("String Validations", () => {
		it("should translate required string error", () => {
			const schema = z.object({ name: z.string().min(1) });
			const result = validateWithLocalizedErrors(schema, { name: "" }, tEn);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.issues[0].message).toBe("This field is required");
			}
		});

		it("should translate minLength error with interpolation", () => {
			const schema = z.object({ password: z.string().min(8) });
			const result = validateWithLocalizedErrors(
				schema,
				{ password: "short" },
				tEn,
			);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.issues[0].message).toBe(
					"Must be at least 8 characters",
				);
			}
		});

		it("should translate maxLength error", () => {
			const schema = z.object({ name: z.string().max(10) });
			const result = validateWithLocalizedErrors(
				schema,
				{ name: "this is too long for the field" },
				tEn,
			);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.issues[0].message).toBe(
					"Must be no more than 10 characters",
				);
			}
		});

		it("should translate email error", () => {
			const schema = z.object({ email: z.string().email() });
			const result = validateWithLocalizedErrors(
				schema,
				{ email: "invalid" },
				tEn,
			);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.issues[0].message).toBe(
					"Please enter a valid email address",
				);
			}
		});

		it("should translate url error", () => {
			const schema = z.object({ website: z.string().url() });
			const result = validateWithLocalizedErrors(
				schema,
				{ website: "not-a-url" },
				tEn,
			);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.issues[0].message).toBe("Please enter a valid URL");
			}
		});

		it("should translate uuid error", () => {
			const schema = z.object({ id: z.string().uuid() });
			const result = validateWithLocalizedErrors(
				schema,
				{ id: "invalid" },
				tEn,
			);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.issues[0].message).toBe("Invalid ID format");
			}
		});

		it("should translate regex pattern error", () => {
			const schema = z.object({ slug: z.string().regex(/^[a-z-]+$/) });
			const result = validateWithLocalizedErrors(
				schema,
				{ slug: "Invalid Slug!" },
				tEn,
			);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.issues[0].message).toBe("Invalid format");
			}
		});
	});

	describe("Number Validations", () => {
		it("should translate number min error (inclusive)", () => {
			const schema = z.object({ port: z.number().min(1) });
			const result = validateWithLocalizedErrors(schema, { port: 0 }, tEn);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.issues[0].message).toBe("Must be at least 1");
			}
		});

		it("should translate number max error (inclusive)", () => {
			const schema = z.object({ port: z.number().max(65535) });
			const result = validateWithLocalizedErrors(schema, { port: 70000 }, tEn);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.issues[0].message).toBe(
					"Must be no more than 65535",
				);
			}
		});

		it("should translate number gt error (exclusive)", () => {
			const schema = z.object({ value: z.number().gt(0) });
			const result = validateWithLocalizedErrors(schema, { value: 0 }, tEn);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.issues[0].message).toBe("Must be greater than 0");
			}
		});

		it("should translate number lt error (exclusive)", () => {
			const schema = z.object({ value: z.number().lt(100) });
			const result = validateWithLocalizedErrors(schema, { value: 100 }, tEn);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.issues[0].message).toBe("Must be less than 100");
			}
		});

		it("should translate finite error", () => {
			const schema = z.object({ value: z.number().finite() });
			const result = validateWithLocalizedErrors(
				schema,
				{ value: Number.POSITIVE_INFINITY },
				tEn,
			);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.issues[0].message).toBe("Must be a finite number");
			}
		});

		it("should translate multipleOf error", () => {
			const schema = z.object({ value: z.number().multipleOf(5) });
			const result = validateWithLocalizedErrors(schema, { value: 7 }, tEn);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.issues[0].message).toBe("Must be a multiple of 5");
			}
		});
	});

	describe("Array Validations", () => {
		it("should translate array required error (min 1)", () => {
			const schema = z.object({ tags: z.array(z.string()).min(1) });
			const result = validateWithLocalizedErrors(schema, { tags: [] }, tEn);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.issues[0].message).toBe(
					"At least one item is required",
				);
			}
		});

		it("should translate array minLength error", () => {
			const schema = z.object({ items: z.array(z.string()).min(3) });
			const result = validateWithLocalizedErrors(
				schema,
				{ items: ["one", "two"] },
				tEn,
			);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.issues[0].message).toBe(
					"Must have at least 3 items",
				);
			}
		});

		it("should translate array maxLength error", () => {
			const schema = z.object({ items: z.array(z.string()).max(2) });
			const result = validateWithLocalizedErrors(
				schema,
				{ items: ["one", "two", "three"] },
				tEn,
			);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.issues[0].message).toBe(
					"Must have no more than 2 items",
				);
			}
		});
	});

	describe("Date Validations", () => {
		it("should translate invalid date error", () => {
			const schema = z.object({ date: z.date() });
			const result = validateWithLocalizedErrors(
				schema,
				{ date: new Date("invalid") },
				tEn,
			);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.issues[0].message).toBe("Invalid date");
			}
		});
	});

	describe("Enum Validations", () => {
		it("should translate invalid enum value error", () => {
			const schema = z.object({
				status: z.enum(["active", "inactive", "pending"]),
			});
			const result = validateWithLocalizedErrors(
				schema,
				{ status: "invalid" as any },
				tEn,
			);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.issues[0].message).toContain("Invalid option");
				expect(result.error.issues[0].message).toContain("active");
			}
		});
	});

	describe("Custom Refinements with i18n Keys", () => {
		it("should use custom i18n key from refinement params", () => {
			const schema = z.object({
				key: z.string().refine((val) => val.startsWith("ssh-"), {
					params: {
						i18nKey: "validation:custom.sshKey.invalidPublicKey",
					},
				}),
			});
			const result = validateWithLocalizedErrors(
				schema,
				{ key: "invalid" },
				tEn,
			);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.issues[0].message).toContain("Invalid public key");
			}
		});

		it("should use custom i18n key with params from refinement", () => {
			const schema = z.object({
				port: z.number().refine((val) => val !== 22, {
					params: {
						i18nKey: "validation:custom.port.reserved",
						i18nParams: { port: 22 },
					},
				}),
			});
			const result = validateWithLocalizedErrors(schema, { port: 22 }, tEn);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.issues[0].message).toContain("22");
				expect(result.error.issues[0].message).toContain("reserved");
			}
		});

		it("should fallback to message if no i18n key provided", () => {
			const schema = z.object({
				value: z.string().refine((val) => val !== "forbidden", {
					message: "This value is not allowed",
				}),
			});
			const result = validateWithLocalizedErrors(
				schema,
				{ value: "forbidden" },
				tEn,
			);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.issues[0].message).toBe(
					"This value is not allowed",
				);
			}
		});
	});

	describe("Type Errors", () => {
		it("should translate type error for required string", () => {
			const schema = z.object({ name: z.string() });
			const result = validateWithLocalizedErrors(schema, {}, tEn);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.issues[0].message).toBe("This field is required");
			}
		});

		it("should translate type error for required number", () => {
			const schema = z.object({ count: z.number() });
			const result = validateWithLocalizedErrors(schema, {}, tEn);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.issues[0].message).toBe("This field is required");
			}
		});

		it("should translate type error for required boolean", () => {
			const schema = z.object({ enabled: z.boolean() });
			const result = validateWithLocalizedErrors(schema, {}, tEn);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.issues[0].message).toBe("This field is required");
			}
		});

		it("should translate type error for required array", () => {
			const schema = z.object({ items: z.array(z.string()) });
			const result = validateWithLocalizedErrors(schema, {}, tEn);

			expect(result.success).toBe(false);
			if (!result.success) {
				// Array-specific required message is more user-friendly
				expect(result.error.issues[0].message).toBe(
					"At least one item is required",
				);
			}
		});
	});

	describe("formatZodErrorsWithTranslations", () => {
		it("should format errors by field path", () => {
			const schema = z.object({
				name: z.string().min(1),
				email: z.string().email(),
			});

			const result = schema.safeParse({ name: "", email: "invalid" });
			expect(result.success).toBe(false);

			if (!result.success) {
				const formatted = formatZodErrorsWithTranslations(result.error, tEn);
				expect(formatted).toHaveProperty("name");
				expect(formatted).toHaveProperty("email");
				expect(formatted.name[0]).toBe("This field is required");
				expect(formatted.email[0]).toBe("Please enter a valid email address");
			}
		});

		it("should handle nested paths", () => {
			const schema = z.object({
				user: z.object({
					email: z.string().email(),
				}),
			});

			const result = schema.safeParse({ user: { email: "invalid" } });
			expect(result.success).toBe(false);

			if (!result.success) {
				const formatted = formatZodErrorsWithTranslations(result.error, tEn);
				expect(formatted).toHaveProperty("user.email");
			}
		});

		it("should handle multiple errors on same field", () => {
			const schema = z.object({
				password: z.string().min(8).regex(/[A-Z]/, "Must contain uppercase"),
			});

			// First validate min length
			const result = schema.safeParse({ password: "short" });
			expect(result.success).toBe(false);

			if (!result.success) {
				const formatted = formatZodErrorsWithTranslations(result.error, tEn);
				expect(formatted.password.length).toBeGreaterThanOrEqual(1);
			}
		});

		it("should use _root for root-level errors", () => {
			const schema = z
				.object({
					password: z.string(),
					confirmPassword: z.string(),
				})
				.refine((data) => data.password === data.confirmPassword, {
					message: "Passwords don't match",
				});

			const result = schema.safeParse({
				password: "test123",
				confirmPassword: "different",
			});
			expect(result.success).toBe(false);

			if (!result.success) {
				const formatted = formatZodErrorsWithTranslations(result.error, tEn);
				expect(formatted).toHaveProperty("_root");
			}
		});
	});

	describe("getLocalizedIssues", () => {
		it("should return array of issues with path and message", () => {
			const schema = z.object({
				name: z.string().min(1),
				email: z.string().email(),
			});

			const result = schema.safeParse({ name: "", email: "invalid" });
			expect(result.success).toBe(false);

			if (!result.success) {
				const issues = getLocalizedIssues(result.error, tEn);
				expect(issues).toHaveLength(2);
				expect(issues[0]).toHaveProperty("path");
				expect(issues[0]).toHaveProperty("message");
				expect(Array.isArray(issues[0].path)).toBe(true);
			}
		});

		it("should preserve nested paths", () => {
			const schema = z.object({
				user: z.object({
					profile: z.object({
						age: z.number().min(0),
					}),
				}),
			});

			const result = schema.safeParse({ user: { profile: { age: -5 } } });
			expect(result.success).toBe(false);

			if (!result.success) {
				const issues = getLocalizedIssues(result.error, tEn);
				expect(issues[0].path).toEqual(["user", "profile", "age"]);
			}
		});
	});

	describe("parseWithLocalizedErrors", () => {
		it("should return parsed data when valid", () => {
			const schema = z.object({ name: z.string().min(1) });
			const result = parseWithLocalizedErrors(schema, { name: "John" }, tEn);
			expect(result).toEqual({ name: "John" });
		});

		it("should throw ZodError with localized messages when invalid", () => {
			const schema = z.object({ name: z.string().min(1) });

			expect(() => {
				parseWithLocalizedErrors(schema, { name: "" }, tEn);
			}).toThrow();

			try {
				parseWithLocalizedErrors(schema, { name: "" }, tEn);
			} catch (error) {
				if (error instanceof z.ZodError) {
					expect(error.issues[0].message).toBe("This field is required");
				}
			}
		});
	});

	describe("applyLocalizedZodErrorMap", () => {
		it("should set global error map", () => {
			// Save original global state
			const originalError = z.string().min(1).safeParse("");

			// Apply localized error map
			applyLocalizedZodErrorMap(tEn);

			// Validate that global error map is applied
			const result = z.string().min(1).safeParse("");
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.issues[0].message).toBe("This field is required");
			}
		});
	});

	describe("Arabic Translations", () => {
		it("should return Arabic translations for required field", () => {
			const schema = z.object({ name: z.string().min(1) });
			const result = validateWithLocalizedErrors(schema, { name: "" }, tAr);

			expect(result.success).toBe(false);
			if (!result.success) {
				// Arabic translation for "This field is required"
				expect(result.error.issues[0].message).toBe("هذا الحقل مطلوب");
			}
		});

		it("should return Arabic translations for email error", () => {
			const schema = z.object({ email: z.string().email() });
			const result = validateWithLocalizedErrors(
				schema,
				{ email: "invalid" },
				tAr,
			);

			expect(result.success).toBe(false);
			if (!result.success) {
				// Arabic translation for "Please enter a valid email address"
				expect(result.error.issues[0].message).toBe(
					"يرجى إدخال بريد إلكتروني صالح",
				);
			}
		});

		it("should return Arabic translations with interpolation", () => {
			const schema = z.object({ password: z.string().min(8) });
			const result = validateWithLocalizedErrors(
				schema,
				{ password: "short" },
				tAr,
			);

			expect(result.success).toBe(false);
			if (!result.success) {
				// Arabic translation should contain the number 8
				expect(result.error.issues[0].message).toContain("8");
			}
		});
	});

	describe("Edge Cases", () => {
		it("should handle empty schema", () => {
			const schema = z.object({});
			const result = validateWithLocalizedErrors(schema, {}, tEn);
			expect(result.success).toBe(true);
		});

		it("should handle deeply nested objects", () => {
			const schema = z.object({
				level1: z.object({
					level2: z.object({
						level3: z.object({
							value: z.string().min(1),
						}),
					}),
				}),
			});

			const result = validateWithLocalizedErrors(
				schema,
				{ level1: { level2: { level3: { value: "" } } } },
				tEn,
			);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.issues[0].path).toEqual([
					"level1",
					"level2",
					"level3",
					"value",
				]);
				expect(result.error.issues[0].message).toBe("This field is required");
			}
		});

		it("should handle union types", () => {
			const schema = z.object({
				value: z.union([z.string().email(), z.string().url()]),
			});

			const result = validateWithLocalizedErrors(
				schema,
				{ value: "neither-email-nor-url" },
				tEn,
			);

			expect(result.success).toBe(false);
		});

		it("should handle literal types", () => {
			const schema = z.object({
				type: z.literal("specific"),
			});

			const result = validateWithLocalizedErrors(
				schema,
				{ type: "other" },
				tEn,
			);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.issues[0].message).toContain("specific");
			}
		});

		it("should handle optional with null", () => {
			const schema = z.object({
				name: z.string().nullable(),
			});

			const result = validateWithLocalizedErrors(schema, { name: null }, tEn);
			expect(result.success).toBe(true);
		});
	});
});
