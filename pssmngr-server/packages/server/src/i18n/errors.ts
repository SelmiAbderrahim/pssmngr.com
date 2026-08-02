// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { TRPCError } from "@trpc/server";
import type { TFunction } from "i18next";

// ============================================
// Generic Error Helpers
// ============================================

/**
 * Create an unauthorized error with translated message.
 *
 * @param t - Translator function from context
 * @param resource - Optional resource being accessed
 * @returns TRPCError with UNAUTHORIZED code
 *
 * @example
 * throw unauthorizedError(ctx.t);
 * throw unauthorizedError(ctx.t, 'PostgreSQL database');
 */
export function unauthorizedError(t: TFunction, resource?: string): TRPCError {
	return new TRPCError({
		code: "UNAUTHORIZED",
		message: resource
			? t("errors:resource.accessDenied", { resource })
			: t("errors:auth.unauthorized"),
	});
}

/**
 * Create a not found error with translated message.
 *
 * @param t - Translator function from context
 * @param resource - Name of the resource not found
 * @param id - Optional ID of the resource
 * @returns TRPCError with NOT_FOUND code
 *
 * @example
 * throw notFoundError(ctx.t, 'Project');
 * throw notFoundError(ctx.t, 'PostgreSQL database', input.postgresId);
 */
export function notFoundError(
	t: TFunction,
	resource: string,
	id?: string,
): TRPCError {
	return new TRPCError({
		code: "NOT_FOUND",
		message: id
			? t("errors:resource.notFoundById", { resource, id })
			: t("errors:resource.notFound", { resource }),
	});
}

/**
 * Create a forbidden error with translated message.
 *
 * @param t - Translator function from context
 * @param action - Optional action being performed
 * @returns TRPCError with FORBIDDEN code
 *
 * @example
 * throw forbiddenError(ctx.t);
 * throw forbiddenError(ctx.t, 'delete this project');
 */
export function forbiddenError(t: TFunction, action?: string): TRPCError {
	return new TRPCError({
		code: "FORBIDDEN",
		message: action
			? t("permissions:generic.actionNotAllowed", { action })
			: t("errors:auth.forbidden"),
	});
}

/**
 * Create a bad request error with translated message.
 *
 * @param t - Translator function from context
 * @param messageKey - Translation key for the error message
 * @param params - Optional interpolation parameters
 * @returns TRPCError with BAD_REQUEST code
 *
 * @example
 * throw badRequestError(ctx.t, 'validation:password.tooWeak');
 */
export function badRequestError(
	t: TFunction,
	messageKey: string,
	params?: Record<string, string | number>,
): TRPCError {
	return new TRPCError({
		code: "BAD_REQUEST",
		message: t(messageKey, params),
	});
}

/**
 * Create an internal server error with translated message.
 *
 * @param t - Translator function from context
 * @param cause - Optional underlying error
 * @returns TRPCError with INTERNAL_SERVER_ERROR code
 *
 * @example
 * throw internalError(ctx.t);
 * throw internalError(ctx.t, originalError);
 */
export function internalError(t: TFunction, cause?: unknown): TRPCError {
	return new TRPCError({
		code: "INTERNAL_SERVER_ERROR",
		message: t("errors:operation.internalError"),
		cause,
	});
}

// ============================================
// Resource Operation Error Helpers
// ============================================

/**
 * Create an error for failed resource creation.
 *
 * @param t - Translator function from context
 * @param resource - Name of the resource
 * @param cause - Optional underlying error
 * @returns TRPCError with BAD_REQUEST code
 *
 * @example
 * throw createFailedError(ctx.t, 'application', error);
 */
export function createFailedError(
	t: TFunction,
	resource: string,
	cause?: unknown,
): TRPCError {
	return new TRPCError({
		code: "BAD_REQUEST",
		message: t("errors:resource.createFailed", { resource }),
		cause,
	});
}

/**
 * Create an error for failed resource update.
 *
 * @param t - Translator function from context
 * @param resource - Name of the resource
 * @param cause - Optional underlying error
 * @returns TRPCError with BAD_REQUEST code
 *
 * @example
 * throw updateFailedError(ctx.t, 'environment variables', error);
 */
export function updateFailedError(
	t: TFunction,
	resource: string,
	cause?: unknown,
): TRPCError {
	return new TRPCError({
		code: "BAD_REQUEST",
		message: t("errors:resource.updateFailed", { resource }),
		cause,
	});
}

/**
 * Create an error for failed resource deletion.
 *
 * @param t - Translator function from context
 * @param resource - Name of the resource
 * @param cause - Optional underlying error
 * @returns TRPCError with BAD_REQUEST code
 *
 * @example
 * throw deleteFailedError(ctx.t, 'backup', error);
 */
export function deleteFailedError(
	t: TFunction,
	resource: string,
	cause?: unknown,
): TRPCError {
	return new TRPCError({
		code: "BAD_REQUEST",
		message: t("errors:resource.deleteFailed", { resource }),
		cause,
	});
}

// ============================================
// Permission-Specific Error Helpers
// ============================================

/**
 * Create an error for user permission issues.
 *
 * @param t - Translator function from context
 * @param permissionKey - Key from permissions namespace
 * @returns TRPCError with FORBIDDEN code
 *
 * @example
 * throw permissionError(ctx.t, 'user.cannotDeleteOwner');
 */
export function permissionError(
	t: TFunction,
	permissionKey: string,
): TRPCError {
	return new TRPCError({
		code: "FORBIDDEN",
		message: t(`permissions:${permissionKey}`),
	});
}

// ============================================
// Utility for Wrapping Existing Errors
// ============================================

/**
 * Wrap an error in a TRPCError with translated message.
 * Useful for catching and re-throwing with proper i18n.
 *
 * @param t - Translator function from context
 * @param error - Original error
 * @param messageKey - Translation key for the message
 * @param params - Optional interpolation parameters
 * @returns TRPCError wrapping the original
 *
 * @example
 * try {
 *   await someOperation();
 * } catch (error) {
 *   throw wrapError(ctx.t, error, 'errors:operation.internalError');
 * }
 */
export function wrapError(
	t: TFunction,
	error: unknown,
	messageKey: string,
	params?: Record<string, string | number>,
): TRPCError {
	// If already a TRPCError, preserve the code
	if (error instanceof TRPCError) {
		return new TRPCError({
			code: error.code,
			message: t(messageKey, params),
			cause: error.cause,
		});
	}

	// Wrap other errors as internal server error
	return new TRPCError({
		code: "INTERNAL_SERVER_ERROR",
		message: t(messageKey, params),
		cause: error,
	});
}
