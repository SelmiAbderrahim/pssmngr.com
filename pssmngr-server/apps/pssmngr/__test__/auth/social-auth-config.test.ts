// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Social auth configuration tests
 *
 * Regression guard for the Google/GitHub OAuth setup: the betterAuth()
 * options must keep both social providers wired to their env vars and
 * account linking enabled for the trusted providers, otherwise a social
 * sign-in with an existing email would create a second user (and lose
 * access to the original org + vault).
 *
 * betterAuth itself is mocked so we can capture the options object the
 * real `lib/auth` module builds, without booting the full auth stack.
 */
import { beforeAll, describe, expect, test, vi } from "vitest";

const { betterAuthOptions } = vi.hoisted(() => ({
	betterAuthOptions: { current: null as Record<string, any> | null },
}));

vi.mock("better-auth", async () => {
	const actual =
		await vi.importActual<typeof import("better-auth")>("better-auth");
	return {
		...actual,
		betterAuth: (options: Record<string, any>) => {
			betterAuthOptions.current = options;
			return {
				handler: vi.fn(),
				api: {},
			};
		},
	};
});

process.env.GITHUB_CLIENT_ID = "test-github-client-id";
process.env.GITHUB_CLIENT_SECRET = "test-only-github-client-secret";
process.env.GOOGLE_CLIENT_ID = "test-google-client-id";
process.env.GOOGLE_CLIENT_SECRET = "test-only-google-client-secret";

beforeAll(async () => {
	await import("@pssmngr/server/lib/auth");
});

describe("betterAuth social provider configuration", () => {
	test("captures the betterAuth options", () => {
		expect(betterAuthOptions.current).not.toBeNull();
	});

	test("GitHub provider is wired to its env credentials", () => {
		expect(betterAuthOptions.current?.socialProviders?.github).toEqual({
			clientId: "test-github-client-id",
			clientSecret: "test-only-github-client-secret",
		});
	});

	test("Google provider is wired to its env credentials", () => {
		expect(betterAuthOptions.current?.socialProviders?.google).toEqual({
			clientId: "test-google-client-id",
			clientSecret: "test-only-google-client-secret",
		});
	});

	test("account linking is enabled for the trusted social providers", () => {
		const accountLinking = betterAuthOptions.current?.account?.accountLinking;
		expect(accountLinking?.enabled).toBe(true);
		expect(accountLinking?.trustedProviders).toEqual(
			expect.arrayContaining(["google", "github"]),
		);
	});

	test("email/password auth stays enabled alongside social login", () => {
		expect(betterAuthOptions.current?.emailAndPassword?.enabled).toBe(true);
	});
});
