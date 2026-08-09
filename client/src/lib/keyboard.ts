// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Shared keyboard utilities for shortcut handling.
 *
 * Provides platform-aware helpers for matching key combos,
 * formatting shortcut labels, and detecting input focus.
 */

/**
 * Check if an input element is currently focused.
 * Returns true when active element is an input, textarea, or contentEditable.
 */
export function isInputFocused(): boolean {
  const activeElement = document.activeElement;
  if (!activeElement) return false;

  const tagName = activeElement.tagName.toLowerCase();
  return (
    tagName === "input" ||
    tagName === "textarea" ||
    (activeElement as HTMLElement).isContentEditable
  );
}

/**
 * Detect if the current platform is macOS.
 */
export function isMac(): boolean {
  // navigator.platform is deprecated but widely supported;
  // navigator.userAgentData is the modern alternative but not universal yet
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPod|iPad/.test(navigator.platform);
}

/**
 * Format a shortcut key array into a human-readable string.
 *
 * Keys use the convention:
 * - "mod" = Cmd on Mac, Ctrl elsewhere
 * - "shift", "alt"
 * - Single characters like "1", "k", "r", "/"
 *
 * @example formatShortcut(["mod", "shift", "1"]) // "⌘⇧1" on Mac, "Ctrl+Shift+1" on Windows
 */
export function formatShortcut(keys: string[]): string {
  const mac = isMac();

  return keys
    .map((key) => {
      switch (key.toLowerCase()) {
        case "mod":
          return mac ? "\u2318" : "Ctrl";
        case "shift":
          return mac ? "\u21E7" : "Shift";
        case "alt":
          return mac ? "\u2325" : "Alt";
        case "enter":
          return mac ? "\u21A9" : "Enter";
        case "escape":
          return "Esc";
        case "/":
          return "/";
        default:
          return key.toUpperCase();
      }
    })
    .join(mac ? "" : "+");
}

/**
 * Check whether a KeyboardEvent matches a shortcut key array.
 *
 * @example matchesShortcut(event, ["mod", "shift", "1"])
 */
export function matchesShortcut(
  e: KeyboardEvent,
  keys: string[],
): boolean {
  const requiresMod = keys.includes("mod");
  const requiresShift = keys.includes("shift");
  const requiresAlt = keys.includes("alt");

  // Check modifier keys
  const modPressed = e.metaKey || e.ctrlKey;
  if (requiresMod !== modPressed) return false;
  if (requiresShift !== e.shiftKey) return false;
  if (requiresAlt !== e.altKey) return false;

  // Find the non-modifier key
  const mainKey = keys.find(
    (k) => !["mod", "shift", "alt"].includes(k.toLowerCase()),
  );
  if (!mainKey) return false;

  return e.key.toLowerCase() === mainKey.toLowerCase();
}
