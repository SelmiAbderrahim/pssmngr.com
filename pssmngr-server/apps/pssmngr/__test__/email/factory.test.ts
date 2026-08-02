// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors

import {
	createEmailProvider,
	createSmtpProviderFromNotification,
	getEmailProviderType,
	getSystemEmailProvider,
	resetSystemProvider,
} from "@pssmngr/server/email";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the Resend SDK
vi.mock("resend", () => ({
	Resend: vi.fn().mockImplementation(() => ({
		emails: {
			send: vi.fn().mockResolvedValue({
				data: { id: "test-message-id" },
				error: null,
			}),
		},
		batch: {
			send: vi.fn().mockResolvedValue({
				data: [{ id: "batch-id-1" }],
				error: null,
			}),
		},
	})),
}));

// Mock nodemailer
vi.mock("nodemailer", () => ({
	default: {
		createTransport: vi.fn().mockReturnValue({
			sendMail: vi.fn().mockResolvedValue({
				messageId: "smtp-message-id",
			}),
			verify: vi.fn().mockResolvedValue(true),
			close: vi.fn(),
		}),
	},
}));

describe("Email Provider Factory", () => {
	const originalEnv = { ...process.env };

	beforeEach(() => {
		resetSystemProvider();
		// Clear email-related env vars
		delete process.env.EMAIL_PROVIDER;
		delete process.env.EMAIL_FROM;
		delete process.env.RESEND_API_KEY;
		delete process.env.SMTP_SERVER;
		delete process.env.SMTP_PORT;
		delete process.env.SMTP_USERNAME;
		delete process.env.SMTP_PASSWORD;
	});

	afterEach(() => {
		process.env = { ...originalEnv };
		resetSystemProvider();
	});

	describe("createEmailProvider", () => {
		it("should create Resend provider with valid config", () => {
			const provider = createEmailProvider({
				provider: "resend",
				apiKey: "re_test_api_key",
				fromAddress: "test@example.com",
			});

			expect(provider.name).toBe("resend");
		});

		it("should create SMTP provider with valid config", () => {
			const provider = createEmailProvider({
				provider: "smtp",
				smtpServer: "smtp.example.com",
				smtpPort: 587,
				username: "user",
				password: "pass",
				fromAddress: "test@example.com",
			});

			expect(provider.name).toBe("smtp");
		});

		it("should throw error for unknown provider", () => {
			expect(() =>
				createEmailProvider({
					provider: "unknown" as any,
					fromAddress: "test@example.com",
				} as any),
			).toThrow("Unknown email provider");
		});
	});

	describe("getEmailProviderType", () => {
		it("should return resend when EMAIL_PROVIDER is resend", () => {
			process.env.EMAIL_PROVIDER = "resend";
			expect(getEmailProviderType()).toBe("resend");
		});

		it("should return smtp when EMAIL_PROVIDER is smtp", () => {
			process.env.EMAIL_PROVIDER = "smtp";
			expect(getEmailProviderType()).toBe("smtp");
		});

		it("should default to resend when EMAIL_PROVIDER is not set", () => {
			delete process.env.EMAIL_PROVIDER;
			expect(getEmailProviderType()).toBe("resend");
		});
	});

	describe("getSystemEmailProvider", () => {
		it("should return Resend provider when configured", () => {
			process.env.EMAIL_PROVIDER = "resend";
			process.env.EMAIL_FROM = "noreply@test.com";
			process.env.RESEND_API_KEY = "re_test_key";

			const provider = getSystemEmailProvider();

			expect(provider.name).toBe("resend");
		});

		it("should return SMTP provider when configured", () => {
			process.env.EMAIL_PROVIDER = "smtp";
			process.env.EMAIL_FROM = "noreply@test.com";
			process.env.SMTP_SERVER = "smtp.test.com";
			process.env.SMTP_PORT = "587";
			process.env.SMTP_USERNAME = "user";
			process.env.SMTP_PASSWORD = "pass";

			const provider = getSystemEmailProvider();

			expect(provider.name).toBe("smtp");
		});

		it("should return same instance on multiple calls (singleton)", () => {
			process.env.EMAIL_PROVIDER = "resend";
			process.env.EMAIL_FROM = "noreply@test.com";
			process.env.RESEND_API_KEY = "re_test_key";

			const provider1 = getSystemEmailProvider();
			const provider2 = getSystemEmailProvider();

			expect(provider1).toBe(provider2);
		});

		it("should throw error when not configured", () => {
			process.env.EMAIL_PROVIDER = "resend";
			// Missing required config

			expect(() => getSystemEmailProvider()).toThrow(
				"Invalid email configuration",
			);
		});
	});

	describe("createSmtpProviderFromNotification", () => {
		it("should create SMTP provider from notification config", () => {
			const provider = createSmtpProviderFromNotification({
				smtpServer: "smtp.notification.com",
				smtpPort: 587,
				username: "notif_user",
				password: "notif_pass",
				fromAddress: "notifications@example.com",
			});

			expect(provider.name).toBe("smtp");
		});

		it("should have close method available", () => {
			const provider = createSmtpProviderFromNotification({
				smtpServer: "smtp.notification.com",
				smtpPort: 587,
				username: "notif_user",
				password: "notif_pass",
				fromAddress: "notifications@example.com",
			});

			expect(typeof provider.close).toBe("function");
		});
	});

	describe("resetSystemProvider", () => {
		it("should clear the singleton instance", () => {
			process.env.EMAIL_PROVIDER = "resend";
			process.env.EMAIL_FROM = "noreply@test.com";
			process.env.RESEND_API_KEY = "re_test_key";

			const provider1 = getSystemEmailProvider();
			resetSystemProvider();

			// Change config
			process.env.EMAIL_PROVIDER = "smtp";
			process.env.SMTP_SERVER = "smtp.test.com";
			process.env.SMTP_PORT = "587";
			process.env.SMTP_USERNAME = "user";
			process.env.SMTP_PASSWORD = "pass";

			const provider2 = getSystemEmailProvider();

			// Should be different providers
			expect(provider1.name).toBe("resend");
			expect(provider2.name).toBe("smtp");
		});
	});
});
