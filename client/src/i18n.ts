// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import i18n from "i18next";
import Backend from "i18next-http-backend";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

// Define supported languages with their properties
export const languages = {
  ar: { name: "العربية", dir: "rtl", flag: "🇸🇦" },
  en: { name: "English", dir: "ltr", flag: "🇺🇸" },
  fr: { name: "Français", dir: "ltr", flag: "🇫🇷" },
  de: { name: "Deutsch", dir: "ltr", flag: "🇩🇪" },
  es: { name: "Español", dir: "ltr", flag: "🇪🇸" },
} as const;

// List of language codes your application supports.
export const supportedLangs = Object.keys(languages) as Array<keyof typeof languages>;
export type SupportedLanguage = keyof typeof languages;

// Default language and fallback hierarchy
const fallbackLng = ["en", "es", "fr", "de", "ar"];

// Get stored language preference from localStorage
const getStoredLanguage = (): string | null => {
  if (typeof window !== "undefined") {
    return localStorage.getItem("i18nextLng");
  }
  return null;
};

// Store language preference in localStorage
const storeLanguage = (lng: string): void => {
  if (typeof window !== "undefined") {
    localStorage.setItem("i18nextLng", lng);
    // Store language direction for CSS
    const dir = languages[lng as SupportedLanguage]?.dir || "ltr";
    document.documentElement.dir = dir;
    document.documentElement.lang = lng;
    // Force style recalculation for RTL changes
    document.documentElement.style.direction = dir;
  }
};

// Initialize i18n
i18n
  // Load translation using HTTP -> see /public/locales
  .use(Backend)
  // Detect user language
  .use(LanguageDetector)
  // Pass the i18n instance to react-i18next
  .use(initReactI18next)
  // Initialize i18next
  .init({
    // Language detection options
    detection: {
      order: ["querystring", "localStorage", "navigator", "htmlTag"],
      caches: ["localStorage"],
      lookupLocalStorage: "i18nextLng",
      lookupQuerystring: "lang",
    },

    // Fallback configuration
    fallbackLng: fallbackLng,

    // Only use base language codes (en, fr, etc.) without region (en-US, fr-FR)
    // This normalizes en-US -> en, fr-FR -> fr
    load: "languageOnly",

    // Supported languages (only base codes)
    supportedLngs: supportedLangs,

    // Clean language codes (en-US -> en)
    cleanCode: true,

    // Debug mode (disable in production)
    debug: process.env.NODE_ENV === "development",

    // Interpolation configuration
    interpolation: {
      escapeValue: false, // React already escapes
    },

    // Backend configuration
    backend: {
      loadPath: "/locales/{{lng}}/{{ns}}.json",
    },

    // Namespace configuration
    // Only `common` is preloaded; every other namespace loads on-demand via
    // i18next-http-backend when useTranslation("namespace") is called.
    // Feature namespaces load on demand when requested by a route/component.
    ns: ["common"],
    defaultNS: "common",
    partialBundledLanguages: true,
  });

// Listen for language changes and update localStorage/direction
i18n.on("languageChanged", (lng) => {
  storeLanguage(lng);
});

// Initialize language direction on first load
if (typeof window !== "undefined") {
  const currentLang = i18n.language || getStoredLanguage() || fallbackLng[0] || "en";
  const dir = languages[currentLang as SupportedLanguage]?.dir || "ltr";
  document.documentElement.dir = dir;
  document.documentElement.lang = currentLang;
  // Force style recalculation for RTL changes
  document.documentElement.style.direction = dir;
}

// Export helper functions
export const changeLanguage = (lng: SupportedLanguage): Promise<any> => {
  return i18n.changeLanguage(lng);
};

export const getCurrentLanguage = (): SupportedLanguage => {
  return (i18n.language as SupportedLanguage) || fallbackLng[0] as SupportedLanguage;
};

export const isRTL = (lng?: string): boolean => {
  const lang = lng || i18n.language || fallbackLng[0];
  return languages[lang as SupportedLanguage]?.dir === "rtl";
};

export const getLanguageInfo = (lng?: string) => {
  const lang = lng || i18n.language || fallbackLng[0];
  return languages[lang as SupportedLanguage] || languages[fallbackLng[0] as SupportedLanguage];
};

export default i18n;
