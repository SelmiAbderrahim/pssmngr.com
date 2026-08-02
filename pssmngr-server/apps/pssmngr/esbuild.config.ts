// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import esbuild from "esbuild";

await esbuild.build({
	entryPoints: {
		server: "server/server.ts",
		"reset-2fa": "reset-2fa.ts",
	},
	bundle: true,
	platform: "node",
	format: "esm",
	target: "node20",
	outExtension: { ".js": ".mjs" },
	minify: true,
	sourcemap: false,
	outdir: "dist",
	tsconfig: "tsconfig.server.json",
	packages: "external",
});
