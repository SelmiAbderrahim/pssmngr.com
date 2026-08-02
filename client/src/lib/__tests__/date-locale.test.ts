// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * date-locale.ts Unit Tests
 *
 * Tests for localized date formatting utilities that wrap date-fns
 * with i18n language awareness.
 *
 * @module lib/__tests__
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ar, de, enUS, es, fr } from "date-fns/locale";

// Mock i18n before importing the module under test
vi.mock("@/i18n", () => ({
  default: {
    language: "en",
  },
}));

import {
  getDateLocale,
  getLocaleByLang,
  formatLocalized,
  formatDistanceLocalized,
  formatRelativeLocalized,
  formatDateLocalized,
  formatDateTimeLocalized,
  formatTimeLocalized,
  formatFullDateLocalized,
  formatShortDateLocalized,
  formatMonthYearLocalized,
} from "../date-locale";

// Get a reference to the mocked i18n default export
import i18n from "@/i18n";

// A fixed reference date to make assertions deterministic
const FIXED_DATE = new Date("2026-01-22T14:30:00.000Z");
const FIXED_ISO_STRING = "2026-01-22T14:30:00.000Z";

describe("date-locale", () => {
  beforeEach(() => {
    // Reset language to English before each test
    (i18n as { language: string }).language = "en";
  });

  // ==========================================================================
  // getDateLocale
  // ==========================================================================

  describe("getDateLocale", () => {
    it("returns enUS locale for English language", () => {
      (i18n as { language: string }).language = "en";
      expect(getDateLocale()).toBe(enUS);
    });

    it("returns ar locale for Arabic language", () => {
      (i18n as { language: string }).language = "ar";
      expect(getDateLocale()).toBe(ar);
    });

    it("returns fr locale for French language", () => {
      (i18n as { language: string }).language = "fr";
      expect(getDateLocale()).toBe(fr);
    });

    it("returns de locale for German language", () => {
      (i18n as { language: string }).language = "de";
      expect(getDateLocale()).toBe(de);
    });

    it("returns es locale for Spanish language", () => {
      (i18n as { language: string }).language = "es";
      expect(getDateLocale()).toBe(es);
    });

    it("strips region subtag from language code (e.g. en-US -> en)", () => {
      (i18n as { language: string }).language = "en-US";
      expect(getDateLocale()).toBe(enUS);
    });

    it("strips region subtag for Arabic with region (ar-SA -> ar)", () => {
      (i18n as { language: string }).language = "ar-SA";
      expect(getDateLocale()).toBe(ar);
    });

    it("falls back to enUS for unknown language", () => {
      (i18n as { language: string }).language = "ja";
      expect(getDateLocale()).toBe(enUS);
    });

    it("falls back to enUS when language is empty string", () => {
      (i18n as { language: string }).language = "";
      expect(getDateLocale()).toBe(enUS);
    });

    it("falls back to enUS when i18n.language is undefined", () => {
      (i18n as { language: string | undefined }).language = undefined;
      expect(getDateLocale()).toBe(enUS);
    });
  });

  // ==========================================================================
  // getLocaleByLang
  // ==========================================================================

  describe("getLocaleByLang", () => {
    it("returns enUS for 'en'", () => {
      expect(getLocaleByLang("en")).toBe(enUS);
    });

    it("returns ar for 'ar'", () => {
      expect(getLocaleByLang("ar")).toBe(ar);
    });

    it("returns fr for 'fr'", () => {
      expect(getLocaleByLang("fr")).toBe(fr);
    });

    it("returns de for 'de'", () => {
      expect(getLocaleByLang("de")).toBe(de);
    });

    it("returns es for 'es'", () => {
      expect(getLocaleByLang("es")).toBe(es);
    });

    it("normalizes region subtag (en-GB -> en)", () => {
      expect(getLocaleByLang("en-GB")).toBe(enUS);
    });

    it("normalizes region subtag (fr-CA -> fr)", () => {
      expect(getLocaleByLang("fr-CA")).toBe(fr);
    });

    it("falls back to enUS for unsupported language code", () => {
      expect(getLocaleByLang("zh")).toBe(enUS);
    });

    it("falls back to enUS for empty string", () => {
      expect(getLocaleByLang("")).toBe(enUS);
    });
  });

  // ==========================================================================
  // formatLocalized
  // ==========================================================================

  describe("formatLocalized", () => {
    it("formats a Date object with a format string", () => {
      (i18n as { language: string }).language = "en";
      const result = formatLocalized(FIXED_DATE, "yyyy");
      expect(result).toBe("2026");
    });

    it("formats an ISO string", () => {
      (i18n as { language: string }).language = "en";
      const result = formatLocalized(FIXED_ISO_STRING, "yyyy-MM-dd");
      // ISO string parsed as UTC; the displayed date depends on timezone offset.
      // We just assert a valid date string pattern is returned.
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("formats a numeric timestamp", () => {
      (i18n as { language: string }).language = "en";
      const result = formatLocalized(FIXED_DATE.getTime(), "yyyy");
      expect(result).toBe("2026");
    });

    it("returns the original string on invalid ISO input", () => {
      const result = formatLocalized("not-a-date", "PPP");
      expect(result).toBe("not-a-date");
    });

    it("returns String(date) on invalid numeric input", () => {
      const result = formatLocalized(NaN, "PPP");
      expect(result).toBe("NaN");
    });

    it("uses locale based on i18n language", () => {
      (i18n as { language: string }).language = "en";
      const enResult = formatLocalized(FIXED_DATE, "MMMM");
      expect(enResult).toBe("January");
    });
  });

  // ==========================================================================
  // formatDistanceLocalized
  // ==========================================================================

  describe("formatDistanceLocalized", () => {
    it("returns a non-empty string for a recent Date", () => {
      const recent = new Date(Date.now() - 60_000); // 1 minute ago
      const result = formatDistanceLocalized(recent);
      expect(result).toBeTruthy();
      expect(typeof result).toBe("string");
    });

    it("accepts an ISO string", () => {
      // 2 hours ago
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const result = formatDistanceLocalized(twoHoursAgo);
      expect(result).toBeTruthy();
    });

    it("accepts a numeric timestamp", () => {
      const ts = Date.now() - 5 * 60 * 1000; // 5 minutes ago
      const result = formatDistanceLocalized(ts);
      expect(result).toBeTruthy();
    });

    it("respects addSuffix=false option", () => {
      const recent = new Date(Date.now() - 60_000);
      const withSuffix = formatDistanceLocalized(recent, { addSuffix: true });
      const withoutSuffix = formatDistanceLocalized(recent, { addSuffix: false });
      // With suffix includes "ago"; without does not (English)
      expect(withSuffix).not.toBe(withoutSuffix);
    });

    it("defaults addSuffix to true", () => {
      const recent = new Date(Date.now() - 60_000);
      const defaultResult = formatDistanceLocalized(recent);
      const explicitResult = formatDistanceLocalized(recent, { addSuffix: true });
      expect(defaultResult).toBe(explicitResult);
    });

    it("returns the original string on invalid ISO input", () => {
      const result = formatDistanceLocalized("not-a-date");
      expect(result).toBe("not-a-date");
    });

    it("returns String(date) on invalid numeric input", () => {
      const result = formatDistanceLocalized(NaN);
      expect(result).toBe("NaN");
    });
  });

  // ==========================================================================
  // formatRelativeLocalized
  // ==========================================================================

  describe("formatRelativeLocalized", () => {
    it("returns a non-empty string for a Date object", () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const result = formatRelativeLocalized(yesterday);
      expect(result).toBeTruthy();
      expect(typeof result).toBe("string");
    });

    it("accepts an ISO string", () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const result = formatRelativeLocalized(yesterday);
      expect(result).toBeTruthy();
    });

    it("accepts a numeric timestamp", () => {
      const ts = Date.now() - 24 * 60 * 60 * 1000;
      const result = formatRelativeLocalized(ts);
      expect(result).toBeTruthy();
    });

    it("accepts a custom baseDate", () => {
      const date = new Date("2026-01-21T12:00:00Z");
      const base = new Date("2026-01-22T12:00:00Z");
      const result = formatRelativeLocalized(date, base);
      expect(result).toBeTruthy();
    });

    it("returns the original string on invalid ISO input", () => {
      const result = formatRelativeLocalized("invalid-date");
      expect(result).toBe("invalid-date");
    });

    it("returns String(date) on invalid numeric input", () => {
      const result = formatRelativeLocalized(NaN);
      expect(result).toBe("NaN");
    });
  });

  // ==========================================================================
  // Convenience wrappers
  // ==========================================================================

  describe("formatDateLocalized", () => {
    it("returns a date string (PP format) for a Date object", () => {
      (i18n as { language: string }).language = "en";
      const result = formatDateLocalized(FIXED_DATE);
      // PP in English looks like "Jan 22, 2026"
      expect(result).toMatch(/Jan/i);
      expect(result).toMatch(/2026/);
    });

    it("accepts an ISO string", () => {
      const result = formatDateLocalized(FIXED_ISO_STRING);
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });

    it("accepts a numeric timestamp", () => {
      const result = formatDateLocalized(FIXED_DATE.getTime());
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });

    it("returns fallback on invalid input", () => {
      const result = formatDateLocalized("bad");
      expect(result).toBe("bad");
    });
  });

  describe("formatDateTimeLocalized", () => {
    it("returns a date-time string (PPp format)", () => {
      (i18n as { language: string }).language = "en";
      const result = formatDateTimeLocalized(FIXED_DATE);
      expect(result).toMatch(/2026/);
      // Time portion present
      expect(result).toMatch(/:/);
    });

    it("accepts an ISO string", () => {
      const result = formatDateTimeLocalized(FIXED_ISO_STRING);
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });

    it("returns fallback on invalid input", () => {
      const result = formatDateTimeLocalized("bad-date");
      expect(result).toBe("bad-date");
    });
  });

  describe("formatTimeLocalized", () => {
    it("returns only a time string (p format)", () => {
      (i18n as { language: string }).language = "en";
      const result = formatTimeLocalized(FIXED_DATE);
      // time like "2:30 PM" – contains colon
      expect(result).toMatch(/:/);
      // Does not include year
      expect(result).not.toMatch(/2026/);
    });

    it("accepts a numeric timestamp", () => {
      const result = formatTimeLocalized(FIXED_DATE.getTime());
      expect(result).toMatch(/:/);
    });

    it("returns fallback on invalid ISO input", () => {
      const result = formatTimeLocalized("nope");
      expect(result).toBe("nope");
    });
  });

  describe("formatFullDateLocalized", () => {
    it("returns a full date string including year", () => {
      (i18n as { language: string }).language = "en";
      const result = formatFullDateLocalized(FIXED_DATE);
      expect(result).toMatch(/2026/);
    });

    it("returns fallback on invalid input", () => {
      const result = formatFullDateLocalized("bad");
      expect(result).toBe("bad");
    });
  });

  describe("formatShortDateLocalized", () => {
    it("returns a short date string (MMM d format)", () => {
      (i18n as { language: string }).language = "en";
      const result = formatShortDateLocalized(FIXED_DATE);
      // e.g. "Jan 22"
      expect(result).toMatch(/Jan/i);
      expect(result).not.toMatch(/2026/);
    });

    it("accepts an ISO string", () => {
      const result = formatShortDateLocalized(FIXED_ISO_STRING);
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });

    it("returns fallback on invalid input", () => {
      const result = formatShortDateLocalized("bad");
      expect(result).toBe("bad");
    });
  });

  describe("formatMonthYearLocalized", () => {
    it("returns month and year (MMMM yyyy format)", () => {
      (i18n as { language: string }).language = "en";
      const result = formatMonthYearLocalized(FIXED_DATE);
      expect(result).toMatch(/January/);
      expect(result).toMatch(/2026/);
    });

    it("accepts a numeric timestamp", () => {
      const result = formatMonthYearLocalized(FIXED_DATE.getTime());
      expect(result).toMatch(/2026/);
    });

    it("returns fallback on invalid input", () => {
      const result = formatMonthYearLocalized("bad");
      expect(result).toBe("bad");
    });
  });
});
