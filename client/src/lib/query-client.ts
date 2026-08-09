// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Shared Query Client
 *
 * Centralized QueryClient instance for React Query.
 * Exported for use in language sync and other utilities.
 *
 * @module lib/query-client
 */

import { QueryClient } from "@tanstack/react-query";

/**
 * Shared QueryClient instance
 *
 * Configuration:
 * - 5 minute stale time for queries
 * - Retry up to 3 times for 5xx errors
 * - No retry for 4xx errors
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: (failureCount, error) => {
        // Don't retry on 4xx errors
        if (error && typeof error === "object" && "status" in error) {
          const status = error.status as number;
          return status >= 500 && failureCount < 3;
        }
        return failureCount < 3;
      },
    },
  },
});
