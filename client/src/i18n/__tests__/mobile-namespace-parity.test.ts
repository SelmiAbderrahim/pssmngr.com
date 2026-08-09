// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const LOCALES = ["en", "ar", "fr", "de", "es"] as const;

function flattenKeys(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return prefix ? [prefix] : [];
  }

  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    flattenKeys(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe("mobile layout i18n namespace parity", () => {
  it("keeps all responsive navigation keys present across supported locales", () => {
    const baseDir = path.resolve(process.cwd(), "public/locales");
    const keySets = LOCALES.map((locale) => {
      const file = path.join(baseDir, locale, "mobile.json");
      const json = JSON.parse(fs.readFileSync(file, "utf8"));
      return [locale, new Set(flattenKeys(json))] as const;
    });

    const englishKeys = [...keySets[0][1]].sort();

    for (const [locale, keys] of keySets) {
      expect([...keys].sort(), locale).toEqual(englishKeys);
    }
  });
});
