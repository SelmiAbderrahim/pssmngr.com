// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { describe, expect, it } from "vitest";
import {
	parseAcceptLanguage,
	parseAcceptLanguageHeader,
} from "../language-detection";

describe("Language Detection Performance", () => {
	it("should parse simple header in < 0.1ms", () => {
		const header = "en-US,en;q=0.9";
		const iterations = 10000;

		const start = performance.now();
		for (let i = 0; i < iterations; i++) {
			parseAcceptLanguage(header);
		}
		const elapsed = performance.now() - start;

		const avgMs = elapsed / iterations;
		console.log(`Average parse time (simple): ${avgMs.toFixed(4)}ms`);
		expect(avgMs).toBeLessThan(0.1);
	});

	it("should parse complex header in < 0.5ms", () => {
		const header =
			"en-US,en;q=0.9,ar-SA;q=0.8,ar;q=0.7,fr-FR;q=0.6,fr;q=0.5,de;q=0.4,es;q=0.3";
		const iterations = 10000;

		const start = performance.now();
		for (let i = 0; i < iterations; i++) {
			parseAcceptLanguage(header);
		}
		const elapsed = performance.now() - start;

		const avgMs = elapsed / iterations;
		console.log(`Average parse time (complex): ${avgMs.toFixed(4)}ms`);
		expect(avgMs).toBeLessThan(0.5);
	});

	it("should parse header with regions efficiently", () => {
		const header = "en-US,en-GB;q=0.95,fr-CA;q=0.9,fr-FR;q=0.85,de-DE;q=0.8";
		const iterations = 10000;

		const start = performance.now();
		for (let i = 0; i < iterations; i++) {
			parseAcceptLanguageHeader(header);
		}
		const elapsed = performance.now() - start;

		const avgMs = elapsed / iterations;
		console.log(`Average parse time (regions): ${avgMs.toFixed(4)}ms`);
		expect(avgMs).toBeLessThan(0.5);
	});

	it("should handle malformed headers without significant slowdown", () => {
		const malformedHeader = "en,,,,,ar;q=invalid,fr;q=0.8,,,";
		const iterations = 10000;

		const start = performance.now();
		for (let i = 0; i < iterations; i++) {
			parseAcceptLanguage(malformedHeader);
		}
		const elapsed = performance.now() - start;

		const avgMs = elapsed / iterations;
		console.log(`Average parse time (malformed): ${avgMs.toFixed(4)}ms`);
		expect(avgMs).toBeLessThan(0.5);
	});

	it("should average less than 1ms for all header types", () => {
		const headers = [
			"en",
			"en-US",
			"en-US,ar",
			"en-US,en;q=0.9,ar;q=0.8",
			"en-US,en;q=0.9,ar-SA;q=0.8,ar;q=0.7,fr;q=0.6",
			"*",
			"*,en;q=0.9",
		];

		const iterations = 1000;

		for (const header of headers) {
			// Warm the parser before measuring so scheduler and module-startup noise
			// cannot make a single-call assertion flaky in shared CI runners.
			parseAcceptLanguage(header);
			const start = performance.now();
			for (let i = 0; i < iterations; i++) {
				parseAcceptLanguage(header);
			}
			const averageMs = (performance.now() - start) / iterations;

			expect(averageMs).toBeLessThan(1);
		}
	});
});
