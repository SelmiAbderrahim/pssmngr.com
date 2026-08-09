// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * API Error Types
 *
 * Type definitions for API error responses and error handling utilities.
 * Designed to work with backend i18n - error messages from the backend
 * are already translated and should be displayed directly.
 *
 * @module lib/api/types
 */

/**
 * API error response structure from tRPC backend
 */
export interface ApiErrorResponse {
  error: {
    /** Translated error message from backend */
    message: string;
    /** tRPC error code (NOT_FOUND, UNAUTHORIZED, etc.) */
    code: string;
    data?: {
      /** Additional error code */
      code: string;
      /** tRPC procedure path */
      path?: string;
      /** HTTP status code */
      httpStatus?: number;
      /** Zod validation errors (field-level) */
      zodError?: {
        fieldErrors: Record<string, string[]>;
        formErrors: string[];
      };
    };
  };
}

/**
 * Validation error for form fields
 */
export interface ValidationError {
  /** Field name that has the error */
  field: string;
  /** Translated error message */
  message: string;
}

/**
 * Standardized API error class
 *
 * Used throughout the application for consistent error handling.
 * The message property contains the already-translated message from backend.
 */
export class ApiError extends Error {
  constructor(
    /** Translated error message from backend */
    message: string,
    /** Error code (e.g., NOT_FOUND, UNAUTHORIZED) */
    public readonly code: string,
    /** HTTP status code */
    public readonly statusCode: number,
    /** Additional error data */
    public readonly data?: unknown
  ) {
    super(message);
    this.name = "ApiError";
    // Maintains proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, ApiError.prototype);
  }

  /**
   * Check if error has field validation errors
   */
  hasFieldErrors(): boolean {
    if (!this.data || typeof this.data !== "object") return false;
    const data = this.data as Record<string, unknown>;
    const zodError = data.zodError as { fieldErrors?: Record<string, string[]> } | undefined;
    return zodError?.fieldErrors
      ? Object.keys(zodError.fieldErrors).length > 0
      : false;
  }

  /**
   * Get field validation errors
   */
  getFieldErrors(): Record<string, string[]> {
    if (!this.data || typeof this.data !== "object") return {};
    const data = this.data as Record<string, unknown>;
    const zodError = data.zodError as { fieldErrors?: Record<string, string[]> } | undefined;
    return zodError?.fieldErrors || {};
  }

  /**
   * Get form-level errors (not associated with a specific field)
   */
  getFormErrors(): string[] {
    if (!this.data || typeof this.data !== "object") return [];
    const data = this.data as Record<string, unknown>;
    const zodError = data.zodError as { formErrors?: string[] } | undefined;
    return zodError?.formErrors || [];
  }

  /**
   * Check if this is a validation error
   */
  isValidationError(): boolean {
    return this.code === "BAD_REQUEST" && this.hasFieldErrors();
  }

  /**
   * Check if this error should be retried
   */
  isRetryable(): boolean {
    return ["TIMEOUT", "NETWORK_ERROR", "INTERNAL_SERVER_ERROR", "SERVICE_UNAVAILABLE"].includes(
      this.code
    );
  }

  /**
   * Convert to plain object for logging/serialization
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      data: this.data,
    };
  }
}

/**
 * Type guard to check if an error is an ApiError
 */
export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/**
 * Type guard to check if an error has the ApiError structure (duck typing)
 * Useful for errors that may have been serialized/deserialized
 */
export function isApiErrorLike(
  error: unknown
): error is { code: string; message: string; statusCode: number; data?: unknown } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "message" in error &&
    "statusCode" in error &&
    typeof (error as Record<string, unknown>).code === "string" &&
    typeof (error as Record<string, unknown>).message === "string" &&
    typeof (error as Record<string, unknown>).statusCode === "number"
  );
}

/**
 * Create an ApiError from a plain error-like object
 */
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }

  if (isApiErrorLike(error)) {
    return new ApiError(error.message, error.code, error.statusCode, error.data);
  }

  if (error instanceof Error) {
    return new ApiError(error.message, "UNKNOWN_ERROR", 500);
  }

  if (typeof error === "string") {
    return new ApiError(error, "UNKNOWN_ERROR", 500);
  }

  return new ApiError("An unexpected error occurred", "UNKNOWN_ERROR", 500);
}

/**
 * Error codes that indicate the user should re-authenticate
 */
export const AUTH_ERROR_CODES = ["UNAUTHORIZED", "SESSION_EXPIRED"] as const;

/**
 * Error codes that indicate a permission issue
 */
export const PERMISSION_ERROR_CODES = ["FORBIDDEN", "ACCESS_DENIED"] as const;

/**
 * Error codes that indicate a client-side issue
 */
export const CLIENT_ERROR_CODES = [
  "BAD_REQUEST",
  "NOT_FOUND",
  "CONFLICT",
  "VALIDATION_ERROR",
] as const;

/**
 * Error codes that indicate a server-side issue
 */
export const SERVER_ERROR_CODES = [
  "INTERNAL_SERVER_ERROR",
  "SERVICE_UNAVAILABLE",
  "TIMEOUT",
  "NETWORK_ERROR",
] as const;
