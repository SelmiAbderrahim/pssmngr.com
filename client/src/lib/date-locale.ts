// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Localized Date Formatting Utilities
 *
 * Provides date formatting functions that respect the user's selected language.
 * Uses date-fns locales to format dates in Arabic, English, French, German, and Spanish.
 *
 * @module lib/date-locale
 */

import {
  format as dateFnsFormat,
  formatDistanceToNow as dateFnsFormatDistanceToNow,
  formatRelative as dateFnsFormatRelative,
  parseISO,
} from "date-fns";
import { ar, de, enUS, es, fr } from "date-fns/locale";
import type { Locale } from "date-fns";
import i18n from "@/i18n";

// ============================================================================
// Locale Mapping
// ============================================================================

/**
 * Map of supported language codes to date-fns locale objects
 */
const localeMap: Record<string, Locale> = {
  ar: ar, // Arabic - "منذ حوالي 20 ساعة"
  en: enUS, // English - "about 20 hours ago"
  fr: fr, // French - "il y a environ 20 heures"
  de: de, // German - "vor etwa 20 Stunden"
  es: es, // Spanish - "hace aproximadamente 20 horas"
};

/**
 * Get the current date-fns locale based on i18n language setting
 *
 * @returns date-fns Locale object for the current language
 *
 * @example
 * const locale = getDateLocale();
 * format(date, "PPP", { locale });
 */
export function getDateLocale(): Locale {
  const lang = i18n.language?.split("-")[0] || "en";
  return localeMap[lang] || enUS;
}

/**
 * Get a specific date-fns locale by language code
 *
 * @param lang - Language code (ar, en, fr, de, es)
 * @returns date-fns Locale object
 */
export function getLocaleByLang(lang: string): Locale {
  const normalizedLang = lang.split("-")[0] ?? "en";
  return localeMap[normalizedLang] || enUS;
}

// ============================================================================
// Core Formatting Functions
// ============================================================================

/**
 * Format a date with locale support
 *
 * @param date - Date object, ISO string, or timestamp
 * @param formatStr - date-fns format string
 * @returns Formatted date string in the current locale
 *
 * @example
 * formatLocalized(new Date(), "PPP") // "22 يناير 2026" (Arabic)
 * formatLocalized("2026-01-22", "PP") // "Jan 22, 2026" (English)
 */
export function formatLocalized(
  date: Date | string | number,
  formatStr: string
): string {
  try {
    const dateObj = typeof date === "string" ? parseISO(date) : new Date(date);
    return dateFnsFormat(dateObj, formatStr, { locale: getDateLocale() });
  } catch {
    return typeof date === "string" ? date : String(date);
  }
}

/**
 * Format relative time with locale support (e.g., "about 20 hours ago")
 *
 * @param date - Date object, ISO string, or timestamp
 * @param options - Additional options
 * @param options.addSuffix - Whether to add "ago" or "in" suffix (default: true)
 * @param options.includeSeconds - Include seconds for very recent times
 * @returns Localized relative time string
 *
 * @example
 * formatDistanceLocalized(new Date(Date.now() - 3600000))
 * // English: "about 1 hour ago"
 * // Arabic: "منذ حوالي ساعة"
 * // French: "il y a environ 1 heure"
 */
export function formatDistanceLocalized(
  date: Date | string | number,
  options?: { addSuffix?: boolean; includeSeconds?: boolean }
): string {
  try {
    const dateObj = typeof date === "string" ? parseISO(date) : new Date(date);
    return dateFnsFormatDistanceToNow(dateObj, {
      addSuffix: options?.addSuffix ?? true,
      includeSeconds: options?.includeSeconds ?? false,
      locale: getDateLocale(),
    });
  } catch {
    return typeof date === "string" ? date : String(date);
  }
}

/**
 * Format a date relative to another date (e.g., "yesterday at 2:30 PM")
 *
 * @param date - Date to format
 * @param baseDate - Reference date (default: now)
 * @returns Localized relative date string
 *
 * @example
 * formatRelativeLocalized(yesterdayDate)
 * // English: "yesterday at 2:30 PM"
 * // Arabic: "أمس الساعة 2:30 م"
 */
export function formatRelativeLocalized(
  date: Date | string | number,
  baseDate: Date = new Date()
): string {
  try {
    const dateObj = typeof date === "string" ? parseISO(date) : new Date(date);
    return dateFnsFormatRelative(dateObj, baseDate, {
      locale: getDateLocale(),
    });
  } catch {
    return typeof date === "string" ? date : String(date);
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Format a date for display in UI (medium format)
 * Uses locale-appropriate date format
 *
 * @param date - Date to format
 * @returns Formatted date string (e.g., "Jan 22, 2026" or "22 يناير 2026")
 *
 * @example
 * formatDateLocalized(new Date()) // "Jan 22, 2026" (English)
 */
export function formatDateLocalized(date: Date | string | number): string {
  return formatLocalized(date, "PP");
}

/**
 * Format a date with time for display in UI
 *
 * @param date - Date to format
 * @returns Formatted date and time string
 *
 * @example
 * formatDateTimeLocalized(new Date()) // "Jan 22, 2026, 2:30 PM" (English)
 */
export function formatDateTimeLocalized(date: Date | string | number): string {
  return formatLocalized(date, "PPp");
}

/**
 * Format time only for display in UI
 *
 * @param date - Date to format
 * @returns Formatted time string
 *
 * @example
 * formatTimeLocalized(new Date()) // "2:30 PM" (English)
 */
export function formatTimeLocalized(date: Date | string | number): string {
  return formatLocalized(date, "p");
}

/**
 * Format a full date with weekday for tooltips
 *
 * @param date - Date to format
 * @returns Full formatted date string
 *
 * @example
 * formatFullDateLocalized(new Date())
 * // English: "Wednesday, January 22, 2026 at 2:30 PM"
 * // Arabic: "الأربعاء، 22 يناير 2026 الساعة 2:30 م"
 */
export function formatFullDateLocalized(date: Date | string | number): string {
  return formatLocalized(date, "PPPP 'at' p");
}

/**
 * Format a short date (month and day only)
 *
 * @param date - Date to format
 * @returns Short date string
 *
 * @example
 * formatShortDateLocalized(new Date()) // "Jan 22" (English)
 */
export function formatShortDateLocalized(date: Date | string | number): string {
  return formatLocalized(date, "MMM d");
}

/**
 * Format month and year
 *
 * @param date - Date to format
 * @returns Month and year string
 *
 * @example
 * formatMonthYearLocalized(new Date()) // "January 2026" (English)
 */
export function formatMonthYearLocalized(date: Date | string | number): string {
  return formatLocalized(date, "MMMM yyyy");
}
