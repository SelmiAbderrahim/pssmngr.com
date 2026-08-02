// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { describe, expect, it } from "vitest";
import enCommon from "../../../public/locales/en/common.json";
import arCommon from "../../../public/locales/ar/common.json";
import deCommon from "../../../public/locales/de/common.json";
import esCommon from "../../../public/locales/es/common.json";
import frCommon from "../../../public/locales/fr/common.json";

const locales = {
	en: enCommon,
	ar: arCommon,
	de: deCommon,
	es: esCommon,
	fr: frCommon,
} as const;

describe("pagination translations", () => {
	it("has all pagination keys in English", () => {
		expect(enCommon.pagination).toBeDefined();
		expect(enCommon.pagination.page).toBeDefined();
		expect(enCommon.pagination.showing).toBeDefined();
		expect(enCommon.pagination.total).toBeDefined();
		expect(enCommon.pagination.first).toBeDefined();
		expect(enCommon.pagination.previous).toBeDefined();
		expect(enCommon.pagination.next).toBeDefined();
		expect(enCommon.pagination.last).toBeDefined();
		expect(enCommon.pagination.goToPage).toBeDefined();
		expect(enCommon.pagination.itemsPerPage).toBeDefined();
		expect(enCommon.pagination.results).toBeDefined();
		expect(enCommon.pagination.results.showing).toBeDefined();
		expect(enCommon.pagination.results.empty).toBeDefined();
		expect(enCommon.pagination.results.filtered).toBeDefined();
	});

	it("has all pagination keys in Arabic", () => {
		expect(arCommon.pagination).toBeDefined();
		expect(arCommon.pagination.page).toBeDefined();
		expect(arCommon.pagination.showing).toBeDefined();
		expect(arCommon.pagination.total).toBeDefined();
		expect(arCommon.pagination.first).toBeDefined();
		expect(arCommon.pagination.previous).toBeDefined();
		expect(arCommon.pagination.next).toBeDefined();
		expect(arCommon.pagination.last).toBeDefined();
	});

	it("has matching interpolation variables in pagination.showing", () => {
		for (const [lang, locale] of Object.entries(locales)) {
			const showing = locale.pagination.showing;
			expect(showing, `${lang}: pagination.showing should contain {{page}}`).toContain("{{page}}");
			expect(showing, `${lang}: pagination.showing should contain {{totalPages}}`).toContain("{{totalPages}}");
		}
	});

	it("has matching interpolation variables in pagination.total", () => {
		for (const [lang, locale] of Object.entries(locales)) {
			const total = locale.pagination.total;
			expect(total, `${lang}: pagination.total should contain {{total}}`).toContain("{{total}}");
		}
	});

	it("has matching interpolation variables in pagination.results.showing", () => {
		for (const [lang, locale] of Object.entries(locales)) {
			const showing = locale.pagination.results.showing;
			expect(showing, `${lang}: pagination.results.showing should contain {{count}}`).toContain("{{count}}");
			expect(showing, `${lang}: pagination.results.showing should contain {{total}}`).toContain("{{total}}");
		}
	});

	it("has search translations in all locales", () => {
		for (const [lang, locale] of Object.entries(locales)) {
			expect(locale.searchInput, `${lang}: searchInput should be defined`).toBeDefined();
			expect(locale.searchInput.placeholder, `${lang}: searchInput.placeholder should be defined`).toBeDefined();
			expect(locale.searchInput.noResults, `${lang}: searchInput.noResults should be defined`).toBeDefined();
		}
	});

	it("has sort translations in all locales", () => {
		for (const [lang, locale] of Object.entries(locales)) {
			expect(locale.sort, `${lang}: sort should be defined`).toBeDefined();
			expect(locale.sort.label, `${lang}: sort.label should be defined`).toBeDefined();
			expect(locale.sort.ascending, `${lang}: sort.ascending should be defined`).toBeDefined();
			expect(locale.sort.descending, `${lang}: sort.descending should be defined`).toBeDefined();
		}
	});

	it("has filter translations in all locales", () => {
		for (const [lang, locale] of Object.entries(locales)) {
			expect(locale.filters, `${lang}: filters should be defined`).toBeDefined();
			expect(locale.filters.clear, `${lang}: filters.clear should be defined`).toBeDefined();
			expect(locale.filters.apply, `${lang}: filters.apply should be defined`).toBeDefined();
		}
	});

	it("has empty state translations in all locales", () => {
		for (const [lang, locale] of Object.entries(locales)) {
			expect(locale.empty, `${lang}: empty should be defined`).toBeDefined();
			expect(locale.empty.list, `${lang}: empty.list should be defined`).toBeDefined();
			expect(locale.empty.search, `${lang}: empty.search should be defined`).toBeDefined();
		}
	});

	it("has loading translations in all locales", () => {
		for (const [lang, locale] of Object.entries(locales)) {
			expect(locale.loadingItems, `${lang}: loadingItems should be defined`).toBeDefined();
			expect(locale.loadingItems.items, `${lang}: loadingItems.items should be defined`).toBeDefined();
		}
	});
});
