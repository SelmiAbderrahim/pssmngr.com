// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Language Provider
 *
 * Manages language synchronization between:
 * - i18next (runtime state)
 * - localStorage (persistence for all users)
 * - Database (persistence for authenticated users - cross-device sync)
 *
 * Detection Priority:
 * - Authenticated: localStorage → DB (fills empty) → browser → default (en)
 * - Unauthenticated: localStorage → browser → default (en)
 *
 * Features:
 * - localStorage ALWAYS wins (user's explicit choice)
 * - DB fills localStorage only when empty (new device sync)
 * - Cross-tab sync via localStorage events
 * - Loading states for async operations
 * - RTL support for Arabic
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useCallback,
  useMemo,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useAuthState } from "@/providers/AuthProvider";
import {
  useUserLanguagePreference,
  useUpdateUserLanguage,
} from "@/hooks/useUserLanguage";
import {
  languages,
  supportedLangs,
  type SupportedLanguage,
} from "@/i18n";

interface LanguageContextValue {
  /** Current language code */
  language: SupportedLanguage;
  /** Language display info (name, direction, flag) */
  languageInfo: (typeof languages)[SupportedLanguage];
  /** Whether current language is RTL */
  isRTL: boolean;
  /** Change language (persists to localStorage and DB if authenticated) */
  changeLanguage: (lang: SupportedLanguage) => Promise<void>;
  /** List of supported languages */
  supportedLanguages: typeof supportedLangs;
  /** Whether language is being saved to DB */
  isSaving: boolean;
  /** Whether language is loading from DB */
  isLoading: boolean;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(
  undefined
);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const { i18n, t } = useTranslation();
  const { status } = useAuthState();
  const isAuthenticated = status === "authenticated";

  // Track if we've checked DB preference this session
  const [hasAppliedDbPreference, setHasAppliedDbPreference] = useState(false);

  // Database preference (only fetched when authenticated)
  const {
    data: dbLanguage,
    isLoading: isLoadingDb,
    isFetched: isDbFetched,
  } = useUserLanguagePreference();

  const updateDbLanguage = useUpdateUserLanguage();

  // Sync DB language to localStorage ONLY when localStorage is empty (new device/browser)
  // localStorage is the source of truth - user's explicit choice always wins
  useEffect(() => {
    if (
      isAuthenticated &&
      isDbFetched &&
      !isLoadingDb &&
      !hasAppliedDbPreference
    ) {
      const storedLang = typeof window !== "undefined"
        ? localStorage.getItem("i18nextLng")
        : null;

      // Only apply DB preference if localStorage is empty (new device scenario)
      if (!storedLang && dbLanguage && supportedLangs.includes(dbLanguage as SupportedLanguage)) {
        i18n.changeLanguage(dbLanguage);
        if (typeof window !== "undefined") {
          localStorage.setItem("i18nextLng", dbLanguage);
        }
      }
      setHasAppliedDbPreference(true);
    }
  }, [isAuthenticated, isDbFetched, isLoadingDb, dbLanguage, hasAppliedDbPreference, i18n]);

  // Reset when logged out
  useEffect(() => {
    if (!isAuthenticated) {
      setHasAppliedDbPreference(false);
    }
  }, [isAuthenticated]);

  // Cross-tab sync via localStorage storage event
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "i18nextLng" && e.newValue) {
        const newLang = e.newValue as SupportedLanguage;
        if (
          supportedLangs.includes(newLang) &&
          newLang !== i18n.language
        ) {
          // Sync language from another tab
          i18n.changeLanguage(newLang);
        }
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [i18n]);

  // Change language handler
  const changeLanguage = useCallback(
    async (lang: SupportedLanguage) => {
      // Validate language
      if (!supportedLangs.includes(lang)) {
        console.error(`Unsupported language: ${lang}`);
        return;
      }

      // Always update i18next (which also updates localStorage via existing handler)
      await i18n.changeLanguage(lang);

      // If authenticated, also save to database for cross-device sync
      if (isAuthenticated) {
        try {
          await updateDbLanguage.mutateAsync(lang);
        } catch (error) {
          console.error("Failed to save language preference to database:", error);
          // Show toast but don't revert - language is still changed locally
          toast.error(
            t("common:errors.saveLanguageFailed", "Failed to save language preference. Please try again.")
          );
        }
      }
    },
    [i18n, isAuthenticated, updateDbLanguage, t]
  );

  // Current language state
  const language = (i18n.language as SupportedLanguage) || "en";
  const languageInfo = languages[language] || languages.en;
  const isRTL = languageInfo.dir === "rtl";

  // Ensure document direction is always synced with current language
  // This is a "belt and suspenders" approach - i18n.on('languageChanged') should handle this,
  // but we explicitly sync here to handle any timing issues with async i18n initialization
  useEffect(() => {
    if (typeof window !== "undefined") {
      const expectedDir = languageInfo.dir;

      // Always ensure direction is set correctly
      document.documentElement.dir = expectedDir;
      document.documentElement.lang = language;
      // Force style recalculation for RTL changes
      document.documentElement.style.direction = expectedDir;

      // Log for debugging (can remove after verification)
      console.log(`[LanguageProvider] Set dir="${expectedDir}" for lang="${language}"`);
    }
  }, [language, languageInfo.dir]);

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      languageInfo,
      isRTL,
      changeLanguage,
      supportedLanguages: supportedLangs,
      isSaving: updateDbLanguage.isPending,
      isLoading: isAuthenticated ? isLoadingDb : false,
    }),
    [
      language,
      languageInfo,
      isRTL,
      changeLanguage,
      updateDbLanguage.isPending,
      isAuthenticated,
      isLoadingDb,
    ]
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

/**
 * Hook to access language state and controls
 *
 * @example
 * ```tsx
 * const { language, changeLanguage, isRTL, isSaving } = useLanguage();
 *
 * // Change language
 * await changeLanguage("es");
 *
 * // Check if RTL
 * if (isRTL) {
 *   // Apply RTL-specific styles
 * }
 * ```
 */
export function useLanguage(): LanguageContextValue {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within LanguageProvider");
  }
  return context;
}

export { LanguageContext };
