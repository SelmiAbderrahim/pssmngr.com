// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Language Sync Utility
 *
 * Handles synchronization between i18n language changes and API cache.
 * When the user changes language, this invalidates all queries to refetch
 * with the new Accept-Language header, ensuring translated error messages.
 *
 * @module lib/api/language-sync
 */

import i18n from "@/i18n";
import { queryClient } from "@/lib/query-client";

let isInitialized = false;

/**
 * Initialize language change listener
 *
 * Listens for language changes and invalidates all queries to refetch
 * with the new Accept-Language header. This ensures:
 * - Error messages are in the user's selected language
 * - Any translated backend content is refreshed
 *
 * @example
 * ```typescript
 * // In main.tsx, after i18n initialization
 * import { initLanguageSync } from '@/lib/api/language-sync';
 * initLanguageSync();
 * ```
 */
export function initLanguageSync(): void {
  // Prevent double initialization
  if (isInitialized) {
    return;
  }

  i18n.on("languageChanged", (newLanguage: string) => {
    if (import.meta.env.DEV) {
      console.debug(`[i18n] Language changed to: ${newLanguage}, invalidating queries`);
    }

    // Invalidate all queries to refetch with new Accept-Language header
    // This ensures error messages and any translated content is updated
    queryClient.invalidateQueries();
  });

  isInitialized = true;
}

/**
 * Get current API language
 *
 * Returns the language that will be sent in Accept-Language header.
 * Useful for debugging or display purposes.
 */
export function getApiLanguage(): string {
  if (i18n.isInitialized && i18n.language) {
    return i18n.language;
  }
  return navigator.language?.split("-")[0] || "en";
}
