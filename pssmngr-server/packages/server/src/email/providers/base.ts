// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Base Email Provider
 *
 * Abstract base class for email providers.
 */

import type {
	EmailMessage,
	EmailProviderType,
	EmailSendResult,
	IEmailProvider,
} from "../types";

/**
 * Abstract base class for email providers
 */
export abstract class BaseEmailProvider implements IEmailProvider {
	abstract readonly name: EmailProviderType;
	protected fromAddress: string;

	constructor(fromAddress: string) {
		this.fromAddress = fromAddress;
	}

	abstract send(message: EmailMessage): Promise<EmailSendResult>;

	async sendBatch(messages: EmailMessage[]): Promise<EmailSendResult[]> {
		// Default implementation: send sequentially
		// Providers can override for batch API support
		return Promise.all(messages.map((msg) => this.send(msg)));
	}

	abstract validate(): Promise<boolean>;

	/**
	 * Get the from address, with optional override
	 */
	protected getFromAddress(override?: string): string {
		return override || this.fromAddress;
	}

	/**
	 * Normalize recipient to array
	 */
	protected normalizeRecipients(to: string | string[]): string[] {
		return Array.isArray(to) ? to : [to];
	}
}
