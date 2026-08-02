// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { describe, expect, it, vi } from "vitest";

vi.mock("@/i18n", () => {
  const translations: Record<string, string> = {
    "errors:auth.validationError": "Please enter a valid email address",
    "errors:auth.validationErrorAction": "Check your email address and try again",
    "errors:auth.emailValidationError": "The email address format is invalid",
    "errors:auth.emailValidationErrorAction": "Check your email address format",
    "errors:auth.invalidAccountId": "Account not found",
    "errors:auth.invalidSecret": "Invalid password",
    "errors:auth.configurationError": "Email service unavailable",
    "errors:auth.configurationErrorAction": "Contact your instance administrator",
    "errors:auth.serviceInitializationError": "Service unavailable",
    "errors:auth.serviceInitializationErrorAction": "Try again in a few minutes",
    "errors:common.network": "Network error",
    "errors:auth.networkErrorAction": "Check your connection and retry",
    "errors:auth.emailSendError": "Could not send email",
    "errors:auth.emailSendErrorAction": "Try sending the email again",
    "errors:auth.rateLimit": "Too many requests",
    "errors:auth.rateLimitErrorAction": "Wait before retrying",
    "errors:common.unknown": "An unknown error occurred",
  };

  return {
    default: {
      t: (key: string) => translations[key] || key,
      language: "en",
      changeLanguage: vi.fn(),
    },
  };
});

import {
  AuthErrorCategory,
  AuthErrorCode,
  extractAuthError,
  formatAuthError,
  getAuthErrorInfo,
  parseAuthErrorCode,
} from "../authErrors";

describe("authErrors", () => {
  it("parses supported codes and rejects unknown codes", () => {
    expect(parseAuthErrorCode("RATE_LIMIT_ERROR")).toBe(
      AuthErrorCode.RATE_LIMIT_ERROR,
    );
    expect(parseAuthErrorCode("NOT_A_REAL_CODE")).toBe(
      AuthErrorCode.UNKNOWN_ERROR,
    );
  });

  it.each([
    ["EMAIL_VALIDATION_ERROR", AuthErrorCategory.VALIDATION, false],
    ["CONFIGURATION_ERROR", AuthErrorCategory.SYSTEM, false],
    ["NETWORK_ERROR", AuthErrorCategory.TRANSIENT, true],
    ["RATE_LIMIT_ERROR", AuthErrorCategory.RATE_LIMIT, true],
    ["UNKNOWN_ERROR", AuthErrorCategory.UNKNOWN, false],
  ])("categorizes %s", (code, category, retryable) => {
    const info = getAuthErrorInfo(code);
    expect(info.category).toBe(category);
    expect(info.retryable).toBe(retryable);
    expect(info.message).toBeTruthy();
  });

  it("uses instance-administrator guidance for configuration errors", () => {
    expect(getAuthErrorInfo("CONFIGURATION_ERROR").action).toBe(
      "Contact your instance administrator",
    );
  });

  it("associates email validation errors with the email field", () => {
    expect(getAuthErrorInfo("EMAIL_VALIDATION_ERROR").fieldName).toBe("email");
  });

  it("extracts a structured API error code", () => {
    const info = extractAuthError({
      data: { code: "EMAIL_VALIDATION_ERROR" },
    });
    expect(info?.category).toBe(AuthErrorCategory.VALIDATION);
  });

  it.each([
    ["Request failed: NETWORK_ERROR", AuthErrorCategory.TRANSIENT],
    ["Request failed: RATE_LIMIT_ERROR", AuthErrorCategory.RATE_LIMIT],
    ["Request failed: CONFIGURATION_ERROR", AuthErrorCategory.SYSTEM],
    ["Request failed: INVALID_SECRET", AuthErrorCategory.VALIDATION],
  ])("extracts a code embedded in an error message", (message, category) => {
    expect(extractAuthError({ message })?.category).toBe(category);
  });

  it("falls back safely for primitive and unrecognized errors", () => {
    expect(extractAuthError(null)?.category).toBe(AuthErrorCategory.UNKNOWN);
    expect(extractAuthError("network broke")?.category).toBe(
      AuthErrorCategory.UNKNOWN,
    );
    expect(extractAuthError({ message: "unexpected" })?.category).toBe(
      AuthErrorCategory.UNKNOWN,
    );
  });

  it.each([
    ["VALIDATION_ERROR", "inline", "error"],
    ["CONFIGURATION_ERROR", "toast", "error"],
    ["NETWORK_ERROR", "toast", "warning"],
    ["RATE_LIMIT_ERROR", "toast", "warning"],
  ])("formats %s for display", (code, displayAs, severity) => {
    expect(formatAuthError(getAuthErrorInfo(code))).toMatchObject({
      displayAs,
      severity,
    });
  });

  it("has a complete category mapping for every supported code", () => {
    for (const code of Object.values(AuthErrorCode)) {
      const info = getAuthErrorInfo(code);
      expect(info.category).toBeDefined();
      expect(info.message).toBeTruthy();
      expect(typeof info.retryable).toBe("boolean");
    }
  });
});
