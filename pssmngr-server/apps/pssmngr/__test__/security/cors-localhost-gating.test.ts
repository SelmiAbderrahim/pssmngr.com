// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ALLOWED_REQUEST_HEADERS, isAllowedOrigin } from "../../server/cors";

describe("CORS origin allowlist — localhost gating", () => {
	const previousSiteUrl = process.env.SITE_URL;
	const previousTrustedOrigins = process.env.TRUSTED_ORIGINS;

	beforeEach(() => {
		process.env.SITE_URL = "https://pssmngr.com";
		process.env.TRUSTED_ORIGINS = "https://vault.example.com";
	});

	afterEach(() => {
		process.env.SITE_URL = previousSiteUrl;
		process.env.TRUSTED_ORIGINS = previousTrustedOrigins;
	});

	it("rejects plaintext localhost web origins in production", () => {
		expect(isAllowedOrigin("http://localhost:5173", true)).toBe(false);
		expect(isAllowedOrigin("http://127.0.0.1:3000", true)).toBe(false);
	});

	it("allows plaintext localhost web origins in development", () => {
		expect(isAllowedOrigin("http://localhost:5173", false)).toBe(true);
		expect(isAllowedOrigin("http://127.0.0.1:3000", false)).toBe(true);
	});

	it("allows only configured production web origins", () => {
		expect(isAllowedOrigin("https://pssmngr.com", true)).toBe(true);
		expect(isAllowedOrigin("https://vault.example.com", true)).toBe(true);
		expect(isAllowedOrigin("https://app.pssmngr.com", true)).toBe(false);
	});

	it("rejects unrelated and undefined origins regardless of env", () => {
		expect(isAllowedOrigin("https://evil.example.com", false)).toBe(false);
		expect(isAllowedOrigin("https://pssmngr.com.evil.com", false)).toBe(false);
		expect(isAllowedOrigin(undefined, false)).toBe(false);
	});
});

describe("CORS request headers", () => {
	it("permits browser JSON request headers", () => {
		expect(ALLOWED_REQUEST_HEADERS).toContain("content-type");
	});
});
