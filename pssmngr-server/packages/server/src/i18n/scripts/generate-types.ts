#!/usr/bin/env tsx
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors

/**
 * Generates TypeScript types from translation JSON files.
 *
 * Usage:
 *   pnpm run i18n:generate-types
 *
 * This script reads all English translation files and generates
 * a TypeScript file with type definitions for all translation keys.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOCALES_DIR = path.join(__dirname, "../locales/en");
const OUTPUT_FILE = path.join(__dirname, "../types.generated.ts");

// Namespaces to process (must match i18n config)
const NAMESPACES = ["errors", "validation", "permissions", "emails"] as const;

interface TranslationObject {
	[key: string]: string | TranslationObject;
}

/**
 * Recursively extract all keys from a translation object.
 * Returns keys in dot notation format.
 */
function extractKeys(obj: TranslationObject, prefix = ""): string[] {
	const keys: string[] = [];

	for (const [key, value] of Object.entries(obj)) {
		const fullKey = prefix ? `${prefix}.${key}` : key;

		if (typeof value === "string") {
			keys.push(fullKey);
		} else if (typeof value === "object" && value !== null) {
			keys.push(...extractKeys(value, fullKey));
		}
	}

	return keys;
}

/**
 * Capitalize the first letter of a string.
 */
function capitalize(str: string): string {
	return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Generate TypeScript type for a single namespace.
 */
function generateNamespaceType(namespace: string, keys: string[]): string {
	const typeName = `${capitalize(namespace)}Keys`;

	if (keys.length === 0) {
		return `export type ${typeName} = never;\n`;
	}

	const keyLiterals = keys.map((k) => `  | "${k}"`).join("\n");

	return `export type ${typeName} =\n${keyLiterals};\n`;
}

/**
 * Generate the full namespaced key type (e.g., 'errors:auth.unauthorized').
 */
function generateFullKeyType(namespaceKeys: Map<string, string[]>): string {
	const unions: string[] = [];

	for (const [namespace, keys] of namespaceKeys) {
		for (const key of keys) {
			unions.push(`  | "${namespace}:${key}"`);
		}
	}

	if (unions.length === 0) {
		return "export type TranslationKey = never;\n";
	}

	return `export type TranslationKey =\n${unions.join("\n")};\n`;
}

/**
 * Extract interpolation variables from translation strings.
 */
function extractVariables(obj: TranslationObject): Map<string, string[]> {
	const variablesMap = new Map<string, string[]>();

	function traverse(o: TranslationObject, prefix = "") {
		for (const [key, value] of Object.entries(o)) {
			const fullKey = prefix ? `${prefix}.${key}` : key;

			if (typeof value === "string") {
				// Extract {{variable}} patterns
				const matches = value.match(/\{\{(\w+)\}\}/g);
				if (matches) {
					const vars = [...new Set(matches.map((m) => m.slice(2, -2)))];
					variablesMap.set(fullKey, vars);
				}
			} else if (typeof value === "object" && value !== null) {
				traverse(value, fullKey);
			}
		}
	}

	traverse(obj);
	return variablesMap;
}

/**
 * Generate interpolation parameter types for a namespace.
 */
function generateInterpolationTypes(
	namespace: string,
	variablesMap: Map<string, string[]>,
): string {
	if (variablesMap.size === 0) return "";

	const typeName = `${capitalize(namespace)}Params`;
	const entries: string[] = [];

	for (const [key, vars] of variablesMap) {
		const varTypes = vars.map((v) => `${v}: string | number`).join("; ");
		entries.push(`  "${namespace}:${key}": { ${varTypes} };`);
	}

	return `export interface ${typeName} {\n${entries.join("\n")}\n}\n`;
}

/**
 * Generate keys that require interpolation parameters.
 */
function generateKeysWithParams(
	namespaceKeys: Map<string, Map<string, string[]>>,
): string {
	const keysWithParams: string[] = [];

	for (const [namespace, variablesMap] of namespaceKeys) {
		for (const key of variablesMap.keys()) {
			keysWithParams.push(`  | "${namespace}:${key}"`);
		}
	}

	if (keysWithParams.length === 0) {
		return "export type KeysWithParams = never;\n";
	}

	return `export type KeysWithParams =\n${keysWithParams.join("\n")};\n`;
}

/**
 * Main generation function.
 */
async function generateTypes(): Promise<void> {
	console.log("Generating translation types...");

	const namespaceKeys = new Map<string, string[]>();
	const namespaceVariables = new Map<string, Map<string, string[]>>();
	const allParamTypes: string[] = [];
	const namespaceTypes: string[] = [];
	const paramInterfaceNames: string[] = [];

	for (const namespace of NAMESPACES) {
		const filePath = path.join(LOCALES_DIR, `${namespace}.json`);

		if (!fs.existsSync(filePath)) {
			console.warn(`Warning: ${filePath} not found, skipping...`);
			continue;
		}

		const content = fs.readFileSync(filePath, "utf8");
		const translations = JSON.parse(content) as TranslationObject;

		// Extract keys
		const keys = extractKeys(translations);
		namespaceKeys.set(namespace, keys);
		console.log(`  ${namespace}: ${keys.length} keys`);

		// Generate namespace type
		namespaceTypes.push(generateNamespaceType(namespace, keys));

		// Extract and generate interpolation types
		const variablesMap = extractVariables(translations);
		namespaceVariables.set(namespace, variablesMap);

		const paramType = generateInterpolationTypes(namespace, variablesMap);
		if (paramType) {
			allParamTypes.push(paramType);
			paramInterfaceNames.push(`${capitalize(namespace)}Params`);
		}
	}

	// Generate combined type
	const fullKeyType = generateFullKeyType(namespaceKeys);

	// Generate keys with params type
	const keysWithParamsType = generateKeysWithParams(namespaceVariables);

	// Build combined params type
	const combinedParamsType =
		paramInterfaceNames.length > 0
			? paramInterfaceNames.join(" & ")
			: "Record<string, never>";

	// Build output file
	const output = `// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * AUTO-GENERATED FILE - DO NOT EDIT
 *
 * Generated by: pnpm run i18n:generate-types
 * Source: packages/server/src/i18n/locales/en/
 */

/* eslint-disable @typescript-eslint/no-empty-object-type */

// =============================================================================
// Namespace Key Types
// =============================================================================
// Each namespace has its own type for keys within that namespace.
// These are useful for creating namespace-specific translation functions.

${namespaceTypes.join("\n")}
// =============================================================================
// Full Translation Key Type
// =============================================================================
// This is the union of all translation keys in 'namespace:key' format.
// Use this type for the main translation function.

${fullKeyType}
// =============================================================================
// Interpolation Parameter Types
// =============================================================================
// These interfaces define the required parameters for keys with interpolation.
// Keys like "errors:resource.notFound" require a {{resource}} parameter.

${allParamTypes.length > 0 ? allParamTypes.join("\n") : "// No keys with interpolation parameters\n"}
// =============================================================================
// Keys That Require Parameters
// =============================================================================
// This type lists all keys that have interpolation parameters ({{variable}}).

${keysWithParamsType}
// =============================================================================
// Combined Types
// =============================================================================

/**
 * All interpolation parameters combined.
 * Use with conditional types to get params for a specific key.
 */
export type AllInterpolationParams = ${combinedParamsType};

/**
 * Get the parameter type for a specific translation key.
 * Returns the required params object if the key has interpolation,
 * otherwise returns an empty object type.
 *
 * @example
 * type Params = TranslationParams<'errors:resource.notFound'>;
 * // { resource: string | number }
 */
export type TranslationParams<K extends TranslationKey> =
  K extends keyof AllInterpolationParams
    ? AllInterpolationParams[K]
    : {};

/**
 * Check if a key requires interpolation parameters.
 */
export type HasParams<K extends TranslationKey> =
  K extends KeysWithParams ? true : false;

// =============================================================================
// Namespace and Language Types
// =============================================================================

/**
 * Available translation namespaces.
 */
export type Namespace = ${NAMESPACES.map((ns) => `"${ns}"`).join(" | ")};

/**
 * Supported languages.
 * Must match SUPPORTED_LANGUAGES in index.ts.
 */
export type SupportedLanguage = "en" | "ar" | "fr" | "de" | "es";

// =============================================================================
// Type Guards and Utilities
// =============================================================================

/**
 * Array of all namespaces (for runtime iteration).
 */
export const NAMESPACE_LIST: readonly Namespace[] = [${NAMESPACES.map((ns) => `"${ns}"`).join(", ")}] as const;

/**
 * Array of all supported languages (for runtime iteration).
 */
export const LANGUAGE_LIST: readonly SupportedLanguage[] = ["en", "ar", "fr", "de", "es"] as const;
`;

	fs.writeFileSync(OUTPUT_FILE, output, "utf8");
	console.log(`\nGenerated: ${OUTPUT_FILE}`);

	// Print statistics
	const totalKeys = Array.from(namespaceKeys.values()).flat().length;
	const totalParamKeys = Array.from(namespaceVariables.values()).reduce(
		(sum, map) => sum + map.size,
		0,
	);

	console.log("\nStatistics:");
	console.log(`  Total keys: ${totalKeys}`);
	console.log(`  Keys with parameters: ${totalParamKeys}`);
	console.log(`  Namespaces: ${namespaceKeys.size}`);
}

// Run generator
generateTypes()
	.then(() => {
		console.log("\nType generation completed successfully!");
		process.exit(0);
	})
	.catch((error) => {
		console.error("Error generating types:", error);
		process.exit(1);
	});
