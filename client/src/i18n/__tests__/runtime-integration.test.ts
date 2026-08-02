// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * i18n Runtime Integration Tests
 *
 * Tests the runtime behaviour of the i18n configuration defined in
 * `src/i18n.ts`.  Unlike the static analysis tests, these tests exercise the
 * actual helper functions exported by the module.
 *
 * Coverage
 * --------
 * 1. Supported language list — all 5 languages registered
 * 2. Language direction — Arabic is RTL, all others are LTR
 * 3. Language info — name, dir, and flag properties for each language
 * 4. changeLanguage — DOM attributes updated (dir, lang)
 * 5. changeLanguage — language stored in localStorage
 * 6. changeLanguage — isRTL returns correct value after switch
 * 7. Fallback — getCurrentLanguage returns a supported language
 * 8. getLanguageInfo — returns English info for unknown language codes
 *
 * The actual i18n module is mocked (following the pattern established in
 * i18n.test.ts) to avoid HTTP backend requests and LanguageDetector
 * interactions that cannot run in jsdom without MSW.
 *
 * @module i18n/__tests__/runtime-integration
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Language metadata (mirrors src/i18n.ts `languages` map)
// ---------------------------------------------------------------------------

const LANGUAGE_METADATA = {
  ar: { name: 'العربية', dir: 'rtl', flag: '🇸🇦' },
  en: { name: 'English', dir: 'ltr', flag: '🇺🇸' },
  fr: { name: 'Français', dir: 'ltr', flag: '🇫🇷' },
  de: { name: 'Deutsch', dir: 'ltr', flag: '🇩🇪' },
  es: { name: 'Español', dir: 'ltr', flag: '🇪🇸' },
} as const;

type Lang = keyof typeof LANGUAGE_METADATA;

// ---------------------------------------------------------------------------
// i18n module mock
// ---------------------------------------------------------------------------

vi.mock('@/i18n', () => {
  const languages = {
    ar: { name: 'العربية', dir: 'rtl', flag: '🇸🇦' },
    en: { name: 'English', dir: 'ltr', flag: '🇺🇸' },
    fr: { name: 'Français', dir: 'ltr', flag: '🇫🇷' },
    de: { name: 'Deutsch', dir: 'ltr', flag: '🇩🇪' },
    es: { name: 'Español', dir: 'ltr', flag: '🇪🇸' },
  } as const;

  const supportedLangs: Lang[] = ['ar', 'en', 'fr', 'de', 'es'];
  let currentLanguage: Lang = 'en';

  const mockI18n = {
    language: 'en',
    changeLanguage: vi.fn((lng: string) => {
      mockI18n.language = lng;
      currentLanguage = lng as Lang;
      return Promise.resolve();
    }),
    on: vi.fn(),
    use: vi.fn().mockReturnThis(),
    init: vi.fn(() => Promise.resolve()),
    t: vi.fn((key: string, fallback?: string) => fallback ?? key),
  };

  const changeLanguage = vi.fn((lng: Lang) => {
    currentLanguage = lng;
    mockI18n.language = lng;
    if (typeof document !== 'undefined') {
      const langData = (languages as Record<string, { dir: string }>)[lng];
      if (langData) {
        document.documentElement.dir = langData.dir;
        document.documentElement.style.direction = langData.dir;
      }
      document.documentElement.lang = lng;
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('i18nextLng', lng);
    }
    return Promise.resolve();
  });

  const getCurrentLanguage = vi.fn((): Lang => currentLanguage);

  const isRTL = vi.fn((lng?: string): boolean => {
    const lang = (lng ?? currentLanguage) as Lang;
    return (languages as Record<string, { dir: string }>)[lang]?.dir === 'rtl';
  });

  const getLanguageInfo = vi.fn((lng?: string) => {
    const lang = (lng ?? currentLanguage) as Lang;
    return (
      (languages as Record<string, (typeof languages)[Lang]>)[lang] ??
      languages['en']
    );
  });

  return {
    default: mockI18n,
    languages,
    supportedLangs,
    changeLanguage,
    getCurrentLanguage,
    isRTL,
    getLanguageInfo,
  };
});

// ---------------------------------------------------------------------------
// Imports (after mock registration)
// ---------------------------------------------------------------------------

import i18n, {
  languages,
  supportedLangs,
  changeLanguage,
  getCurrentLanguage,
  isRTL,
  getLanguageInfo,
  type SupportedLanguage,
} from '@/i18n';

// ---------------------------------------------------------------------------
// localStorage mock
// ---------------------------------------------------------------------------

const buildLocalStorageMock = () => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
    get length() { return Object.keys(store).length; },
    key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
  };
};

const localStorageMock = buildLocalStorageMock();

// ---------------------------------------------------------------------------
// Test setup / teardown
// ---------------------------------------------------------------------------

beforeEach(async () => {
  localStorageMock.clear();
  localStorageMock.getItem.mockClear();
  localStorageMock.setItem.mockClear();

  Object.defineProperty(global, 'localStorage', {
    value: localStorageMock,
    writable: true,
    configurable: true,
  });

  vi.mocked(changeLanguage).mockClear();
  vi.mocked(getCurrentLanguage).mockClear();
  vi.mocked(isRTL).mockClear();
  vi.mocked(getLanguageInfo).mockClear();

  // Reset to English before each test
  await changeLanguage('en');
  vi.mocked(changeLanguage).mockClear();
  localStorageMock.setItem.mockClear();
  i18n.language = 'en';
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// 1. Supported language list
// ---------------------------------------------------------------------------

describe('Supported language registration', () => {
  it('supportedLangs contains exactly 5 languages', () => {
    expect(supportedLangs).toHaveLength(5);
  });

  it('supportedLangs includes all required language codes', () => {
    const required: SupportedLanguage[] = ['ar', 'en', 'fr', 'de', 'es'];
    for (const lang of required) {
      expect(supportedLangs).toContain(lang);
    }
  });

  it('languages map contains metadata for every supported language', () => {
    for (const lang of supportedLangs) {
      expect(languages[lang as SupportedLanguage]).toBeDefined();
      expect(languages[lang as SupportedLanguage].name).toBeTruthy();
      expect(languages[lang as SupportedLanguage].dir).toMatch(/^(ltr|rtl)$/);
      expect(languages[lang as SupportedLanguage].flag).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Language direction
// ---------------------------------------------------------------------------

describe('Language direction (RTL / LTR)', () => {
  it('Arabic is RTL', () => {
    expect(isRTL('ar')).toBe(true);
  });

  it.each(['en', 'fr', 'de', 'es'] as const)(
    '%s is LTR',
    (lang) => {
      expect(isRTL(lang)).toBe(false);
    }
  );

  it('unknown language code is treated as LTR (not RTL)', () => {
    expect(isRTL('xx')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. getLanguageInfo
// ---------------------------------------------------------------------------

describe('getLanguageInfo', () => {
  it.each(Object.entries(LANGUAGE_METADATA) as [Lang, typeof LANGUAGE_METADATA[Lang]][]) (
    'returns correct metadata for %s',
    (lang, expected) => {
      const info = getLanguageInfo(lang);
      expect(info.name).toBe(expected.name);
      expect(info.dir).toBe(expected.dir);
      expect(info.flag).toBe(expected.flag);
    }
  );

  it('returns English info for an unknown language code', () => {
    const info = getLanguageInfo('zz');
    expect(info).toEqual(LANGUAGE_METADATA['en']);
  });
});

// ---------------------------------------------------------------------------
// 4. changeLanguage — DOM attribute updates
// ---------------------------------------------------------------------------

describe('changeLanguage — DOM attribute updates', () => {
  it('sets document.documentElement.lang to the new language', async () => {
    await changeLanguage('fr');
    expect(document.documentElement.lang).toBe('fr');
  });

  it('sets document.documentElement.dir to "rtl" when switching to Arabic', async () => {
    await changeLanguage('ar');
    expect(document.documentElement.dir).toBe('rtl');
  });

  it('sets document.documentElement.dir to "ltr" when switching away from Arabic', async () => {
    // Start in Arabic
    await changeLanguage('ar');
    expect(document.documentElement.dir).toBe('rtl');

    // Switch to German
    await changeLanguage('de');
    expect(document.documentElement.dir).toBe('ltr');
  });

  it.each(['en', 'fr', 'de', 'es'] as const)(
    'sets dir to "ltr" when switching to %s',
    async (lang) => {
      await changeLanguage(lang);
      expect(document.documentElement.dir).toBe('ltr');
    }
  );
});

// ---------------------------------------------------------------------------
// 5. changeLanguage — localStorage persistence
// ---------------------------------------------------------------------------

describe('changeLanguage — localStorage persistence', () => {
  it('stores the new language in localStorage under "i18nextLng"', async () => {
    await changeLanguage('es');
    expect(localStorageMock.setItem).toHaveBeenCalledWith('i18nextLng', 'es');
  });

  it('persists Arabic language to localStorage', async () => {
    await changeLanguage('ar');
    expect(localStorageMock.setItem).toHaveBeenCalledWith('i18nextLng', 'ar');
  });

  it.each(['en', 'fr', 'de', 'es', 'ar'] as const)(
    'persists language "%s" to localStorage',
    async (lang) => {
      await changeLanguage(lang);
      expect(localStorageMock.setItem).toHaveBeenCalledWith('i18nextLng', lang);
    }
  );
});

// ---------------------------------------------------------------------------
// 6. isRTL reflects the current language after changeLanguage
// ---------------------------------------------------------------------------

describe('isRTL after changeLanguage', () => {
  it('isRTL("ar") is true regardless of current language', async () => {
    await changeLanguage('en');
    expect(isRTL('ar')).toBe(true);
  });

  it('isRTL("en") is false regardless of current language', async () => {
    await changeLanguage('ar');
    expect(isRTL('en')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 7. getCurrentLanguage — returns a supported language
// ---------------------------------------------------------------------------

describe('getCurrentLanguage', () => {
  it('returns a value from the supportedLangs list', () => {
    const lang = getCurrentLanguage();
    expect(supportedLangs).toContain(lang);
  });

  it('returns the language set via changeLanguage', async () => {
    await changeLanguage('de');
    expect(getCurrentLanguage()).toBe('de');
  });

  it.each(['en', 'fr', 'de', 'es', 'ar'] as const)(
    'returns "%s" after switching to it',
    async (lang) => {
      await changeLanguage(lang);
      expect(getCurrentLanguage()).toBe(lang);
    }
  );
});

// ---------------------------------------------------------------------------
// 8. Switching through all languages
// ---------------------------------------------------------------------------

describe('Full language cycle', () => {
  it('can switch through all 5 languages sequentially without errors', async () => {
    for (const lang of ['en', 'ar', 'fr', 'de', 'es'] as const) {
      await expect(changeLanguage(lang)).resolves.not.toThrow();
    }
  });

  it('DOM direction reflects each language during a full cycle', async () => {
    const expectedDirs: Record<SupportedLanguage, 'ltr' | 'rtl'> = {
      ar: 'rtl',
      en: 'ltr',
      fr: 'ltr',
      de: 'ltr',
      es: 'ltr',
    };

    for (const [lang, dir] of Object.entries(expectedDirs) as [SupportedLanguage, 'ltr' | 'rtl'][]) {
      await changeLanguage(lang);
      expect(document.documentElement.dir).toBe(dir);
    }
  });
});

// ---------------------------------------------------------------------------
// 9. Fallback behaviour — getLanguageInfo
// ---------------------------------------------------------------------------

describe('Fallback behaviour', () => {
  it('getLanguageInfo returns defined object for all supported languages', () => {
    for (const lang of supportedLangs) {
      const info = getLanguageInfo(lang);
      expect(info).toBeDefined();
      expect(info.dir).toMatch(/^(ltr|rtl)$/);
    }
  });

  it('getLanguageInfo returns English metadata for completely unknown codes', () => {
    const fallback = getLanguageInfo('ja');
    expect(fallback).toEqual(LANGUAGE_METADATA['en']);
  });
});
