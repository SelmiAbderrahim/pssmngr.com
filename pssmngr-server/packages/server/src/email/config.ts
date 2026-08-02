// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Email Configuration Module
 *
 * Reads email-provider configuration from environment variables.
 */

import type { EmailEnvironmentConfig, EmailProviderType } from "./types";

/**
 * Default email provider
 */
const DEFAULT_PROVIDER: EmailProviderType = "resend";

/**
 * Environment Variables:
 * - EMAIL_PROVIDER: 'resend' | 'smtp' (default: 'resend')
 * - EMAIL_FROM: Default from address (e.g., 'noreply@pssmngr.com')
 * - RESEND_API_KEY: API key for Resend
 * - SMTP_SERVER, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD: SMTP config
 */
export async function getEmailConfigAsync(): Promise<EmailEnvironmentConfig> {
	return getEmailConfig();
}

/**
 * Get email configuration synchronously.
 */
export function getEmailConfig(): EmailEnvironmentConfig {
	const provider =
		(process.env.EMAIL_PROVIDER as EmailProviderType) || DEFAULT_PROVIDER;

	return {
		provider,
		fromAddress: process.env.EMAIL_FROM || process.env.SMTP_FROM_ADDRESS || "",
		resendApiKey: process.env.RESEND_API_KEY,
		smtpServer: process.env.SMTP_SERVER,
		smtpPort: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined,
		smtpUsername: process.env.SMTP_USERNAME,
		smtpPassword: process.env.SMTP_PASSWORD,
	};
}

/**
 * Validate that required config is present for the selected provider
 */
export function validateEmailConfig(config: EmailEnvironmentConfig): {
	valid: boolean;
	errors: string[];
} {
	const errors: string[] = [];

	if (!config.fromAddress) {
		errors.push("EMAIL_FROM or SMTP_FROM_ADDRESS is required");
	}

	if (config.provider === "resend") {
		if (!config.resendApiKey) {
			errors.push("RESEND_API_KEY is required when EMAIL_PROVIDER=resend");
		}
	} else if (config.provider === "smtp") {
		if (!config.smtpServer)
			errors.push("SMTP_SERVER is required when EMAIL_PROVIDER=smtp");
		if (!config.smtpPort)
			errors.push("SMTP_PORT is required when EMAIL_PROVIDER=smtp");
		if (!config.smtpUsername)
			errors.push("SMTP_USERNAME is required when EMAIL_PROVIDER=smtp");
		if (!config.smtpPassword)
			errors.push("SMTP_PASSWORD is required when EMAIL_PROVIDER=smtp");
	}

	return { valid: errors.length === 0, errors };
}

/**
 * Check if email is configured and available (async convenience wrapper).
 */
export async function isEmailConfiguredAsync(): Promise<boolean> {
	const config = await getEmailConfigAsync();
	const { valid } = validateEmailConfig(config);
	return valid;
}

/**
 * Check if email is configured and available.
 */
export function isEmailConfigured(): boolean {
	const config = getEmailConfig();
	const { valid } = validateEmailConfig(config);
	return valid;
}
