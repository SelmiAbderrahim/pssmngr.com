// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * RTL Utilities Unit Tests
 *
 * Tests for right-to-left layout and text direction utilities
 * Particularly important for Arabic language support
 *
 * @module lib/__tests__
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  isRTLLanguage,
  RTL_LANGUAGES,
  getDirection,
  setDirection,
  toggleDirection,
  useDirection,
  useDirectionControls,
  shouldMirrorIcon,
  MIRROR_ICONS,
  NO_MIRROR_ICONS,
  getMirrorClass,
  useIconMirror,
  getLogicalAlign,
  getDirectionalClass,
  getMarginClass,
  getPaddingClass,
  getTextAlignClass,
  getFloatClass,
  getBorderClass,
  getRoundedClass,
  getTransformClass,
  getIconClass,
  getFlexClass,
  useRTL,
} from '../rtl';
import { isRTL } from '@/i18n';

// Mock i18n for testing
vi.mock('@/i18n', () => ({
  isRTL: vi.fn((lang?: string) => lang === 'ar'),
  languages: {
    ar: { name: 'العربية', dir: 'rtl', flag: '🇸🇦' },
    en: { name: 'English', dir: 'ltr', flag: '🇺🇸' },
    fr: { name: 'Français', dir: 'ltr', flag: '🇫🇷' },
    de: { name: 'Deutsch', dir: 'ltr', flag: '🇩🇪' },
    es: { name: 'Español', dir: 'ltr', flag: '🇪🇸' },
  },
}));

// =============================================================================
// TESTS
// =============================================================================

describe('RTL utilities', () => {
  describe('getDirectionalClass', () => {
    it('should return LTR class for non-RTL language', () => {
      const result = getDirectionalClass('text-left', 'text-right');
      expect(result).toBe('text-left');
    });

    it('should return RTL class for RTL language', () => {
      vi.mocked(isRTL).mockReturnValue(true);
      
      const result = getDirectionalClass('text-left', 'text-right');
      expect(result).toBe('text-right');
    });
  });

  describe('getMarginClass', () => {
    it('should return ms-* logical property (deprecated - always returns logical)', () => {
      vi.mocked(isRTL).mockReturnValue(false);

      const result = getMarginClass(4);
      // Deprecated function now returns logical property ms-* regardless of direction
      expect(result).toBe('ms-4');
    });

    it('should return ms-* logical property for RTL too (deprecated)', () => {
      vi.mocked(isRTL).mockReturnValue(true);

      const result = getMarginClass(4);
      // Deprecated function now returns logical property ms-* regardless of direction
      expect(result).toBe('ms-4');
    });
  });

  describe('getPaddingClass', () => {
    it('should return ps-* logical property (deprecated - always returns logical)', () => {
      vi.mocked(isRTL).mockReturnValue(false);

      const result = getPaddingClass(4);
      // Deprecated function now returns logical property ps-* regardless of direction
      expect(result).toBe('ps-4');
    });

    it('should return ps-* logical property for RTL too (deprecated)', () => {
      vi.mocked(isRTL).mockReturnValue(true);

      const result = getPaddingClass(4);
      // Deprecated function now returns logical property ps-* regardless of direction
      expect(result).toBe('ps-4');
    });
  });

  describe('getTextAlignClass', () => {
    it('should return text-start logical property (deprecated - always returns logical)', () => {
      vi.mocked(isRTL).mockReturnValue(false);

      const result = getTextAlignClass();
      // Deprecated function now returns logical property text-start regardless of direction
      expect(result).toBe('text-start');
    });

    it('should return text-start logical property for RTL too (deprecated)', () => {
      vi.mocked(isRTL).mockReturnValue(true);

      const result = getTextAlignClass();
      // Deprecated function now returns logical property text-start regardless of direction
      expect(result).toBe('text-start');
    });
  });

  describe('getFloatClass', () => {
    it('should return float-start logical property (deprecated - always returns logical)', () => {
      vi.mocked(isRTL).mockReturnValue(false);

      const result = getFloatClass();
      // Deprecated function now returns logical property float-start regardless of direction
      expect(result).toBe('float-start');
    });

    it('should return float-start logical property for RTL too (deprecated)', () => {
      vi.mocked(isRTL).mockReturnValue(true);

      const result = getFloatClass();
      // Deprecated function now returns logical property float-start regardless of direction
      expect(result).toBe('float-start');
    });
  });

  describe('getBorderClass', () => {
    it('should return border-s-* logical property for left side (deprecated)', () => {
      vi.mocked(isRTL).mockReturnValue(false);

      const result = getBorderClass('left', '2');
      // Deprecated function now returns logical property border-s-* for left
      expect(result).toBe('border-s-2');
    });

    it('should return border-s-* logical property for left side in RTL too (deprecated)', () => {
      vi.mocked(isRTL).mockReturnValue(true);

      const result = getBorderClass('left', '2');
      // Deprecated function now returns logical property border-s-* for left
      expect(result).toBe('border-s-2');
    });

    it('should return border-e-* logical property for right side (deprecated)', () => {
      vi.mocked(isRTL).mockReturnValue(false);

      const result = getBorderClass('right', '2');
      // Deprecated function now returns logical property border-e-* for right
      expect(result).toBe('border-e-2');
    });

    it('should return border-e-* logical property for right side in RTL too (deprecated)', () => {
      vi.mocked(isRTL).mockReturnValue(true);

      const result = getBorderClass('right', '2');
      // Deprecated function now returns logical property border-e-* for right
      expect(result).toBe('border-e-2');
    });
  });

  describe('getRoundedClass', () => {
    it('should return rounded-s-* logical property for left side (deprecated)', () => {
      vi.mocked(isRTL).mockReturnValue(false);

      const result = getRoundedClass('left', 'lg');
      // Deprecated function now returns logical property rounded-s-* for left
      expect(result).toBe('rounded-s-lg');
    });

    it('should return rounded-s-* logical property for left side in RTL too (deprecated)', () => {
      vi.mocked(isRTL).mockReturnValue(true);

      const result = getRoundedClass('left', 'lg');
      // Deprecated function now returns logical property rounded-s-* for left
      expect(result).toBe('rounded-s-lg');
    });

    it('should return rounded-e-* logical property for right side (deprecated)', () => {
      vi.mocked(isRTL).mockReturnValue(false);

      const result = getRoundedClass('right', 'lg');
      // Deprecated function now returns logical property rounded-e-* for right
      expect(result).toBe('rounded-e-lg');
    });
  });

  describe('getTransformClass', () => {
    it('should return unchanged class for LTR', () => {
      
      vi.mocked(isRTL).mockReturnValue(false);
      
      const result = getTransformClass('translate-x-4');
      expect(result).toBe('translate-x-4');
    });

    it('should return flipped class for RTL', () => {
      
      vi.mocked(isRTL).mockReturnValue(true);
      
      const result = getTransformClass('translate-x-4');
      expect(result).toBe('translate-x--4');
    });

    it('should handle negative values in RTL', () => {
      
      vi.mocked(isRTL).mockReturnValue(true);
      
      const result = getTransformClass('translate-x--4');
      expect(result).toBe('translate-x-4');
    });
  });

  describe('getIconClass', () => {
    it('should return unchanged class for LTR', () => {
      
      vi.mocked(isRTL).mockReturnValue(false);
      
      const result = getIconClass('test-icon');
      expect(result).toBe('test-icon');
    });

    it('should return scale-x-[-1] for RTL', () => {
      
      vi.mocked(isRTL).mockReturnValue(true);
      
      const result = getIconClass('test-icon');
      expect(result).toBe('test-icon scale-x-[-1]');
    });
  });

  describe('getFlexClass', () => {
    it('should return row for LTR', () => {
      
      vi.mocked(isRTL).mockReturnValue(false);
      
      const result = getFlexClass('row');
      expect(result).toBe('flex-row');
    });

    it('should return row-reverse for RTL', () => {
      
      vi.mocked(isRTL).mockReturnValue(true);
      
      const result = getFlexClass('row');
      expect(result).toBe('flex-row-reverse');
    });

    it('should return row-reverse for LTR row-reverse', () => {
      
      vi.mocked(isRTL).mockReturnValue(false);
      
      const result = getFlexClass('row-reverse');
      expect(result).toBe('flex-row-reverse');
    });
  });

  describe('useRTL hook', () => {
    it('should return RTL state and helpers', () => {

      vi.mocked(isRTL).mockReturnValue(false);

      const result = useRTL();

      expect(result).toEqual({
        isRTL: false,
        isLTR: true,
        getDirectionalClass: expect.any(Function),
        getMarginClass: expect.any(Function),
        getPaddingClass: expect.any(Function),
        getTextAlignClass: expect.any(Function),
        getFloatClass: expect.any(Function),
        getBorderClass: expect.any(Function),
        getRoundedClass: expect.any(Function),
        getTransformClass: expect.any(Function),
        getIconClass: expect.any(Function),
        getFlexClass: expect.any(Function),
      });
    });

    it('should return isRTL true when language is RTL', () => {
      vi.mocked(isRTL).mockReturnValue(true);
      const result = useRTL();
      expect(result.isRTL).toBe(true);
      expect(result.isLTR).toBe(false);
    });
  });
});

// =============================================================================
// ADDITIONAL COVERAGE TESTS
// =============================================================================

describe('isRTLLanguage', () => {
  it('returns true for Arabic (ar)', () => {
    expect(isRTLLanguage('ar')).toBe(true);
  });

  it('returns true for Hebrew (he)', () => {
    expect(isRTLLanguage('he')).toBe(true);
  });

  it('returns true for Farsi (fa)', () => {
    expect(isRTLLanguage('fa')).toBe(true);
  });

  it('returns true for all RTL languages', () => {
    for (const lang of RTL_LANGUAGES) {
      expect(isRTLLanguage(lang)).toBe(true);
    }
  });

  it('returns false for English (en)', () => {
    expect(isRTLLanguage('en')).toBe(false);
  });

  it('returns false for French (fr)', () => {
    expect(isRTLLanguage('fr')).toBe(false);
  });

  it('strips region code and checks base language', () => {
    expect(isRTLLanguage('ar-SA')).toBe(true);
    expect(isRTLLanguage('he-IL')).toBe(true);
    expect(isRTLLanguage('en-US')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(isRTLLanguage('AR')).toBe(true);
    expect(isRTLLanguage('HE')).toBe(true);
    expect(isRTLLanguage('EN')).toBe(false);
  });
});

describe('getDirection', () => {
  afterEach(() => {
    document.documentElement.dir = 'ltr';
  });

  it('returns ltr when document dir is ltr', () => {
    document.documentElement.dir = 'ltr';
    expect(getDirection()).toBe('ltr');
  });

  it('returns rtl when document dir is rtl', () => {
    document.documentElement.dir = 'rtl';
    expect(getDirection()).toBe('rtl');
  });

  it('returns ltr as default when dir is empty', () => {
    document.documentElement.removeAttribute('dir');
    expect(getDirection()).toBe('ltr');
  });
});

describe('setDirection', () => {
  afterEach(() => {
    document.documentElement.dir = 'ltr';
  });

  it('sets dir attribute to rtl', () => {
    setDirection('rtl');
    expect(document.documentElement.dir).toBe('rtl');
    expect(document.documentElement.getAttribute('dir')).toBe('rtl');
  });

  it('sets dir attribute to ltr', () => {
    setDirection('rtl');
    setDirection('ltr');
    expect(document.documentElement.dir).toBe('ltr');
    expect(document.documentElement.getAttribute('dir')).toBe('ltr');
  });
});

describe('toggleDirection', () => {
  afterEach(() => {
    document.documentElement.dir = 'ltr';
    vi.mocked(isRTL).mockReturnValue(false);
  });

  it('toggles from ltr to rtl when current is ltr', () => {
    vi.mocked(isRTL).mockReturnValue(false);
    const result = toggleDirection();
    expect(result).toBe('rtl');
    expect(document.documentElement.dir).toBe('rtl');
  });

  it('toggles from rtl to ltr when current is rtl', () => {
    vi.mocked(isRTL).mockReturnValue(true);
    const result = toggleDirection();
    expect(result).toBe('ltr');
    expect(document.documentElement.dir).toBe('ltr');
  });
});

describe('useDirection', () => {
  beforeEach(() => {
    document.documentElement.dir = 'ltr';
  });

  afterEach(() => {
    document.documentElement.dir = 'ltr';
  });

  it('returns current document direction', () => {
    document.documentElement.dir = 'ltr';
    const { result } = renderHook(() => useDirection());
    expect(result.current).toBe('ltr');
  });

  it('returns rtl when document dir is rtl', () => {
    document.documentElement.dir = 'rtl';
    const { result } = renderHook(() => useDirection());
    expect(result.current).toBe('rtl');
  });

  it('updates when dir attribute changes via MutationObserver', async () => {
    document.documentElement.dir = 'ltr';
    const { result } = renderHook(() => useDirection());
    expect(result.current).toBe('ltr');

    act(() => {
      document.documentElement.setAttribute('dir', 'rtl');
    });

    // Give the MutationObserver time to fire
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(result.current).toBe('rtl');
  });
});

describe('useDirectionControls', () => {
  afterEach(() => {
    document.documentElement.dir = 'ltr';
    vi.mocked(isRTL).mockReturnValue(false);
  });

  it('returns [dir, toggle, setDir] tuple', () => {
    document.documentElement.dir = 'ltr';
    const { result } = renderHook(() => useDirectionControls());
    const [dir, toggle, setDir] = result.current;
    expect(dir).toBe('ltr');
    expect(typeof toggle).toBe('function');
    expect(typeof setDir).toBe('function');
  });

  it('setDir changes the document direction', () => {
    document.documentElement.dir = 'ltr';
    const { result } = renderHook(() => useDirectionControls());
    const [, , setDir] = result.current;
    act(() => {
      setDir('rtl');
    });
    expect(document.documentElement.dir).toBe('rtl');
  });

  it('toggle switches direction', () => {
    vi.mocked(isRTL).mockReturnValue(false);
    document.documentElement.dir = 'ltr';
    const { result } = renderHook(() => useDirectionControls());
    const [, toggle] = result.current;
    act(() => {
      toggle();
    });
    expect(document.documentElement.dir).toBe('rtl');
  });
});

describe('shouldMirrorIcon', () => {
  it('returns true for icons in MIRROR_ICONS set', () => {
    expect(shouldMirrorIcon('ChevronRight')).toBe(true);
    expect(shouldMirrorIcon('ArrowLeft')).toBe(true);
    expect(shouldMirrorIcon('LogIn')).toBe(true);
    expect(shouldMirrorIcon('Forward')).toBe(true);
  });

  it('returns false for icons not in MIRROR_ICONS set', () => {
    expect(shouldMirrorIcon('Search')).toBe(false);
    expect(shouldMirrorIcon('Settings')).toBe(false);
    expect(shouldMirrorIcon('User')).toBe(false);
  });

  it('returns false for unknown icon names', () => {
    expect(shouldMirrorIcon('UnknownIcon')).toBe(false);
    expect(shouldMirrorIcon('')).toBe(false);
  });

  it('all MIRROR_ICONS entries return true', () => {
    for (const icon of MIRROR_ICONS) {
      expect(shouldMirrorIcon(icon)).toBe(true);
    }
  });

  it('all NO_MIRROR_ICONS entries return false', () => {
    for (const icon of NO_MIRROR_ICONS) {
      expect(shouldMirrorIcon(icon)).toBe(false);
    }
  });
});

describe('getMirrorClass', () => {
  afterEach(() => {
    vi.mocked(isRTL).mockReturnValue(false);
  });

  it('returns empty string for non-mirror icon regardless of direction', () => {
    vi.mocked(isRTL).mockReturnValue(true);
    expect(getMirrorClass('Search')).toBe('');
  });

  it('returns empty string for mirror icon in LTR', () => {
    vi.mocked(isRTL).mockReturnValue(false);
    expect(getMirrorClass('ChevronRight')).toBe('');
  });

  it('returns rtl:scale-x-[-1] for mirror icon in RTL', () => {
    vi.mocked(isRTL).mockReturnValue(true);
    expect(getMirrorClass('ChevronRight')).toBe('rtl:scale-x-[-1]');
  });

  it('returns rtl:scale-x-[-1] for ArrowLeft in RTL', () => {
    vi.mocked(isRTL).mockReturnValue(true);
    expect(getMirrorClass('ArrowLeft')).toBe('rtl:scale-x-[-1]');
  });

  it('returns empty string for unknown icon name', () => {
    vi.mocked(isRTL).mockReturnValue(true);
    expect(getMirrorClass('UnknownIcon')).toBe('');
  });
});

describe('useIconMirror', () => {
  afterEach(() => {
    document.documentElement.dir = 'ltr';
  });

  it('returns empty string for non-mirror icon in LTR', () => {
    document.documentElement.dir = 'ltr';
    const { result } = renderHook(() => useIconMirror('Search'));
    expect(result.current).toBe('');
  });

  it('returns empty string for mirror icon in LTR', () => {
    document.documentElement.dir = 'ltr';
    const { result } = renderHook(() => useIconMirror('ChevronRight'));
    expect(result.current).toBe('');
  });

  it('returns scale-x-[-1] for mirror icon in RTL', () => {
    document.documentElement.dir = 'rtl';
    const { result } = renderHook(() => useIconMirror('ChevronRight'));
    expect(result.current).toBe('scale-x-[-1]');
  });

  it('returns empty string for non-mirror icon in RTL', () => {
    document.documentElement.dir = 'rtl';
    const { result } = renderHook(() => useIconMirror('Search'));
    expect(result.current).toBe('');
  });
});

describe('getLogicalAlign', () => {
  it('returns start for left', () => {
    expect(getLogicalAlign('left')).toBe('start');
  });

  it('returns end for right', () => {
    expect(getLogicalAlign('right')).toBe('end');
  });
});
