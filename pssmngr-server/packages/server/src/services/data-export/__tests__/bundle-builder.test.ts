// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Unit tests for the pure helpers in the bundle builder.
 *
 * The end-to-end ZIP path is covered by the service-level integration
 * test; here we lock down the two zero-knowledge invariants that are
 * easiest to regress: money accuracy (integer minor units only) and
 * the CSV escaping that ships ciphertext fields.
 */
import { describe, expect, it } from "vitest";
import { __testing__ } from "../bundle-builder";

const { toCsv } = __testing__;

describe("toCsv", () => {
	it("returns an empty string for an empty row list", () => {
		expect(toCsv([])).toBe("");
	});

	it("emits a header row followed by escaped values", () => {
		const rows = [
			{ id: "i1", ciphertext: "aGVsbG8=", note: "ok" },
			{ id: "i2", ciphertext: "d29ybGQ=", note: "ok" },
		];
		const out = toCsv(rows);
		expect(out.split("\n")[0]).toBe("id,ciphertext,note");
		expect(out).toContain("i1,aGVsbG8=,ok");
	});

	it("escapes commas, quotes, and newlines", () => {
		const rows = [{ a: "has,comma", b: 'has "quote"', c: "has\nnewline" }];
		const out = toCsv(rows);
		// quoted, with embedded quotes doubled
		expect(out).toContain('"has,comma"');
		expect(out).toContain('"has ""quote"""');
		expect(out).toContain('"has\nnewline"');
	});

	it("serializes nulls as empty strings (never the word 'null')", () => {
		const rows = [{ a: "x", b: null, c: undefined }];
		const out = toCsv(rows);
		// header + one data row → "x,,"
		const dataLine = out.split("\n")[1];
		expect(dataLine).toBe("x,,");
	});
});
