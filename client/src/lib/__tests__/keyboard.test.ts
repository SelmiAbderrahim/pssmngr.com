// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  isInputFocused,
  isMac,
  formatShortcut,
  matchesShortcut,
} from '@/lib/keyboard';

// ---------------------------------------------------------------------------
// Helper: build a synthetic KeyboardEvent with the given properties.
// ---------------------------------------------------------------------------
function makeKeyEvent(
  key: string,
  {
    ctrlKey = false,
    metaKey = false,
    shiftKey = false,
    altKey = false,
  }: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean; altKey?: boolean } = {},
): KeyboardEvent {
  return new KeyboardEvent('keydown', { key, ctrlKey, metaKey, shiftKey, altKey, bubbles: true });
}

// ---------------------------------------------------------------------------
// Helper: spy on document.activeElement to return a given element.
// ---------------------------------------------------------------------------
function mockActiveElement(el: Element | null): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(document, 'activeElement', 'get').mockReturnValue(el);
}

describe('keyboard', () => {
  // -------------------------------------------------------------------------
  // isInputFocused
  // -------------------------------------------------------------------------
  describe('isInputFocused', () => {
    let spy: ReturnType<typeof vi.spyOn>;

    afterEach(() => {
      spy?.mockRestore();
    });

    it('returns true when an <input> element is focused', () => {
      const el = document.createElement('input');
      spy = mockActiveElement(el);
      expect(isInputFocused()).toBe(true);
    });

    it('returns true when a <textarea> element is focused', () => {
      const el = document.createElement('textarea');
      spy = mockActiveElement(el);
      expect(isInputFocused()).toBe(true);
    });

    it('returns falsy when a contentEditable div is focused (isContentEditable path)', () => {
      // isContentEditable is undefined in this JSDOM version; the short-circuit
      // expression returns undefined (falsy) for non-input/textarea elements.
      // This test exercises the isContentEditable branch in the source.
      const el = document.createElement('div');
      el.contentEditable = 'true';
      spy = mockActiveElement(el);
      // The expression reaches (el as HTMLElement).isContentEditable which is
      // undefined in JSDOM – resulting in a falsy (undefined) return value.
      expect(isInputFocused()).toBeFalsy();
    });

    it('returns falsy when a non-input element (button) is focused', () => {
      // tagName === "input" → false, === "textarea" → false,
      // isContentEditable → undefined (JSDOM limitation) → result is falsy
      const el = document.createElement('button');
      spy = mockActiveElement(el);
      expect(isInputFocused()).toBeFalsy();
    });

    it('returns falsy when a non-input block element (div) is focused', () => {
      const el = document.createElement('div');
      spy = mockActiveElement(el);
      expect(isInputFocused()).toBeFalsy();
    });

    it('returns false when activeElement is null', () => {
      spy = mockActiveElement(null);
      expect(isInputFocused()).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // isMac
  // -------------------------------------------------------------------------
  describe('isMac', () => {
    const originalPlatform = navigator.platform;

    afterEach(() => {
      // Restore original platform after each test
      Object.defineProperty(navigator, 'platform', {
        value: originalPlatform,
        writable: true,
        configurable: true,
      });
    });

    function setPlatform(platform: string) {
      Object.defineProperty(navigator, 'platform', {
        value: platform,
        writable: true,
        configurable: true,
      });
    }

    it('returns true for "MacIntel"', () => {
      setPlatform('MacIntel');
      expect(isMac()).toBe(true);
    });

    it('returns true for "Macintosh"', () => {
      setPlatform('Macintosh');
      expect(isMac()).toBe(true);
    });

    it('returns true for "iPhone"', () => {
      setPlatform('iPhone');
      expect(isMac()).toBe(true);
    });

    it('returns true for "iPod"', () => {
      setPlatform('iPod');
      expect(isMac()).toBe(true);
    });

    it('returns true for "iPad"', () => {
      setPlatform('iPad');
      expect(isMac()).toBe(true);
    });

    it('returns false for "Win32" (Windows)', () => {
      setPlatform('Win32');
      expect(isMac()).toBe(false);
    });

    it('returns false for "Linux x86_64"', () => {
      setPlatform('Linux x86_64');
      expect(isMac()).toBe(false);
    });

    it('returns false for an empty platform string', () => {
      setPlatform('');
      expect(isMac()).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // formatShortcut
  // -------------------------------------------------------------------------
  describe('formatShortcut', () => {
    const originalPlatform = navigator.platform;

    afterEach(() => {
      Object.defineProperty(navigator, 'platform', {
        value: originalPlatform,
        writable: true,
        configurable: true,
      });
    });

    function setPlatform(platform: string) {
      Object.defineProperty(navigator, 'platform', {
        value: platform,
        writable: true,
        configurable: true,
      });
    }

    describe('on Mac (MacIntel)', () => {
      beforeEach(() => setPlatform('MacIntel'));

      it('formats "mod" as ⌘', () => {
        expect(formatShortcut(['mod'])).toBe('⌘');
      });

      it('formats "shift" as ⇧', () => {
        expect(formatShortcut(['shift'])).toBe('⇧');
      });

      it('formats "alt" as ⌥', () => {
        expect(formatShortcut(['alt'])).toBe('⌥');
      });

      it('formats "enter" as ↩', () => {
        expect(formatShortcut(['enter'])).toBe('↩');
      });

      it('formats "escape" as Esc', () => {
        expect(formatShortcut(['escape'])).toBe('Esc');
      });

      it('formats "/" as /', () => {
        expect(formatShortcut(['/'])).toBe('/');
      });

      it('formats a single letter key as uppercase', () => {
        expect(formatShortcut(['s'])).toBe('S');
      });

      it('formats mod+s as ⌘S (joined with empty string on Mac)', () => {
        expect(formatShortcut(['mod', 's'])).toBe('⌘S');
      });

      it('formats mod+shift+1 as ⌘⇧1', () => {
        expect(formatShortcut(['mod', 'shift', '1'])).toBe('⌘⇧1');
      });

      it('uses mixed case input for "MOD" gracefully (toLowerCase in switch)', () => {
        expect(formatShortcut(['MOD'])).toBe('⌘');
      });
    });

    describe('on non-Mac (Win32)', () => {
      beforeEach(() => setPlatform('Win32'));

      it('formats "mod" as Ctrl', () => {
        expect(formatShortcut(['mod'])).toBe('Ctrl');
      });

      it('formats "shift" as Shift', () => {
        expect(formatShortcut(['shift'])).toBe('Shift');
      });

      it('formats "alt" as Alt', () => {
        expect(formatShortcut(['alt'])).toBe('Alt');
      });

      it('formats "enter" as Enter', () => {
        expect(formatShortcut(['enter'])).toBe('Enter');
      });

      it('formats "escape" as Esc', () => {
        expect(formatShortcut(['escape'])).toBe('Esc');
      });

      it('formats "/" as /', () => {
        expect(formatShortcut(['/'])).toBe('/');
      });

      it('formats a single letter key as uppercase', () => {
        expect(formatShortcut(['s'])).toBe('S');
      });

      it('formats mod+s as Ctrl+S (joined with + on Windows)', () => {
        expect(formatShortcut(['mod', 's'])).toBe('Ctrl+S');
      });

      it('formats mod+shift+1 as Ctrl+Shift+1', () => {
        expect(formatShortcut(['mod', 'shift', '1'])).toBe('Ctrl+Shift+1');
      });

      it('formats multiple plain keys joined with +', () => {
        expect(formatShortcut(['alt', 's'])).toBe('Alt+S');
      });
    });
  });

  // -------------------------------------------------------------------------
  // matchesShortcut
  // -------------------------------------------------------------------------
  describe('matchesShortcut', () => {
    it('matches Ctrl+S on non-Mac', () => {
      const event = makeKeyEvent('s', { ctrlKey: true });
      expect(matchesShortcut(event, ['mod', 's'])).toBe(true);
    });

    it('matches Meta+S (Cmd+S on Mac)', () => {
      const event = makeKeyEvent('s', { metaKey: true });
      expect(matchesShortcut(event, ['mod', 's'])).toBe(true);
    });

    it('does not match when no modifier is pressed but mod is required', () => {
      const event = makeKeyEvent('s');
      expect(matchesShortcut(event, ['mod', 's'])).toBe(false);
    });

    it('does not match when modifier is pressed but shortcut requires none', () => {
      const event = makeKeyEvent('s', { ctrlKey: true });
      expect(matchesShortcut(event, ['s'])).toBe(false);
    });

    it('does not match when wrong key is pressed', () => {
      const event = makeKeyEvent('k', { ctrlKey: true });
      expect(matchesShortcut(event, ['mod', 's'])).toBe(false);
    });

    it('matches case-insensitively (event key uppercase)', () => {
      const event = makeKeyEvent('S', { ctrlKey: true });
      expect(matchesShortcut(event, ['mod', 's'])).toBe(true);
    });

    it('matches case-insensitively (shortcut key uppercase)', () => {
      const event = makeKeyEvent('s', { ctrlKey: true });
      expect(matchesShortcut(event, ['mod', 'S'])).toBe(true);
    });

    it('matches Ctrl+Shift+S when shift is required', () => {
      const event = makeKeyEvent('s', { ctrlKey: true, shiftKey: true });
      expect(matchesShortcut(event, ['mod', 'shift', 's'])).toBe(true);
    });

    it('does not match when shift is required but not pressed', () => {
      const event = makeKeyEvent('s', { ctrlKey: true, shiftKey: false });
      expect(matchesShortcut(event, ['mod', 'shift', 's'])).toBe(false);
    });

    it('does not match when shift is pressed but not required', () => {
      const event = makeKeyEvent('s', { ctrlKey: true, shiftKey: true });
      expect(matchesShortcut(event, ['mod', 's'])).toBe(false);
    });

    it('matches Alt modifier when alt is required', () => {
      const event = makeKeyEvent('s', { ctrlKey: true, altKey: true });
      expect(matchesShortcut(event, ['mod', 'alt', 's'])).toBe(true);
    });

    it('does not match when alt is required but not pressed', () => {
      const event = makeKeyEvent('s', { ctrlKey: true, altKey: false });
      expect(matchesShortcut(event, ['mod', 'alt', 's'])).toBe(false);
    });

    it('does not match when alt is pressed but not required', () => {
      const event = makeKeyEvent('s', { ctrlKey: true, altKey: true });
      expect(matchesShortcut(event, ['mod', 's'])).toBe(false);
    });

    it('returns false when keys array has only modifiers and no main key', () => {
      const event = makeKeyEvent('s', { ctrlKey: true });
      // No main key in the array — matchesShortcut returns false when mainKey is undefined
      expect(matchesShortcut(event, ['mod'])).toBe(false);
    });

    it('matches a plain key with no modifiers', () => {
      const event = makeKeyEvent('/');
      expect(matchesShortcut(event, ['/'])).toBe(true);
    });

    it('does not match a plain key when wrong key is pressed', () => {
      const event = makeKeyEvent('k');
      expect(matchesShortcut(event, ['/'])).toBe(false);
    });
  });
});
