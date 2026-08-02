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
  return Object.entries(value as Record<string, unknown>).flatMap(
    ([key, child]) => flattenKeys(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe("guide i18n namespace parity", () => {
  it("keeps every guide key present across en/ar/fr/de/es", () => {
    const baseDir = path.resolve(process.cwd(), "public/locales");
    const sets = LOCALES.map((locale) => {
      const file = path.join(baseDir, locale, "guide.json");
      const json = JSON.parse(fs.readFileSync(file, "utf8"));
      return [locale, new Set(flattenKeys(json))] as const;
    });
    const en = [...sets[0][1]].sort();
    for (const [locale, keys] of sets) {
      expect([...keys].sort(), locale).toEqual(en);
    }
  });
});
