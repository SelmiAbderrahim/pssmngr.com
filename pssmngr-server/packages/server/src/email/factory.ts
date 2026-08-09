// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Email Provider Factory
 *
 * Factory for creating email providers based on configuration.
 * Supports database-stored credentials with fallback to environment variables.
 */

import {
	getEmailConfig,
	getEmailConfigAsync,
	validateEmailConfig,
} from "./config";
import { ResendProvider } from "./providers/resend";
import { SmtpProvider } from "./providers/smtp";
import type {
	EmailProviderConfig,
	EmailProviderType,
	IEmailProvider,
} from "./types";

/**
 * Singleton instance for system email provider
 */
let systemProvider: IEmailProvider | null = null;

/**
 * Track the config hash to detect changes
 */
let configHash: string | null = null;

function hashConfig(config: {
	resendApiKey?: string;
	smtpPassword?: string;
}): string {
	return `${config.resendApiKey || ""}-${config.smtpPassword || ""}`;
}

/**
 * Create an email provider from configuration
 */
export function createEmailProvider(
	config: EmailProviderConfig,
): IEmailProvider {
	switch (config.provider) {
		case "resend":
			return new ResendProvider(config.apiKey, config.fromAddress);

		case "smtp":
			return new SmtpProvider({
				smtpServer: config.smtpServer,
				smtpPort: config.smtpPort,
				username: config.username,
				password: config.password,
				fromAddress: config.fromAddress,
				secure: config.secure,
			});

		default:
			throw new Error(`Unknown email provider: ${(config as any).provider}`);
	}
}

/**
 * Get or create the system email provider using database-stored credentials.
 * This is the preferred method as it supports database-stored API keys.
 */
export async function getSystemEmailProviderAsync(): Promise<IEmailProvider> {
	const envConfig = await getEmailConfigAsync();
	const newHash = hashConfig(envConfig);

	// If config changed, recreate provider
	if (systemProvider && newHash !== configHash) {
		systemProvider = null;
	}

	if (systemProvider) {
		return systemProvider;
	}

	const { valid, errors } = validateEmailConfig(envConfig);

	if (!valid) {
		throw new Error(`Invalid email configuration: ${errors.join(", ")}`);
	}

	if (envConfig.provider === "resend") {
		systemProvider = new ResendProvider(
			envConfig.resendApiKey!,
			envConfig.fromAddress,
		);
	} else {
		systemProvider = new SmtpProvider({
			smtpServer: envConfig.smtpServer!,
			smtpPort: envConfig.smtpPort!,
			username: envConfig.smtpUsername!,
			password: envConfig.smtpPassword!,
			fromAddress: envConfig.fromAddress,
		});
	}

	configHash = newHash;
	return systemProvider;
}

/**
 * Get or create the system email provider based on environment config (sync)
 * @deprecated Use getSystemEmailProviderAsync() for database-stored keys support
 */
export function getSystemEmailProvider(): IEmailProvider {
	if (systemProvider) {
		return systemProvider;
	}

	const envConfig = getEmailConfig();
	const { valid, errors } = validateEmailConfig(envConfig);

	if (!valid) {
		throw new Error(`Invalid email configuration: ${errors.join(", ")}`);
	}

	if (envConfig.provider === "resend") {
		systemProvider = new ResendProvider(
			envConfig.resendApiKey!,
			envConfig.fromAddress,
		);
	} else {
		systemProvider = new SmtpProvider({
			smtpServer: envConfig.smtpServer!,
			smtpPort: envConfig.smtpPort!,
			username: envConfig.smtpUsername!,
			password: envConfig.smtpPassword!,
			fromAddress: envConfig.fromAddress,
		});
	}

	return systemProvider;
}

/**
 * Create SMTP provider from database notification config
 * Used for user-configured notification emails
 */
export function createSmtpProviderFromNotification(notificationEmail: {
	smtpServer: string;
	smtpPort: number;
	username: string;
	password: string;
	fromAddress: string;
}): SmtpProvider {
	return new SmtpProvider({
		smtpServer: notificationEmail.smtpServer,
		smtpPort: notificationEmail.smtpPort,
		username: notificationEmail.username,
		password: notificationEmail.password,
		fromAddress: notificationEmail.fromAddress,
	});
}

/**
 * Reset system provider (useful for testing or when keys are updated)
 */
export function resetSystemProvider(): void {
	systemProvider = null;
	configHash = null;
}

/**
 * Clear the email provider cache.
 * Call this when email service keys are updated.
 */
export function clearEmailProviderCache(): void {
	systemProvider = null;
	configHash = null;
}

/**
 * Get the current email provider type from environment
 */
export function getEmailProviderType(): EmailProviderType {
	return getEmailConfig().provider;
}
