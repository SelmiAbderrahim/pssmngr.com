// Copyright (c) 2026 Password Manager contributors
/**
 * Application Configuration
 *
 * Centralized configuration using environment variables.
 * Provides type-safe access to environment-specific settings.
 *
 * @module lib/config
 */

import { apiConfig } from "./api/config";

/**
 * Application configuration object
 * All values are loaded from environment variables with safe defaults
 */
export const config = {
  /**
   * Base site URL (from VITE_SITE_URL environment variable)
   * Used for absolute URLs in SEO meta tags, sitemaps, and structured data
   *
   * @example "https://pssmngr.com"
   * @default "https://pssmngr.com"
   */
  siteUrl:
    import.meta.env.VITE_SITE_URL ||
    (import.meta.env.DEV
      ? "http://localhost:5173"
      : "https://pssmngr.com"),

  /**
   * API configuration (Password Manager Dashboard)
   * Used for vault management and authentication
   */
  api: {
    /** API base URL — resolved dynamically via apiConfig */
    apiUrl: apiConfig.baseUrl,
    /** API request timeout in ms */
    timeout: 30000,
    /** Whether API integration is configured */
    isConfigured: Boolean(import.meta.env.VITE_API_URL),
  },

  /**
   * Environment mode
   * Automatically detected from Vite
   */
  isDev: import.meta.env.DEV,
  isProd: import.meta.env.PROD,
  mode: import.meta.env.MODE,
} as const;

/**
 * Validate required environment variables on module load
 * Logs warnings in development to catch configuration issues early
 */
if (import.meta.env.DEV) {
  if (!config.api.isConfigured) {
    console.warn(
      "[Config] VITE_API_URL is not set. Using same-origin API requests"
    );
  }
}

/**
 * Type for config object (for external imports)
 */
export type Config = typeof config;
