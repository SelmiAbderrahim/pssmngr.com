// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { toast } from "sonner";
import { useAuthError, useRetry } from "../useAuthError";

// Mock authErrors utilities
const mockExtractAuthError = vi.fn();
const mockFormatAuthError = vi.fn();

vi.mock("@/lib/authErrors", () => ({
  extractAuthError: (...args: unknown[]) => mockExtractAuthError(...args),
  formatAuthError: (...args: unknown[]) => mockFormatAuthError(...args),
  AuthErrorCategory: {
    VALIDATION: "validation",
    SYSTEM: "system",
    TRANSIENT: "transient",
    RATE_LIMIT: "rate_limit",
    UNKNOWN: "unknown",
  },
}));

const makeErrorInfo = (
  overrides: Record<string, unknown> = {}
) => ({
  category: "unknown",
  message: "Something went wrong",
  retryable: false,
  ...overrides,
});

const makeFormattedError = (
  overrides: Record<string, unknown> = {}
) => ({
  message: "Formatted error",
  severity: "error" as const,
  displayAs: "toast" as const,
  ...overrides,
});

describe("useAuthError", () => {
  beforeEach(() => {
    mockExtractAuthError.mockReset();
    mockFormatAuthError.mockReset();
    vi.mocked(toast.error).mockClear();
  });

  it("returns null fieldError initially", () => {
    const { result } = renderHook(() => useAuthError());
    expect(result.current.fieldError).toBeNull();
  });

  it("returns all expected methods", () => {
    const { result } = renderHook(() => useAuthError());
    expect(result.current.handleAuthError).toBeTypeOf("function");
    expect(result.current.clearError).toBeTypeOf("function");
    expect(result.current.clearFieldError).toBeTypeOf("function");
    expect(result.current.hasFieldError).toBeTypeOf("function");
    expect(result.current.getFieldErrorMessage).toBeTypeOf("function");
  });

  describe("handleAuthError", () => {
    it("sets fieldError for validation errors with fieldName", () => {
      const errorInfo = makeErrorInfo({
        category: "validation",
        message: "Invalid email",
        fieldName: "email",
      });
      const formatted = makeFormattedError({
        message: "Invalid email address",
        displayAs: "inline",
      });
      mockExtractAuthError.mockReturnValue(errorInfo);
      mockFormatAuthError.mockReturnValue(formatted);

      const { result } = renderHook(() => useAuthError());
      act(() => {
        result.current.handleAuthError(new Error("bad email"));
      });
      expect(result.current.fieldError).toEqual({
        field: "email",
        message: "Invalid email address",
      });
      expect(toast.error).not.toHaveBeenCalled();
    });

    it("shows toast for validation errors without fieldName", () => {
      const errorInfo = makeErrorInfo({
        category: "validation",
        message: "Validation failed",
      });
      const formatted = makeFormattedError({ message: "Validation failed" });
      mockExtractAuthError.mockReturnValue(errorInfo);
      mockFormatAuthError.mockReturnValue(formatted);

      const { result } = renderHook(() => useAuthError());
      act(() => {
        result.current.handleAuthError(new Error("validation"));
      });
      expect(result.current.fieldError).toBeNull();
      expect(toast.error).toHaveBeenCalled();
    });

    it("shows toast for unknown/system errors", () => {
      const errorInfo = makeErrorInfo({
        category: "system",
        message: "System error",
      });
      const formatted = makeFormattedError({ message: "System error occurred" });
      mockExtractAuthError.mockReturnValue(errorInfo);
      mockFormatAuthError.mockReturnValue(formatted);

      const { result } = renderHook(() => useAuthError());
      act(() => {
        result.current.handleAuthError(new Error("system"));
      });
      expect(result.current.fieldError).toBeNull();
      expect(toast.error).toHaveBeenCalled();
    });

    it("shows fallback toast when extractAuthError returns null", () => {
      mockExtractAuthError.mockReturnValue(null);

      const { result } = renderHook(() => useAuthError());
      act(() => {
        result.current.handleAuthError(new Error("unknown"));
      });
      expect(toast.error).toHaveBeenCalledWith(
        "An unexpected error occurred. Please try again."
      );
    });

    it("shows toast for transient errors", () => {
      const errorInfo = makeErrorInfo({
        category: "transient",
        message: "Network issue",
        retryable: true,
      });
      const formatted = makeFormattedError({
        message: "Network issue",
        severity: "warning",
      });
      mockExtractAuthError.mockReturnValue(errorInfo);
      mockFormatAuthError.mockReturnValue(formatted);

      const { result } = renderHook(() => useAuthError());
      act(() => {
        result.current.handleAuthError(new Error("transient"));
      });
      expect(toast.error).toHaveBeenCalled();
    });

    it("shows toast for rate limit errors", () => {
      const errorInfo = makeErrorInfo({
        category: "rate_limit",
        message: "Too many requests",
        retryable: true,
      });
      const formatted = makeFormattedError({
        message: "Too many requests",
        severity: "warning",
      });
      mockExtractAuthError.mockReturnValue(errorInfo);
      mockFormatAuthError.mockReturnValue(formatted);

      const { result } = renderHook(() => useAuthError());
      act(() => {
        result.current.handleAuthError(new Error("rate limit"));
      });
      expect(toast.error).toHaveBeenCalled();
    });
  });

  describe("clearError", () => {
    it("clears fieldError", () => {
      const errorInfo = makeErrorInfo({
        category: "validation",
        fieldName: "email",
      });
      const formatted = makeFormattedError({ message: "Invalid" });
      mockExtractAuthError.mockReturnValue(errorInfo);
      mockFormatAuthError.mockReturnValue(formatted);

      const { result } = renderHook(() => useAuthError());
      act(() => {
        result.current.handleAuthError(new Error("bad"));
      });
      expect(result.current.fieldError).not.toBeNull();

      act(() => {
        result.current.clearError();
      });
      expect(result.current.fieldError).toBeNull();
    });
  });

  describe("clearFieldError", () => {
    it("clears error for matching field", () => {
      const errorInfo = makeErrorInfo({
        category: "validation",
        fieldName: "email",
      });
      const formatted = makeFormattedError({ message: "Invalid email" });
      mockExtractAuthError.mockReturnValue(errorInfo);
      mockFormatAuthError.mockReturnValue(formatted);

      const { result } = renderHook(() => useAuthError());
      act(() => {
        result.current.handleAuthError(new Error("bad"));
      });
      expect(result.current.fieldError?.field).toBe("email");

      act(() => {
        result.current.clearFieldError("email");
      });
      expect(result.current.fieldError).toBeNull();
    });

    it("does not clear error for non-matching field", () => {
      const errorInfo = makeErrorInfo({
        category: "validation",
        fieldName: "email",
      });
      const formatted = makeFormattedError({ message: "Invalid email" });
      mockExtractAuthError.mockReturnValue(errorInfo);
      mockFormatAuthError.mockReturnValue(formatted);

      const { result } = renderHook(() => useAuthError());
      act(() => {
        result.current.handleAuthError(new Error("bad"));
      });

      act(() => {
        result.current.clearFieldError("code");
      });
      expect(result.current.fieldError).not.toBeNull();
      expect(result.current.fieldError?.field).toBe("email");
    });
  });

  describe("hasFieldError", () => {
    it("returns true when field matches current error", () => {
      const errorInfo = makeErrorInfo({
        category: "validation",
        fieldName: "email",
      });
      const formatted = makeFormattedError({ message: "Bad" });
      mockExtractAuthError.mockReturnValue(errorInfo);
      mockFormatAuthError.mockReturnValue(formatted);

      const { result } = renderHook(() => useAuthError());
      act(() => {
        result.current.handleAuthError(new Error("bad"));
      });
      expect(result.current.hasFieldError("email")).toBe(true);
    });

    it("returns false when field does not match", () => {
      const errorInfo = makeErrorInfo({
        category: "validation",
        fieldName: "email",
      });
      const formatted = makeFormattedError({ message: "Bad" });
      mockExtractAuthError.mockReturnValue(errorInfo);
      mockFormatAuthError.mockReturnValue(formatted);

      const { result } = renderHook(() => useAuthError());
      act(() => {
        result.current.handleAuthError(new Error("bad"));
      });
      expect(result.current.hasFieldError("code")).toBe(false);
    });

    it("returns false when no error is set", () => {
      const { result } = renderHook(() => useAuthError());
      expect(result.current.hasFieldError("email")).toBe(false);
    });
  });

  describe("getFieldErrorMessage", () => {
    it("returns message for matching field", () => {
      const errorInfo = makeErrorInfo({
        category: "validation",
        fieldName: "code",
      });
      const formatted = makeFormattedError({ message: "Invalid code" });
      mockExtractAuthError.mockReturnValue(errorInfo);
      mockFormatAuthError.mockReturnValue(formatted);

      const { result } = renderHook(() => useAuthError());
      act(() => {
        result.current.handleAuthError(new Error("bad"));
      });
      expect(result.current.getFieldErrorMessage("code")).toBe("Invalid code");
    });

    it("returns undefined for non-matching field", () => {
      const errorInfo = makeErrorInfo({
        category: "validation",
        fieldName: "code",
      });
      const formatted = makeFormattedError({ message: "Invalid code" });
      mockExtractAuthError.mockReturnValue(errorInfo);
      mockFormatAuthError.mockReturnValue(formatted);

      const { result } = renderHook(() => useAuthError());
      act(() => {
        result.current.handleAuthError(new Error("bad"));
      });
      expect(result.current.getFieldErrorMessage("email")).toBeUndefined();
    });

    it("returns undefined when no error is set", () => {
      const { result } = renderHook(() => useAuthError());
      expect(result.current.getFieldErrorMessage("email")).toBeUndefined();
    });
  });
});

describe("useRetry", () => {
  beforeEach(() => {
    mockExtractAuthError.mockReset();
  });

  it("has correct initial state", () => {
    const { result } = renderHook(() => useRetry());
    expect(result.current.retryCount).toBe(0);
    expect(result.current.isRetrying).toBe(false);
    expect(result.current.withRetry).toBeTypeOf("function");
    expect(result.current.resetRetry).toBeTypeOf("function");
  });

  it("accepts custom maxRetries", () => {
    const { result } = renderHook(() => useRetry(5));
    expect(result.current.retryCount).toBe(0);
  });

  it("resetRetry clears retry state", async () => {
    const { result } = renderHook(() => useRetry());

    // Execute a successful call to ensure clean state
    await act(async () => {
      await result.current.withRetry(async () => "ok");
    });
    expect(result.current.retryCount).toBe(0);
    expect(result.current.isRetrying).toBe(false);

    act(() => {
      result.current.resetRetry();
    });
    expect(result.current.retryCount).toBe(0);
    expect(result.current.isRetrying).toBe(false);
  });

  it("withRetry resolves on first success", async () => {
    const { result } = renderHook(() => useRetry());
    let value: string | undefined;

    await act(async () => {
      value = await result.current.withRetry(async () => "success");
    });

    expect(value).toBe("success");
    expect(result.current.retryCount).toBe(0);
    expect(result.current.isRetrying).toBe(false);
  });

  it("withRetry throws when error is not retryable", async () => {
    mockExtractAuthError.mockReturnValue({ retryable: false });
    const { result } = renderHook(() => useRetry());
    const error = new Error("Not retryable");

    await expect(
      act(async () => {
        await result.current.withRetry(async () => {
          throw error;
        });
      })
    ).rejects.toThrow("Not retryable");
  });
});
