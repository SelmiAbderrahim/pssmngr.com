// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * Plaintext-localhost *web* origins. These are useful for local development
 * but must NOT be accepted in production: combined with
 * `Access-Control-Allow-Credentials: true`, any process listening on localhost
 * (local malware, a sandboxed app, a DNS-rebinding-adjacent context) could make
 * credentialed cross-origin calls against the production API. They are gated
 * behind a non-production environment below.
 */
const DEV_ONLY_ORIGIN_PATTERNS = [
	/^http:\/\/localhost:[0-9]+$/,
	/^http:\/\/127\.0\.0\.1:[0-9]+$/,
] as const;

export const ALLOWED_REQUEST_HEADERS = [
	"authorization",
	"content-type",
	"accept-language",
	"idempotency-key",
] as const;

function isProductionEnv(): boolean {
	return (
		process.env.NODE_ENV === "production" || process.env.IS_CLOUD === "true"
	);
}

export function isAllowedOrigin(
	origin: string | undefined,
	isProduction: boolean = isProductionEnv(),
): boolean {
	if (!origin) return false;
	if (
		!isProduction &&
		DEV_ONLY_ORIGIN_PATTERNS.some((pattern) => pattern.test(origin))
	) {
		return true;
	}
	const configured = [
		process.env.SITE_URL,
		...(process.env.TRUSTED_ORIGINS ?? "").split(","),
	]
		.map((value) => value?.trim().replace(/\/$/, ""))
		.filter(Boolean);
	return configured.includes(origin.replace(/\/$/, ""));
}

export function applyCorsHeaders(
	req: IncomingMessage,
	res: ServerResponse,
): void {
	const origin = Array.isArray(req.headers.origin)
		? req.headers.origin[0]
		: req.headers.origin;

	if (!isAllowedOrigin(origin)) {
		return;
	}

	res.setHeader("Access-Control-Allow-Origin", origin);
	res.setHeader(
		"Access-Control-Allow-Methods",
		"GET,POST,PUT,PATCH,DELETE,OPTIONS",
	);
	res.setHeader(
		"Access-Control-Allow-Headers",
		ALLOWED_REQUEST_HEADERS.join(", "),
	);
	res.setHeader("Vary", "Origin");

	res.setHeader("Access-Control-Allow-Credentials", "true");
}

export function handleCorsPreflight(
	req: IncomingMessage,
	res: ServerResponse,
): boolean {
	applyCorsHeaders(req, res);

	if (req.method !== "OPTIONS") {
		return false;
	}
	const origin = Array.isArray(req.headers.origin)
		? req.headers.origin[0]
		: req.headers.origin;
	if (!origin) {
		return false;
	}

	res.statusCode = isAllowedOrigin(origin) ? 200 : 403;
	res.end();
	return true;
}
