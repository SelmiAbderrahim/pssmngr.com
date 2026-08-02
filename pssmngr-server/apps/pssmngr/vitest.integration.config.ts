// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors

import path from "node:path";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["__tests__/integration/**/*.test.ts"],
		exclude: ["**/node_modules/**", "**/dist/**"],
		environment: "node",
		globals: true,
		testTimeout: 30000,
		hookTimeout: 30000,
		pool: "forks",
		poolOptions: {
			forks: {
				singleFork: true,
			},
		},
		env: {
			NODE_ENV: "test",
		},
	},
	plugins: [
		tsconfigPaths({
			projects: [path.resolve(__dirname, "tsconfig.json")],
		}),
	],
	resolve: {
		alias: {
			"@pssmngr/server": path.resolve(__dirname, "../../packages/server/src"),
		},
	},
});
