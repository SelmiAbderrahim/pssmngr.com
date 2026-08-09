// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { describe, it, expect, vi, beforeEach } from "vitest";

import { isSafeExternalUrl, openExternalUrlSafe } from "@/lib/safe-external-url";

beforeEach(() => {
	vi.clearAllMocks();
	vi.spyOn(window, "open").mockImplementation(() => null);
});

describe("isSafeExternalUrl", () => {
	it("allows http(s) and mailto URLs", () => {
		expect(isSafeExternalUrl("https://example.com")).toBe(true);
		expect(isSafeExternalUrl("http://example.com/path?q=1")).toBe(true);
		expect(isSafeExternalUrl("mailto:support@pssmngr.com")).toBe(true);
	});

	it("allows relative URLs (resolve to our own origin)", () => {
		expect(isSafeExternalUrl("/docs")).toBe(true);
		expect(isSafeExternalUrl("/terms")).toBe(true);
	});

	it("rejects dangerous schemes", () => {
		expect(isSafeExternalUrl("javascript:alert(1)")).toBe(false);
		expect(isSafeExternalUrl("JavaScript:alert(1)")).toBe(false);
		expect(isSafeExternalUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
		expect(isSafeExternalUrl("vbscript:msgbox(1)")).toBe(false);
		expect(isSafeExternalUrl("file:///etc/passwd")).toBe(false);
	});

	it("rejects empty / non-string input", () => {
		expect(isSafeExternalUrl("")).toBe(false);
		expect(isSafeExternalUrl("   ")).toBe(false);
		// @ts-expect-error testing runtime guard
		expect(isSafeExternalUrl(undefined)).toBe(false);
	});
});

describe("openExternalUrlSafe", () => {
	it("opens safe URLs and returns true", async () => {
		const opened = await openExternalUrlSafe("https://example.com");
		expect(opened).toBe(true);
		expect(window.open).toHaveBeenCalledWith(
			"https://example.com",
			"_blank",
			"noopener,noreferrer",
		);
	});

	it("refuses unsafe URLs without calling openExternalUrl", async () => {
		const opened = await openExternalUrlSafe("javascript:alert(document.cookie)");
		expect(opened).toBe(false);
		expect(window.open).not.toHaveBeenCalled();
	});
});
