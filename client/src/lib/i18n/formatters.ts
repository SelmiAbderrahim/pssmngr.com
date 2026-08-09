// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Locale-aware formatting utilities for the payment system.
 *
 * Uses Intl.NumberFormat and Intl.DateTimeFormat for proper
 * locale-specific number, currency, and date formatting.
 */

/** Map of i18n language codes to Intl locale codes */
const LOCALE_MAP: Record<string, string> = {
  en: "en-US",
  ar: "ar-SA",
  es: "es-ES",
  fr: "fr-FR",
  de: "de-DE",
};

/**
 * Resolve an i18n language code to an Intl-compatible locale string.
 */
function resolveLocale(locale?: string): string {
  if (!locale) return "en-US";
  return LOCALE_MAP[locale] || locale;
}

/**
 * Format a monetary amount from cents to a locale-aware currency string.
 *
 * @param cents - Amount in cents (e.g. 2999 = $29.99)
 * @param currency - ISO 4217 currency code (e.g. "USD", "SAR")
 * @param locale - i18n language code (e.g. "en", "ar")
 * @returns Formatted currency string (e.g. "$29.99", "٢٩٫٩٩ ر.س.")
 */
export function formatCurrency(
  cents: number,
  currency = "USD",
  locale?: string,
): string {
  const resolvedLocale = resolveLocale(locale);
  const amount = cents / 100;

  try {
    return new Intl.NumberFormat(resolvedLocale, {
      style: "currency",
      currency: currency.toUpperCase(),
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    // Fallback for unsupported currency/locale combinations
    return `${currency} ${amount.toFixed(2)}`;
  }
}

/**
 * Format a number with locale-aware grouping and decimal separators.
 *
 * @param value - The number to format
 * @param locale - i18n language code
 * @param options - Additional Intl.NumberFormat options
 * @returns Formatted number string (e.g. "1,234.56" or "1.234,56")
 */
export function formatNumber(
  value: number,
  locale?: string,
  options?: Intl.NumberFormatOptions,
): string {
  const resolvedLocale = resolveLocale(locale);

  try {
    return new Intl.NumberFormat(resolvedLocale, options).format(value);
  } catch {
    return String(value);
  }
}

/**
 * Format a percentage with locale-aware formatting.
 *
 * @param value - Percentage value (e.g. 0.15 for 15%, or 15 for 15%)
 * @param locale - i18n language code
 * @param asFraction - If true, treat value as a fraction (0.15 = 15%)
 * @returns Formatted percentage string (e.g. "15%", "١٥٪")
 */
export function formatPercent(
  value: number,
  locale?: string,
  asFraction = false,
): string {
  const resolvedLocale = resolveLocale(locale);
  const displayValue = asFraction ? value : value / 100;

  try {
    return new Intl.NumberFormat(resolvedLocale, {
      style: "percent",
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
    }).format(displayValue);
  } catch {
    const pct = asFraction ? value * 100 : value;
    return `${pct}%`;
  }
}

/**
 * Format a date with locale-aware formatting.
 *
 * @param date - Date object, timestamp, or ISO string
 * @param locale - i18n language code
 * @param options - Intl.DateTimeFormat options (defaults to medium date)
 * @returns Formatted date string
 */
export function formatDate(
  date: Date | number | string,
  locale?: string,
  options?: Intl.DateTimeFormatOptions,
): string {
  const resolvedLocale = resolveLocale(locale);
  const dateObj = date instanceof Date ? date : new Date(date);

  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "long",
    day: "numeric",
  };

  try {
    return new Intl.DateTimeFormat(
      resolvedLocale,
      options || defaultOptions,
    ).format(dateObj);
  } catch {
    return dateObj.toLocaleDateString();
  }
}

/**
 * Format a date as a short string (e.g. "Jan 15, 2025" or "15 يناير 2025").
 */
export function formatDateShort(
  date: Date | number | string,
  locale?: string,
): string {
  return formatDate(date, locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Format a date with time (e.g. "Jan 15, 2025, 3:30 PM").
 */
export function formatDateTime(
  date: Date | number | string,
  locale?: string,
): string {
  return formatDate(date, locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Format bytes into a human-readable size string.
 *
 * @param bytes - Size in bytes
 * @param locale - i18n language code
 * @returns Formatted size string (e.g. "1.5 GB", "١٫٥ غيغابايت")
 */
export function formatBytes(bytes: number, locale?: string): string {
  const resolvedLocale = resolveLocale(locale);
  const units = ["B", "KB", "MB", "GB", "TB"];
  let unitIndex = 0;
  let size = bytes;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  try {
    const formatted = new Intl.NumberFormat(resolvedLocale, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
    }).format(size);
    return `${formatted} ${units[unitIndex]}`;
  } catch {
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }
}
