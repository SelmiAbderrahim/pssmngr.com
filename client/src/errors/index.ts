// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/** Shared client error types and privacy-preserving normalization helpers. */

import type { AppError } from "@/types";

export const ERROR_CODES = {
  NETWORK_ERROR: "NETWORK_ERROR",
  CONNECTION_TIMEOUT: "CONNECTION_TIMEOUT",
  API_ERROR: "API_ERROR",
  SERVER_ERROR: "SERVER_ERROR",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  TOKEN_EXPIRED: "TOKEN_EXPIRED",
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  INVALID_INPUT: "INVALID_INPUT",
  MISSING_REQUIRED_FIELD: "MISSING_REQUIRED_FIELD",
  DATABASE_ERROR: "DATABASE_ERROR",
  RECORD_NOT_FOUND: "RECORD_NOT_FOUND",
  DUPLICATE_RECORD: "DUPLICATE_RECORD",
  CONSTRAINT_VIOLATION: "CONSTRAINT_VIOLATION",
  CONFIG_ERROR: "CONFIG_ERROR",
  INVALID_CONFIG: "INVALID_CONFIG",
  UNKNOWN_ERROR: "UNKNOWN_ERROR",
  INTERNAL_SERVER_ERROR: "INTERNAL_SERVER_ERROR",
  CANCELLED: "CANCELLED",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export class ApplicationError extends Error implements AppError {
  public readonly code: ErrorCode;
  public readonly details?: unknown;
  public readonly timestamp: number;
  public readonly userId?: string;
  public readonly requestId?: string;
  public readonly recoverable: boolean;
  public readonly userMessage?: string;

  constructor({
    code,
    message,
    details,
    userId,
    requestId,
    recoverable = false,
    userMessage,
    cause,
  }: {
    code: ErrorCode;
    message: string;
    details?: unknown;
    userId?: string;
    requestId?: string;
    recoverable?: boolean;
    userMessage?: string;
    cause?: Error;
  }) {
    super(message);
    if (cause) {
      Object.defineProperty(this, "cause", {
        configurable: true,
        value: cause,
      });
    }
    this.name = "ApplicationError";
    this.code = code;
    this.timestamp = Date.now();
    this.recoverable = recoverable;
    if (details !== undefined) this.details = details;
    if (userId !== undefined) this.userId = userId;
    if (requestId !== undefined) this.requestId = requestId;
    if (userMessage !== undefined) this.userMessage = userMessage;
  }

  toJSON(): AppError {
    const result: AppError = {
      code: this.code,
      message: this.message,
      timestamp: this.timestamp,
    };
    if (this.details !== undefined) result.details = this.details;
    if (this.stack !== undefined) result.stack = this.stack;
    if (this.userId !== undefined) result.userId = this.userId;
    if (this.requestId !== undefined) result.requestId = this.requestId;
    return result;
  }

  getUserMessage(): string {
    if (this.userMessage) return this.userMessage;

    switch (this.code) {
      case ERROR_CODES.NETWORK_ERROR:
      case ERROR_CODES.CONNECTION_TIMEOUT:
        return "Network connection error. Check your connection and try again.";
      case ERROR_CODES.UNAUTHORIZED:
        return "Log in to continue.";
      case ERROR_CODES.FORBIDDEN:
        return "You do not have permission to perform this action.";
      case ERROR_CODES.TOKEN_EXPIRED:
        return "Your session has expired. Log in again.";
      case ERROR_CODES.VALIDATION_ERROR:
      case ERROR_CODES.INVALID_INPUT:
        return "Check your input and try again.";
      default:
        return "An unexpected error occurred. Try again.";
    }
  }

  isRecoverable(): boolean {
    return (
      this.recoverable ||
      this.code === ERROR_CODES.NETWORK_ERROR ||
      this.code === ERROR_CODES.CONNECTION_TIMEOUT ||
      this.code === ERROR_CODES.SERVER_ERROR
    );
  }
}

export const ErrorFactory = {
  networkError(message = "Network connection failed"): ApplicationError {
    return new ApplicationError({
      code: ERROR_CODES.NETWORK_ERROR,
      message,
      recoverable: true,
      userMessage: "Network connection error. Check your connection and try again.",
    });
  },

  apiError(statusCode: number, message = `API error: ${statusCode}`): ApplicationError {
    return new ApplicationError({
      code: statusCode >= 500 ? ERROR_CODES.SERVER_ERROR : ERROR_CODES.API_ERROR,
      message,
      details: { statusCode },
      recoverable: statusCode >= 500,
      userMessage:
        statusCode >= 500
          ? "Server error. Try again later."
          : "Request failed. Check your input and try again.",
    });
  },
};

export const ErrorHandler = {
  normalize(error: unknown): ApplicationError {
    if (error instanceof ApplicationError) return error;

    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      if (message.includes("fetch") || message.includes("network")) {
        return ErrorFactory.networkError(error.message);
      }
      if (message.includes("timeout")) {
        return new ApplicationError({
          code: ERROR_CODES.CONNECTION_TIMEOUT,
          message: error.message,
          recoverable: true,
          userMessage: "Request timed out. Try again.",
        });
      }
      return new ApplicationError({
        code: ERROR_CODES.UNKNOWN_ERROR,
        message: error.message,
        cause: error,
        userMessage: "An unexpected error occurred.",
      });
    }

    return new ApplicationError({
      code: ERROR_CODES.UNKNOWN_ERROR,
      message: typeof error === "string" ? error : "Unknown error",
      userMessage: "An unexpected error occurred.",
    });
  },

  shouldReport(error: ApplicationError): boolean {
    const nonReportableCodes: readonly ErrorCode[] = [
      ERROR_CODES.VALIDATION_ERROR,
      ERROR_CODES.UNAUTHORIZED,
      ERROR_CODES.FORBIDDEN,
      ERROR_CODES.TOKEN_EXPIRED,
      ERROR_CODES.CANCELLED,
    ];
    return !nonReportableCodes.includes(error.code);
  },

  /** Log classification only; messages, details, and context may contain secrets. */
  log(error: ApplicationError, _context?: Record<string, unknown>): void {
    console.error("[Error]", {
      code: error.code,
      timestamp: error.timestamp,
      recoverable: error.isRecoverable(),
    });
  },
};

export interface ErrorBoundaryState {
  hasError: boolean;
  error: ApplicationError | null;
  errorInfo: unknown;
}

export interface ErrorFallbackProps {
  error: ApplicationError;
  resetError: () => void;
  componentStack?: string;
}

export type { AppError } from "@/types";
