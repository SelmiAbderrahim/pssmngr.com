// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import path from "node:path";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

// Server package test path (relative to project root: pssmngr-server/apps/pssmngr)
const serverPackagePath = "../../packages/server/src/**/__tests__/**/*.test.ts";

export default defineConfig({
	test: {
		include: [
			"__test__/**/*.test.ts", // Main app tests
			"__tests__/**/*.test.ts", // Router integration tests
			"server/api/__tests__/**/*.test.ts", // Server API tests (i18n integration)
			"server/api/routers/__tests__/**/*.test.ts", // Router-level tests
			serverPackagePath, // Server package tests
		],
		exclude: [
			"**/node_modules/**",
			"**/dist/**",
			"**/.docker/**",
			"__tests__/integration/**",
		],
		pool: "forks",
		env: {
			NODE_ENV: "test",
			SITE_URL: "http://localhost:3000",
			DATABASE_URL:
				"postgresql://postgres:postgres@localhost:5432/pssmngr_test", // gitleaks:allow -- fixed local test credential
			BETTER_AUTH_SECRET: "test-only-better-auth-secret-32-chars",
			ENCRYPTION_KEY: "test-only-metadata-hmac-key-32-chars",
		},
	},
	plugins: [
		tsconfigPaths({
			projects: [path.resolve(__dirname, "../tsconfig.json")],
		}),
	],
	resolve: {
		alias: {
			"@pssmngr/server": path.resolve(
				__dirname,
				"../../../packages/server/src",
			),
		},
	},
});
