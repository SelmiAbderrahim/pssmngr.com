// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Authentication Error Handling Hook
 *
 * Custom React hook for handling authentication errors with toast notifications
 * and form field validation display.
 *
 * @module useAuthError
 */

import { useState, useCallback } from "react";
import { toast } from "sonner";
import i18n from "@/i18n";
import {
  extractAuthError,
  formatAuthError,
  AuthErrorCategory,
  type AuthErrorInfo,
  type FormattedError,
} from "@/lib/authErrors";

/**
 * Error state for form fields
 */
export interface FieldError {
  /** Field name that has the error */
  field: "email" | "code";
  /** Error message to display */
  message: string;
}

/**
 * Return type for useAuthError hook
 */
export interface UseAuthErrorReturn {
  /** Current field-level error (for inline display) */
  fieldError: FieldError | null;
  /** Handle an error from an authentication request */
  handleAuthError: (error: unknown) => void;
  /** Clear all errors */
  clearError: () => void;
  /** Clear field-specific error */
  clearFieldError: (field: "email" | "code") => void;
  /** Check if a specific field has an error */
  hasFieldError: (field: "email" | "code") => boolean;
  /** Get error message for a specific field */
  getFieldErrorMessage: (field: "email" | "code") => string | undefined;
}

/**
 * Rate limit state for countdown timer
 */
interface RateLimitState {
  /** Remaining seconds until retry is allowed */
  remainingSeconds: number;
  /** Timer interval ID */
  timerId?: NodeJS.Timeout;
}

/**
 * Custom hook for handling authentication errors
 *
 * Provides comprehensive error handling with:
 * - Toast notifications for system/transient errors
 * - Inline field errors for validation errors
 * - Rate limit countdown timer
 * - Retry logic for recoverable errors
 *
 * @returns Error handling utilities
 *
 * @example
 * ```typescript
 * function LoginForm() {
 *   const { handleAuthError, fieldError, clearError } = useAuthError();
 *
 *   const handleSubmit = async (email: string) => {
 *     try {
 *       await signIn("resend-otp", { email });
 *     } catch (error) {
 *       handleAuthError(error);
 *     }
 *   };
 *
 *   return (
 *     <form>
 *       <input type="email" />
 *       {fieldError?.field === "email" && (
 *         <span className="text-destructive">{fieldError.message}</span>
 *       )}
 *     </form>
 *   );
 * }
 * ```
 */
export function useAuthError(): UseAuthErrorReturn {
  const [fieldError, setFieldError] = useState<FieldError | null>(null);
  const [rateLimitState, setRateLimitState] = useState<RateLimitState | null>(null);

  /**
   * Displays error as a toast notification
   */
  const showErrorToast = useCallback((formattedError: FormattedError, errorInfo: AuthErrorInfo) => {
    const toastOptions = {
      duration: errorInfo.retryable ? 6000 : 4000,
      style: {
        background: 'hsl(var(--background))',
        color: 'hsl(var(--foreground))',
        border: '1px solid hsl(var(--border))',
      },
    };

    if (errorInfo.category === AuthErrorCategory.RATE_LIMIT) {
      // Show rate limit toast with countdown
      toast.error(
        () => (
          <div className="flex flex-col gap-1">
            <p className="font-semibold">{formattedError.message}</p>
            {formattedError.description && (
              <p className="text-sm text-muted-foreground">{formattedError.description}</p>
            )}
            {rateLimitState && (
              <p className="text-xs text-muted-foreground mt-1">
                Retry in {rateLimitState.remainingSeconds}s
              </p>
            )}
          </div>
        ),
        toastOptions
      );
    } else if (errorInfo.retryable) {
      // Show transient error toast with retry suggestion
      toast.error(
        () => (
          <div className="flex flex-col gap-1">
            <p className="font-semibold">{formattedError.message}</p>
            {formattedError.description && (
              <p className="text-sm text-muted-foreground">{formattedError.description}</p>
            )}
          </div>
        ),
        toastOptions
      );
    } else {
      // Show regular error toast
      toast.error(
        () => (
          <div className="flex flex-col gap-1">
            <p className="font-semibold">{formattedError.message}</p>
            {formattedError.description && (
              <p className="text-sm text-muted-foreground">{formattedError.description}</p>
            )}
          </div>
        ),
        toastOptions
      );
    }
  }, [rateLimitState]);

  /**
   * Starts countdown timer for rate limiting
   */
  const startRateLimitTimer = useCallback((durationSeconds: number = 60) => {
    // Clear any existing timer
    if (rateLimitState?.timerId) {
      clearInterval(rateLimitState.timerId);
    }

    let remaining = durationSeconds;
    setRateLimitState({ remainingSeconds: remaining });

    const timerId = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(timerId);
        setRateLimitState(null);
      } else {
        setRateLimitState({ remainingSeconds: remaining, timerId });
      }
    }, 1000);

    setRateLimitState({ remainingSeconds: remaining, timerId });
  }, [rateLimitState]);

  /**
   * Main error handler for authentication errors
   */
  const handleAuthError = useCallback((error: unknown) => {
    // Extract error information
    const errorInfo = extractAuthError(error);
    if (!errorInfo) {
      // Fallback for completely unknown errors
      toast.error(i18n.t("auth:login.error.unknownError", "An unexpected error occurred. Please try again."));
      return;
    }

    // Format error for display
    const formattedError = formatAuthError(errorInfo);

    // Handle based on category
    switch (errorInfo.category) {
      case AuthErrorCategory.VALIDATION:
        // Display inline below form field
        if (errorInfo.fieldName) {
          setFieldError({
            field: errorInfo.fieldName,
            message: formattedError.message,
          });
        } else {
          // Fallback to toast if no field specified
          showErrorToast(formattedError, errorInfo);
        }
        break;

      case AuthErrorCategory.RATE_LIMIT:
        // Start countdown timer and show toast
        startRateLimitTimer(60);
        showErrorToast(formattedError, errorInfo);
        break;

      case AuthErrorCategory.TRANSIENT:
      case AuthErrorCategory.SYSTEM:
      case AuthErrorCategory.UNKNOWN:
      default:
        // Display as toast notification
        showErrorToast(formattedError, errorInfo);
        break;
    }

    // Log error in development
    if (import.meta.env.DEV) {
      console.error("[Auth Error]", {
        error,
        errorInfo,
        formattedError,
      });
    }
  }, [showErrorToast, startRateLimitTimer]);

  /**
   * Clear all errors
   */
  const clearError = useCallback(() => {
    setFieldError(null);
    if (rateLimitState?.timerId) {
      clearInterval(rateLimitState.timerId);
      setRateLimitState(null);
    }
  }, [rateLimitState]);

  /**
   * Clear error for specific field
   */
  const clearFieldError = useCallback((field: "email" | "code") => {
    setFieldError((current) => {
      if (current?.field === field) {
        return null;
      }
      return current;
    });
  }, []);

  /**
   * Check if field has error
   */
  const hasFieldError = useCallback((field: "email" | "code") => {
    return fieldError?.field === field;
  }, [fieldError]);

  /**
   * Get error message for field
   */
  const getFieldErrorMessage = useCallback((field: "email" | "code") => {
    if (fieldError?.field === field) {
      return fieldError.message;
    }
    return undefined;
  }, [fieldError]);

  return {
    fieldError,
    handleAuthError,
    clearError,
    clearFieldError,
    hasFieldError,
    getFieldErrorMessage,
  };
}

/**
 * Hook for retry logic with exponential backoff
 *
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * @returns Retry utilities
 */
export interface UseRetryReturn {
  /** Current retry count */
  retryCount: number;
  /** Whether currently retrying */
  isRetrying: boolean;
  /** Execute function with retry logic */
  withRetry: <T>(fn: () => Promise<T>) => Promise<T>;
  /** Reset retry state */
  resetRetry: () => void;
}

export function useRetry(maxRetries: number = 3): UseRetryReturn {
  const [retryCount, setRetryCount] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);

  const withRetry = useCallback(async <T,>(fn: () => Promise<T>): Promise<T> => {
    let lastError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        setIsRetrying(attempt > 0);
        setRetryCount(attempt);

        const result = await fn();

        // Success - reset state
        setIsRetrying(false);
        setRetryCount(0);
        return result;
      } catch (error) {
        lastError = error;

        // Check if error is retryable
        const errorInfo = extractAuthError(error);
        if (!errorInfo?.retryable || attempt >= maxRetries) {
          setIsRetrying(false);
          throw error;
        }

        // Exponential backoff: 1s, 2s, 4s, 8s
        const delay = Math.min(1000 * Math.pow(2, attempt), 8000);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    setIsRetrying(false);
    throw lastError;
  }, [maxRetries]);

  const resetRetry = useCallback(() => {
    setRetryCount(0);
    setIsRetrying(false);
  }, []);

  return {
    retryCount,
    isRetrying,
    withRetry,
    resetRetry,
  };
}
