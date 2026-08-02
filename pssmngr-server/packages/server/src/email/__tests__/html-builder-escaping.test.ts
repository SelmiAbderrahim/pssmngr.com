// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Round 4, fix #26 — email HTML injection.
 *
 * Email content is assembled from user-controlled values (organization name,
 * inviter display name) that reach buildEmailHtml/buildSimpleEmail via i18next
 * with escapeValue:false. These tests prove the builder HTML-escapes every
 * dynamic value and rejects dangerous action-URL schemes.
 */

import { describe, expect, it } from "vitest";
import {
	buildEmailHtml,
	buildEmailText,
	buildSimpleEmail,
} from "../html-builder";

const XSS = `<img src=x onerror="alert(1)">`;
const XSS_ESCAPED = "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;";

describe("buildEmailHtml escaping (fix #26)", () => {
	it("escapes a malicious organization/inviter name in the body and additionalContent", () => {
		const html = buildEmailHtml({
			language: "en",
			title: "Invitation",
			greeting: "Hello",
			body: `You were invited to ${XSS}`,
			footer: "Footer",
			additionalContent: `Invited by ${XSS}`,
		});

		expect(html).not.toContain("<img src=x onerror=");
		expect(html).toContain(XSS_ESCAPED);
	});

	it("escapes the title (rendered in <title> and <h1>)", () => {
		const html = buildEmailHtml({
			language: "en",
			title: XSS,
			greeting: "Hi",
			body: "Body",
			footer: "Footer",
		});
		expect(html).not.toContain("<img src=x onerror=");
	});

	it("escapes the credential block label and value", () => {
		const html = buildEmailHtml({
			language: "en",
			title: "T",
			greeting: "G",
			body: "B",
			footer: "F",
			credentialBlock: { label: XSS, value: `pw${XSS}` },
		});
		expect(html).not.toContain("<img src=x onerror=");
		expect(html).toContain(XSS_ESCAPED);
	});

	it("neutralizes a javascript: action URL", () => {
		const html = buildEmailHtml({
			language: "en",
			title: "T",
			greeting: "G",
			body: "B",
			footer: "F",
			actionText: "Click",
			// eslint-disable-next-line no-script-url
			actionUrl: "javascript:alert(document.cookie)",
		});
		expect(html).not.toContain("javascript:alert");
		expect(html).toContain('href="#"');
	});

	it("preserves a legitimate https action URL", () => {
		const html = buildEmailHtml({
			language: "en",
			title: "T",
			greeting: "G",
			body: "B",
			footer: "F",
			actionText: "Click",
			actionUrl: "https://pssmngr.com/accept?token=abc123",
		});
		expect(html).toContain("https://pssmngr.com/accept?token=abc123");
	});

	it("escapes an attribute-breaking secondary action URL/text", () => {
		const html = buildEmailHtml({
			language: "en",
			title: "T",
			greeting: "G",
			body: "B",
			footer: "F",
			secondaryAction: {
				text: XSS,
				// Try to break out of the href attribute.
				url: 'https://evil.tld/"><script>alert(1)</script>',
			},
		});
		expect(html).not.toContain("<script>alert(1)</script>");
		expect(html).not.toContain("<img src=x onerror=");
	});
});

describe("buildSimpleEmail escaping (fix #26)", () => {
	it("escapes the body and rejects a javascript: action URL in HTML", () => {
		const { html, text } = buildSimpleEmail({
			language: "en",
			subject: "Reset",
			body: `Reset requested ${XSS}`,
			actionText: "Reset",
			// eslint-disable-next-line no-script-url
			actionUrl: "javascript:alert(1)",
		});
		expect(html).not.toContain("<img src=x onerror=");
		expect(html).not.toContain("javascript:alert");
		expect(html).toContain('href="#"');
		// Plain-text stays human-readable (no HTML entities), and the bad URL
		// is dropped rather than rendered.
		expect(text).toContain(`Reset requested ${XSS}`);
		expect(text).not.toContain("javascript:alert");
	});

	it("preserves a legitimate https URL in both html and text", () => {
		const { html, text } = buildSimpleEmail({
			language: "en",
			subject: "Verify",
			body: "Verify your email",
			actionText: "Verify",
			actionUrl: "https://pssmngr.com/verify?token=xyz",
		});
		expect(html).toContain("https://pssmngr.com/verify?token=xyz");
		expect(text).toContain("https://pssmngr.com/verify?token=xyz");
	});
});

describe("buildEmailText (plain text, unchanged)", () => {
	it("keeps raw text without HTML entities", () => {
		const text = buildEmailText({
			language: "en",
			title: "T",
			greeting: "Hello",
			body: "Plain body with <brackets> & ampersand",
			footer: "Footer",
		});
		expect(text).toContain("Plain body with <brackets> & ampersand");
		expect(text).not.toContain("&lt;");
	});
});
