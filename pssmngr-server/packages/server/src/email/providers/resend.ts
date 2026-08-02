// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Resend Email Provider
 *
 * Uses the Resend SDK for email delivery.
 */

import { Resend } from "resend";
import type {
	EmailMessage,
	EmailProviderType,
	EmailSendResult,
} from "../types";
import { BaseEmailProvider } from "./base";

export type ResendClient = Pick<Resend, "emails" | "batch">;

/**
 * Resend email provider implementation
 */
export class ResendProvider extends BaseEmailProvider {
	readonly name: EmailProviderType = "resend";
	private client: ResendClient;

	constructor(
		apiKey: string,
		fromAddress: string,
		client: ResendClient = new Resend(apiKey),
	) {
		super(fromAddress);
		this.client = client;
	}

	async send(message: EmailMessage): Promise<EmailSendResult> {
		try {
			const recipients = this.normalizeRecipients(message.to);

			const { data, error } = await this.client.emails.send({
				from: this.getFromAddress(message.from),
				to: recipients,
				subject: message.subject,
				html: message.html,
				text: message.text,
				replyTo: message.replyTo,
				tags: message.tags
					? Object.entries(message.tags).map(([name, value]) => ({
							name,
							value,
						}))
					: undefined,
			});

			if (error) {
				return {
					success: false,
					error: error.message,
				};
			}

			return {
				success: true,
				messageId: data?.id,
			};
		} catch (err) {
			return {
				success: false,
				error:
					err instanceof Error
						? err.message
						: "Unknown error sending email via Resend",
			};
		}
	}

	async sendBatch(messages: EmailMessage[]): Promise<EmailSendResult[]> {
		// Resend supports batch API - use it for efficiency
		try {
			const batchMessages = messages.map((msg) => ({
				from: this.getFromAddress(msg.from),
				to: this.normalizeRecipients(msg.to),
				subject: msg.subject,
				html: msg.html,
				text: msg.text,
				replyTo: msg.replyTo,
			}));

			const { data, error } = await this.client.batch.send(batchMessages);

			if (error) {
				// Return error for all messages
				return messages.map(() => ({
					success: false,
					error: error.message,
				}));
			}

			// data is an object with 'data' array containing results
			const results = (data as { data: Array<{ id: string }> })?.data || [];
			return results.map((result: { id: string }) => ({
				success: true,
				messageId: result.id,
			}));
		} catch (err) {
			return messages.map(() => ({
				success: false,
				error:
					err instanceof Error ? err.message : "Unknown error in batch send",
			}));
		}
	}

	async validate(): Promise<boolean> {
		// Validate by checking client is initialized
		return this.client !== null;
	}
}
