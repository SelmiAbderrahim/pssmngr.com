// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Email Module
 *
 * Multi-provider email support for Password Manager.
 * Supports Resend (default) and SMTP providers.
 */

// Configuration
export {
	getEmailConfig,
	isEmailConfigured,
	validateEmailConfig,
} from "./config";
// Factory
export {
	createEmailProvider,
	createSmtpProviderFromNotification,
	getEmailProviderType,
	getSystemEmailProvider,
	getSystemEmailProviderAsync,
	resetSystemProvider,
} from "./factory";
// HTML Builder
export {
	buildEmailHtml,
	buildEmailText,
	buildSimpleEmail,
	getTextAlign,
	getTextDirection,
	isRtlLanguage,
} from "./html-builder";
// Localized Email Service
export {
	getUserEmailLanguage,
	renderLocalizedEmail,
	sendLocalizedEmail,
	sendLocalizedInvitation,
	sendSimpleLocalizedEmail,
} from "./i18n-email-service";
export { BaseEmailProvider } from "./providers/base";
// Providers (for direct instantiation if needed)
export { ResendProvider } from "./providers/resend";
export { SmtpProvider, type SmtpProviderConfig } from "./providers/smtp";
// Types
export * from "./types";
