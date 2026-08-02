// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * SECURITY (Round 4, fix #31): centralized sensitive-clipboard helper.
 *
 * Previously each component scheduled its own 30s clipboard auto-wipe
 * timer (or none at all) and cleared it in its unmount cleanup, which
 * meant navigating away within 30s CANCELED the wipe and left the
 * secret on the clipboard indefinitely.
 *
 * This module owns a single MODULE-LEVEL timer so the wipe survives
 * component unmount. Copying again before the wipe fires reschedules
 * it (only one wipe is ever pending). The wipe is best-effort: before
 * overwriting, it tries to read the clipboard and skips the wipe if
 * the user has since copied something else; all clipboard errors
 * (e.g. document not focused, permission denied) are swallowed.
 */

/** How long a copied secret is allowed to live on the clipboard. */
export const CLIPBOARD_CLEAR_MS = 30_000;

let wipeTimer: ReturnType<typeof setTimeout> | undefined;

/** Best-effort clipboard wipe; never throws. */
async function wipeClipboard(expected: string): Promise<void> {
  try {
    // Cheaply avoid clobbering unrelated content the user copied since.
    // readText may be unavailable (Firefox) or throw (focus/permission);
    // in that case fall through to the unconditional best-effort wipe.
    if (typeof navigator.clipboard.readText === "function") {
      try {
        const current = await navigator.clipboard.readText();
        if (current !== expected) return;
      } catch {
        // Can't read — proceed with the wipe attempt anyway.
      }
    }
    await navigator.clipboard.writeText("");
  } catch {
    // Clipboard may not be available (e.g. document not focused).
  }
}

/**
 * Copy a secret to the clipboard and schedule an auto-wipe after
 * CLIPBOARD_CLEAR_MS. Throws if the initial write fails (callers show
 * their own error toast), but the deferred wipe never throws.
 */
export async function copySensitiveText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);

  if (wipeTimer !== undefined) clearTimeout(wipeTimer);
  wipeTimer = setTimeout(() => {
    wipeTimer = undefined;
    void wipeClipboard(text);
  }, CLIPBOARD_CLEAR_MS);
}
