// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Email HTML Builder
 *
 * Generates responsive HTML emails with RTL support for Arabic.
 * All emails follow email deliverability best practices:
 * - No remote images or tracking pixels
 * - Proper HTML DOCTYPE
 * - No raw IP addresses or ports in URLs
 */

import type { SupportedLanguage } from "../i18n/types";
import type { EmailHtmlOptions } from "./types";

/**
 * SECURITY (Round 4, fix #26): email content is assembled from user-controlled
 * values (organization name, inviter display name, …) that reach this builder
 * through i18next with `escapeValue:false`. Without escaping, a member could set
 * an org/display name to arbitrary HTML and have it rendered inside a
 * transactional email sent from our own domain (link/image injection →
 * convincing phishing). Every dynamic value interpolated into HTML must pass
 * through `escapeHtml`; every URL placed in an `href` must pass through
 * `sanitizeUrl` (which also HTML-escapes the result for the attribute context).
 */
function escapeHtml(value: unknown): string {
	return String(value ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

const SAFE_EMAIL_URL_SCHEMES = new Set(["http:", "https:", "mailto:"]);

/**
 * Validate a URL for use in an email `href`. Rejects `javascript:`/`data:`/etc.
 * by returning '#', and HTML-escapes the result for safe attribute embedding.
 */
function sanitizeUrl(rawUrl: unknown): string {
	const url = String(rawUrl ?? "").trim();
	if (!url) return "#";
	try {
		const parsed = new URL(url);
		if (!SAFE_EMAIL_URL_SCHEMES.has(parsed.protocol)) return "#";
		return escapeHtml(parsed.toString());
	} catch {
		// Not an absolute URL — refuse rather than emit a relative/odd value.
		return "#";
	}
}

/**
 * Check if language is RTL (Right-to-Left)
 */
export function isRtlLanguage(language: SupportedLanguage): boolean {
	return language === "ar";
}

/**
 * Get text direction for language
 */
export function getTextDirection(language: SupportedLanguage): "ltr" | "rtl" {
	return isRtlLanguage(language) ? "rtl" : "ltr";
}

/**
 * Get text alignment for language
 */
export function getTextAlign(language: SupportedLanguage): "left" | "right" {
	return isRtlLanguage(language) ? "right" : "left";
}

/**
 * Build email HTML with full RTL support
 *
 * @param options - Email content options
 * @returns Complete HTML email string
 */
export function buildEmailHtml(options: EmailHtmlOptions): string {
	const { language } = options;

	// SECURITY (fix #26): escape every dynamic value before it touches the HTML.
	const title = escapeHtml(options.title);
	const greeting = escapeHtml(options.greeting);
	const body = escapeHtml(options.body);
	const actionText = escapeHtml(options.actionText);
	const actionUrl = options.actionUrl
		? sanitizeUrl(options.actionUrl)
		: options.actionUrl;
	const footer = escapeHtml(options.footer);
	const additionalContent = options.additionalContent
		? escapeHtml(options.additionalContent)
		: options.additionalContent;
	const credentialBlock = options.credentialBlock
		? {
				label: escapeHtml(options.credentialBlock.label),
				value: escapeHtml(options.credentialBlock.value),
			}
		: options.credentialBlock;
	const secondaryAction = options.secondaryAction
		? {
				text: escapeHtml(options.secondaryAction.text),
				url: sanitizeUrl(options.secondaryAction.url),
			}
		: options.secondaryAction;

	const isRtl = isRtlLanguage(language);
	const direction = getTextDirection(language);
	const textAlign = getTextAlign(language);
	const langCode = language === "ar" ? "ar" : language;

	return `<!DOCTYPE html>
<html lang="${langCode}" dir="${direction}">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="X-UA-Compatible" content="IE=edge">
	<title>${title}</title>
	<!--[if mso]>
	<noscript>
		<xml>
			<o:OfficeDocumentSettings>
				<o:PixelsPerInch>96</o:PixelsPerInch>
			</o:OfficeDocumentSettings>
		</xml>
	</noscript>
	<![endif]-->
	<style>
		/* Reset styles */
		body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
		table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
		img { -ms-interpolation-mode: bicubic; }

		/* Base styles */
		body {
			margin: 0 !important;
			padding: 0 !important;
			width: 100% !important;
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
			line-height: 1.6;
			color: #333333;
			direction: ${direction};
			text-align: ${textAlign};
		}

		/* Link styles */
		a {
			color: #2563eb;
			text-decoration: none;
		}

		/* Button styles */
		.button {
			display: inline-block;
			padding: 14px 28px;
			background-color: #000000;
			color: #ffffff !important;
			text-decoration: none;
			border-radius: 6px;
			font-weight: 600;
			font-size: 14px;
		}

		/* Mobile styles */
		@media screen and (max-width: 600px) {
			.container {
				width: 100% !important;
				padding: 20px !important;
			}
			.button {
				display: block !important;
				width: 100% !important;
				text-align: center !important;
			}
		}
	</style>
</head>
<body style="margin: 0; padding: 0; background-color: #f9fafb;">
	<!-- Email wrapper -->
	<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f9fafb;">
		<tr>
			<td align="center" style="padding: 40px 20px;">
				<!-- Main container -->
				<table role="presentation" class="container" width="465" cellspacing="0" cellpadding="0" border="0" style="background-color: #ffffff; border: 1px solid #eaeaea; border-radius: 8px;">
					<!-- Brand header (text-only to avoid remote image requests) -->
					<tr>
						<td align="center" style="padding: 32px 20px 24px 20px;">
							<span style="font-size: 24px; font-weight: 700; letter-spacing: -0.5px; color: #000000;">pssmngr</span>
						</td>
					</tr>

					<!-- Title -->
					<tr>
						<td align="center" style="padding: 0 20px 20px 20px;">
							<h1 style="margin: 0; font-size: 24px; font-weight: 600; color: #000000; direction: ${direction}; text-align: center;">
								${title}
							</h1>
						</td>
					</tr>

					<!-- Main content -->
					<tr>
						<td style="padding: 0 32px 24px 32px; direction: ${direction}; text-align: ${textAlign};">
							<p style="margin: 0 0 16px 0; font-size: 15px; line-height: 24px; color: #333333;">
								${greeting}
							</p>
							<p style="margin: 0 0 24px 0; font-size: 15px; line-height: 24px; color: #333333;">
								${body}
							</p>
							${additionalContent ? `<p style="margin: 0 0 24px 0; font-size: 15px; line-height: 24px; color: #333333;">${additionalContent}</p>` : ""}
							${
								credentialBlock
									? `
							<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin: 0 0 24px 0;">
								<tr>
									<td style="background-color: #f3f4f6; border: 1px solid #eaeaea; border-radius: 6px; padding: 16px; direction: ${direction}; text-align: ${textAlign};">
										<p style="margin: 0 0 6px 0; font-size: 13px; line-height: 18px; color: #666666;">
											${credentialBlock.label}
										</p>
										<p style="margin: 0; font-size: 18px; line-height: 24px; font-weight: 600; color: #111111; font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; word-break: break-all; direction: ltr; text-align: ${isRtl ? "right" : "left"};">
											${credentialBlock.value}
										</p>
									</td>
								</tr>
							</table>
							`
									: ""
							}
						</td>
					</tr>

					${
						actionUrl && actionText
							? `
					<!-- CTA Button -->
					<tr>
						<td align="center" style="padding: 0 32px 32px 32px;">
							<a href="${actionUrl}" class="button" style="display: inline-block; padding: 14px 28px; background-color: #000000; color: #ffffff !important; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px;">
								${actionText}
							</a>
						</td>
					</tr>

					<!-- Link fallback -->
					<tr>
						<td style="padding: 0 32px 24px 32px; direction: ${direction}; text-align: ${textAlign};">
							<p style="margin: 0; font-size: 13px; line-height: 20px; color: #666666;">
								${isRtl ? "أو انسخ والصق هذا الرابط في متصفحك:" : "Or copy and paste this URL into your browser:"}
							</p>
							<p style="margin: 8px 0 0 0; font-size: 13px; line-height: 20px; word-break: break-all;">
								<a href="${actionUrl}" style="color: #2563eb;">${actionUrl}</a>
							</p>
						</td>
					</tr>
					`
							: ""
					}

					${
						secondaryAction
							? `
					<!-- Secondary action -->
					<tr>
						<td style="padding: 0 32px 24px 32px; direction: ${direction}; text-align: ${textAlign};">
							<p style="margin: 0; font-size: 13px; line-height: 20px; color: #666666;">
								<a href="${secondaryAction.url}" style="color: #2563eb;">${secondaryAction.text}</a>
							</p>
						</td>
					</tr>
					`
							: ""
					}

					<!-- Divider -->
					<tr>
						<td style="padding: 0 32px;">
							<hr style="border: none; border-top: 1px solid #eaeaea; margin: 0;" />
						</td>
					</tr>

					<!-- Footer -->
					<tr>
						<td style="padding: 24px 32px 32px 32px; direction: ${direction}; text-align: ${textAlign};">
							<p style="margin: 0; font-size: 13px; line-height: 20px; color: #666666;">
								${footer}
							</p>
						</td>
					</tr>
				</table>

				<!-- Copyright footer -->
				<table role="presentation" width="465" cellspacing="0" cellpadding="0" border="0">
					<tr>
						<td align="center" style="padding: 24px 20px;">
							<p style="margin: 0; font-size: 12px; line-height: 18px; color: #999999;">
								&copy; ${new Date().getFullYear()} Password Manager. ${isRtl ? "جميع الحقوق محفوظة." : "All rights reserved."}
							</p>
						</td>
					</tr>
				</table>
			</td>
		</tr>
	</table>
</body>
</html>`;
}

/**
 * Build plain text email from HTML options
 *
 * @param options - Email content options
 * @returns Plain text email string
 */
export function buildEmailText(options: EmailHtmlOptions): string {
	const {
		greeting,
		body,
		actionText,
		actionUrl,
		footer,
		additionalContent,
		credentialBlock,
		secondaryAction,
	} = options;

	const lines: string[] = [greeting, "", body];

	if (additionalContent) {
		lines.push("", additionalContent);
	}

	if (credentialBlock) {
		lines.push("", `${credentialBlock.label}: ${credentialBlock.value}`);
	}

	if (actionUrl && actionText) {
		lines.push("", `${actionText}: ${actionUrl}`);
	}

	if (secondaryAction) {
		lines.push("", `${secondaryAction.text}: ${secondaryAction.url}`);
	}

	lines.push("", "---", "", footer);
	lines.push("", `(c) ${new Date().getFullYear()} Password Manager`);

	return lines.join("\n");
}

/**
 * Build a simple email for password reset / verification
 * Uses minimal HTML for maximum compatibility
 *
 * @param options - Simple email options
 * @returns HTML and text versions
 */
export function buildSimpleEmail(options: {
	language: SupportedLanguage;
	subject: string;
	body: string;
	actionText: string;
	actionUrl: string;
}): { html: string; text: string } {
	const { language } = options;
	// SECURITY (fix #26): escape dynamic content / validate the action URL.
	const body = escapeHtml(options.body);
	const actionText = escapeHtml(options.actionText);
	const actionUrl = sanitizeUrl(options.actionUrl);
	const isRtl = isRtlLanguage(language);
	const direction = getTextDirection(language);
	const textAlign = getTextAlign(language);

	const html = `<!DOCTYPE html>
<html lang="${language}" dir="${direction}">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Password Manager</title>
</head>
<body style="margin: 0; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background-color: #f9fafb; direction: ${direction}; text-align: ${textAlign};">
	<div style="max-width: 465px; margin: 0 auto; background: #ffffff; border: 1px solid #eaeaea; border-radius: 8px; padding: 32px;">
		<p style="margin: 0 0 24px 0; font-size: 15px; line-height: 24px; color: #333333;">
			${body}
		</p>
		<p style="margin: 0 0 24px 0;">
			<a href="${actionUrl}" style="display: inline-block; padding: 14px 28px; background-color: #000000; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px;">
				${actionText}
			</a>
		</p>
		<p style="margin: 0; font-size: 13px; color: #666666; word-break: break-all;">
			<a href="${actionUrl}" style="color: #2563eb;">${actionUrl}</a>
		</p>
	</div>
</body>
</html>`;

	// Plain-text version uses raw (un-escaped) values; the URL is still
	// scheme-validated so a javascript:/data: link never reaches either part.
	const textUrl = actionUrl === "#" ? "" : String(options.actionUrl);
	const text = `${options.body}\n\n${options.actionText}: ${textUrl}\n\n---\nPassword Manager`;

	return { html, text };
}
