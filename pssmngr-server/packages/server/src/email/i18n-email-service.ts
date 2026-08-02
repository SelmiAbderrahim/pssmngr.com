// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Localized Email Service
 *
 * Provides functions for sending translated emails based on user language preferences.
 * Integrates with the existing i18n system and email providers.
 */

import { eq } from "drizzle-orm";
import { db } from "../db";
import * as schema from "../db/schema";
import {
	DEFAULT_LANGUAGE,
	getNamespacedTranslator,
	initI18n,
	SUPPORTED_LANGUAGES,
	type SupportedLanguage,
} from "../i18n";
import { getSystemEmailProviderAsync } from "./factory";
import {
	buildEmailHtml,
	buildEmailText,
	buildSimpleEmail,
} from "./html-builder";
import type {
	EmailTemplateId,
	LocalizedEmailOptions,
	LocalizedEmailResult,
	RenderedEmail,
} from "./types";

/**
 * Get user's preferred language from database.
 * Falls back to default language if not set or user not found.
 *
 * @param userId - The user ID to look up
 * @returns The user's preferred language or default
 */
export async function getUserEmailLanguage(
	userId: string | null | undefined,
): Promise<SupportedLanguage> {
	if (!userId) {
		return DEFAULT_LANGUAGE;
	}

	try {
		const user = await db.query.user.findFirst({
			where: eq(schema.user.id, userId),
			columns: {
				preferredLanguage: true,
			},
		});

		if (user?.preferredLanguage && isValidLanguage(user.preferredLanguage)) {
			return user.preferredLanguage;
		}

		return DEFAULT_LANGUAGE;
	} catch (error) {
		console.error("[i18n-email] Error fetching user language:", error);
		return DEFAULT_LANGUAGE;
	}
}

/**
 * Check if a language code is valid/supported.
 */
function isValidLanguage(lang: string): lang is SupportedLanguage {
	return SUPPORTED_LANGUAGES.includes(lang as SupportedLanguage);
}

/**
 * Render an email template with translations.
 *
 * @param templateId - The template identifier
 * @param language - The language to use
 * @param data - Data for interpolation
 * @returns Rendered email with subject, html, and text
 */
export async function renderLocalizedEmail(
	templateId: EmailTemplateId,
	language: SupportedLanguage,
	data: Record<string, string | number>,
): Promise<RenderedEmail> {
	// Ensure i18n is initialized
	await initI18n();

	// Get translator for emails namespace
	const t = getNamespacedTranslator(language, "emails");

	// Get common translations
	const greeting = data.name
		? t("common.greetingWithName", { name: data.name })
		: t("common.greeting");
	const footer = t("common.footer");

	// Render based on template type
	switch (templateId) {
		case "invitation":
			return renderInvitationEmail(t, language, data, greeting, footer);
		case "emailVerification":
			return renderEmailVerificationEmail(t, language, data, greeting, footer);
		default:
			templateId satisfies never;
			throw new Error("Unknown email template");
	}
}

// Template rendering functions
function renderInvitationEmail(
	t: ReturnType<typeof getNamespacedTranslator>,
	language: SupportedLanguage,
	data: Record<string, string | number>,
	greeting: string,
	footer: string,
): RenderedEmail {
	const subject = t("invitation.subject", { organization: data.organization });
	const title = t("invitation.title");

	const baseBody = data.role
		? t("invitation.bodyWithRole", {
				organization: data.organization,
				role: data.role,
			})
		: t("invitation.body", { organization: data.organization });
	const body = baseBody;

	const actionText = t("invitation.action");
	const additionalContent = data.inviter
		? t("invitation.invitedBy", { name: data.inviter })
		: undefined;

	const html = buildEmailHtml({
		language,
		title,
		greeting,
		body,
		actionText,
		actionUrl: data.actionUrl as string,
		footer: `${footer} ${t("invitation.ignoreNote")}`,
		additionalContent,
	});

	const text = buildEmailText({
		language,
		title,
		greeting,
		body,
		actionText,
		actionUrl: data.actionUrl as string,
		footer: `${footer} ${t("invitation.ignoreNote")}`,
		additionalContent,
	});

	return { subject, html, text };
}

function renderEmailVerificationEmail(
	t: ReturnType<typeof getNamespacedTranslator>,
	language: SupportedLanguage,
	data: Record<string, string | number>,
	greeting: string,
	footer: string,
): RenderedEmail {
	const subject = t("emailVerification.subject");
	const title = t("emailVerification.title");
	const body = t("emailVerification.body");
	const actionText = t("emailVerification.action");

	const html = buildEmailHtml({
		language,
		title,
		greeting,
		body,
		actionText,
		actionUrl: data.actionUrl as string,
		footer,
	});

	const text = buildEmailText({
		language,
		title,
		greeting,
		body,
		actionText,
		actionUrl: data.actionUrl as string,
		footer,
	});

	return { subject, html, text };
}

/**
 * Send a localized email using the system email provider.
 *
 * @param options - Email options including template, language, and data
 * @returns Result of the email send operation
 */
export async function sendLocalizedEmail(
	options: LocalizedEmailOptions,
): Promise<LocalizedEmailResult> {
	const { to, templateId, language, data, replyTo, from } = options;

	try {
		// Render the email
		const rendered = await renderLocalizedEmail(templateId, language, data);

		// Get the email provider
		const provider = await getSystemEmailProviderAsync();

		// Send the email
		const result = await provider.send({
			to,
			subject: rendered.subject,
			html: rendered.html,
			text: rendered.text,
			replyTo,
			from,
		});

		return {
			success: result.success,
			messageId: result.messageId,
			error: result.error,
			language,
		};
	} catch (error) {
		console.error("[i18n-email] Failed to send email:", error);
		return {
			success: false,
			error: error instanceof Error ? error.message : "Unknown error",
			language,
		};
	}
}

/**
 * Send a simple localized email for address verification.
 * Uses minimal HTML for maximum compatibility.
 *
 * @param options - Simple email options
 * @returns Result of the email send operation
 */
export async function sendSimpleLocalizedEmail(options: {
	to: string;
	userId?: string | null;
	templateId: "emailVerification";
	actionUrl: string;
}): Promise<LocalizedEmailResult> {
	const { to, userId, templateId, actionUrl } = options;

	try {
		// Get user's language preference
		const language = await getUserEmailLanguage(userId);

		// Ensure i18n is initialized
		await initI18n();

		// Get translator
		const t = getNamespacedTranslator(language, "emails");

		// Get translations
		const subject = t(`${templateId}.subject`);
		const body = t(`${templateId}.body`);
		const actionText = t(`${templateId}.action`);

		// Warn if translations didn't resolve (returned raw key)
		if (subject === `${templateId}.subject`) {
			console.error(
				`[i18n-email] Translation not loaded for "${templateId}" (lang=${language}). ` +
					"Check that locale files exist at the resolved path. " +
					`I18N_LOCALES_PATH=${process.env.I18N_LOCALES_PATH || "unset"}`,
			);
		}

		// Build simple email
		const { html, text } = buildSimpleEmail({
			language,
			subject,
			body,
			actionText,
			actionUrl,
		});

		// Get the email provider
		const provider = await getSystemEmailProviderAsync();

		// Send the email
		const result = await provider.send({
			to,
			subject,
			html,
			text,
		});

		return {
			success: result.success,
			messageId: result.messageId,
			error: result.error,
			language,
		};
	} catch (error) {
		console.error("[i18n-email] Failed to send simple email:", error);
		return {
			success: false,
			error: error instanceof Error ? error.message : "Unknown error",
			language: DEFAULT_LANGUAGE,
		};
	}
}

/**
 * Send invitation email with localization.
 * Convenience function for the common invitation use case.
 *
 * @param options - Invitation email options
 * @returns Result of the email send operation
 */
export async function sendLocalizedInvitation(options: {
	to: string;
	inviteeUserId?: string | null;
	organization: string;
	inviter?: string;
	role?: string;
	actionUrl: string;
}): Promise<LocalizedEmailResult> {
	const { to, inviteeUserId, organization, inviter, role, actionUrl } = options;

	// Get language preference
	const language = await getUserEmailLanguage(inviteeUserId);

	return sendLocalizedEmail({
		to,
		templateId: "invitation",
		language,
		data: {
			organization,
			inviter: inviter || "",
			role: role || "",
			actionUrl,
		},
	});
}
