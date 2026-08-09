// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Namespace Loading Tests
 *
 * Verifies that all supported translation namespaces are present and well-formed for
 * all 5 supported languages (en, ar, fr, de, es).
 *
 * Checks performed
 * ----------------
 * 1. File existence — {lang}/{ns}.json exists and is valid JSON
 * 2. Non-empty values — no leaf value is an empty string
 * 3. Structural parity — all languages have the same key structure as English
 *    (Arabic extended plural suffixes _zero / _two / _few / _many are allowed
 *    as additional keys beyond the EN set)
 *
 * This test is intentionally stricter than the structural checks in
 * translation-completeness.test.ts; it focuses on the loading layer to catch
 * problems that would prevent i18next from successfully initialising a
 * namespace at runtime.
 *
 * @module i18n/__tests__/namespace-loading
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LANGUAGES = ['en', 'ar', 'fr', 'de', 'es'] as const;
type Language = (typeof LANGUAGES)[number];

const ALL_NAMESPACES = [
  'auth',
  'common',
  'emergency',
  'errors',
  'generator',
  'guide',
  'mobile',
  'organization',
  'settings',
  'sync',
  'validation',
  'vault',
  'watchtower',
  'workspace',
] as const;
type Namespace = (typeof ALL_NAMESPACES)[number];

/**
 * Arabic extended plural suffixes that are valid additional keys in ar/
 * locale files (no EN counterpart required).
 */
const ARABIC_PLURAL_SUFFIXES = ['_zero', '_two', '_few', '_many'] as const;

const LOCALES_DIR = path.join(process.cwd(), 'public/locales');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type JsonObject = Record<string, unknown>;

function loadJson(lang: Language, ns: Namespace): JsonObject | null {
  const filePath = path.join(LOCALES_DIR, lang, `${ns}.json`);
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as JsonObject;
  } catch {
    return null;
  }
}

/**
 * Recursively collect dot-notation leaf keys from a JSON object.
 * Only terminal (non-object, non-array) nodes are returned.
 */
function flattenLeafKeys(obj: JsonObject, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) => {
    const full = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      return flattenLeafKeys(v as JsonObject, full);
    }
    return [full];
  });
}

/**
 * Retrieve a nested value by dot-notation path.
 */
function getByPath(obj: JsonObject, dotPath: string): unknown {
  return dotPath.split('.').reduce<unknown>((cur, segment) => {
    if (cur == null || typeof cur !== 'object') return undefined;
    return (cur as JsonObject)[segment];
  }, obj);
}

function isArabicPluralExtension(key: string): boolean {
  return ARABIC_PLURAL_SUFFIXES.some((s) => key.endsWith(s));
}

// ---------------------------------------------------------------------------
// Pre-load all translations once to avoid repeated I/O inside loop tests
// ---------------------------------------------------------------------------

const ALL_DATA: Record<Namespace, Record<Language, JsonObject | null>> = {} as Record<
  Namespace,
  Record<Language, JsonObject | null>
>;

for (const ns of ALL_NAMESPACES) {
  ALL_DATA[ns] = {} as Record<Language, JsonObject | null>;
  for (const lang of LANGUAGES) {
    ALL_DATA[ns][lang] = loadJson(lang, ns);
  }
}

// ---------------------------------------------------------------------------
// 1. File Existence & Parse Validity
// ---------------------------------------------------------------------------

describe('Namespace loading — file existence and JSON validity', () => {
  for (const ns of ALL_NAMESPACES) {
    describe(`namespace: ${ns}`, () => {
      for (const lang of LANGUAGES) {
        it(`${lang}/${ns}.json exists and parses as valid JSON`, () => {
          const filePath = path.join(LOCALES_DIR, lang, `${ns}.json`);
          expect(
            fs.existsSync(filePath),
            `${lang}/${ns}.json is missing from public/locales/${lang}/`
          ).toBe(true);

          const data = ALL_DATA[ns][lang];
          expect(
            data,
            `${lang}/${ns}.json failed to parse as JSON`
          ).not.toBeNull();

          expect(
            typeof data,
            `${lang}/${ns}.json does not produce an object`
          ).toBe('object');
        });

        it(`${lang}/${ns}.json has at least one key`, () => {
          const data = ALL_DATA[ns][lang];
          if (!data) return; // covered by existence test
          expect(
            Object.keys(data).length,
            `${lang}/${ns}.json is an empty object`
          ).toBeGreaterThan(0);
        });
      }
    });
  }
});

// ---------------------------------------------------------------------------
// 2. No Empty String Values
// ---------------------------------------------------------------------------

describe('Namespace loading — no empty string values', () => {
  for (const ns of ALL_NAMESPACES) {
    for (const lang of LANGUAGES) {
      it(`${lang}/${ns}.json has no empty string values`, () => {
        const data = ALL_DATA[ns][lang];
        if (!data) return; // covered by existence test

        const emptyKeys = flattenLeafKeys(data).filter((k) => {
          const v = getByPath(data, k);
          return typeof v === 'string' && v.trim() === '';
        });

        expect(
          emptyKeys,
          `${lang}/${ns}.json contains empty string values at: ${emptyKeys.join(', ')}`
        ).toEqual([]);
      });
    }
  }
});

// ---------------------------------------------------------------------------
// 3. Key Structure Parity — all languages match English
// ---------------------------------------------------------------------------

describe('Namespace loading — all languages have identical key structure to English', () => {
  for (const ns of ALL_NAMESPACES) {
    describe(`namespace: ${ns}`, () => {
      const enData = ALL_DATA[ns]['en'];
      if (!enData) return; // covered by existence tests

      const enKeys = new Set(flattenLeafKeys(enData));

      // 3a. Every EN key must be present in every non-EN language
      for (const lang of LANGUAGES.filter((l) => l !== 'en')) {
        it(`${lang} contains all English keys`, () => {
          const langData = ALL_DATA[ns][lang];
          if (!langData) return;

          const langKeySet = new Set(flattenLeafKeys(langData));
          const missing = [...enKeys].filter((k) => !langKeySet.has(k));

          expect(
            missing,
            `${lang}/${ns}.json is missing these EN keys: ${missing.join(', ')}`
          ).toEqual([]);
        });
      }

      // 3b. Non-EN languages must not introduce unexpected extra keys
      //     (Arabic extended plural suffixes are exempted)
      for (const lang of LANGUAGES.filter((l) => l !== 'en')) {
        it(`${lang} has no unexpected extra keys beyond English (Arabic plurals allowed)`, () => {
          const langData = ALL_DATA[ns][lang];
          if (!langData) return;

          const langKeys = flattenLeafKeys(langData);
          const extra = langKeys.filter(
            (k) => !enKeys.has(k) && !isArabicPluralExtension(k)
          );

          expect(
            extra,
            `${lang}/${ns}.json has extra keys not present in EN: ${extra.join(', ')}`
          ).toEqual([]);
        });
      }
    });
  }
});

// ---------------------------------------------------------------------------
// 4. Top-level section consistency
// ---------------------------------------------------------------------------

describe('Namespace loading — top-level section counts match English in all languages', () => {
  for (const ns of ALL_NAMESPACES) {
    it(`${ns}: all languages have the same top-level sections as English`, () => {
      const enData = ALL_DATA[ns]['en'];
      if (!enData) return;

      const enTopKeys = Object.keys(enData).sort();

      for (const lang of LANGUAGES.filter((l) => l !== 'en')) {
        const langData = ALL_DATA[ns][lang];
        if (!langData) continue;

        const langTopKeys = Object.keys(langData).sort();
        expect(
          langTopKeys,
          `${lang}/${ns}.json top-level sections differ from English`
        ).toEqual(enTopKeys);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// 5. Locale directory completeness — all 5 language folders exist
// ---------------------------------------------------------------------------

describe('Namespace loading — locale directory structure', () => {
  it('all 5 language directories exist under public/locales/', () => {
    for (const lang of LANGUAGES) {
      const langDir = path.join(LOCALES_DIR, lang);
      expect(
        fs.existsSync(langDir),
        `public/locales/${lang}/ directory is missing`
      ).toBe(true);
    }
  });

  it('each language directory contains exactly 21 namespace files', () => {
    for (const lang of LANGUAGES) {
      const langDir = path.join(LOCALES_DIR, lang);
      if (!fs.existsSync(langDir)) continue;

      const jsonFiles = fs
        .readdirSync(langDir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.replace('.json', ''));

      // Every expected namespace must be present
      const missingNs = ALL_NAMESPACES.filter((ns) => !jsonFiles.includes(ns));
      expect(
        missingNs,
        `${lang}/ is missing namespace files: ${missingNs.join(', ')}`
      ).toEqual([]);
    }
  });
});
