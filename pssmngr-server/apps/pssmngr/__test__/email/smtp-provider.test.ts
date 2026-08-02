// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	SmtpProvider,
	type SmtpTransportFactory,
} from "../../../../packages/server/src/email/providers/smtp";

const mockSendMail = vi.fn();
const mockVerify = vi.fn();
const mockClose = vi.fn();
const mockCreateTransport = vi.fn();

mockCreateTransport.mockImplementation((config) => ({
	sendMail: mockSendMail,
	verify: mockVerify,
	close: mockClose,
	_config: config,
}));

describe("SmtpProvider", () => {
	let provider: SmtpProvider;
	const defaultConfig = {
		smtpServer: "smtp.test.com",
		smtpPort: 587,
		username: "testuser",
		password: "testpass",
		fromAddress: "noreply@test.com",
	};

	beforeEach(() => {
		vi.clearAllMocks();
		provider = new SmtpProvider(
			defaultConfig,
			mockCreateTransport as unknown as SmtpTransportFactory,
		);

		// Reset mock implementations
		mockSendMail.mockResolvedValue({
			messageId: "smtp-message-id",
		});
		mockVerify.mockResolvedValue(true);
	});

	describe("constructor", () => {
		it("should have correct provider name", () => {
			expect(provider.name).toBe("smtp");
		});

		it("should create transporter with correct config", async () => {
			expect(mockCreateTransport).toHaveBeenCalledWith({
				host: "smtp.test.com",
				port: 587,
				secure: false,
				auth: {
					user: "testuser",
					pass: "testpass",
				},
			});
		});

		it("should use secure connection for port 465", async () => {
			vi.clearAllMocks();

			new SmtpProvider(
				{
					...defaultConfig,
					smtpPort: 465,
				},
				mockCreateTransport as unknown as SmtpTransportFactory,
			);

			expect(mockCreateTransport).toHaveBeenCalledWith(
				expect.objectContaining({
					port: 465,
					secure: true,
				}),
			);
		});

		it("should respect explicit secure setting", async () => {
			vi.clearAllMocks();

			new SmtpProvider(
				{
					...defaultConfig,
					secure: true,
				},
				mockCreateTransport as unknown as SmtpTransportFactory,
			);

			expect(mockCreateTransport).toHaveBeenCalledWith(
				expect.objectContaining({
					secure: true,
				}),
			);
		});
	});

	describe("send", () => {
		it("should send email successfully", async () => {
			const result = await provider.send({
				to: "recipient@example.com",
				subject: "Test Subject",
				html: "<p>Test content</p>",
			});

			expect(result.success).toBe(true);
			expect(result.messageId).toBe("smtp-message-id");
			expect(mockSendMail).toHaveBeenCalledWith({
				from: "noreply@test.com",
				to: "recipient@example.com",
				subject: "Test Subject",
				html: "<p>Test content</p>",
				text: undefined,
				replyTo: undefined,
			});
		});

		it("should handle array of recipients", async () => {
			const result = await provider.send({
				to: ["recipient1@example.com", "recipient2@example.com"],
				subject: "Test Subject",
				html: "<p>Test content</p>",
			});

			expect(result.success).toBe(true);
			expect(mockSendMail).toHaveBeenCalledWith(
				expect.objectContaining({
					to: "recipient1@example.com, recipient2@example.com",
				}),
			);
		});

		it("should use custom from address when provided", async () => {
			await provider.send({
				to: "recipient@example.com",
				subject: "Test",
				html: "<p>Test</p>",
				from: "custom@example.com",
			});

			expect(mockSendMail).toHaveBeenCalledWith(
				expect.objectContaining({
					from: "custom@example.com",
				}),
			);
		});

		it("should include text and replyTo when provided", async () => {
			await provider.send({
				to: "recipient@example.com",
				subject: "Test",
				html: "<p>Test</p>",
				text: "Plain text version",
				replyTo: "reply@example.com",
			});

			expect(mockSendMail).toHaveBeenCalledWith(
				expect.objectContaining({
					text: "Plain text version",
					replyTo: "reply@example.com",
				}),
			);
		});

		it("should handle send errors", async () => {
			mockSendMail.mockRejectedValueOnce(new Error("Connection refused"));

			const result = await provider.send({
				to: "recipient@example.com",
				subject: "Test",
				html: "<p>Test</p>",
			});

			expect(result.success).toBe(false);
			expect(result.error).toBe("Connection refused");
		});

		it("should handle unknown errors", async () => {
			mockSendMail.mockRejectedValueOnce("Unknown error object");

			const result = await provider.send({
				to: "recipient@example.com",
				subject: "Test",
				html: "<p>Test</p>",
			});

			expect(result.success).toBe(false);
			expect(result.error).toContain("Unknown error");
		});
	});

	describe("validate", () => {
		it("should return true when connection is valid", async () => {
			mockVerify.mockResolvedValueOnce(true);

			const isValid = await provider.validate();

			expect(isValid).toBe(true);
			expect(mockVerify).toHaveBeenCalled();
		});

		it("should return false when connection fails", async () => {
			mockVerify.mockRejectedValueOnce(new Error("Connection failed"));

			const isValid = await provider.validate();

			expect(isValid).toBe(false);
		});
	});

	describe("close", () => {
		it("should close the transporter", () => {
			provider.close();

			expect(mockClose).toHaveBeenCalled();
		});
	});

	describe("sendBatch (inherited)", () => {
		it("should send emails sequentially by default", async () => {
			const results = await provider.sendBatch([
				{
					to: "user1@example.com",
					subject: "Email 1",
					html: "<p>Content 1</p>",
				},
				{
					to: "user2@example.com",
					subject: "Email 2",
					html: "<p>Content 2</p>",
				},
			]);

			expect(results).toHaveLength(2);
			expect(results[0].success).toBe(true);
			expect(results[1].success).toBe(true);
			expect(mockSendMail).toHaveBeenCalledTimes(2);
		});
	});
});
