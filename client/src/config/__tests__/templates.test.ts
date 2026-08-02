// Copyright (c) 2026 Password Manager contributors
/**
 * `coerceTemplate` — the read-time map that shields the UI from stored
 * `user.layoutTemplate` values left over from retired navigation ids. No DB
 * migration is needed.
 */
import { describe, expect, it } from "vitest";
import {
	coerceTemplate,
	DEFAULT_LAYOUT_TEMPLATE,
	isLayoutTemplateId,
	LAYOUT_TEMPLATES,
	LAYOUT_TEMPLATE_IDS,
} from "../templates";

describe("coerceTemplate", () => {
	it("maps legacy nav-chrome value to the default template", () => {
		expect(coerceTemplate("top-nav")).toBe("default");
	});

	it("passes known density template ids through", () => {
		expect(coerceTemplate("default")).toBe("default");
		expect(coerceTemplate("compact")).toBe("compact");
		expect(coerceTemplate("list")).toBe("list");
	});

	it("falls back to default for null / undefined / empty / unknown", () => {
		expect(coerceTemplate(null)).toBe(DEFAULT_LAYOUT_TEMPLATE);
		expect(coerceTemplate(undefined)).toBe(DEFAULT_LAYOUT_TEMPLATE);
		expect(coerceTemplate("")).toBe(DEFAULT_LAYOUT_TEMPLATE);
		expect(coerceTemplate("nope")).toBe(DEFAULT_LAYOUT_TEMPLATE);
		expect(coerceTemplate(42)).toBe(DEFAULT_LAYOUT_TEMPLATE);
	});
});

describe("isLayoutTemplateId", () => {
	it("returns true only for known ids", () => {
		for (const id of LAYOUT_TEMPLATE_IDS) {
			expect(isLayoutTemplateId(id)).toBe(true);
		}
		expect(isLayoutTemplateId("top-nav")).toBe(false);
		expect(isLayoutTemplateId(null)).toBe(false);
	});
});

describe("LAYOUT_TEMPLATES", () => {
	it("has exactly the three density templates", () => {
		expect(Object.keys(LAYOUT_TEMPLATES).sort()).toEqual(["compact", "default", "list"]);
	});
});
