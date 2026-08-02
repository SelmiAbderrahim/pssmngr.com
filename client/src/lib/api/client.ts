// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * API Client - Base HTTP client
 *
 * Centralized HTTP client for tRPC backend integration.
 * Provides authentication, error handling, and request management.
 *
 * @module lib/api/client
 */

import { getCurrentLanguage } from "./config";
import { handleUnauthorized } from "./handle-unauthorized";

/**
 * API Client Configuration
 */
export interface ApiClientConfig {
  /** Base URL for API requests */
  baseUrl: string;
  /** Request timeout in milliseconds */
  timeout?: number;
}

/**
 * Request options for API calls
 */
export interface RequestOptions {
  /** HTTP method */
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Request body (will be JSON stringified) */
  body?: unknown;
  /** Additional headers */
  headers?: Record<string, string>;
  /** AbortSignal for request cancellation */
  signal?: AbortSignal;
  /** Per-request timeout override (ms); falls back to the client default */
  timeoutMs?: number;
}

/**
 * Standardized API error structure
 */
export interface ApiError {
  /** Error code identifier */
  code: string;
  /** Human-readable error message */
  message: string;
  /** HTTP status code */
  statusCode: number;
  /** Additional error details */
  details?: unknown;
}

/**
 * Type guard to check if an error is an ApiError
 */
export function isApiError(error: unknown): error is ApiError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "message" in error &&
    "statusCode" in error
  );
}

/**
 * Base API Client
 *
 * Provides HTTP methods with:
 * - Cookie-based session authentication
 * - Timeout handling
 * - Standardized error responses
 * - AbortController support
 */
export class ApiClient {
  private config: Required<ApiClientConfig>;

  constructor(config: ApiClientConfig) {
    this.config = {
      timeout: 30000,
      ...config,
    };
  }

  /**
   * Get current base URL
   */
  getBaseUrl(): string {
    return this.config.baseUrl;
  }

  /**
   * Make an HTTP request
   */
  private async request<T>(
    endpoint: string,
    options: RequestOptions = {}
  ): Promise<T> {
    const { method = "GET", body, headers = {}, signal, timeoutMs } = options;

    const url = `${this.config.baseUrl}${endpoint}`;

    // Setup timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      timeoutMs ?? this.config.timeout
    );

    try {
      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          "Accept-Language": getCurrentLanguage(),
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: signal || controller.signal,
        credentials: "include",
      });

      // Redirect to login on session expiry (before generic error handler)
      if (response.status === 401) {
        handleUnauthorized();
        throw {
          code: "UNAUTHORIZED",
          message: "Session expired",
          statusCode: 401,
        } as ApiError;
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));

        // Handle tRPC error format: {error: {json: {message: "...", code: ..., data: {...}}}}
        const trpcError = errorData?.error?.json;
        const isErrorObject = typeof errorData?.error === "object" && errorData?.error !== null;

        const error: ApiError = {
          code: trpcError?.data?.code || errorData.code || `HTTP_${response.status}`,
          message:
            trpcError?.message ||
            errorData.message ||
            (typeof errorData.error === "string" ? errorData.error : null) ||
            response.statusText,
          statusCode: trpcError?.data?.httpStatus || response.status,
          details: trpcError?.data || errorData.details || (isErrorObject ? errorData.error : undefined),
        };
        throw error;
      }

      // Handle empty responses (204 No Content)
      if (response.status === 204) {
        return undefined as T;
      }

      return await response.json();
    } catch (error) {
      // Handle abort/timeout. The aborted fetch rejects with an AbortError,
      // but its constructor identity is not guaranteed to be DOMException
      // across runtimes (browser DOMException vs. undici/jsdom error), so we
      // detect it by name rather than relying on `instanceof DOMException`.
      if (
        error instanceof DOMException
          ? error.name === "AbortError"
          : typeof error === "object" &&
            error !== null &&
            (error as { name?: string }).name === "AbortError"
      ) {
        throw {
          code: "TIMEOUT",
          message: "Request timed out",
          statusCode: 408,
        } as ApiError;
      }

      // Handle network errors
      if (error instanceof TypeError && error.message === "Failed to fetch") {
        throw {
          code: "NETWORK_ERROR",
          message: "Network request failed. Please check your connection.",
          statusCode: 0,
        } as ApiError;
      }

      // Re-throw ApiErrors
      if (isApiError(error)) {
        throw error;
      }

      // Wrap unknown errors
      throw {
        code: "UNKNOWN_ERROR",
        message:
          error instanceof Error ? error.message : "An unknown error occurred",
        statusCode: 500,
      } as ApiError;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * GET request
   */
  get<T>(endpoint: string, signal?: AbortSignal): Promise<T> {
    return this.request<T>(endpoint, { method: "GET", signal });
  }

  /**
   * POST request
   */
  post<T>(
    endpoint: string,
    body?: unknown,
    signal?: AbortSignal,
    timeoutMs?: number,
  ): Promise<T> {
    return this.request<T>(endpoint, { method: "POST", body, signal, timeoutMs });
  }

  /**
   * PUT request
   */
  put<T>(endpoint: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    return this.request<T>(endpoint, { method: "PUT", body, signal });
  }

  /**
   * PATCH request
   */
  patch<T>(endpoint: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    return this.request<T>(endpoint, { method: "PATCH", body, signal });
  }

  /**
   * DELETE request
   */
  delete<T>(endpoint: string, signal?: AbortSignal): Promise<T> {
    return this.request<T>(endpoint, { method: "DELETE", signal });
  }
}
