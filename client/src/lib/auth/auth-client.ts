// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Better-Auth Client
 *
 * Centralized auth client for Password Manager dashboard.
 * Connects to the Password Manager backend API.
 * Uses global API config for consistent settings.
 */

import { createAuthClient } from "better-auth/react";
import {
  twoFactorClient,
  organizationClient,
} from "better-auth/client/plugins";
import { passkeyClient } from "@better-auth/passkey/client";
import { apiConfig, getCurrentLanguage } from "../api/config";

if (import.meta.env.DEV && !import.meta.env.VITE_API_URL) {
  console.warn(
    "[Auth] VITE_API_URL not configured - using default:",
    apiConfig.baseUrl,
  );
}

export const authClient = createAuthClient({
  baseURL: apiConfig.baseUrl,
  fetchOptions: {
    credentials: apiConfig.credentials,
    /**
     * Dynamic header injection via onRequest hook
     *
     * This hook is called before every request, allowing us to add
     * the Accept-Language header with the current i18n language.
     * This ensures the backend returns localized error messages.
     */
    onRequest: (context) => {
      // Get current language at request time (not at client creation time)
      const language = getCurrentLanguage();

      // Create new headers with Accept-Language
      const headers = new Headers(context.headers);
      headers.set("Accept-Language", language);

      // Return updated context
      return {
        ...context,
        headers,
      };
    },
  },
  plugins: [twoFactorClient(), organizationClient(), passkeyClient()],
});

// Export commonly used auth functions

export const { signIn, signOut, signUp, useSession, getSession } =
  authClient as any;

// Type exports for use across the app
export type Session = Awaited<ReturnType<typeof getSession>>;
