// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import type { TFunction } from "i18next";

// Import generated types (with fallback for when not generated yet)
import type {
	KeysWithParams,
	Namespace,
	TranslationKey,
	TranslationParams,
} from "./types.generated";

/**
 * Type-safe translation function wrapper.
 *
 * Provides compile-time checking for translation keys and parameters.
 * This ensures that:
 * 1. All translation keys are valid
 * 2. All required interpolation parameters are provided
 * 3. No typos in translation keys slip through to runtime
 *
 * @example
 * const t = createTypedTranslator(ctx.t);
 *
 * // Valid keys compile without errors
 * t('errors:auth.unauthorized'); // OK
 *
 * // Invalid keys cause TypeScript errors
 * t('errors:invalid.key'); // Error: not a valid TranslationKey
 *
 * // Keys with params require the params object
 * t('errors:resource.notFound', { resource: 'Project' }); // OK
 * t('errors:resource.notFound'); // Error: missing required params
 */
export function createTypedTranslator(t: TFunction) {
	/**
	 * Type-safe translation function.
	 *
	 * @param key - The translation key in 'namespace:path.to.key' format
	 * @param params - Required interpolation parameters (if any)
	 * @returns The translated string
	 */
	function typedT<K extends TranslationKey>(
		key: K,
		...args: K extends KeysWithParams
			? [params: TranslationParams<K>]
			: [params?: Record<string, string | number>]
	): string {
		const params = args[0];
		return t(key, params as Record<string, unknown>);
	}

	return typedT;
}

/**
 * Type guard for checking if a string is a valid translation key.
 *
 * Note: This is a runtime check that validates the key format.
 * For compile-time safety, use the typed translator.
 *
 * @param key - The string to check
 * @returns True if the key has valid format (namespace:key)
 *
 * @example
 * if (isValidTranslationKey(userInput)) {
 *   // userInput is now typed as TranslationKey
 *   t(userInput);
 * }
 */
export function isValidTranslationKey(key: string): key is TranslationKey {
	// Check format: namespace:key.path
	if (!key.includes(":")) return false;

	const [namespace, keyPath] = key.split(":", 2);

	// Validate namespace
	const validNamespaces: Namespace[] = [
		"errors",
		"validation",
		"permissions",
		"emails",
	];
	if (!validNamespaces.includes(namespace as Namespace)) return false;

	// Validate key path exists and has valid format
	if (!keyPath || keyPath.includes(" ")) return false;

	return true;
}

/**
 * Helper to build namespaced keys with type safety.
 *
 * Use this when you need to construct keys dynamically while
 * maintaining type safety.
 *
 * @param namespace - The translation namespace
 * @param key - The key within the namespace (dot notation)
 * @returns The full namespaced key
 *
 * @example
 * const key = buildKey('errors', 'auth.unauthorized');
 * // Returns: 'errors:auth.unauthorized' with correct type
 */
export function buildKey<NS extends Namespace, K extends string>(
	namespace: NS,
	key: K,
): `${NS}:${K}` {
	return `${namespace}:${key}` as `${NS}:${K}`;
}

/**
 * Create a namespace-scoped translator.
 *
 * This is useful when you're working primarily within one namespace
 * and want to avoid repeating the namespace prefix.
 *
 * @param t - The base translation function
 * @param namespace - The namespace to scope to
 * @returns A translator function that prepends the namespace
 *
 * @example
 * const tErrors = createNamespacedTranslator(ctx.t, 'errors');
 * tErrors('auth.unauthorized'); // Translates 'errors:auth.unauthorized'
 */
export function createNamespacedTranslator(t: TFunction, namespace: Namespace) {
	return function nsTranslator(
		key: string,
		params?: Record<string, string | number>,
	): string {
		const fullKey = `${namespace}:${key}`;
		return t(fullKey, params as Record<string, unknown>);
	};
}

/**
 * Extract the namespace from a full translation key.
 *
 * @param key - The full translation key
 * @returns The namespace part of the key
 *
 * @example
 * extractNamespace('errors:auth.unauthorized'); // 'errors'
 */
export function extractNamespace(key: TranslationKey): Namespace {
	return key.split(":")[0] as Namespace;
}

/**
 * Extract the key path from a full translation key.
 *
 * @param key - The full translation key
 * @returns The key path (without namespace)
 *
 * @example
 * extractKeyPath('errors:auth.unauthorized'); // 'auth.unauthorized'
 */
export function extractKeyPath(key: TranslationKey): string {
	const parts = key.split(":");
	// TranslationKey type guarantees the format 'namespace:key.path',
	// so the second part will always exist
	return parts[1] ?? "";
}
