// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Security Requirements Test Suite (SEC-01 through SEC-24)
 *
 * Maps to: docs/security/requirements-checklist.md
 *
 * These are static analysis tests that run without a live server. They read
 * source files and configuration using `fs.readFileSync` and verify security
 * invariants via regex pattern matching.
 *
 * @security
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// ─── Path helpers ───────────────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, "../../../../..");
const SERVER_PKG = path.join(ROOT, "pssmngr-server/packages/server/src");
const ROUTERS_DIR = path.join(
	ROOT,
	"pssmngr-server/apps/pssmngr/server/api/routers",
);
const NGINX_CONF = path.join(ROOT, "docker/nginx/pssmngr.conf.example");
const MIDDLEWARE_DIR = path.join(SERVER_PKG, "middleware");
const LIB_DIR = path.join(SERVER_PKG, "lib");
const CI_WORKFLOWS = path.join(ROOT, ".github/workflows");

/**
 * Safely read a file and return its contents, or null if missing.
 */
function readFileSafe(filePath: string): string | null {
	try {
		return fs.readFileSync(filePath, "utf-8");
	} catch {
		return null;
	}
}

/**
 * Recursively collect all `.ts` files under a directory, excluding node_modules and dist.
 */
function collectTsFiles(dir: string): string[] {
	const results: string[] = [];
	if (!fs.existsSync(dir)) return results;

	const entries = fs.readdirSync(dir, { withFileTypes: true });
	for (const entry of entries) {
		const fullPath = path.join(dir, entry.name);
		if (entry.name === "node_modules" || entry.name === "dist") continue;
		if (entry.isDirectory()) {
			results.push(...collectTsFiles(fullPath));
		} else if (entry.isFile() && entry.name.endsWith(".ts")) {
			results.push(fullPath);
		}
	}
	return results;
}

/**
 * Collect all `.ts` files under the server source tree (packages/server/src).
 */
function collectServerSourceFiles(): string[] {
	return collectTsFiles(SERVER_PKG).filter(
		(f) =>
			!f.includes("__tests__") &&
			!f.includes(".test.") &&
			!f.includes(".spec."),
	);
}

// ─── SEC-04: Session Binding (Device fingerprint + IP/UA pinning) ───────────

describe("@security SEC-04: Session binding (UA pinning)", () => {
	const sessionPinningPath = path.join(MIDDLEWARE_DIR, "session-pinning.ts");

	it("session-pinning.ts file exists", () => {
		expect(
			fs.existsSync(sessionPinningPath),
			`Expected file at ${sessionPinningPath}`,
		).toBe(true);
	});

	it("does NOT pin sessions to an IP (removed 2026-07-07 — revoked CGNAT/mobile sessions)", () => {
		const content = readFileSafe(sessionPinningPath);
		expect(content).not.toBeNull();
		expect(content).not.toMatch(/"ip_mismatch"/);
	});

	it("checks userAgent for session validation", () => {
		const content = readFileSafe(sessionPinningPath);
		expect(content).not.toBeNull();
		expect(content).toMatch(/userAgent/);
		expect(content).toMatch(/ua.*mismatch|currentUa.*!==.*session/i);
	});

	it("returns a rejection reason on mismatch (not just boolean)", () => {
		const content = readFileSafe(sessionPinningPath);
		expect(content).not.toBeNull();
		// The function should return a descriptive string on mismatch
		expect(content).toMatch(/ua_mismatch/);
	});
});

// ─── SEC-05: Rate Limiting (brute force protection) ─────────────────────────

describe("@security SEC-05: Rate limiting for auth endpoints", () => {
	const rateLimiterPath = path.join(MIDDLEWARE_DIR, "rate-limiter.ts");

	it("rate-limiter.ts file exists", () => {
		expect(
			fs.existsSync(rateLimiterPath),
			`Expected file at ${rateLimiterPath}`,
		).toBe(true);
	});

	it("AUTH_LIMITS.login.maxAttempts is at most 5", () => {
		const content = readFileSafe(rateLimiterPath);
		expect(content).not.toBeNull();

		// Extract maxAttempts value for login
		const loginBlock = content!.match(
			/login\s*:\s*\{[^}]*maxAttempts\s*:\s*(\d+)/s,
		);
		expect(
			loginBlock,
			"AUTH_LIMITS.login block with maxAttempts not found",
		).not.toBeNull();

		const maxAttempts = Number.parseInt(loginBlock![1], 10);
		expect(maxAttempts).toBeLessThanOrEqual(5);
		expect(maxAttempts).toBeGreaterThan(0);
	});

	it("AUTH_LIMITS.login.windowMs is at most 15 minutes", () => {
		const content = readFileSafe(rateLimiterPath);
		expect(content).not.toBeNull();

		// Match the windowMs for login — could be literal or expression
		const windowMatch = content!.match(
			/login\s*:\s*\{[^}]*windowMs\s*:\s*([^,\n]+)/s,
		);
		expect(windowMatch, "AUTH_LIMITS.login.windowMs not found").not.toBeNull();

		const windowExpr = windowMatch![1].trim();
		// Evaluate simple arithmetic expressions like "15 * 60 * 1000"
		const windowMs = Function(`"use strict"; return (${windowExpr})`)();
		expect(windowMs).toBeLessThanOrEqual(15 * 60 * 1000);
		expect(windowMs).toBeGreaterThan(0);
	});

	it("has a blockDuration for login attempts", () => {
		const content = readFileSafe(rateLimiterPath);
		expect(content).not.toBeNull();

		const blockMatch = content!.match(
			/login\s*:\s*\{[^}]*blockDuration\s*:\s*(\d+)/s,
		);
		expect(
			blockMatch,
			"AUTH_LIMITS.login.blockDuration not found",
		).not.toBeNull();

		const blockDuration = Number.parseInt(blockMatch![1], 10);
		expect(blockDuration).toBeGreaterThan(0);
	});

	it("uses Redis for rate limit storage (sorted sets)", () => {
		const content = readFileSafe(rateLimiterPath);
		expect(content).not.toBeNull();
		// Should reference Redis operations for atomic counting
		expect(content).toMatch(/zremrangebyscore|zadd|zcard|pipeline/);
	});
});

// ─── SEC-10: CSP and Security Headers ───────────────────────────────────────

describe("@security SEC-10: Content Security Policy headers", () => {
	it("nginx.conf file exists", () => {
		expect(
			fs.existsSync(NGINX_CONF),
			`Expected nginx config at ${NGINX_CONF}`,
		).toBe(true);
	});

	const nginxContent = readFileSafe(NGINX_CONF) ?? "";

	it("CSP contains default-src 'self'", () => {
		expect(nginxContent).toMatch(/default-src\s+'self'/);
	});

	it("CSP contains frame-ancestors 'none'", () => {
		expect(nginxContent).toMatch(/frame-ancestors\s+'none'/);
	});

	it("CSP contains object-src 'none'", () => {
		expect(nginxContent).toMatch(/object-src\s+'none'/);
	});

	it("CSP contains base-uri 'self'", () => {
		expect(nginxContent).toMatch(/base-uri\s+'self'/);
	});

	it("CSP does not contain unsafe-eval (except wasm-unsafe-eval)", () => {
		// Extract the full CSP header value
		const cspMatch = nginxContent.match(/Content-Security-Policy\s+"([^"]+)"/);
		expect(cspMatch, "CSP header not found in nginx.conf").not.toBeNull();

		const cspValue = cspMatch![1];
		// Remove wasm-unsafe-eval before checking for unsafe-eval
		const cspWithoutWasm = cspValue.replace(/wasm-unsafe-eval/g, "");
		expect(cspWithoutWasm).not.toMatch(/unsafe-eval/);
	});

	it("CSP does not contain unsafe-inline in script-src", () => {
		const cspMatch = nginxContent.match(/Content-Security-Policy\s+"([^"]+)"/);
		expect(cspMatch).not.toBeNull();

		// Extract script-src directive
		const scriptSrc = cspMatch![1].match(/script-src\s+([^;]+)/);
		if (scriptSrc) {
			expect(scriptSrc[1]).not.toMatch(/'unsafe-inline'/);
		}
	});
});

// ─── Security Headers (comprehensive) ──────────────────────────────────────

describe("@security SEC-10 (extended): All required security headers in nginx", () => {
	const nginxContent = readFileSafe(NGINX_CONF) ?? "";

	const requiredHeaders: Array<{ name: string; pattern: RegExp }> = [
		{
			name: "Content-Security-Policy",
			pattern: /add_header\s+Content-Security-Policy\s+"/,
		},
		{
			name: "Strict-Transport-Security (HSTS)",
			pattern: /add_header\s+Strict-Transport-Security\s+"/,
		},
		{
			name: "Cross-Origin-Opener-Policy (COOP)",
			pattern: /add_header\s+Cross-Origin-Opener-Policy\s+"/,
		},
		{
			name: "Cross-Origin-Resource-Policy (CORP)",
			pattern: /add_header\s+Cross-Origin-Resource-Policy\s+"/,
		},
		{
			name: "X-Frame-Options",
			pattern: /add_header\s+X-Frame-Options\s+"/,
		},
		{
			name: "X-Content-Type-Options",
			pattern: /add_header\s+X-Content-Type-Options\s+"/,
		},
		{
			name: "Referrer-Policy",
			pattern: /add_header\s+Referrer-Policy\s+"/,
		},
		{
			name: "Permissions-Policy",
			pattern: /add_header\s+Permissions-Policy\s+"/,
		},
	];

	for (const header of requiredHeaders) {
		it(`contains ${header.name} header`, () => {
			expect(
				header.pattern.test(nginxContent),
				`Missing ${header.name} in nginx.conf`,
			).toBe(true);
		});
	}

	it("HSTS max-age is at least 1 year (31536000)", () => {
		const hstsMatch = nginxContent.match(/max-age=(\d+)/);
		expect(hstsMatch, "HSTS max-age not found").not.toBeNull();
		expect(Number.parseInt(hstsMatch![1], 10)).toBeGreaterThanOrEqual(31536000);
	});

	it("X-Frame-Options is DENY", () => {
		expect(nginxContent).toMatch(/X-Frame-Options\s+"DENY"/);
	});

	it("X-Content-Type-Options is nosniff", () => {
		expect(nginxContent).toMatch(/X-Content-Type-Options\s+"nosniff"/);
	});
});

// ─── SEC-11: CSRF Protection (SameSite cookies) ────────────────────────────

describe("@security SEC-11: CSRF protection via SameSite cookies", () => {
	it("better-auth or server code configures SameSite on cookies", () => {
		// better-auth defaults to SameSite=Lax when not explicitly set.
		// We verify that the auth config exists and uses better-auth which
		// provides SameSite cookies by default.
		const authPath = path.join(LIB_DIR, "auth.ts");
		const content = readFileSafe(authPath);
		expect(content, "auth.ts not found").not.toBeNull();

		// Verify better-auth is imported and used (provides SameSite=Lax default)
		expect(content).toMatch(/betterAuth|better-auth/);

		// If explicit sameSite config exists, it must be Strict or Lax
		const sameSiteMatch = content!.match(/sameSite\s*:\s*["'](\w+)["']/i);
		if (sameSiteMatch) {
			const value = sameSiteMatch[1].toLowerCase();
			expect(
				["strict", "lax"].includes(value),
				`SameSite must be Strict or Lax, got: ${value}`,
			).toBe(true);
		}
		// If no explicit sameSite, better-auth defaults to Lax which is acceptable
	});
});

// ─── SEC-17: Webhook signature verification ─────────────────────────────────

describe("@security SEC-18: TOTP seeds must never be logged", () => {
	it("no console.log/debug/info/warn of seed/totp/otp in server source", () => {
		const serverFiles = collectServerSourceFiles();
		const violations: string[] = [];

		// Pattern: console.(log|debug|info|warn) with seed/totp/otp nearby
		const dangerousPattern =
			/console\.(log|debug|info|warn)\s*\([^)]*\b(seed|totp|otp|totpSecret|otpSecret)\b/gi;

		for (const file of serverFiles) {
			const content = readFileSafe(file);
			if (!content) continue;

			const lines = content.split("\n");
			for (let i = 0; i < lines.length; i++) {
				if (dangerousPattern.test(lines[i])) {
					const relPath = path.relative(ROOT, file);
					violations.push(`${relPath}:${i + 1}: ${lines[i].trim()}`);
				}
				// Reset regex lastIndex for global patterns
				dangerousPattern.lastIndex = 0;
			}
		}

		expect(
			violations,
			`Found TOTP/seed logging in server code:\n${violations.join("\n")}`,
		).toHaveLength(0);
	});

	it("no logger.info/debug/warn/error of seed/totp/otp in server source", () => {
		const serverFiles = collectServerSourceFiles();
		const violations: string[] = [];

		const dangerousPattern =
			/logger\.(info|debug|warn|error|trace|fatal)\s*\([^)]*\b(seed|totpSecret|otpSecret)\b/gi;

		for (const file of serverFiles) {
			const content = readFileSafe(file);
			if (!content) continue;

			const lines = content.split("\n");
			for (let i = 0; i < lines.length; i++) {
				if (dangerousPattern.test(lines[i])) {
					const relPath = path.relative(ROOT, file);
					violations.push(`${relPath}:${i + 1}: ${lines[i].trim()}`);
				}
				dangerousPattern.lastIndex = 0;
			}
		}

		expect(
			violations,
			`Found TOTP/seed logging via logger in server code:\n${violations.join("\n")}`,
		).toHaveLength(0);
	});
});

// ─── SEC-19: Timing-safe comparisons ────────────────────────────────────────

describe("@security SEC-19: Timing-safe comparison for auth tokens", () => {
	it("timingSafeEqual is used somewhere in the server codebase", () => {
		const serverFiles = collectServerSourceFiles();
		let found = false;

		for (const file of serverFiles) {
			const content = readFileSafe(file);
			if (!content) continue;

			if (/timingSafeEqual/.test(content)) {
				found = true;
				break;
			}
		}

		expect(
			found,
			"No usage of timingSafeEqual found in server source — auth tokens may be vulnerable to timing attacks",
		).toBe(true);
	});

	it("timingSafeEqual import comes from node:crypto", () => {
		const serverFiles = collectServerSourceFiles();
		let foundCorrectImport = false;

		for (const file of serverFiles) {
			const content = readFileSafe(file);
			if (!content) continue;

			if (
				/import\s*\{[^}]*timingSafeEqual[^}]*\}\s*from\s*["'](?:node:)?crypto["']/.test(
					content,
				)
			) {
				foundCorrectImport = true;
				break;
			}
		}

		expect(
			foundCorrectImport,
			"timingSafeEqual should be imported from 'node:crypto' or 'crypto'",
		).toBe(true);
	});
});

// ─── SEC-22: Supply chain security ──────────────────────────────────────────

describe("@security SEC-22: Supply chain integrity", () => {
	it("client pnpm-lock.yaml exists (pinned dependencies)", () => {
		const lockfilePath = path.join(ROOT, "client/pnpm-lock.yaml");
		expect(
			fs.existsSync(lockfilePath),
			"client/pnpm-lock.yaml not found — dependencies are not pinned",
		).toBe(true);
	});

	it("server pnpm-lock.yaml exists (pinned dependencies)", () => {
		const lockfilePath = path.join(ROOT, "pssmngr-server/pnpm-lock.yaml");
		expect(
			fs.existsSync(lockfilePath),
			"pssmngr-server/pnpm-lock.yaml not found — dependencies are not pinned",
		).toBe(true);
	});

	it("CI workflow includes npm audit step", () => {
		const securityScanPath = path.join(CI_WORKFLOWS, "security-scan.yml");
		const content = readFileSafe(securityScanPath);
		expect(content, "security-scan.yml workflow not found").not.toBeNull();
		expect(content).toMatch(/npm audit|pnpm audit/);
	});

	it("CI audit uses --audit-level=high or stricter", () => {
		const securityScanPath = path.join(CI_WORKFLOWS, "security-scan.yml");
		const content = readFileSafe(securityScanPath);
		expect(content).not.toBeNull();

		const hasHighLevel = /audit.*--audit-level=(high|critical)/.test(content!);
		expect(
			hasHighLevel,
			"CI audit should use --audit-level=high or --audit-level=critical",
		).toBe(true);
	});
});

// ─── SEC-24: Zero-knowledge enforcement ─────────────────────────────────────

describe("@security SEC-24: Zero-knowledge — server never returns plaintext vault data", () => {
	it("no server route returns plaintext vault fields", () => {
		const serverFiles = collectServerSourceFiles();
		const violations: string[] = [];

		// Patterns that would indicate plaintext vault data being returned
		const dangerousPatterns = [
			/\.plaintextPassword\b/,
			/\.decryptedData\b/,
			/\.plaintext\b.*return/,
			/return\s*\{[^}]*plaintext/,
			/res\.json\(\s*\{[^}]*plaintext/,
		];

		for (const file of serverFiles) {
			const content = readFileSafe(file);
			if (!content) continue;

			for (const pattern of dangerousPatterns) {
				if (pattern.test(content)) {
					const relPath = path.relative(ROOT, file);
					violations.push(
						`${relPath}: matches dangerous pattern ${pattern.source}`,
					);
				}
			}
		}

		expect(
			violations,
			`Server code appears to return plaintext vault data:\n${violations.join("\n")}`,
		).toHaveLength(0);
	});

	it("vault router only returns encrypted fields (ciphertext, iv, salt, authTag)", () => {
		const vaultRouterPath = path.join(ROUTERS_DIR, "vault.ts");
		const content = readFileSafe(vaultRouterPath);

		if (content) {
			// Should not have any decryption happening in the router
			expect(content).not.toMatch(
				/decrypt\s*\(|\.decrypt\b|decryptVault|decryptItem/,
			);
		}
	});

	it("credentials router does not decrypt on server side", () => {
		const credentialsRouterPath = path.join(ROUTERS_DIR, "credentials.ts");
		const content = readFileSafe(credentialsRouterPath);

		if (content) {
			expect(content).not.toMatch(/decrypt\s*\(|\.decrypt\b|decryptCredential/);
		}
	});
});

// ─── Zod .strict() audit (informational) ───────────────────────────────────

describe("@security Zod .strict() audit on router input schemas", () => {
	it("reports router input schemas missing .strict() (informational)", () => {
		if (!fs.existsSync(ROUTERS_DIR)) {
			console.warn(`Routers directory not found at ${ROUTERS_DIR}`);
			return;
		}

		const routerFiles = fs
			.readdirSync(ROUTERS_DIR)
			.filter((f: string) => f.endsWith(".ts") && !f.startsWith("__"))
			.map((f: string) => path.join(ROUTERS_DIR, f));

		const schemasWithoutStrict: string[] = [];
		let totalSchemas = 0;

		for (const file of routerFiles) {
			const content = readFileSafe(file);
			if (!content) continue;

			const fileName = path.basename(file);

			// Find all .input(z.object( patterns
			// We look for lines with .input( that contain z.object(
			const lines = content.split("\n");
			for (let i = 0; i < lines.length; i++) {
				const line = lines[i];
				if (/\.input\s*\(\s*z\.object\s*\(/.test(line)) {
					totalSchemas++;

					// Check if .strict() appears in a reasonable range after z.object(
					// Look ahead up to 50 lines for the closing of the schema chain
					const lookAhead = lines.slice(i, i + 50).join("\n");

					// Find the schema block: from z.object( to the next ) that closes .input(
					// A simplified heuristic: check if .strict() appears before the next
					// procedure definition (.query(, .mutation(, .subscription()
					const nextProcedure = lookAhead.match(
						/\.(query|mutation|subscription)\s*\(/,
					);
					const blockEnd = nextProcedure?.index ?? lookAhead.length;
					const schemaBlock = lookAhead.substring(0, blockEnd);

					if (!schemaBlock.includes(".strict()")) {
						schemasWithoutStrict.push(`${fileName}:${i + 1}`);
					}
				}
			}
		}

		// This is informational — log but don't fail
		if (schemasWithoutStrict.length > 0) {
			console.warn(
				`\n[SEC-INFO] ${schemasWithoutStrict.length}/${totalSchemas} router input schemas missing .strict():\n` +
					schemasWithoutStrict.map((s) => `  - ${s}`).join("\n"),
			);
		}

		// Soft assertion: at least some schemas should exist
		expect(
			totalSchemas,
			"No z.object() input schemas found in routers — check path",
		).toBeGreaterThan(0);
	});
});

// ─── Logger redaction paths ─────────────────────────────────────────────────

describe("@security Logger redaction: sensitive fields must be redacted", () => {
	const loggerPath = path.join(LIB_DIR, "logger.ts");

	it("logger.ts file exists", () => {
		expect(fs.existsSync(loggerPath), `Expected logger at ${loggerPath}`).toBe(
			true,
		);
	});

	const requiredRedactPaths = [
		"masterPassword",
		"password",
		"privateKey",
		"secretKey",
		"token",
		"sessionToken",
		"authorization",
		"cookie",
		"apiKey",
	];

	const loggerContent = readFileSafe(loggerPath) ?? "";

	for (const field of requiredRedactPaths) {
		it(`redact paths include "${field}"`, () => {
			// Check the redact configuration contains this field name
			// It may be a direct path or a wildcard path like "*.password"
			const hasField =
				loggerContent.includes(`"${field}"`) ||
				loggerContent.includes(`'${field}'`) ||
				loggerContent.includes(`"*.${field}"`) ||
				loggerContent.includes(`'*.${field}'`);

			expect(
				hasField,
				`Logger redact paths must include "${field}" to prevent sensitive data leaking to logs`,
			).toBe(true);
		});
	}

	it("uses a censor replacement (not removal) for redacted fields", () => {
		// Verify redacted values are replaced with a placeholder, not silently removed
		expect(loggerContent).toMatch(/censor\s*:\s*["']\[REDACTED\]["']/);
	});

	it("redacts authorization header from request objects", () => {
		expect(
			loggerContent.includes("req.headers.authorization") ||
				loggerContent.includes('"authorization"') ||
				loggerContent.includes("'authorization'"),
			"Logger must redact authorization headers from request objects",
		).toBe(true);
	});

	it("redacts cookies from request and response objects", () => {
		const hasCookieRedaction =
			loggerContent.includes("req.headers.cookie") ||
			loggerContent.includes("set-cookie") ||
			(loggerContent.includes('"cookie"') &&
				loggerContent.includes('"cookies"'));

		expect(
			hasCookieRedaction,
			"Logger must redact cookies from request/response objects",
		).toBe(true);
	});
});

// ─── SEC-10 + SEC-11 combined: Nginx hardens against common attacks ────────

describe("@security SEC-10/SEC-11: Nginx rate limiting for auth endpoints", () => {
	const nginxContent = readFileSafe(NGINX_CONF) ?? "";

	it("has a dedicated rate limit zone for auth endpoints", () => {
		expect(nginxContent).toMatch(/limit_req_zone.*auth/);
	});

	it("auth rate limit is stricter than general API rate limit", () => {
		const authRate = nginxContent.match(
			/zone=pssmngr_auth:\S+\s+rate=(\d+)r\/s/,
		);
		const apiRate = nginxContent.match(/zone=pssmngr_api:\S+\s+rate=(\d+)r\/s/);

		expect(authRate, "Auth rate limit zone not found").not.toBeNull();
		expect(apiRate, "API rate limit zone not found").not.toBeNull();

		const authRps = Number.parseInt(authRate![1], 10);
		const apiRps = Number.parseInt(apiRate![1], 10);

		expect(
			authRps,
			`Auth rate limit (${authRps}r/s) should be stricter than API limit (${apiRps}r/s)`,
		).toBeLessThan(apiRps);
	});

	it("auth endpoints have limit_req applied", () => {
		// The auth location block should reference the auth rate limit zone
		expect(nginxContent).toMatch(
			/location.*auth[\s\S]*?limit_req\s+zone=pssmngr_auth/,
		);
	});
});

// ─── SEC-04 (extended): Session configuration ──────────────────────────────

describe("@security SEC-04 (extended): Session TTL and rotation", () => {
	const authPath = path.join(LIB_DIR, "auth.ts");
	const authContent = readFileSafe(authPath) ?? "";

	it("session has an explicit expiresIn configuration", () => {
		expect(authContent).toMatch(/expiresIn\s*:/);
	});

	it("session has an updateAge for rotation", () => {
		expect(authContent).toMatch(/updateAge\s*:/);
	});

	it("session pinning is imported and used in auth flow", () => {
		expect(authContent).toMatch(/validateSessionBinding/);
	});
});

// ─── SEC-22 (extended): CI security workflows ──────────────────────────────

describe("@security SEC-22 (extended): CI security pipeline coverage", () => {
	it("security-scan.yml workflow exists", () => {
		const workflowPath = path.join(CI_WORKFLOWS, "security-scan.yml");
		expect(
			fs.existsSync(workflowPath),
			"Missing .github/workflows/security-scan.yml",
		).toBe(true);
	});

	it("security scan runs on PRs to main", () => {
		const workflowPath = path.join(CI_WORKFLOWS, "security-scan.yml");
		const content = readFileSafe(workflowPath);
		expect(content).not.toBeNull();
		expect(content).toMatch(/pull_request/);
		expect(content).toMatch(/main/);
	});

	it("security workflow includes committed-secret detection", () => {
		const workflowPath = path.join(CI_WORKFLOWS, "security-scan.yml");
		const content = readFileSafe(workflowPath);
		expect(content, "security-scan.yml workflow not found").not.toBeNull();
		expect(content).toMatch(/gitleaks/i);
	});
});

// ─── SEC-18 (extended): No sensitive data in console across all server ─────

describe("@security SEC-18 (extended): No sensitive material logged via console", () => {
	it("no console.log of passwords, keys, or tokens in server source", () => {
		const serverFiles = collectServerSourceFiles();
		const violations: string[] = [];

		const sensitiveTerms =
			/\b(masterPassword|privateKey|secretKey|encryptionKey|derivedKey|vaultKey|sessionToken|refreshToken|accessToken)\b/;

		for (const file of serverFiles) {
			const content = readFileSafe(file);
			if (!content) continue;

			const lines = content.split("\n");
			for (let i = 0; i < lines.length; i++) {
				const line = lines[i];
				// Check for console.log/debug/info/warn that references sensitive terms
				if (
					/console\.(log|debug|info|warn)\s*\(/.test(line) &&
					sensitiveTerms.test(line)
				) {
					const relPath = path.relative(ROOT, file);
					violations.push(`${relPath}:${i + 1}: ${line.trim()}`);
				}
			}
		}

		expect(
			violations,
			`Found console logging of sensitive material:\n${violations.join("\n")}`,
		).toHaveLength(0);
	});
});

// ─── Cross-cutting: no plaintext secrets in source ──────────────────────────

describe("@security Cross-cutting: no hardcoded secrets in server source", () => {
	it("no hardcoded JWT secrets in source files", () => {
		const serverFiles = collectServerSourceFiles();
		const violations: string[] = [];

		for (const file of serverFiles) {
			const content = readFileSafe(file);
			if (!content) continue;

			const lines = content.split("\n");
			for (let i = 0; i < lines.length; i++) {
				const line = lines[i];
				// Look for patterns like: secret = "some-hardcoded-value"
				// but exclude env references and type annotations
				if (
					/(?:jwt|session|encryption).*(?:secret|key)\s*[:=]\s*["'][^"']+["']/i.test(
						line,
					) &&
					!/process\.env|import|type |interface |\/\/|\/\*|\*\/|\.d\.ts/.test(
						line,
					)
				) {
					const relPath = path.relative(ROOT, file);
					violations.push(`${relPath}:${i + 1}: ${line.trim()}`);
				}
			}
		}

		expect(
			violations,
			`Found potential hardcoded secrets:\n${violations.join("\n")}`,
		).toHaveLength(0);
	});
});
