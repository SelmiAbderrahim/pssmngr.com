// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * SMTP Email Provider
 *
 * Uses Nodemailer for SMTP-based email delivery.
 */

import type { Transporter } from "nodemailer";
import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import type {
	EmailMessage,
	EmailProviderType,
	EmailSendResult,
} from "../types";
import { BaseEmailProvider } from "./base";

/**
 * SMTP configuration options
 */
export interface SmtpProviderConfig {
	smtpServer: string;
	smtpPort: number;
	username: string;
	password: string;
	fromAddress: string;
	secure?: boolean;
}

export type SmtpTransportFactory = (
	options: SMTPTransport.Options,
) => Transporter;

/**
 * SMTP email provider implementation using Nodemailer
 */
export class SmtpProvider extends BaseEmailProvider {
	readonly name: EmailProviderType = "smtp";
	private transporter: Transporter;
	private config: SmtpProviderConfig;

	constructor(
		config: SmtpProviderConfig,
		createTransport: SmtpTransportFactory = nodemailer.createTransport,
	) {
		super(config.fromAddress);
		this.config = config;
		this.transporter = createTransport({
			host: config.smtpServer,
			port: config.smtpPort,
			secure: config.secure ?? config.smtpPort === 465,
			auth: {
				user: config.username,
				pass: config.password,
			},
		});
	}

	async send(message: EmailMessage): Promise<EmailSendResult> {
		try {
			const recipients = this.normalizeRecipients(message.to);

			const result = await this.transporter.sendMail({
				from: this.getFromAddress(message.from),
				to: recipients.join(", "),
				subject: message.subject,
				html: message.html,
				text: message.text,
				replyTo: message.replyTo,
			});

			return {
				success: true,
				messageId: result.messageId,
			};
		} catch (err) {
			console.error("SMTP send error:", err);
			return {
				success: false,
				error:
					err instanceof Error
						? err.message
						: "Unknown error sending email via SMTP",
			};
		}
	}

	async validate(): Promise<boolean> {
		try {
			await this.transporter.verify();
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Close the transporter connection
	 */
	close(): void {
		this.transporter.close();
	}
}
