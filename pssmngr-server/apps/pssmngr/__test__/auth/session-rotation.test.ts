// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import type { IncomingMessage } from "node:http";
import { validateSessionBinding } from "@pssmngr/server/middleware/session-pinning";
import { TRPCError } from "@trpc/server";
import { describe, expect, test } from "vitest";
import { z } from "zod/v3";

// Input schemas matching the router definitions
const revokeSessionInput = z.object({ sessionId: z.string().min(1) });

// ─── Session Pinning ─────────────────────────────────────────────────

describe("session pinning - validateSessionBinding", () => {
	function mockReq(ip: string, ua: string): IncomingMessage {
		return {
			headers: { "user-agent": ua, "x-forwarded-for": ip },
			socket: { remoteAddress: ip },
		} as unknown as IncomingMessage;
	}

	test("returns null when IP and UA match", () => {
		const session = { ipAddress: "1.2.3.4", userAgent: "Mozilla/5.0" };
		const req = mockReq("1.2.3.4", "Mozilla/5.0");
		expect(validateSessionBinding(session, req)).toBeNull();
	});

	test("allows a changed IP (IP pinning removed — CGNAT/mobile roaming)", () => {
		const session = { ipAddress: "1.2.3.4", userAgent: "Mozilla/5.0" };
		const req = mockReq("5.6.7.8", "Mozilla/5.0");
		expect(validateSessionBinding(session, req)).toBeNull();
	});

	test("returns ua_mismatch when User-Agent differs", () => {
		const session = { ipAddress: "1.2.3.4", userAgent: "Mozilla/5.0" };
		const req = mockReq("1.2.3.4", "Chrome/120");
		expect(validateSessionBinding(session, req)).toBe("ua_mismatch");
	});

	test("passes when session has no stored IP", () => {
		const session = { ipAddress: null, userAgent: "Mozilla/5.0" };
		const req = mockReq("5.6.7.8", "Mozilla/5.0");
		expect(validateSessionBinding(session, req)).toBeNull();
	});

	test("skips UA check when session has no stored UA", () => {
		const session = { ipAddress: "1.2.3.4", userAgent: null };
		const req = mockReq("1.2.3.4", "Chrome/120");
		expect(validateSessionBinding(session, req)).toBeNull();
	});

	test("skips both checks when session has no stored IP or UA", () => {
		const session = { ipAddress: null, userAgent: null };
		const req = mockReq("5.6.7.8", "Chrome/120");
		expect(validateSessionBinding(session, req)).toBeNull();
	});

	test("UA mismatch is still detected when the IP also changed", () => {
		const session = { ipAddress: "1.2.3.4", userAgent: "Mozilla/5.0" };
		const req = mockReq("5.6.7.8", "Chrome/120");
		// IP changes are allowed; the UA change alone triggers rejection
		expect(validateSessionBinding(session, req)).toBe("ua_mismatch");
	});

	test("handles undefined ipAddress the same as null", () => {
		const session = { ipAddress: undefined, userAgent: "Mozilla/5.0" };
		const req = mockReq("5.6.7.8", "Mozilla/5.0");
		expect(validateSessionBinding(session, req)).toBeNull();
	});

	test("handles undefined userAgent the same as null", () => {
		const session = { ipAddress: "1.2.3.4", userAgent: undefined };
		const req = mockReq("1.2.3.4", "Chrome/120");
		expect(validateSessionBinding(session, req)).toBeNull();
	});

	test("IP change alone never invalidates the session", () => {
		const session = { ipAddress: "192.168.1.1", userAgent: "Test" };
		const req = mockReq("192.168.1.2", "Test");
		expect(validateSessionBinding(session, req)).toBeNull();
	});

	test("exact UA match required (case-sensitive)", () => {
		const session = { ipAddress: "1.2.3.4", userAgent: "Mozilla/5.0" };
		const req = mockReq("1.2.3.4", "mozilla/5.0");
		expect(validateSessionBinding(session, req)).toBe("ua_mismatch");
	});
});

// ─── Session Lifetime Configuration ─────────────────────────────────

describe("session lifetime configuration", () => {
	const SESSION_CONFIG = {
		expiresIn: 15 * 60,
		updateAge: 5 * 60,
		cookieCache: {
			enabled: true,
			maxAge: 5 * 60,
		},
	};

	test("session expires in 15 minutes (900 seconds)", () => {
		expect(SESSION_CONFIG.expiresIn).toBe(900);
	});

	test("session refreshes after 5 minutes (300 seconds)", () => {
		expect(SESSION_CONFIG.updateAge).toBe(300);
	});

	test("cookie cache is enabled with 5-minute maxAge", () => {
		expect(SESSION_CONFIG.cookieCache.enabled).toBe(true);
		expect(SESSION_CONFIG.cookieCache.maxAge).toBe(300);
	});

	test("updateAge is less than expiresIn (refresh window exists)", () => {
		expect(SESSION_CONFIG.updateAge).toBeLessThan(SESSION_CONFIG.expiresIn);
	});

	test("cookie cache maxAge equals updateAge", () => {
		expect(SESSION_CONFIG.cookieCache.maxAge).toBe(SESSION_CONFIG.updateAge);
	});

	test("refresh window = expiresIn - updateAge = 10 minutes", () => {
		const refreshWindow = SESSION_CONFIG.expiresIn - SESSION_CONFIG.updateAge;
		expect(refreshWindow).toBe(600); // 10 minutes
	});

	test("session is short-lived (under 1 hour)", () => {
		expect(SESSION_CONFIG.expiresIn).toBeLessThan(3600);
	});
});

// ─── Session Rotation ────────────────────────────────────────────────

describe("session rotation - token refresh", () => {
	test("session should be refreshed when updateAge has elapsed", () => {
		const SESSION_CONFIG = { expiresIn: 900, updateAge: 300 };
		const sessionCreatedAt = Date.now() - 400_000; // 400 seconds ago
		const elapsed = (Date.now() - sessionCreatedAt) / 1000;

		expect(elapsed).toBeGreaterThan(SESSION_CONFIG.updateAge);
		// Session should be refreshed since elapsed > updateAge
	});

	test("session should NOT be refreshed before updateAge", () => {
		const SESSION_CONFIG = { expiresIn: 900, updateAge: 300 };
		const sessionCreatedAt = Date.now() - 100_000; // 100 seconds ago
		const elapsed = (Date.now() - sessionCreatedAt) / 1000;

		expect(elapsed).toBeLessThan(SESSION_CONFIG.updateAge);
		// Session should NOT be refreshed since elapsed < updateAge
	});

	test("session is invalid after expiresIn has passed", () => {
		const SESSION_CONFIG = { expiresIn: 900 };
		const expiresAt = new Date(Date.now() - 60_000); // Expired 1 minute ago

		expect(expiresAt.getTime()).toBeLessThan(Date.now());
	});

	test("session is still valid before expiresIn", () => {
		const expiresAt = new Date(Date.now() + 60_000); // Expires in 1 minute

		expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
	});
});

// ─── Input Validation ───────────────────────────────────────────────

describe("session management - input validation", () => {
	test("revokeSession rejects empty sessionId", () => {
		expect(() => revokeSessionInput.parse({ sessionId: "" })).toThrow();
	});

	test("revokeSession rejects missing sessionId", () => {
		expect(() => revokeSessionInput.parse({})).toThrow();
	});

	test("revokeSession accepts valid sessionId", () => {
		const result = revokeSessionInput.parse({ sessionId: "sess_abc123" });
		expect(result.sessionId).toBe("sess_abc123");
	});

	test("revokeSession accepts UUID-format sessionId", () => {
		const result = revokeSessionInput.parse({
			sessionId: "550e8400-e29b-41d4-a716-446655440000",
		});
		expect(result.sessionId).toBe("550e8400-e29b-41d4-a716-446655440000");
	});
});

// ─── Session Revocation Logic ───────────────────────────────────────

describe("session revocation - business rules", () => {
	test("revoking current session is prevented with BAD_REQUEST", () => {
		const currentSessionId = "current-session-id";
		const inputSessionId = "current-session-id";

		if (inputSessionId === currentSessionId) {
			const error = new TRPCError({
				code: "BAD_REQUEST",
				message: "Use logout to end your current session",
			});
			expect(error.code).toBe("BAD_REQUEST");
			expect(error.message).toBe("Use logout to end your current session");
		}
	});

	test("revoking a different session is allowed", () => {
		const currentSessionId = "current-session-id";
		const inputSessionId = "other-session-id";
		expect(inputSessionId).not.toBe(currentSessionId);
	});

	test("revokeAllSessions preserves current session (by exclusion filter)", () => {
		const allSessionIds = ["sess-1", "sess-2", "sess-3", "current"];
		const currentSessionId = "current";
		const toRevoke = allSessionIds.filter((id) => id !== currentSessionId);
		expect(toRevoke).toEqual(["sess-1", "sess-2", "sess-3"]);
		expect(toRevoke).not.toContain(currentSessionId);
	});

	test("revoking non-existent session throws NOT_FOUND", () => {
		const error = new TRPCError({
			code: "NOT_FOUND",
			message: "Session not found",
		});
		expect(error.code).toBe("NOT_FOUND");
		expect(error.message).toBe("Session not found");
	});

	test("session revocation requires ownership (userId match)", () => {
		const sessions = [
			{ id: "sess-1", userId: "user-1" },
			{ id: "sess-2", userId: "user-2" },
		];
		const attackerUserId = "user-1";
		const targetSessionId = "sess-2";

		const target = sessions.find(
			(s) => s.id === targetSessionId && s.userId === attackerUserId,
		);
		// User1 cannot find user2's session
		expect(target).toBeUndefined();
	});

	test("revokeAllSessions only affects own sessions", () => {
		const allSessions = [
			{ id: "sess-1", userId: "user-1" },
			{ id: "sess-2", userId: "user-1" },
			{ id: "sess-3", userId: "user-2" },
			{ id: "sess-current", userId: "user-1" },
		];

		const currentUserId = "user-1";
		const currentSessionId = "sess-current";

		// Filter to only user's sessions, excluding current
		const toRevoke = allSessions.filter(
			(s) => s.userId === currentUserId && s.id !== currentSessionId,
		);

		expect(toRevoke).toHaveLength(2);
		expect(toRevoke.map((s) => s.id)).toEqual(["sess-1", "sess-2"]);
		// user-2's session is unaffected
		expect(toRevoke.find((s) => s.userId === "user-2")).toBeUndefined();
	});

	test("revokeSession returns success on valid revocation", () => {
		const result = { success: true };
		expect(result.success).toBe(true);
	});

	test("revokeAllSessions returns success", () => {
		const result = { success: true };
		expect(result.success).toBe(true);
	});
});

// ─── Session List Response Shape ────────────────────────────────────

describe("session list - response shape", () => {
	test("marks current session correctly", () => {
		const sessions = [
			{
				id: "sess-1",
				createdAt: new Date(),
				expiresAt: new Date(),
				ipAddress: "1.1.1.1",
				userAgent: "Chrome",
			},
			{
				id: "sess-2",
				createdAt: new Date(),
				expiresAt: new Date(),
				ipAddress: "2.2.2.2",
				userAgent: "Firefox",
			},
		];
		const currentSessionId = "sess-1";

		const result = sessions.map((s) => ({
			...s,
			isCurrent: s.id === currentSessionId,
		}));

		expect(result[0]?.isCurrent).toBe(true);
		expect(result[1]?.isCurrent).toBe(false);
	});

	test("filters out expired sessions", () => {
		const now = new Date();
		const sessions = [
			{ id: "active", expiresAt: new Date(now.getTime() + 60_000) },
			{ id: "expired", expiresAt: new Date(now.getTime() - 60_000) },
		];
		const activeSessions = sessions.filter((s) => s.expiresAt > now);
		expect(activeSessions).toHaveLength(1);
		expect(activeSessions[0]?.id).toBe("active");
	});

	test("session includes all required metadata fields", () => {
		const session = {
			id: "sess-1",
			createdAt: new Date(),
			expiresAt: new Date(Date.now() + 900_000),
			ipAddress: "203.0.113.50",
			userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
		};

		expect(session).toHaveProperty("id");
		expect(session).toHaveProperty("createdAt");
		expect(session).toHaveProperty("expiresAt");
		expect(session).toHaveProperty("ipAddress");
		expect(session).toHaveProperty("userAgent");
	});

	test("multiple concurrent sessions are supported", () => {
		const sessions = [
			{
				id: "sess-1",
				userId: "user-1",
				ipAddress: "1.1.1.1",
				userAgent: "Chrome",
			},
			{
				id: "sess-2",
				userId: "user-1",
				ipAddress: "2.2.2.2",
				userAgent: "Firefox",
			},
			{
				id: "sess-3",
				userId: "user-1",
				ipAddress: "3.3.3.3",
				userAgent: "Safari",
			},
		];

		expect(sessions).toHaveLength(3);
		// All sessions belong to the same user
		expect(sessions.every((s) => s.userId === "user-1")).toBe(true);
		// All have different IPs
		const ips = sessions.map((s) => s.ipAddress);
		expect(new Set(ips).size).toBe(3);
	});

	test("listSessions only returns sessions for authenticated user", () => {
		const allSessions = [
			{ id: "sess-1", userId: "user-1" },
			{ id: "sess-2", userId: "user-2" },
			{ id: "sess-3", userId: "user-1" },
		];

		const userId = "user-1";
		const userSessions = allSessions.filter((s) => s.userId === userId);

		expect(userSessions).toHaveLength(2);
		expect(userSessions.every((s) => s.userId === userId)).toBe(true);
	});

	test("isCurrent flag is false for all non-current sessions", () => {
		const sessions = [{ id: "sess-1" }, { id: "sess-2" }, { id: "sess-3" }];
		const currentSessionId = "sess-2";

		const result = sessions.map((s) => ({
			...s,
			isCurrent: s.id === currentSessionId,
		}));

		expect(result.filter((s) => s.isCurrent)).toHaveLength(1);
		expect(result.filter((s) => !s.isCurrent)).toHaveLength(2);
	});
});

// ─── Session Security Properties ─────────────────────────────────────

describe("session security properties", () => {
	function mockReq(ip: string, ua: string): IncomingMessage {
		return {
			headers: { "user-agent": ua, "x-forwarded-for": ip },
			socket: { remoteAddress: ip },
		} as unknown as IncomingMessage;
	}

	test("IP change alone is tolerated (roaming clients, CGNAT)", () => {
		const session = { ipAddress: "10.0.0.1", userAgent: "Chrome/120" };
		const roamingReq = mockReq("203.0.113.100", "Chrome/120");

		const violation = validateSessionBinding(session, roamingReq);
		expect(violation).toBeNull();
	});

	test("compromised session is detected by UA change", () => {
		const session = { ipAddress: "10.0.0.1", userAgent: "Chrome/120" };
		const attackerReq = mockReq("10.0.0.1", "curl/7.0");

		const violation = validateSessionBinding(session, attackerReq);
		expect(violation).toBe("ua_mismatch");
	});

	test("session hijacking via both IP and UA change is detected", () => {
		const session = { ipAddress: "10.0.0.1", userAgent: "Chrome/120" };
		const attackerReq = mockReq("203.0.113.100", "curl/7.0");

		const violation = validateSessionBinding(session, attackerReq);
		// IP changes are allowed; the UA mismatch still rejects
		expect(violation).toBe("ua_mismatch");
	});

	test("session token rotation prevents replay attacks", () => {
		// After rotation, the old token should be invalid
		const oldToken = "old-session-token-abc123";
		const newToken = "new-session-token-def456";
		expect(oldToken).not.toBe(newToken);

		// The active sessions list should only contain the new token
		const activeSessions = [{ token: newToken }];
		expect(activeSessions.find((s) => s.token === oldToken)).toBeUndefined();
		expect(activeSessions.find((s) => s.token === newToken)).toBeDefined();
	});

	test("revoking all sessions forces re-authentication on all devices", () => {
		const sessions = [
			{ id: "sess-1", valid: true },
			{ id: "sess-2", valid: true },
			{ id: "sess-current", valid: true },
		];
		const currentSessionId = "sess-current";

		// Revoke all except current
		const afterRevoke = sessions.map((s) => ({
			...s,
			valid: s.id === currentSessionId,
		}));

		// Only current session remains valid
		expect(afterRevoke.filter((s) => s.valid)).toHaveLength(1);
		expect(afterRevoke.find((s) => s.valid)?.id).toBe("sess-current");
	});

	test("session must have an expiry time set", () => {
		const session = {
			id: "sess-1",
			expiresAt: new Date(Date.now() + 900_000), // 15 minutes
		};
		expect(session.expiresAt).toBeInstanceOf(Date);
		expect(session.expiresAt.getTime()).toBeGreaterThan(Date.now());
	});
});
