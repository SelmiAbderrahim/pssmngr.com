// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import {
	DEFAULT_LANGUAGE,
	SUPPORTED_LANGUAGES,
	type SupportedLanguage,
} from "./index";

/**
 * Represents a parsed language preference from Accept-Language header.
 */
interface LanguagePreference {
	/** Language code (e.g., 'en', 'ar') */
	code: string;
	/** Optional region code (e.g., 'US', 'SA') */
	region?: string;
	/** Quality value (0-1, default 1) */
	quality: number;
	/** Original value from header */
	original: string;
}

/**
 * Parse a single language entry from Accept-Language header.
 *
 * @example
 * parseLanguageEntry('en-US;q=0.9')
 * // Returns: { code: 'en', region: 'US', quality: 0.9, original: 'en-US' }
 */
function parseLanguageEntry(entry: string): LanguagePreference | null {
	const trimmed = entry.trim();
	if (!trimmed) return null;

	// Split on semicolon to separate language from quality
	const parts = trimmed.split(";");
	const langPart = parts[0];
	const qualityParts = parts.slice(1);

	if (!langPart) return null;
	const langTrimmed = langPart.trim();
	if (!langTrimmed) return null;

	// Parse quality value (default 1 if not specified)
	let quality = 1;
	for (const part of qualityParts) {
		const qMatch = part.trim().match(/^q\s*=\s*([\d.]+)$/i);
		if (qMatch?.[1]) {
			const parsedQ = Number.parseFloat(qMatch[1]);
			if (!Number.isNaN(parsedQ) && parsedQ >= 0 && parsedQ <= 1) {
				quality = parsedQ;
			}
		}
	}

	// Parse language and optional region (e.g., 'en-US' → ['en', 'US'])
	const langParts = langTrimmed.toLowerCase().split("-");
	const code = langParts[0];
	const region = langParts[1];

	if (!code) return null;

	return {
		code,
		region: region?.toUpperCase(),
		quality,
		original: langTrimmed,
	};
}

/**
 * Parse the Accept-Language header into a sorted list of language preferences.
 *
 * @param header - The Accept-Language header value
 * @returns Array of parsed preferences, sorted by quality (descending)
 *
 * @example
 * parseAcceptLanguageHeader('en-US,en;q=0.9,ar;q=0.8')
 * // Returns: [
 * //   { code: 'en', region: 'US', quality: 1, original: 'en-us' },
 * //   { code: 'en', quality: 0.9, original: 'en' },
 * //   { code: 'ar', quality: 0.8, original: 'ar' },
 * // ]
 */
export function parseAcceptLanguageHeader(
	header: string,
): LanguagePreference[] {
	if (!header || typeof header !== "string") {
		return [];
	}

	return header
		.split(",")
		.map(parseLanguageEntry)
		.filter((entry): entry is LanguagePreference => entry !== null)
		.sort((a, b) => {
			// Sort by quality (descending)
			if (b.quality !== a.quality) {
				return b.quality - a.quality;
			}
			// For equal quality, prefer more specific (with region)
			if (a.region && !b.region) return -1;
			if (!a.region && b.region) return 1;
			return 0;
		});
}

/**
 * Get the best matching supported language from Accept-Language header.
 *
 * @param header - The Accept-Language header value
 * @returns The best matching supported language, or default language
 *
 * @example
 * parseAcceptLanguage('fr-FR,fr;q=0.9,en;q=0.8')
 * // Returns: 'fr' (if supported)
 *
 * parseAcceptLanguage('zh-CN,zh;q=0.9')
 * // Returns: 'en' (default, since Chinese not supported)
 */
export function parseAcceptLanguage(
	header: string | undefined | null,
): SupportedLanguage {
	// Return default if no header provided
	if (!header) {
		return DEFAULT_LANGUAGE;
	}

	const preferences = parseAcceptLanguageHeader(header);

	// Find first supported language
	for (const pref of preferences) {
		if (SUPPORTED_LANGUAGES.includes(pref.code as SupportedLanguage)) {
			return pref.code as SupportedLanguage;
		}
	}

	// No supported language found, return default
	return DEFAULT_LANGUAGE;
}

/**
 * Check if a language code is supported.
 *
 * @param code - Language code to check
 * @returns True if the language is supported
 */
export function isLanguageSupported(code: string): code is SupportedLanguage {
	return SUPPORTED_LANGUAGES.includes(code as SupportedLanguage);
}

/**
 * Normalize a language code to a supported language.
 *
 * @param code - Language code to normalize
 * @returns Normalized supported language, or default if not supported
 *
 * @example
 * normalizeLanguage('EN-us') // Returns: 'en'
 * normalizeLanguage('ar-SA') // Returns: 'ar'
 * normalizeLanguage('zh')    // Returns: 'en' (not supported)
 */
export function normalizeLanguage(
	code: string | undefined | null,
): SupportedLanguage {
	if (!code) {
		return DEFAULT_LANGUAGE;
	}

	// Extract base language code and lowercase it
	const baseCode = code.toLowerCase().split("-")[0];

	if (SUPPORTED_LANGUAGES.includes(baseCode as SupportedLanguage)) {
		return baseCode as SupportedLanguage;
	}

	return DEFAULT_LANGUAGE;
}

/**
 * Get the effective language for a request.
 * Priority: user preference > Accept-Language > default
 *
 * @param options - Language detection options
 * @returns The effective language for the request
 */
export function getEffectiveLanguage(options: {
	/** User's stored language preference */
	userPreference?: string | null;
	/** Accept-Language header value */
	acceptLanguage?: string | null;
}): SupportedLanguage {
	const { userPreference, acceptLanguage } = options;

	// 1. User's explicit preference takes priority
	if (userPreference) {
		const normalized = normalizeLanguage(userPreference);
		if (
			normalized !== DEFAULT_LANGUAGE ||
			userPreference.toLowerCase().startsWith("en")
		) {
			return normalized;
		}
	}

	// 2. Parse Accept-Language header
	if (acceptLanguage) {
		return parseAcceptLanguage(acceptLanguage);
	}

	// 3. Default language
	return DEFAULT_LANGUAGE;
}
