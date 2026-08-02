// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Global API Configuration
 *
 * Centralized configuration for all API requests.
 * Single source of truth for API settings across the application.
 *
 * @module lib/api/config
 */

import i18n from "@/i18n";

/**
 * Resolve API base URL at runtime.
 *
 * - Development (localhost): uses VITE_API_URL from .env
 * - Production (non-localhost): uses same-origin (nginx proxies /api/ to backend)
 *
 * This prevents stale build-time localhost URLs from being used in production.
 */
function getApiBaseUrl(): string {
  const envUrl = import.meta.env.VITE_API_URL;

  if (envUrl) {
    const isEnvLocalhost =
      envUrl.includes("localhost") || envUrl.includes("127.0.0.1");
    const isBrowserLocalhost =
      typeof window !== "undefined" &&
      (window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1");

    // Stale build-time value: env points to localhost but browser is on a real domain
    if (isEnvLocalhost && !isBrowserLocalhost) {
      return typeof window !== "undefined" ? window.location.origin : envUrl;
    }

    // Localhost env on a localhost browser (dev): honor the configured backend
    // port from VITE_API_URL rather than the dev server origin.
    return envUrl;
  }

  // No VITE_API_URL: use same-origin (nginx proxies /api/)
  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  return "";
}

/**
 * API Configuration object
 *
 * Contains all settings for API communication:
 * - baseUrl: Backend API endpoint
 * - timeout: Request timeout in milliseconds
 * - credentials: Cookie handling for cross-origin requests
 * - headers: Default headers for all requests
 */
export const apiConfig = {
  /** Base URL for API requests — resolved dynamically at runtime */
  baseUrl: getApiBaseUrl(),

  /** Request timeout in milliseconds */
  timeout: 30000,

  /** Credentials mode for fetch - 'include' sends cookies with cross-origin requests */
  credentials: "include" as RequestCredentials,

  /** Default headers for all API requests */
  headers: {
    "Content-Type": "application/json",
  },
} as const;

/**
 * Get full URL for an API endpoint
 *
 * @param path - API endpoint path (e.g., '/api/v1/projects')
 * @returns Full URL with base URL prepended
 *
 * @example
 * getApiUrl('/api/v1/projects') // => 'http://localhost:39291/api/v1/projects'
 */
export const getApiUrl = (path: string): string => {
  // Ensure path starts with /
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${apiConfig.baseUrl}${normalizedPath}`;
};

/**
 * Create fetch options with default configuration
 *
 * @param options - Additional fetch options to merge
 * @returns Merged fetch options with defaults applied
 */
export const createFetchOptions = (
  options: RequestInit = {}
): RequestInit => {
  const { headers: optionHeaders, ...restOptions } = options;
  return {
    credentials: apiConfig.credentials,
    ...restOptions,
    headers: {
      ...apiConfig.headers,
      ...(optionHeaders as Record<string, string>),
    },
  };
};

/**
 * Type-safe environment check for API URL configuration
 */
export const isApiConfigured = (): boolean => {
  return Boolean(import.meta.env.VITE_API_URL);
};

/**
 * Get current API configuration (read-only)
 */
export const getApiConfig = () => ({ ...apiConfig });

/**
 * Get current language for API requests
 *
 * Returns the language that will be sent in Accept-Language header.
 * This is called at request time to ensure the current language is used.
 *
 * Priority: i18n language > browser language > default 'en'
 */
export function getCurrentLanguage(): string {
  // Check if running in browser and i18n is initialized
  if (typeof window !== "undefined" && i18n.isInitialized && i18n.language) {
    return i18n.language;
  }
  // Fallback to browser language or 'en'
  if (typeof navigator !== "undefined") {
    return navigator.language?.split("-")[0] || "en";
  }
  return "en";
}
