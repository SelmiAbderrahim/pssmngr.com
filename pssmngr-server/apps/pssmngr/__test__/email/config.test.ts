// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors

import {
	getEmailConfig,
	isEmailConfigured,
	validateEmailConfig,
} from "@pssmngr/server/email";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("Email Configuration", () => {
	const originalEnv = { ...process.env };

	beforeEach(() => {
		// Clear email-related env vars before each test
		delete process.env.EMAIL_PROVIDER;
		delete process.env.EMAIL_FROM;
		delete process.env.RESEND_API_KEY;
		delete process.env.SMTP_SERVER;
		delete process.env.SMTP_PORT;
		delete process.env.SMTP_USERNAME;
		delete process.env.SMTP_PASSWORD;
		delete process.env.SMTP_FROM_ADDRESS;
	});

	afterEach(() => {
		// Restore original env
		process.env = { ...originalEnv };
	});

	describe("getEmailConfig", () => {
		it("should return resend config from environment", () => {
			process.env.EMAIL_PROVIDER = "resend";
			process.env.EMAIL_FROM = "noreply@test.com";
			process.env.RESEND_API_KEY = "re_test_key";

			const config = getEmailConfig();

			expect(config.provider).toBe("resend");
			expect(config.fromAddress).toBe("noreply@test.com");
			expect(config.resendApiKey).toBe("re_test_key");
		});

		it("should return smtp config from environment", () => {
			process.env.EMAIL_PROVIDER = "smtp";
			process.env.SMTP_FROM_ADDRESS = "noreply@test.com";
			process.env.SMTP_SERVER = "smtp.test.com";
			process.env.SMTP_PORT = "587";
			process.env.SMTP_USERNAME = "user";
			process.env.SMTP_PASSWORD = "pass";

			const config = getEmailConfig();

			expect(config.provider).toBe("smtp");
			expect(config.smtpServer).toBe("smtp.test.com");
			expect(config.smtpPort).toBe(587);
		});

		it("should default to resend provider when EMAIL_PROVIDER is not set", () => {
			const config = getEmailConfig();
			expect(config.provider).toBe("resend");
		});

		it("should use EMAIL_FROM over SMTP_FROM_ADDRESS", () => {
			process.env.EMAIL_FROM = "primary@test.com";
			process.env.SMTP_FROM_ADDRESS = "fallback@test.com";

			const config = getEmailConfig();
			expect(config.fromAddress).toBe("primary@test.com");
		});

		it("should fall back to SMTP_FROM_ADDRESS when EMAIL_FROM is not set", () => {
			process.env.SMTP_FROM_ADDRESS = "fallback@test.com";

			const config = getEmailConfig();
			expect(config.fromAddress).toBe("fallback@test.com");
		});
	});

	describe("validateEmailConfig", () => {
		it("should validate resend config successfully", () => {
			const config = {
				provider: "resend" as const,
				fromAddress: "noreply@test.com",
				resendApiKey: "re_test_key",
			};

			const result = validateEmailConfig(config);

			expect(result.valid).toBe(true);
			expect(result.errors).toHaveLength(0);
		});

		it("should fail validation for missing resend API key", () => {
			const config = {
				provider: "resend" as const,
				fromAddress: "noreply@test.com",
			};

			const result = validateEmailConfig(config);

			expect(result.valid).toBe(false);
			expect(result.errors).toContain(
				"RESEND_API_KEY is required when EMAIL_PROVIDER=resend",
			);
		});

		it("should fail validation for missing from address", () => {
			const config = {
				provider: "resend" as const,
				fromAddress: "",
				resendApiKey: "re_test_key",
			};

			const result = validateEmailConfig(config);

			expect(result.valid).toBe(false);
			expect(result.errors).toContain(
				"EMAIL_FROM or SMTP_FROM_ADDRESS is required",
			);
		});

		it("should validate smtp config successfully", () => {
			const config = {
				provider: "smtp" as const,
				fromAddress: "noreply@test.com",
				smtpServer: "smtp.test.com",
				smtpPort: 587,
				smtpUsername: "user",
				smtpPassword: "pass",
			};

			const result = validateEmailConfig(config);

			expect(result.valid).toBe(true);
			expect(result.errors).toHaveLength(0);
		});

		it("should fail validation for missing smtp config", () => {
			const config = {
				provider: "smtp" as const,
				fromAddress: "noreply@test.com",
			};

			const result = validateEmailConfig(config);

			expect(result.valid).toBe(false);
			expect(result.errors).toContain(
				"SMTP_SERVER is required when EMAIL_PROVIDER=smtp",
			);
			expect(result.errors).toContain(
				"SMTP_PORT is required when EMAIL_PROVIDER=smtp",
			);
			expect(result.errors).toContain(
				"SMTP_USERNAME is required when EMAIL_PROVIDER=smtp",
			);
			expect(result.errors).toContain(
				"SMTP_PASSWORD is required when EMAIL_PROVIDER=smtp",
			);
		});
	});

	describe("isEmailConfigured", () => {
		it("should return true when resend is properly configured", () => {
			process.env.EMAIL_PROVIDER = "resend";
			process.env.EMAIL_FROM = "noreply@test.com";
			process.env.RESEND_API_KEY = "re_test_key";

			expect(isEmailConfigured()).toBe(true);
		});

		it("should return true when smtp is properly configured", () => {
			process.env.EMAIL_PROVIDER = "smtp";
			process.env.EMAIL_FROM = "noreply@test.com";
			process.env.SMTP_SERVER = "smtp.test.com";
			process.env.SMTP_PORT = "587";
			process.env.SMTP_USERNAME = "user";
			process.env.SMTP_PASSWORD = "pass";

			expect(isEmailConfigured()).toBe(true);
		});

		it("should return false when resend API key is missing", () => {
			process.env.EMAIL_PROVIDER = "resend";
			process.env.EMAIL_FROM = "noreply@test.com";
			// Missing RESEND_API_KEY

			expect(isEmailConfigured()).toBe(false);
		});

		it("should return false when from address is missing", () => {
			process.env.EMAIL_PROVIDER = "resend";
			process.env.RESEND_API_KEY = "re_test_key";
			// Missing EMAIL_FROM

			expect(isEmailConfigured()).toBe(false);
		});
	});
});
