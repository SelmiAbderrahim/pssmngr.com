// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { logger } from "./logger";

interface EnvVarSpec {
	name: string;
	required: boolean;
	sensitive: boolean;
	minLength?: number;
	description: string;
}

const REQUIRED_ENV_VARS: EnvVarSpec[] = [
	{
		name: "DATABASE_URL",
		required: true,
		sensitive: true,
		description: "PostgreSQL connection string",
	},
	{
		name: "REDIS_URL",
		required: false,
		sensitive: true,
		description: "Redis connection string (optional if REDIS_HOST set)",
	},
	{
		name: "BETTER_AUTH_SECRET",
		required: true,
		sensitive: true,
		minLength: 32,
		description: "Secret key for better-auth session signing",
	},
	{
		name: "ENCRYPTION_KEY",
		required: true,
		sensitive: true,
		minLength: 32,
		description: "HMAC key for anti-enumeration and emergency-access metadata",
	},
];

const OPTIONAL_ENV_VARS: EnvVarSpec[] = [
	{
		name: "GITHUB_CLIENT_ID",
		required: false,
		sensitive: false,
		description: "GitHub OAuth client ID",
	},
	{
		name: "GITHUB_CLIENT_SECRET",
		required: false,
		sensitive: true,
		description: "GitHub OAuth client secret",
	},
	{
		name: "GOOGLE_CLIENT_ID",
		required: false,
		sensitive: false,
		description: "Google OAuth client ID",
	},
	{
		name: "GOOGLE_CLIENT_SECRET",
		required: false,
		sensitive: true,
		description: "Google OAuth client secret",
	},
];

export function validateEnv(): void {
	const errors: string[] = [];
	const warnings: string[] = [];

	for (const spec of REQUIRED_ENV_VARS) {
		const value = process.env[spec.name];

		if (!value) {
			errors.push(
				`Missing required env var: ${spec.name} — ${spec.description}`,
			);
			continue;
		}

		if (spec.minLength && value.length < spec.minLength) {
			errors.push(
				`${spec.name} must be at least ${spec.minLength} characters (got ${value.length})`,
			);
		}
	}

	for (const spec of OPTIONAL_ENV_VARS) {
		const value = process.env[spec.name];
		if (value && spec.minLength && value.length < spec.minLength) {
			warnings.push(
				`${spec.name} is set but shorter than recommended ${spec.minLength} characters`,
			);
		}
	}

	if (warnings.length > 0) {
		for (const warning of warnings) {
			logger.warn({ env: "validation" }, warning);
		}
	}

	if (errors.length > 0) {
		for (const error of errors) {
			logger.error({ env: "validation" }, error);
		}
		throw new Error(
			`Environment validation failed:\n${errors.map((e) => `  - ${e}`).join("\n")}`,
		);
	}

	logger.info(
		{ env: "validation" },
		`Environment validated: ${REQUIRED_ENV_VARS.length} required vars OK`,
	);
}
