// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Schemes that are safe to hand to `window.open`.
 *
 * SECURITY: vault item URLs are user-controlled — and in shared org vaults they
 * are controlled by *other* members. Opening such a value without checking its
 * scheme can execute attacker-chosen `javascript:`/`data:`/`vbscript:` URIs
 * (web `window.open` mostly blocks top-level navigations to these now, but
 * Browser handling of non-http schemes is
 * OS-dependent). We allow only navigational web/mail schemes.
 */
const SAFE_URL_SCHEMES = new Set(["http:", "https:", "mailto:"]);

/**
 * Returns true if `value` is safe to open externally. Relative URLs (no scheme,
 * e.g. "/docs") are allowed — they resolve against our own origin. Anything with
 * a non-allowlisted scheme (javascript:, data:, file:, vbscript:, …) is rejected.
 */
export function isSafeExternalUrl(value: string): boolean {
	if (typeof value !== "string" || value.trim() === "") return false;

	let parsed: URL;
	try {
		// Resolve against a fixed base so relative URLs become http(s) and are allowed.
		parsed = new URL(value, "https://pssmngr.com");
	} catch {
		return false;
	}
	return SAFE_URL_SCHEMES.has(parsed.protocol);
}

/**
 * Open an external URL only if its scheme is allowlisted. Returns true when the
 * URL was opened, false when it was rejected as unsafe.
 */
export async function openExternalUrlSafe(value: string): Promise<boolean> {
	if (!isSafeExternalUrl(value)) {
		if (import.meta.env?.DEV) {
			console.warn("[safe-external-url] refused to open unsafe URL:", value);
		}
		return false;
	}
	window.open(value, "_blank", "noopener,noreferrer");
	return true;
}
