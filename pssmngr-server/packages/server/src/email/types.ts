// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Email Provider Types and Interfaces
 *
 * This module defines the types for the multi-provider email system.
 */

/**
 * Supported email provider types
 */
export type EmailProviderType = "resend" | "smtp";

/**
 * Email message structure
 */
export interface EmailMessage {
	to: string | string[];
	subject: string;
	html: string;
	text?: string;
	from?: string;
	replyTo?: string;
	tags?: Record<string, string>;
}

/**
 * Result of sending an email
 */
export interface EmailSendResult {
	success: boolean;
	messageId?: string;
	error?: string;
}

/**
 * Base configuration for all providers
 */
export interface BaseEmailConfig {
	fromAddress: string;
}

/**
 * SMTP-specific configuration
 */
export interface SmtpConfig extends BaseEmailConfig {
	provider: "smtp";
	smtpServer: string;
	smtpPort: number;
	username: string;
	password: string;
	secure?: boolean;
}

/**
 * Resend-specific configuration
 */
export interface ResendConfig extends BaseEmailConfig {
	provider: "resend";
	apiKey: string;
}

/**
 * Union type for provider configurations
 */
export type EmailProviderConfig = SmtpConfig | ResendConfig;

/**
 * Email provider interface - all providers must implement this
 */
export interface IEmailProvider {
	readonly name: EmailProviderType;

	/**
	 * Send a single email
	 */
	send(message: EmailMessage): Promise<EmailSendResult>;

	/**
	 * Send multiple emails (batch)
	 */
	sendBatch?(messages: EmailMessage[]): Promise<EmailSendResult[]>;

	/**
	 * Validate provider configuration
	 */
	validate(): Promise<boolean>;
}

/**
 * Environment-based email configuration
 */
export interface EmailEnvironmentConfig {
	provider: EmailProviderType;
	fromAddress: string;
	resendApiKey?: string;
	smtpServer?: string;
	smtpPort?: number;
	smtpUsername?: string;
	smtpPassword?: string;
}

// =============================================================================
// Localized Email Types
// =============================================================================

import type { SupportedLanguage } from "../i18n/types";

/**
 * Supported email template IDs
 * These correspond to keys in the emails.json translation files
 */
export type EmailTemplateId = "invitation" | "emailVerification";

/**
 * Options for sending a localized email
 */
export interface LocalizedEmailOptions {
	/** Recipient email address */
	to: string;
	/** Email template identifier */
	templateId: EmailTemplateId;
	/** Language for the email content */
	language: SupportedLanguage;
	/** Data for template interpolation */
	data: Record<string, string | number>;
	/** Optional reply-to address */
	replyTo?: string;
	/** Optional custom from address */
	from?: string;
}

/**
 * Rendered email content ready to send
 */
export interface RenderedEmail {
	/** Email subject line */
	subject: string;
	/** HTML email body */
	html: string;
	/** Plain text email body */
	text: string;
}

/**
 * Options for building email HTML
 */
export interface EmailHtmlOptions {
	/** Language code for the email */
	language: SupportedLanguage;
	/** Title/heading of the email */
	title: string;
	/** Greeting line (e.g., "Hello John") */
	greeting: string;
	/** Main body content */
	body: string;
	/** Call-to-action button text */
	actionText?: string;
	/** Call-to-action button URL */
	actionUrl?: string;
	/** Footer text */
	footer: string;
	/** Additional body content (optional) */
	additionalContent?: string;
	/** Highlighted credential to display in a boxed block (e.g. a temporary password) */
	credentialBlock?: {
		label: string;
		value: string;
	};
	/** Secondary action rendered as a text link below the primary button */
	secondaryAction?: {
		text: string;
		url: string;
	};
}

/**
 * Result of sending a localized email
 */
export interface LocalizedEmailResult {
	success: boolean;
	messageId?: string;
	error?: string;
	language: SupportedLanguage;
}
