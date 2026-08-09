// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * API Layer Exports
 *
 * Centralized exports for API client functionality.
 *
 * @module lib/api
 */

// Global API configuration
export {
  apiConfig,
  getApiUrl,
  createFetchOptions,
  isApiConfigured,
  getApiConfig,
  getCurrentLanguage,
} from "./config";

// Base API client
export { ApiClient, isApiError } from "./client";
export type { ApiClientConfig, RequestOptions, ApiError } from "./client";

// tRPC client
export {
  apiClient,
  trpcQuery,
  trpcMutation,
  isTrpcConfigured,
} from "./trpc";

// Unauthorized session handler
export { handleUnauthorized } from "./handle-unauthorized";

// Language sync utilities for Accept-Language header
export { initLanguageSync, getApiLanguage } from "./language-sync";

// API error types and utilities
export {
  ApiError as ApiErrorClass,
  isApiError as isApiErrorType,
  isApiErrorLike,
  toApiError,
  AUTH_ERROR_CODES,
  PERMISSION_ERROR_CODES,
  CLIENT_ERROR_CODES,
  SERVER_ERROR_CODES,
} from "./types";
export type { ApiErrorResponse, ValidationError } from "./types";
