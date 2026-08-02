// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * RTL (Right-to-Left) Utilities
 *
 * Helper functions for handling RTL layout and text direction
 * Particularly important for Arabic language support
 *
 * @module lib/rtl
 * @rtl Full RTL support with logical properties
 * @responsive Works across all breakpoints
 */

import { isRTL } from "@/i18n";
import { useEffect, useState, useCallback } from "react";

// =============================================================================
// TYPES
// =============================================================================

export type Direction = "ltr" | "rtl";

// =============================================================================
// RTL LANGUAGES
// =============================================================================

export const RTL_LANGUAGES = [
  "ar", // Arabic
  "he", // Hebrew
  "fa", // Farsi/Persian
  "ur", // Urdu
  "yi", // Yiddish
  "ps", // Pashto
  "sd", // Sindhi
] as const;

/**
 * Check if a language code is RTL
 */
export function isRTLLanguage(languageCode: string): boolean {
  const lang = (languageCode.split("-")[0] ?? "").toLowerCase();
  return RTL_LANGUAGES.includes(lang as (typeof RTL_LANGUAGES)[number]);
}

// =============================================================================
// DIRECTION HOOKS
// =============================================================================

/**
 * Get current document direction
 */
export function getDirection(): Direction {
  if (typeof document === "undefined") return "ltr";
  return (document.documentElement.dir as Direction) || "ltr";
}

/**
 * Set document direction
 */
export function setDirection(dir: Direction): void {
  if (typeof document === "undefined") return;
  document.documentElement.dir = dir;
  document.documentElement.setAttribute("dir", dir);
}

/**
 * Toggle direction between LTR and RTL
 */
export function toggleDirection(): Direction {
  const newDir = isRTL() ? "ltr" : "rtl";
  setDirection(newDir);
  return newDir;
}

/**
 * React hook to get current direction with reactive updates
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const dir = useDirection();
 *   return <div className={dir === 'rtl' ? 'me-2' : 'me-2'}>...</div>;
 * }
 * ```
 */
export function useDirection(): Direction {
  const [dir, setDir] = useState<Direction>(() => getDirection());

  useEffect(() => {
    const updateDirection = () => setDir(getDirection());
    updateDirection();

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "attributes" && mutation.attributeName === "dir") {
          updateDirection();
        }
      }
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["dir"],
    });

    return () => observer.disconnect();
  }, []);

  return dir;
}

/**
 * React hook to get direction and toggle function
 */
export function useDirectionControls(): [Direction, () => void, (dir: Direction) => void] {
  const dir = useDirection();
  const toggle = useCallback(() => toggleDirection(), []);
  const setDir = useCallback((newDir: Direction) => setDirection(newDir), []);
  return [dir, toggle, setDir];
}

// =============================================================================
// ICON MIRRORING
// =============================================================================

/**
 * Icons that MUST mirror in RTL
 */
export const MIRROR_ICONS = new Set([
  "ChevronLeft",
  "ChevronRight",
  "ArrowLeft",
  "ArrowRight",
  "ArrowLeftRight",
  "ChevronFirst",
  "ChevronLast",
  "ChevronsLeft",
  "ChevronsRight",
  "CornerUpLeft",
  "CornerUpRight",
  "CornerDownLeft",
  "CornerDownRight",
  "CornerLeftUp",
  "CornerLeftDown",
  "CornerRightUp",
  "CornerRightDown",
  "LogIn",
  "LogOut",
  "Redo",
  "Redo2",
  "Undo",
  "Undo2",
  "RotateCcw",
  "RotateCw",
  "Reply",
  "ReplyAll",
  "Forward",
  "Share",
  "ExternalLink",
  "MoveLeft",
  "MoveRight",
  "IndentDecrease",
  "IndentIncrease",
  "TextAlignLeft",
  "TextAlignRight",
  "SkipBack",
  "SkipForward",
  "Rewind",
  "FastForward",
]);

/**
 * Icons that MUST NOT mirror in RTL
 */
export const NO_MIRROR_ICONS = new Set([
  "Search",
  "Settings",
  "User",
  "Home",
  "Plus",
  "Minus",
  "X",
  "Check",
  "Clock",
  "Calendar",
  "Star",
  "Heart",
  "Mail",
  "Phone",
  "Camera",
  "Mic",
  "Video",
  "Music",
  "Image",
  "File",
  "Folder",
  "Download",
  "Upload",
  "Trash",
  "Edit",
  "Eye",
  "EyeOff",
  "Lock",
  "Unlock",
  "Key",
  "Shield",
  "Bell",
  "Info",
  "AlertCircle",
  "AlertTriangle",
  "HelpCircle",
  "Play",
  "Pause",
  "Stop",
  "Volume",
  "VolumeOff",
  "Menu",
  "MoreVertical",
  "MoreHorizontal",
  "Grid",
  "List",
  "Filter",
  "Sort",
  "Refresh",
  "Sun",
  "Moon",
  "Globe",
]);

/**
 * Check if an icon should be mirrored in RTL
 */
export function shouldMirrorIcon(iconName: string): boolean {
  return MIRROR_ICONS.has(iconName);
}

/**
 * Get mirror class for an icon based on current direction
 *
 * @example
 * ```tsx
 * <ChevronRight className={cn('h-4 w-4', getMirrorClass('ChevronRight'))} />
 * ```
 */
export function getMirrorClass(iconName: string): string {
  if (shouldMirrorIcon(iconName) && isRTL()) {
    return "rtl:scale-x-[-1]";
  }
  return "";
}

/**
 * React hook for icon mirroring
 */
export function useIconMirror(iconName: string): string {
  const dir = useDirection();
  return shouldMirrorIcon(iconName) && dir === "rtl" ? "scale-x-[-1]" : "";
}

/**
 * Get logical alignment value
 */
export function getLogicalAlign(align: "left" | "right"): "start" | "end" {
  return align === "left" ? "start" : "end";
}

// =============================================================================
// RTL HELPER FUNCTIONS
// =============================================================================
//
// ⚠️ DEPRECATION NOTICE ⚠️
//
// These helper functions are DEPRECATED. Use CSS logical properties directly instead:
//
// | Deprecated Function  | Use Instead                                    |
// |---------------------|------------------------------------------------|
// | getMarginClass()    | ms-* / me-* (margin-inline-start/end)         |
// | getPaddingClass()   | ps-* / pe-* (padding-inline-start/end)        |
// | getTextAlignClass() | text-start / text-end                          |
// | getFloatClass()     | float-start / float-end                        |
// | getBorderClass()    | border-s-* / border-e-*                        |
// | getRoundedClass()   | rounded-s-* / rounded-e-*                      |
// | getFlexClass()      | Just use flex-row (native RTL handles reversal)|
//
// Example migration:
//   BEFORE: className={getMarginClass(4)}
//   AFTER:  className="ms-4"
//
// Logical properties automatically handle RTL without JavaScript.
// See: https://tailwindcss.com/blog/tailwindcss-v3-3#logical-properties
// =============================================================================

/**
 * Get direction-aware class names
 * @param ltrClass - Class for LTR languages
 * @param rtlClass - Class for RTL languages
 * @returns Appropriate class based on current language
 * @deprecated Use CSS logical properties or Tailwind RTL variants instead
 */
export function getDirectionalClass(ltrClass: string, rtlClass: string): string {
  return isRTL() ? rtlClass : ltrClass;
}

/**
 * Get direction-aware margin class
 * @param size - Size value (e.g., 4, 8)
 * @returns Appropriate margin class based on text direction
 * @deprecated Use ms-* (margin-inline-start) or me-* (margin-inline-end) instead
 * @example
 * // BEFORE (deprecated):
 * className={getMarginClass(4)}
 *
 * // AFTER (use this):
 * className="ms-4"  // For start margin
 * className="me-4"  // For end margin
 */
export function getMarginClass(size: number): string {
  console.warn('[DEPRECATED] getMarginClass() is deprecated. Use ms-* or me-* logical properties instead.');
  return `ms-${size}`; // Now returns logical property
}

/**
 * Get direction-aware padding class
 * @param size - Size value (e.g., 4, 8)
 * @returns Appropriate padding class based on text direction
 * @deprecated Use ps-* (padding-inline-start) or pe-* (padding-inline-end) instead
 * @example
 * // BEFORE (deprecated):
 * className={getPaddingClass(4)}
 *
 * // AFTER (use this):
 * className="ps-4"  // For start padding
 * className="pe-4"  // For end padding
 */
export function getPaddingClass(size: number): string {
  console.warn('[DEPRECATED] getPaddingClass() is deprecated. Use ps-* or pe-* logical properties instead.');
  return `ps-${size}`; // Now returns logical property
}

/**
 * Get direction-aware text alignment class
 * @returns Appropriate text alignment class based on text direction
 * @deprecated Use text-start or text-end instead
 * @example
 * // BEFORE (deprecated):
 * className={getTextAlignClass()}
 *
 * // AFTER (use this):
 * className="text-start"  // For start alignment
 * className="text-end"    // For end alignment
 */
export function getTextAlignClass(): string {
  console.warn('[DEPRECATED] getTextAlignClass() is deprecated. Use text-start or text-end instead.');
  return "text-start"; // Now returns logical property
}

/**
 * Get direction-aware float class
 * @returns Appropriate float class based on text direction
 * @deprecated Use float-start or float-end instead
 * @example
 * // BEFORE (deprecated):
 * className={getFloatClass()}
 *
 * // AFTER (use this):
 * className="float-start"  // For start float
 * className="float-end"    // For end float
 */
export function getFloatClass(): string {
  console.warn('[DEPRECATED] getFloatClass() is deprecated. Use float-start or float-end instead.');
  return "float-start"; // Now returns logical property
}

/**
 * Get direction-aware border class
 * @param side - Border side (left, right)
 * @param size - Border size
 * @returns Appropriate border class based on text direction
 * @deprecated Use border-s-* or border-e-* instead
 * @example
 * // BEFORE (deprecated):
 * className={getBorderClass('left', '2')}
 *
 * // AFTER (use this):
 * className="border-s-2"  // For start border
 * className="border-e-2"  // For end border
 */
export function getBorderClass(side: "left" | "right", size: string): string {
  console.warn('[DEPRECATED] getBorderClass() is deprecated. Use border-s-* or border-e-* instead.');
  const logicalSide = side === "left" ? "s" : "e";
  return `border-${logicalSide}-${size}`; // Now returns logical property
}

/**
 * Get direction-aware rounded class
 * @param side - Rounded side (left, right)
 * @param size - Rounded size
 * @returns Appropriate rounded class based on text direction
 * @deprecated Use rounded-s-* or rounded-e-* instead
 * @example
 * // BEFORE (deprecated):
 * className={getRoundedClass('left', 'lg')}
 *
 * // AFTER (use this):
 * className="rounded-s-lg"  // For start rounding
 * className="rounded-e-lg"  // For end rounding
 */
export function getRoundedClass(side: "left" | "right", size: string): string {
  console.warn('[DEPRECATED] getRoundedClass() is deprecated. Use rounded-s-* or rounded-e-* instead.');
  const logicalSide = side === "left" ? "s" : "e";
  return `rounded-${logicalSide}-${size}`; // Now returns logical property
}

/**
 * Get direction-aware transform class
 * @param value - Transform value
 * @returns Appropriate transform class based on text direction
 * @deprecated For centering, use CSS logical properties or Tailwind's built-in RTL support
 */
export function getTransformClass(value: string): string {
  // For RTL, we need to flip horizontal transforms
  if (isRTL()) {
    // Flip translateX values
    if (value.includes("translate-x-")) {
      return value.replace(/translate-x-(-?)(\w+)/, (_match, negative, p1) => {
        // Handle negative values - flip the sign
        if (negative === "-") {
          return `translate-x-${p1}`;
        } else {
          return `translate-x--${p1}`;
        }
      });
    }
  }

  return value;
}

/**
 * Get direction-aware icon class
 * @param baseClass - Base icon class
 * @returns Icon class with appropriate direction
 * @deprecated Use getMirrorClass() or rtl:scale-x-[-1] Tailwind variant instead
 */
export function getIconClass(baseClass: string): string {
  return isRTL() ? `${baseClass} scale-x-[-1]` : baseClass;
}

/**
 * Get direction-aware flex class
 * @param direction - Flex direction (row, row-reverse)
 * @returns Appropriate flex class based on text direction
 * @deprecated Just use `flex-row` - native RTL (dir="rtl" on HTML) handles reversal automatically.
 * Do NOT use rtl:flex-row-reverse as it causes double-reversal!
 * @example
 * // BEFORE (deprecated):
 * className={getFlexClass('row')}
 *
 * // AFTER (correct):
 * className="flex-row"  // Native RTL handles reversal
 */
export function getFlexClass(direction: "row" | "row-reverse"): string {
  console.warn('[DEPRECATED] getFlexClass() is deprecated. Just use flex-row - native RTL handles reversal.');
  if (isRTL()) {
    return direction === "row" ? "flex-row-reverse" : "flex-row";
  }
  return `flex-${direction}`;
}

// =============================================================================
// RTL HOOK
// =============================================================================

/**
 * Hook for RTL-aware components
 * @returns RTL state and helper functions
 * @deprecated The helper functions in this hook are deprecated.
 * Use CSS logical properties and Tailwind RTL variants directly instead:
 *
 * @example
 * // INSTEAD of using useRTL():
 * const { getMarginClass } = useRTL();
 * <div className={getMarginClass(4)}>...</div>
 *
 * // USE logical properties directly:
 * <div className="ms-4">...</div>
 *
 * // For direction checks, use useDirection() hook instead:
 * const dir = useDirection();
 * if (dir === 'rtl') { ... }
 */
export function useRTL() {
  const rtl = isRTL();

  return {
    isRTL: rtl,
    isLTR: !rtl,
    /** @deprecated Use ms-* / me-* instead */
    getDirectionalClass,
    /** @deprecated Use ms-* / me-* instead */
    getMarginClass,
    /** @deprecated Use ps-* / pe-* instead */
    getPaddingClass,
    /** @deprecated Use text-start / text-end instead */
    getTextAlignClass,
    /** @deprecated Use float-start / float-end instead */
    getFloatClass,
    /** @deprecated Use border-s-* / border-e-* instead */
    getBorderClass,
    /** @deprecated Use rounded-s-* / rounded-e-* instead */
    getRoundedClass,
    /** @deprecated Use CSS logical properties instead */
    getTransformClass,
    /** @deprecated Use getMirrorClass() instead */
    getIconClass,
    /** @deprecated Just use flex-row - native RTL handles reversal */
    getFlexClass,
  };
}
