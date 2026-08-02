// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors

import { createHash } from "node:crypto";
import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";

const auditLogger = pino({
	name: "audit",
	level: "info",
	redact: {
		paths: ["password", "token", "secret", "apiKey", "*.password", "*.token"],
		censor: "[REDACTED]",
	},
	...(isProduction
		? {}
		: {
				transport: {
					target: "pino-pretty",
					options: { colorize: true },
				},
			}),
});

function hashIp(ip: string): string {
	return createHash("sha256").update(ip).digest("hex").slice(0, 16);
}

type AuditEvent =
	| "auth.login"
	| "auth.logout"
	| "auth.login_failed"
	| "auth.register"
	| "auth.password_change"
	| "auth.totp_enable"
	| "auth.totp_disable"
	| "role.change"
	| "credential.export"
	| "device.enroll"
	| "device.revoke"
	| "recovery.initiate"
	| "recovery.complete"
	| "session.revoke"
	| "sharing.create"
	| "sharing.revoke"
	| "emergency.request"
	| "emergency.approve"
	| "emergency.deny";

interface AuditContext {
	userId: string;
	ip?: string;
	userAgent?: string;
	metadata?: Record<string, unknown>;
}

function classifyUserAgent(ua: string): string {
	return ua.includes("Mobile") ? "mobile-browser" : "desktop-browser";
}

export function audit(event: AuditEvent, context: AuditContext): void {
	auditLogger.info({
		event,
		userId: context.userId,
		ipHash: context.ip ? hashIp(context.ip) : undefined,
		userAgentClass: context.userAgent
			? classifyUserAgent(context.userAgent)
			: undefined,
		metadata: context.metadata,
		timestamp: new Date().toISOString(),
	});
}

export { auditLogger };
export type { AuditEvent, AuditContext };
