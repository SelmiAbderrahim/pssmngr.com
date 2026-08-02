// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import { realpathSync } from "node:fs";
import { dirname } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = realpathSync(dirname(fileURLToPath(import.meta.url)));
const workspaceRoot = __dirname;

/** @type {import("next").NextConfig} */
const nextConfig = {
	reactStrictMode: true,
	transpilePackages: ["@pssmngr/server"],
};

export default {
	...nextConfig,
	experimental: {
		cpus: Number(process.env.NEXT_BUILD_CPUS || 1),
	},
	turbopack: {
		root: workspaceRoot,
	},
};
