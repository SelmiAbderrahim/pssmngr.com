// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Parity check for the new GDPR data-export i18n keys.
 *
 * Every key under `errors:dataExport.*` and `emails:dataExport.*` must
 * exist in all 5 supported languages with identical interpolation
 * variables. This guards interpolation parity across languages.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const LANGS = ["en", "ar", "fr", "de", "es"] as const;
const ROOT = path.resolve(__dirname, "..", "locales");

type Json = Record<string, unknown>;

async function load(lang: string, namespace: string): Promise<Json> {
	const raw = await readFile(
		path.join(ROOT, lang, `${namespace}.json`),
		"utf-8",
	);
	return JSON.parse(raw) as Json;
}

function flatten(obj: unknown, prefix = ""): Record<string, string> {
	const out: Record<string, string> = {};
	if (obj == null) return out;
	if (typeof obj === "string") {
		out[prefix] = obj;
		return out;
	}
	if (typeof obj !== "object") return out;
	for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
		const next = prefix ? `${prefix}.${k}` : k;
		Object.assign(out, flatten(v, next));
	}
	return out;
}

function interpolationVars(value: string): string[] {
	const out = new Set<string>();
	const re = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
	let m: RegExpExecArray | null;
	// biome-ignore lint/suspicious/noAssignInExpressions: regex iteration
	while ((m = re.exec(value)) !== null) {
		out.add(m[1]);
	}
	return [...out].sort();
}

describe("dataExport i18n parity", () => {
	it("errors:dataExport.* exists in every language with stable shape", async () => {
		const baseline = flatten(
			((await load("en", "errors")) as Json).dataExport,
			"dataExport",
		);
		for (const lang of LANGS) {
			const ns = (await load(lang, "errors")) as Json;
			const flat = flatten(ns.dataExport, "dataExport");
			for (const key of Object.keys(baseline)) {
				expect(flat[key], `missing ${key} in errors:${lang}`).toBeDefined();
				// No raw key leakage (i.e. the value didn't fall back to its
				// own name)
				expect(flat[key]).not.toBe(key);
				// Interpolation variables match the en baseline EXACTLY
				expect(
					interpolationVars(flat[key]),
					`var mismatch in errors:${lang}:${key}`,
				).toEqual(interpolationVars(baseline[key]));
			}
		}
	});

	it("emails:dataExport.* exists in every language with stable shape", async () => {
		const baseline = flatten(
			((await load("en", "emails")) as Json).dataExport,
			"dataExport",
		);
		for (const lang of LANGS) {
			const ns = (await load(lang, "emails")) as Json;
			const flat = flatten(ns.dataExport, "dataExport");
			for (const key of Object.keys(baseline)) {
				expect(flat[key], `missing ${key} in emails:${lang}`).toBeDefined();
				expect(flat[key]).not.toBe(key);
				expect(
					interpolationVars(flat[key]),
					`var mismatch in emails:${lang}:${key}`,
				).toEqual(interpolationVars(baseline[key]));
			}
		}
	});

	it("expiresOn template carries the {{expiresAt}} variable", async () => {
		for (const lang of LANGS) {
			const ns = (await load(lang, "emails")) as Json;
			const value = (ns.dataExport as Json).expiresOn as string;
			expect(value).toMatch(/\{\{\s*expiresAt\s*\}\}/);
		}
	});
});
