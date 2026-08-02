// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * tRPC API Client
 *
 * Pre-configured API client for tRPC backend integration.
 * Connects to the backend using tRPC HTTP pattern.
 *
 * @module lib/api/trpc
 */

import { ApiClient } from "./client";
import { apiConfig } from "./config";
import { handleUnauthorized } from "./handle-unauthorized";

const TRPC_PREFIX = "/api/trpc";

/**
 * Pre-configured tRPC API client instance
 *
 * Usage:
 * ```typescript
 * import { apiClient } from '@/lib/api/trpc';
 *
 * // Direct API call
 * const result = await apiClient.get('/api/...');
 *
 * // tRPC style call
 * const result = await trpcQuery('auth', 'me');
 * ```
 */
export const apiClient = new ApiClient({
  baseUrl: apiConfig.baseUrl,
  timeout: 30000,
});

/**
 * tRPC Success Response structure
 * Note: tRPC HTTP protocol wraps data in { json: ... }
 */
interface TrpcSuccessResponse<T> {
  result: {
    data: {
      json: T;
    };
  };
}

/**
 * tRPC Error Response structure
 * Note: tRPC returns errors as HTTP 200 with error body!
 * The error can be either:
 * - Direct: { error: { message, code, data } }
 * - Wrapped in json: { error: { json: { message, code, data } } }
 */
interface TrpcErrorInner {
  message: string;
  code: number;
  data?: {
    code: string;
    httpStatus?: number;
    path?: string;
    zodError?: unknown;
  };
}

interface TrpcErrorResponse {
  error: TrpcErrorInner | { json: TrpcErrorInner };
}

/**
 * Combined tRPC Response type
 */
type TrpcResponse<T> = TrpcSuccessResponse<T> | TrpcErrorResponse;

/**
 * Redirect to login when session has expired.
 * Delegates to handleUnauthorized which clears the session before redirecting.
 */
function redirectOnUnauthorized(error: TrpcErrorInner): void {
  if (error.data?.httpStatus === 401 || error.data?.code === "UNAUTHORIZED") {
    handleUnauthorized();
  }
}

/**
 * Type guard to check if response is a tRPC error
 */
function isTrpcError(response: unknown): response is TrpcErrorResponse {
  return (
    typeof response === "object" && response !== null && "error" in response
  );
}

/**
 * Extract the inner error from tRPC error response
 * Handles both direct and json-wrapped formats
 */
function extractTrpcError(response: TrpcErrorResponse): TrpcErrorInner {
  const error = response.error;
  // Check if error is wrapped in json
  if ("json" in error && typeof error.json === "object") {
    return error.json as TrpcErrorInner;
  }
  return error as TrpcErrorInner;
}

/**
 * tRPC Query helper - for GET operations
 *
 * Converts router.procedure pattern to HTTP GET request with query params.
 * Automatically unwraps the tRPC response structure to return just the data.
 *
 * @example
 * ```typescript
 * // GET /api/trpc/auth.me
 * const user = await trpcQuery('auth', 'me');
 *
 * // GET /api/trpc/vault.get?input={"vaultId":"123"}
 * const vault = await trpcQuery('vault', 'get', { vaultId: '123' });
 * ```
 */
export async function trpcQuery<T>(
  router: string,
  procedure: string,
  input?: Record<string, unknown>,
): Promise<T> {
  const params = input
    ? `?input=${encodeURIComponent(JSON.stringify({ json: input }))}`
    : "";
  const response = await apiClient.get<TrpcResponse<T>>(
    `${TRPC_PREFIX}/${router}.${procedure}${params}`,
  );

  // Check for tRPC error response (HTTP 200 with error body)
  if (isTrpcError(response)) {
    const error = extractTrpcError(response);
    redirectOnUnauthorized(error);
    throw {
      code: error.data?.code || "TRPC_ERROR",
      message: error.message || "An error occurred",
      statusCode: error.data?.httpStatus || 500,
      details: error.data,
    };
  }

  return response.result.data.json;
}

/**
 * tRPC Mutation helper - for POST/PUT/DELETE operations
 *
 * Converts router.procedure pattern to HTTP POST request with JSON body.
 * Automatically unwraps the tRPC response structure to return just the data.
 *
 * @example
 * ```typescript
 * // POST /api/trpc/vault.create with body
 * const vault = await trpcMutation('vault', 'create', { name: 'My Vault' });
 *
 * // POST /api/trpc/credentials.save
 * await trpcMutation('credentials', 'save', { vaultId: '123', data: encrypted });
 * ```
 */
export async function trpcMutation<T>(
  router: string,
  procedure: string,
  input?: unknown,
  options?: { timeoutMs?: number },
): Promise<T> {
  const response = await apiClient.post<TrpcResponse<T>>(
    `${TRPC_PREFIX}/${router}.${procedure}`,
    { json: input },
    undefined,
    options?.timeoutMs,
  );

  // Check for tRPC error response (HTTP 200 with error body)
  if (isTrpcError(response)) {
    const error = extractTrpcError(response);
    redirectOnUnauthorized(error);
    throw {
      code: error.data?.code || "TRPC_ERROR",
      message: error.message || "An error occurred",
      statusCode: error.data?.httpStatus || 500,
      details: error.data,
    };
  }

  return response.result.data.json;
}

/**
 * Check if tRPC API is configured
 */
export const isTrpcConfigured = (): boolean => {
  return Boolean(apiConfig.baseUrl);
};

/**
 * Get tRPC configuration details
 *
 * Returns current configuration for the tRPC client.
 * Used by test utilities to resolve the correct base URL.
 */
export const getTrpcConfig = () => ({
  baseUrl: apiConfig.baseUrl,
  prefix: TRPC_PREFIX,
});
