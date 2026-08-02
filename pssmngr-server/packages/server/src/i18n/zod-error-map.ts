// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors

import type { TFunction } from "i18next";
import { type ZodErrorMap, z } from "zod/v3";

/**
 * Create a localized Zod error map.
 *
 * This error map translates Zod validation errors using i18next.
 * It maps Zod issue codes to translation keys in the 'validation' namespace.
 *
 * @param t - Translator function bound to a specific language
 * @returns A ZodErrorMap that returns translated messages
 *
 * @example
 * const errorMap = createZodErrorMap(ctx.t);
 * z.setErrorMap(errorMap);
 * // Now all Zod validations will use translated messages
 */
export function createZodErrorMap(t: TFunction): ZodErrorMap {
	return (issue, ctx) => {
		let message: string;

		switch (issue.code) {
			// ============================================
			// Type Errors
			// ============================================
			case z.ZodIssueCode.invalid_type:
				if (issue.received === "undefined") {
					message = getTypeRequiredMessage(t, issue.expected);
				} else if (issue.received === "null") {
					message = t("validation:string.required");
				} else {
					message = t("validation:type.invalid", {
						expected: issue.expected,
						received: issue.received,
					});
				}
				break;

			// ============================================
			// String Validations
			// ============================================
			case z.ZodIssueCode.too_small:
				if (issue.type === "string") {
					if (issue.minimum === 1) {
						message = t("validation:string.required");
					} else {
						message = t("validation:string.minLength", { min: issue.minimum });
					}
				} else if (issue.type === "number") {
					message = issue.inclusive
						? t("validation:number.min", { min: issue.minimum })
						: t("validation:number.minExclusive", { min: issue.minimum });
				} else if (issue.type === "array") {
					if (issue.minimum === 1) {
						message = t("validation:array.required");
					} else {
						message = t("validation:array.minLength", { min: issue.minimum });
					}
				} else if (issue.type === "date") {
					message = t("validation:date.min", { min: String(issue.minimum) });
				} else if (issue.type === "set") {
					message = t("validation:set.minSize", { min: issue.minimum });
				} else if (issue.type === "bigint") {
					message = t("validation:number.min", { min: issue.minimum });
				} else {
					message = ctx.defaultError;
				}
				break;

			case z.ZodIssueCode.too_big:
				if (issue.type === "string") {
					message = t("validation:string.maxLength", { max: issue.maximum });
				} else if (issue.type === "number") {
					message = issue.inclusive
						? t("validation:number.max", { max: issue.maximum })
						: t("validation:number.maxExclusive", { max: issue.maximum });
				} else if (issue.type === "array") {
					message = t("validation:array.maxLength", { max: issue.maximum });
				} else if (issue.type === "date") {
					message = t("validation:date.max", { max: String(issue.maximum) });
				} else if (issue.type === "set") {
					message = t("validation:set.maxSize", { max: issue.maximum });
				} else if (issue.type === "bigint") {
					message = t("validation:number.max", { max: issue.maximum });
				} else {
					message = ctx.defaultError;
				}
				break;

			case z.ZodIssueCode.invalid_string:
				switch (issue.validation) {
					case "email":
						message = t("validation:string.email");
						break;
					case "url":
						message = t("validation:string.url");
						break;
					case "uuid":
						message = t("validation:string.uuid");
						break;
					case "regex":
						message = t("validation:string.pattern");
						break;
					case "datetime":
						message = t("validation:date.invalid");
						break;
					case "cuid":
						message = t("validation:string.cuid");
						break;
					case "cuid2":
						message = t("validation:string.cuid2");
						break;
					case "ulid":
						message = t("validation:string.ulid");
						break;
					case "emoji":
						message = t("validation:string.emoji");
						break;
					case "ip":
						message = t("validation:string.ip");
						break;
					case "base64":
						message = t("validation:string.base64");
						break;
					default:
						// Handle includes/startsWith/endsWith with message
						if (typeof issue.validation === "object") {
							if ("includes" in issue.validation) {
								message = t("validation:string.includes", {
									value: issue.validation.includes,
								});
							} else if ("startsWith" in issue.validation) {
								message = t("validation:string.startsWith", {
									value: issue.validation.startsWith,
								});
							} else if ("endsWith" in issue.validation) {
								message = t("validation:string.endsWith", {
									value: issue.validation.endsWith,
								});
							} else {
								message = t("validation:string.pattern");
							}
						} else {
							message = t("validation:string.pattern");
						}
				}
				break;

			// ============================================
			// Number Validations
			// ============================================
			case z.ZodIssueCode.not_finite:
				message = t("validation:number.finite");
				break;

			case z.ZodIssueCode.not_multiple_of:
				message = t("validation:number.multipleOf", {
					multipleOf: issue.multipleOf,
				});
				break;

			// ============================================
			// Literal and Enum Validations
			// ============================================
			case z.ZodIssueCode.invalid_literal:
				message = t("validation:literal.invalid", {
					expected: JSON.stringify(issue.expected),
				});
				break;

			case z.ZodIssueCode.invalid_enum_value:
				message = t("validation:enum.invalid", {
					options: issue.options.join(", "),
					received: String(issue.received),
				});
				break;

			// ============================================
			// Union and Intersection Validations
			// ============================================
			case z.ZodIssueCode.invalid_union:
				message = t("validation:union.invalid");
				break;

			case z.ZodIssueCode.invalid_union_discriminator:
				message = t("validation:union.invalidDiscriminator", {
					options: issue.options.join(", "),
				});
				break;

			case z.ZodIssueCode.invalid_intersection_types:
				message = t("validation:intersection.invalid");
				break;

			// ============================================
			// Date Validations
			// ============================================
			case z.ZodIssueCode.invalid_date:
				message = t("validation:date.invalid");
				break;

			// ============================================
			// Function Validations
			// ============================================
			case z.ZodIssueCode.invalid_arguments:
				message = t("validation:function.invalidArguments");
				break;

			case z.ZodIssueCode.invalid_return_type:
				message = t("validation:function.invalidReturnType");
				break;

			// ============================================
			// Custom Validations (refinements)
			// ============================================
			case z.ZodIssueCode.custom:
				// Support custom i18n keys via params
				if (issue.params?.i18nKey && typeof issue.params.i18nKey === "string") {
					const translationKey = issue.params.i18nKey;
					const translationParams = issue.params.i18nParams as
						| Record<string, string | number>
						| undefined;
					message = t(translationKey, translationParams);
				} else if (issue.message) {
					// Use the message from the refinement if no i18n key
					message = issue.message;
				} else {
					message = ctx.defaultError;
				}
				break;

			// ============================================
			// Unrecognized Keys
			// ============================================
			case z.ZodIssueCode.unrecognized_keys:
				message = t("validation:object.unrecognizedKeys", {
					keys: issue.keys.join(", "),
				});
				break;

			// ============================================
			// Default
			// ============================================
			default:
				message = ctx.defaultError;
		}

		return { message };
	};
}

/**
 * Get the required message for a specific type.
 */
function getTypeRequiredMessage(t: TFunction, expectedType: string): string {
	switch (expectedType) {
		case "string":
			return t("validation:string.required");
		case "number":
			return t("validation:number.required");
		case "boolean":
			return t("validation:boolean.required");
		case "array":
			return t("validation:array.required");
		case "date":
			return t("validation:date.required");
		case "object":
			return t("validation:object.required");
		default:
			return t("validation:string.required");
	}
}

/**
 * Apply the localized error map globally for Zod.
 *
 * Call this once with the translator for the current request.
 * Note: This affects all Zod validations in the current context.
 *
 * @param t - Translator function
 */
export function applyLocalizedZodErrorMap(t: TFunction): void {
	z.setErrorMap(createZodErrorMap(t));
}

/**
 * Validate with a localized error map without affecting global state.
 *
 * This is useful when you need to validate with specific translations
 * without changing the global error map.
 *
 * @param schema - Zod schema to validate with
 * @param data - Data to validate
 * @param t - Translator function
 * @returns Validation result with localized errors
 *
 * @example
 * const result = validateWithLocalizedErrors(mySchema, input, ctx.t);
 * if (!result.success) {
 *   console.log(result.error.issues); // Translated error messages
 * }
 */
export function validateWithLocalizedErrors<T extends z.ZodTypeAny>(
	schema: T,
	data: unknown,
	t: TFunction,
): z.SafeParseReturnType<z.input<T>, z.output<T>> {
	const errorMap = createZodErrorMap(t);
	return schema.safeParse(data, { errorMap });
}

/**
 * Format Zod errors with translations.
 *
 * This utility transforms a ZodError into a flattened format
 * with translated messages.
 *
 * @param error - ZodError to format
 * @param t - Translator function
 * @returns Formatted error object with field paths and messages
 */
export function formatZodErrorsWithTranslations(
	error: z.ZodError,
	t: TFunction,
): Record<string, string[]> {
	const errorMap = createZodErrorMap(t);
	const formatted: Record<string, string[]> = {};

	for (const issue of error.issues) {
		const path = issue.path.length > 0 ? issue.path.join(".") : "_root";
		const { message } = errorMap(issue, {
			defaultError: issue.message,
			data: undefined,
		});

		if (!formatted[path]) {
			formatted[path] = [];
		}
		formatted[path].push(message);
	}

	return formatted;
}

/**
 * Get localized issues from a ZodError.
 *
 * Returns an array of issues with their paths and translated messages.
 *
 * @param error - ZodError to format
 * @param t - Translator function
 * @returns Array of issues with path and message
 */
export function getLocalizedIssues(
	error: z.ZodError,
	t: TFunction,
): Array<{ path: (string | number)[]; message: string }> {
	const errorMap = createZodErrorMap(t);

	return error.issues.map((issue) => ({
		path: issue.path,
		message: errorMap(issue, {
			defaultError: issue.message,
			data: undefined,
		}).message,
	}));
}

/**
 * Parse with localized errors, throwing on failure.
 *
 * Similar to schema.parse() but uses localized error messages.
 *
 * @param schema - Zod schema to validate with
 * @param data - Data to validate
 * @param t - Translator function
 * @returns Parsed data if valid
 * @throws ZodError with localized messages if invalid
 */
export function parseWithLocalizedErrors<T extends z.ZodTypeAny>(
	schema: T,
	data: unknown,
	t: TFunction,
): z.output<T> {
	const errorMap = createZodErrorMap(t);
	return schema.parse(data, { errorMap });
}
