// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Clipboard Utility
 *
 * Provides cross-browser clipboard functionality with fallback for non-secure contexts (HTTP).
 * The modern Clipboard API requires HTTPS, so we fall back to document.execCommand for HTTP.
 *
 * @module lib/utils/clipboard
 */

/**
 * Copy text to clipboard with fallback for non-secure contexts
 *
 * @param text - The text to copy to clipboard
 * @returns Promise<boolean> - True if copy succeeded, false otherwise
 *
 * @example
 * ```typescript
 * const success = await copyToClipboard('Hello World');
 * if (success) {
 *   toast.success('Copied!');
 * } else {
 *   toast.error('Failed to copy');
 * }
 * ```
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  // Try modern clipboard API first (requires secure context - HTTPS)
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to legacy method
    }
  }

  // Fallback: Create temporary textarea element
  // This works in non-secure contexts (HTTP)
  const textarea = document.createElement("textarea");
  textarea.value = text;

  // Prevent scrolling to bottom of page in some browsers
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "-9999px";
  textarea.style.opacity = "0";
  textarea.setAttribute("readonly", ""); // Prevent mobile keyboard popup

  document.body.appendChild(textarea);
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length); // For mobile devices

  try {
    const success = document.execCommand("copy");
    return success;
  } catch {
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
}
