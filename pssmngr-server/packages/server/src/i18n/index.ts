// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import i18next, { type TFunction } from "i18next";
import Backend from "i18next-fs-backend";

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Resolve the locales directory by trying multiple paths.
 * Handles production Docker (where __dirname may not contain locales),
 * development, and bundled environments.
 */
function resolveLocalesDir(): string {
	const candidates = [
		process.env.I18N_LOCALES_PATH,
		path.join(__dirname, "locales"),
		path.join(process.cwd(), "node_modules/@pssmngr/server/dist/i18n/locales"),
		path.join(process.cwd(), "node_modules/@pssmngr/server/src/i18n/locales"),
	].filter(Boolean) as string[];

	for (const dir of candidates) {
		try {
			if (fs.existsSync(path.join(dir, "en/errors.json"))) {
				return dir;
			}
		} catch {
			// skip inaccessible paths
		}
	}

	// Fallback to __dirname-based (original behavior)
	return path.join(__dirname, "locales");
}

// Supported languages (must match client exactly)
export const SUPPORTED_LANGUAGES = ["en", "ar", "fr", "de", "es"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export const DEFAULT_LANGUAGE: SupportedLanguage = "en";

// Namespaces for backend translations
export const NAMESPACES = [
	"errors",
	"validation",
	"permissions",
	"emails",
] as const;
export type Namespace = (typeof NAMESPACES)[number];

// Track initialization state
let initialized = false;
let initPromise: Promise<typeof i18next> | null = null;

/**
 * Initialize i18next for server-side use.
 * This function is idempotent and safe to call multiple times.
 */
export async function initI18n(): Promise<typeof i18next> {
	// Return existing instance if already initialized
	if (initialized) {
		return i18next;
	}

	// Return pending initialization if in progress
	if (initPromise) {
		return initPromise;
	}

	initPromise = i18next
		.use(Backend)
		.init({
			// Default language
			lng: DEFAULT_LANGUAGE,

			// Fallback chain
			fallbackLng: DEFAULT_LANGUAGE,

			// Supported languages
			supportedLngs: [...SUPPORTED_LANGUAGES],

			// Namespaces configuration
			ns: [...NAMESPACES],
			defaultNS: "errors",

			// Backend options for loading from filesystem
			backend: {
				loadPath: path.join(resolveLocalesDir(), "{{lng}}/{{ns}}.json"),
				addPath: path.join(__dirname, "locales/{{lng}}/{{ns}}.missing.json"),
			},

			// Interpolation settings (match client configuration)
			interpolation: {
				escapeValue: false, // Not needed for server-side
				skipOnVariables: false,
			},

			// Preload all languages on startup for performance
			preload: [...SUPPORTED_LANGUAGES],

			// Return key if translation missing (for debugging)
			returnEmptyString: false,
			returnNull: false,

			// Debug mode (disable in production)
			debug: process.env.NODE_ENV === "development",

			// Logging
			saveMissing: process.env.NODE_ENV === "development",
			missingKeyHandler: (lngs, ns, key, _fallbackValue) => {
				if (process.env.NODE_ENV === "development") {
					console.warn(
						`[i18n] Missing translation: ${lngs.join(",")}/${ns}/${key}`,
					);
				}
			},
		})
		.then(() => {
			initialized = true;
			return i18next;
		});

	return initPromise;
}

/**
 * Check if i18next is initialized.
 */
export function isInitialized(): boolean {
	return initialized;
}

/**
 * Get a translator function fixed to a specific language.
 *
 * @param language - The language code (e.g., 'en', 'ar')
 * @returns A translation function bound to the specified language
 */
export function getTranslator(language: string): TFunction {
	// Validate language and fallback to default if unsupported
	const validLanguage = SUPPORTED_LANGUAGES.includes(
		language as SupportedLanguage,
	)
		? (language as SupportedLanguage)
		: DEFAULT_LANGUAGE;

	return i18next.getFixedT(validLanguage);
}

/**
 * Get a translator function for a specific language and namespace.
 *
 * @param language - The language code
 * @param namespace - The namespace to use
 * @returns A translation function bound to language and namespace
 */
export function getNamespacedTranslator(
	language: string,
	namespace: Namespace,
): TFunction {
	const validLanguage = SUPPORTED_LANGUAGES.includes(
		language as SupportedLanguage,
	)
		? (language as SupportedLanguage)
		: DEFAULT_LANGUAGE;

	return i18next.getFixedT(validLanguage, namespace);
}

/**
 * Check if a language is supported.
 *
 * @param language - The language code to check
 * @returns True if the language is supported
 */
export function isSupportedLanguage(
	language: string,
): language is SupportedLanguage {
	return SUPPORTED_LANGUAGES.includes(language as SupportedLanguage);
}

/**
 * Get the i18next instance (for advanced use cases).
 * Throws if not initialized.
 */
export function getI18nInstance(): typeof i18next {
	if (!initialized) {
		throw new Error("i18n not initialized. Call initI18n() first.");
	}
	return i18next;
}

/**
 * Reset i18n for testing purposes.
 * This should only be used in test environments.
 */
export function resetI18nForTesting(): void {
	initialized = false;
	initPromise = null;
}

// Re-export types for convenience
export type { TFunction } from "i18next";
// Re-export error helpers for tRPC integration
export {
	badRequestError,
	// Resource operation errors
	createFailedError,
	deleteFailedError,
	forbiddenError,
	internalError,
	notFoundError,
	// Permission errors
	permissionError,
	// Generic errors
	unauthorizedError,
	updateFailedError,
	// Utility
	wrapError,
} from "./errors";
// Re-export language detection utilities
export {
	getEffectiveLanguage,
	isLanguageSupported,
	normalizeLanguage,
	parseAcceptLanguage,
	parseAcceptLanguageHeader,
} from "./language-detection";

// Re-export typed translator utilities
export {
	buildKey,
	createNamespacedTranslator,
	createTypedTranslator,
	extractKeyPath,
	extractNamespace,
	isValidTranslationKey,
} from "./typed-translator";
// Re-export type definitions
export * from "./types";

// Re-export Zod error map utilities for validation localization
export {
	applyLocalizedZodErrorMap,
	createZodErrorMap,
	formatZodErrorsWithTranslations,
	getLocalizedIssues,
	parseWithLocalizedErrors,
	validateWithLocalizedErrors,
} from "./zod-error-map";
