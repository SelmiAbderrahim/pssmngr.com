// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	type ResendClient,
	ResendProvider,
} from "../../../../packages/server/src/email/providers/resend";

const send = vi.fn();
const sendBatch = vi.fn();
const client = {
	emails: { send },
	batch: { send: sendBatch },
} as unknown as ResendClient;

describe("ResendProvider", () => {
	let provider: ResendProvider;

	beforeEach(() => {
		vi.clearAllMocks();
		provider = new ResendProvider("re_test_key", "noreply@test.com", client);
	});

	it("implements the provider interface", async () => {
		expect(provider.name).toBe("resend");
		expect(typeof provider.send).toBe("function");
		expect(typeof provider.sendBatch).toBe("function");
		expect(await provider.validate()).toBe(true);
	});

	it("sends a message", async () => {
		send.mockResolvedValue({ data: { id: "message-1" }, error: null });

		await expect(
			provider.send({
				to: "recipient@example.com",
				subject: "Test",
				html: "<p>Test</p>",
			}),
		).resolves.toEqual({ success: true, messageId: "message-1" });
		expect(send).toHaveBeenCalledWith(
			expect.objectContaining({
				from: "noreply@test.com",
				to: ["recipient@example.com"],
				subject: "Test",
			}),
		);
	});

	it("returns API errors without throwing", async () => {
		send.mockResolvedValue({ data: null, error: { message: "unauthorized" } });

		await expect(
			provider.send({
				to: "recipient@example.com",
				subject: "Test",
				html: "<p>Test</p>",
			}),
		).resolves.toEqual({ success: false, error: "unauthorized" });
	});

	it("sends a batch", async () => {
		sendBatch.mockResolvedValue({
			data: { data: [{ id: "message-1" }, { id: "message-2" }] },
			error: null,
		});

		await expect(
			provider.sendBatch([
				{ to: "one@example.com", subject: "One", html: "<p>One</p>" },
				{ to: "two@example.com", subject: "Two", html: "<p>Two</p>" },
			]),
		).resolves.toEqual([
			{ success: true, messageId: "message-1" },
			{ success: true, messageId: "message-2" },
		]);
	});

	it("returns a batch API error for every message", async () => {
		sendBatch.mockResolvedValue({
			data: null,
			error: { message: "rate limited" },
		});

		await expect(
			provider.sendBatch([
				{ to: "one@example.com", subject: "One", html: "<p>One</p>" },
				{ to: "two@example.com", subject: "Two", html: "<p>Two</p>" },
			]),
		).resolves.toEqual([
			{ success: false, error: "rate limited" },
			{ success: false, error: "rate limited" },
		]);
	});
});
