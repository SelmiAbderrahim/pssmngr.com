// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Authentication Error Handling System
 *
 * Maps authentication API error codes to user-friendly messages
 * and categorizes errors for appropriate UI display.
 *
 * @module authErrors
 */

import i18n from "@/i18n";

/**
 * Authentication error codes understood by the client.
 */
export enum AuthErrorCode {
  // Validation Errors (user input issues)
  VALIDATION_ERROR = "VALIDATION_ERROR",
  EMAIL_VALIDATION_ERROR = "EMAIL_VALIDATION_ERROR",

  // System Errors (configuration/service issues)
  CONFIGURATION_ERROR = "CONFIGURATION_ERROR",
  SERVICE_INITIALIZATION_ERROR = "SERVICE_INITIALIZATION_ERROR",

  // Transient Errors (retry-able)
  NETWORK_ERROR = "NETWORK_ERROR",
  EMAIL_SEND_ERROR = "EMAIL_SEND_ERROR",
  RATE_LIMIT_ERROR = "RATE_LIMIT_ERROR",

  // Authentication errors
  INVALID_ACCOUNT_ID = "INVALID_ACCOUNT_ID",
  INVALID_SECRET = "INVALID_SECRET",

  // Unknown/fallback
  INTERNAL_ERROR = "INTERNAL_ERROR",
  UNKNOWN_ERROR = "UNKNOWN_ERROR",
}

/**
 * Error category for UI display logic
 */
export enum AuthErrorCategory {
  /** Display inline below form field */
  VALIDATION = "validation",
  /** Display as a toast with instance-administrator guidance */
  SYSTEM = "system",
  /** Display as toast with retry button */
  TRANSIENT = "transient",
  /** Display as toast with countdown timer */
  RATE_LIMIT = "rate_limit",
  /** Display generic error toast */
  UNKNOWN = "unknown",
}

/**
 * Error information for UI display
 */
export interface AuthErrorInfo {
  /** Error category determines display logic */
  category: AuthErrorCategory;
  /** User-friendly message to display */
  message: string;
  /** Whether error is recoverable with retry */
  retryable: boolean;
  /** Suggested action for user */
  action?: string;
  /** Optional field name for validation errors */
  fieldName?: "email" | "code";
}

/**
 * Error code to category mapping
 */
const ERROR_CATEGORY_MAP: Record<AuthErrorCode, AuthErrorCategory> = {
  // Authentication Errors
  [AuthErrorCode.VALIDATION_ERROR]: AuthErrorCategory.VALIDATION,
  [AuthErrorCode.EMAIL_VALIDATION_ERROR]: AuthErrorCategory.VALIDATION,
  [AuthErrorCode.INVALID_ACCOUNT_ID]: AuthErrorCategory.VALIDATION,
  [AuthErrorCode.INVALID_SECRET]: AuthErrorCategory.VALIDATION,
  [AuthErrorCode.CONFIGURATION_ERROR]: AuthErrorCategory.SYSTEM,
  [AuthErrorCode.SERVICE_INITIALIZATION_ERROR]: AuthErrorCategory.SYSTEM,
  [AuthErrorCode.NETWORK_ERROR]: AuthErrorCategory.TRANSIENT,
  [AuthErrorCode.EMAIL_SEND_ERROR]: AuthErrorCategory.TRANSIENT,
  [AuthErrorCode.RATE_LIMIT_ERROR]: AuthErrorCategory.RATE_LIMIT,
  [AuthErrorCode.INTERNAL_ERROR]: AuthErrorCategory.UNKNOWN,
  [AuthErrorCode.UNKNOWN_ERROR]: AuthErrorCategory.UNKNOWN,
};

/**
 * Translation keys for error messages
 */
const getErrorMessageKey = (code: AuthErrorCode): string => {
  switch (code) {
    case AuthErrorCode.VALIDATION_ERROR:
      return "errors:auth.validationError";
    case AuthErrorCode.EMAIL_VALIDATION_ERROR:
      return "errors:auth.emailValidationError";
    case AuthErrorCode.INVALID_ACCOUNT_ID:
      return "errors:auth.invalidAccountId";
    case AuthErrorCode.INVALID_SECRET:
      return "errors:auth.invalidSecret";
    case AuthErrorCode.CONFIGURATION_ERROR:
      return "errors:auth.configurationError";
    case AuthErrorCode.SERVICE_INITIALIZATION_ERROR:
      return "errors:auth.serviceInitializationError";
    case AuthErrorCode.NETWORK_ERROR:
      return "errors:common.network";
    case AuthErrorCode.EMAIL_SEND_ERROR:
      return "errors:auth.emailSendError";
    case AuthErrorCode.RATE_LIMIT_ERROR:
      return "errors:auth.rateLimit";
    case AuthErrorCode.INTERNAL_ERROR:
      return "errors:common.unknown";
    case AuthErrorCode.UNKNOWN_ERROR:
      return "errors:common.unknown";
    default:
      return "errors:common.unknown";
  }
};

/**
 * Translation keys for error actions
 */
const getErrorActionKey = (code: AuthErrorCode): string | undefined => {
  switch (code) {
    case AuthErrorCode.VALIDATION_ERROR:
      return "errors:auth.validationErrorAction";
    case AuthErrorCode.EMAIL_VALIDATION_ERROR:
      return "errors:auth.emailValidationErrorAction";
    case AuthErrorCode.CONFIGURATION_ERROR:
      return "errors:auth.configurationErrorAction";
    case AuthErrorCode.SERVICE_INITIALIZATION_ERROR:
      return "errors:auth.serviceInitializationErrorAction";
    case AuthErrorCode.NETWORK_ERROR:
      return "errors:auth.networkErrorAction";
    case AuthErrorCode.EMAIL_SEND_ERROR:
      return "errors:auth.emailSendErrorAction";
    case AuthErrorCode.RATE_LIMIT_ERROR:
      return "errors:auth.rateLimitErrorAction";
    default:
      return undefined;
  }
};

/**
 * Maps an API error code string to AuthErrorCode.
 */
export function parseAuthErrorCode(code: string): AuthErrorCode {
  // Check if code exists in our enum
  if (Object.values(AuthErrorCode).includes(code as AuthErrorCode)) {
    return code as AuthErrorCode;
  }
  return AuthErrorCode.UNKNOWN_ERROR;
}

/**
 * Gets comprehensive error information for a given error code
 *
 * @param code - Error code from the authentication API
 * @returns Error information for UI display
 *
 * @example
 * ```typescript
 * const errorInfo = getAuthErrorInfo("EMAIL_VALIDATION_ERROR");
 * if (errorInfo.category === AuthErrorCategory.VALIDATION) {
 *   // Display inline below email field
 * } else {
 *   // Display as toast
 * }
 * ```
 */
export function getAuthErrorInfo(code: string): AuthErrorInfo {
  const errorCode = parseAuthErrorCode(code);
  const category = ERROR_CATEGORY_MAP[errorCode];
  const messageKey = getErrorMessageKey(errorCode);
  const actionKey = getErrorActionKey(errorCode);
  
  const message = i18n.t(messageKey);
  const action = actionKey ? i18n.t(actionKey) : undefined;

  // Determine if error is retryable
  const retryable = category === AuthErrorCategory.TRANSIENT ||
                    category === AuthErrorCategory.RATE_LIMIT;

  // Determine field name for validation errors
  let fieldName: "email" | "code" | undefined;
  if (category === AuthErrorCategory.VALIDATION) {
    if (errorCode === AuthErrorCode.VALIDATION_ERROR ||
        errorCode === AuthErrorCode.EMAIL_VALIDATION_ERROR) {
      fieldName = "email";
    }
  }

  // Build result conditionally to satisfy exactOptionalPropertyTypes
  const result: AuthErrorInfo = {
    category,
    message,
    retryable,
  };
  if (action !== undefined) result.action = action;
  if (fieldName !== undefined) result.fieldName = fieldName;
  return result;
}

/**
 * Extracts error information from an API error object.
 *
 * @param error - Error thrown by an authentication request
 * @returns Error information for display, or null if not a recognized error
 *
 * @example
 * ```typescript
 * try {
 *   await signIn("resend-otp", { email });
 * } catch (error) {
 *   const errorInfo = extractAuthError(error);
 *   if (errorInfo) {
 *     // Handle the error
 *   }
 * }
 * ```
 */
export function extractAuthError(error: unknown): AuthErrorInfo | null {
  if (error && typeof error === "object") {
    const err = error as any;

    // tRPC and Better Auth errors may expose a structured code.
    if (err.data && typeof err.data === "object") {
      const code = err.data.code || err.data.message;
      if (code) {
        return getAuthErrorInfo(code);
      }
    }

    // Try to extract from error message
    if (err.message && typeof err.message === "string") {
      // Check for specific error patterns in message
      if (err.message.includes("InvalidAccountId") || err.message.includes("INVALID_ACCOUNT_ID")) {
        return getAuthErrorInfo("INVALID_ACCOUNT_ID");
      }
      if (err.message.includes("InvalidSecret") || err.message.includes("INVALID_SECRET")) {
        return getAuthErrorInfo("INVALID_SECRET");
      }
      if (err.message.includes("EMAIL_VALIDATION_ERROR")) {
        return getAuthErrorInfo("EMAIL_VALIDATION_ERROR");
      }
      if (err.message.includes("RATE_LIMIT_ERROR")) {
        return getAuthErrorInfo("RATE_LIMIT_ERROR");
      }
      if (err.message.includes("NETWORK_ERROR")) {
        return getAuthErrorInfo("NETWORK_ERROR");
      }
      if (err.message.includes("CONFIGURATION_ERROR")) {
        return getAuthErrorInfo("CONFIGURATION_ERROR");
      }
    }
  }

  // Fallback to unknown error
  return getAuthErrorInfo("UNKNOWN_ERROR");
}

/**
 * Formats an error for display based on its category
 *
 * @param errorInfo - Error information from getAuthErrorInfo
 * @returns Formatted error object for UI components
 */
export interface FormattedError {
  /** Primary error message */
  message: string;
  /** Optional secondary message or action */
  description?: string;
  /** Error severity for styling */
  severity: "error" | "warning" | "info";
  /** Display location */
  displayAs: "inline" | "toast";
}

export function formatAuthError(errorInfo: AuthErrorInfo): FormattedError {
  let severity: "error" | "warning" | "info" = "error";
  let displayAs: "inline" | "toast" = "toast";

  switch (errorInfo.category) {
    case AuthErrorCategory.VALIDATION:
      severity = "error";
      displayAs = "inline";
      break;
    case AuthErrorCategory.SYSTEM:
      severity = "error";
      displayAs = "toast";
      break;
    case AuthErrorCategory.TRANSIENT:
      severity = "warning";
      displayAs = "toast";
      break;
    case AuthErrorCategory.RATE_LIMIT:
      severity = "warning";
      displayAs = "toast";
      break;
    case AuthErrorCategory.UNKNOWN:
      severity = "error";
      displayAs = "toast";
      break;
  }

  // Build result conditionally to satisfy exactOptionalPropertyTypes
  const result: FormattedError = {
    message: errorInfo.message,
    severity,
    displayAs,
  };
  if (errorInfo.action !== undefined) result.description = errorInfo.action;
  return result;
}
