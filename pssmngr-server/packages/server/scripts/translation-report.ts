#!/usr/bin/env tsx
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors

/**
 * Translation Report Generator
 *
 * Generates a detailed report of translation coverage across all languages and namespaces.
 * Outputs both console summary and JSON report.
 *
 * Usage:
 *   npx tsx scripts/translation-report.ts
 *   npx tsx scripts/translation-report.ts --json
 *   npx tsx scripts/translation-report.ts --lang ar
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

// Constants matching i18n configuration
const SUPPORTED_LANGUAGES = ["en", "ar", "fr", "de", "es"] as const;
const NAMESPACES = ["errors", "validation", "permissions", "emails"] as const;
const DEFAULT_LANGUAGE = "en";

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOCALES_DIR = path.join(__dirname, "../src/i18n/locales");

interface Report {
	timestamp: string;
	totalKeys: number;
	languages: {
		[lang: string]: {
			translated: number;
			missing: string[];
			extra: string[];
			empty: string[];
			percentage: number;
		};
	};
	namespaces: {
		[namespace: string]: {
			totalKeys: number;
			coverage: { [lang: string]: number };
		};
	};
}

interface TranslationData {
	[key: string]: string | TranslationData;
}

function loadTranslation(lang: string, namespace: string): TranslationData {
	const filePath = path.join(LOCALES_DIR, lang, `${namespace}.json`);
	if (!fs.existsSync(filePath)) return {};
	return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function getAllKeys(obj: TranslationData, prefix = ""): string[] {
	const keys: string[] = [];
	for (const [key, value] of Object.entries(obj)) {
		const fullKey = prefix ? `${prefix}.${key}` : key;
		if (typeof value === "string") {
			keys.push(fullKey);
		} else if (typeof value === "object") {
			keys.push(...getAllKeys(value, fullKey));
		}
	}
	return keys;
}

function findEmptyValues(obj: TranslationData, prefix = ""): string[] {
	const emptyKeys: string[] = [];
	for (const [key, value] of Object.entries(obj)) {
		const fullKey = prefix ? `${prefix}.${key}` : key;
		if (typeof value === "string") {
			if (value.trim() === "") {
				emptyKeys.push(fullKey);
			}
		} else if (typeof value === "object") {
			emptyKeys.push(...findEmptyValues(value, fullKey));
		}
	}
	return emptyKeys;
}

function generateReport(): Report {
	const report: Report = {
		timestamp: new Date().toISOString(),
		totalKeys: 0,
		languages: {},
		namespaces: {},
	};

	// Get all reference keys
	let allReferenceKeys: string[] = [];
	for (const namespace of NAMESPACES) {
		const data = loadTranslation(DEFAULT_LANGUAGE, namespace);
		const keys = getAllKeys(data);
		allReferenceKeys = [
			...allReferenceKeys,
			...keys.map((k) => `${namespace}:${k}`),
		];

		report.namespaces[namespace] = {
			totalKeys: keys.length,
			coverage: {},
		};
	}

	report.totalKeys = allReferenceKeys.length;

	// Check each language
	for (const lang of SUPPORTED_LANGUAGES) {
		const langKeys: string[] = [];
		const missing: string[] = [];
		const extra: string[] = [];
		const empty: string[] = [];

		for (const namespace of NAMESPACES) {
			const refData = loadTranslation(DEFAULT_LANGUAGE, namespace);
			const langData = loadTranslation(lang, namespace);

			const refKeys = getAllKeys(refData);
			const langKeysForNs = getAllKeys(langData);

			// Check for empty values
			const emptyInNs = findEmptyValues(langData);
			empty.push(...emptyInNs.map((k) => `${namespace}:${k}`));

			// Check for missing keys
			for (const key of refKeys) {
				const fullKey = `${namespace}:${key}`;
				if (!langKeysForNs.includes(key)) {
					missing.push(fullKey);
				} else {
					langKeys.push(fullKey);
				}
			}

			// Check for extra keys
			for (const key of langKeysForNs) {
				if (!refKeys.includes(key)) {
					extra.push(`${namespace}:${key}`);
				}
			}

			// Calculate namespace coverage for this language
			const covered = refKeys.filter((k) => langKeysForNs.includes(k)).length;
			report.namespaces[namespace].coverage[lang] =
				refKeys.length > 0 ? Math.round((covered / refKeys.length) * 100) : 100;
		}

		report.languages[lang] = {
			translated: langKeys.length,
			missing,
			extra,
			empty,
			percentage:
				report.totalKeys > 0
					? Math.round((langKeys.length / report.totalKeys) * 100)
					: 100,
		};
	}

	return report;
}

function printReport(report: Report, filterLang?: string): void {
	console.log("\n=== Translation Coverage Report ===");
	console.log(`Generated: ${report.timestamp}`);
	console.log(`Total translation keys: ${report.totalKeys}\n`);

	console.log("--- Language Coverage ---");
	for (const [lang, data] of Object.entries(report.languages)) {
		if (filterLang && lang !== filterLang) continue;

		const status =
			data.percentage === 100
				? "\u2705"
				: data.percentage >= 90
					? "\u26A0\uFE0F"
					: "\u274C";
		console.log(
			`${status} ${lang}: ${data.percentage}% (${data.translated}/${report.totalKeys})`,
		);

		if (data.missing.length > 0) {
			console.log(
				`   Missing: ${data.missing.slice(0, 5).join(", ")}${data.missing.length > 5 ? ` (+${data.missing.length - 5} more)` : ""}`,
			);
		}

		if (data.empty.length > 0) {
			console.log(
				`   Empty values: ${data.empty.slice(0, 3).join(", ")}${data.empty.length > 3 ? ` (+${data.empty.length - 3} more)` : ""}`,
			);
		}

		if (data.extra.length > 0) {
			console.log(
				`   Extra keys: ${data.extra.slice(0, 3).join(", ")}${data.extra.length > 3 ? ` (+${data.extra.length - 3} more)` : ""}`,
			);
		}
	}

	console.log("\n--- Namespace Coverage ---");
	for (const [namespace, data] of Object.entries(report.namespaces)) {
		console.log(`\n${namespace} (${data.totalKeys} keys):`);
		for (const [lang, coverage] of Object.entries(data.coverage)) {
			if (filterLang && lang !== filterLang) continue;
			const status =
				coverage === 100
					? "\u2705"
					: coverage >= 90
						? "\u26A0\uFE0F"
						: "\u274C";
			console.log(`  ${status} ${lang}: ${coverage}%`);
		}
	}

	// Summary
	const allComplete = Object.values(report.languages).every(
		(l) => l.percentage === 100 && l.empty.length === 0,
	);

	console.log("\n=== Summary ===");
	if (allComplete) {
		console.log("\u2705 All translations are complete!");
	} else {
		const incomplete = Object.entries(report.languages)
			.filter(([, data]) => data.percentage < 100 || data.empty.length > 0)
			.map(([lang]) => lang);
		console.log(`\u274C Incomplete translations in: ${incomplete.join(", ")}`);
		console.log("See details above for missing keys.");
	}
}

// Parse command line arguments
const args = process.argv.slice(2);
const jsonOutput = args.includes("--json");
const langIndex = args.indexOf("--lang");
const filterLang =
	langIndex !== -1 && args[langIndex + 1] ? args[langIndex + 1] : undefined;

// Run report
const report = generateReport();

if (jsonOutput) {
	console.log(JSON.stringify(report, null, 2));
} else {
	printReport(report, filterLang);

	// Save JSON report
	const reportPath = path.join(__dirname, "../translation-report.json");
	fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
	console.log(`\nFull report saved to: ${reportPath}`);
}

// Exit with error if incomplete
const allComplete = Object.values(report.languages).every(
	(l) => l.percentage === 100 && l.empty.length === 0,
);

if (!allComplete) {
	process.exit(1);
}
