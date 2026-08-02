// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { afterEach, describe, expect, it } from "vitest";
import { getEmailConfig } from "../config";

describe("Email FROM address format", () => {
	const originalEnv = { ...process.env };

	afterEach(() => {
		process.env = { ...originalEnv };
	});

	it("should include a display name with angle bracket format", () => {
		process.env.EMAIL_FROM = "Password Manager <noreply@pssmngr.com>";
		const config = getEmailConfig();
		expect(config.fromAddress).toMatch(/^.+\s<.+@.+>$/);
	});

	it("should use 'Password Manager' as the display name", () => {
		process.env.EMAIL_FROM = "Password Manager <noreply@pssmngr.com>";
		const config = getEmailConfig();
		expect(config.fromAddress).toContain("Password Manager");
	});

	it("should use pssmngr.com domain", () => {
		process.env.EMAIL_FROM = "Password Manager <noreply@pssmngr.com>";
		const config = getEmailConfig();
		expect(config.fromAddress).toContain("@pssmngr.com");
	});

	it("should not show bare email without display name", () => {
		process.env.EMAIL_FROM = "Password Manager <noreply@pssmngr.com>";
		const config = getEmailConfig();
		expect(config.fromAddress).not.toEqual("noreply@pssmngr.com");
	});
});
