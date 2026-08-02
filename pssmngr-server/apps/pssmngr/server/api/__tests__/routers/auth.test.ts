// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Auth Router Unit Tests
 *
 * Tests authentication operations exposed through tRPC. Two-factor enrollment
 * and disablement use Better Auth directly with a derived client credential.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { authRouter } from "../../routers/auth";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockVerifyTOTP = vi.fn();

vi.mock("@pssmngr/server/lib/auth", () => ({
	auth: {
		api: {
			verifyTOTP: (...args: any[]) => mockVerifyTOTP(...args),
		},
	},
}));

const mockCheckRateLimit = vi
	.fn()
	.mockResolvedValue({ allowed: true, retryAfter: 0 });

vi.mock("@pssmngr/server/middleware/rate-limiter", () => ({
	AUTH_LIMITS: {
		getSalt: { keyPrefix: "rl:getSalt:", max: 10, windowSec: 60 },
		verifyTotp: { keyPrefix: "rl:verifyTotp:", max: 5, windowSec: 60 },
	},
	checkRateLimit: (...args: any[]) => mockCheckRateLimit(...args),
	getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
	getPlatformRateLimitConfig: (config: any) => config,
	setRateLimitHeaders: vi.fn(),
}));

vi.mock("@pssmngr/server/utils/redis", () => ({
	getRedisClient: vi.fn().mockReturnValue({}),
}));

// ---------------------------------------------------------------------------
// Mock DB helpers
// ---------------------------------------------------------------------------

function mockInsert(returning: any[] = [{}]) {
	return vi.fn().mockReturnValue({
		values: vi.fn().mockImplementation(() => {
			const p = Promise.resolve(undefined);
			(p as any).returning = vi.fn().mockResolvedValue(returning);
			return p;
		}),
	});
}

function mockDelete() {
	return vi.fn().mockReturnValue({
		where: vi.fn().mockResolvedValue(undefined),
	});
}

function mockSelect(results: any[] = []) {
	return vi.fn().mockReturnValue({
		from: vi.fn().mockReturnValue({
			where: vi.fn().mockResolvedValue(results),
		}),
	});
}

function makeVault(overrides: Record<string, any> = {}) {
	return {
		id: "vault-1",
		userId: "user-1",
		name: "Personal Vault",
		kdfSalt: "c2FsdHNhbHRzYWx0c2FsdA==",
		createdAt: new Date(),
		...overrides,
	};
}

function makeSession(overrides: Record<string, any> = {}) {
	return {
		id: "session-1",
		userId: "user-1",
		createdAt: new Date(),
		expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
		ipAddress: "127.0.0.1",
		userAgent: "Mozilla/5.0",
		...overrides,
	};
}

function createMockDb() {
	return {
		query: {
			user: { findFirst: vi.fn().mockResolvedValue(null) },
			vault: { findFirst: vi.fn().mockResolvedValue(null) },
			session: { findFirst: vi.fn().mockResolvedValue(null) },
		},
		insert: mockInsert([makeVault()]),
		select: mockSelect([]),
		delete: mockDelete(),
	};
}

function createCtx(userId: string, db: any, sessionId = "current-session") {
	return {
		session: { id: sessionId, activeOrganizationId: "org-1" },
		user: {
			id: userId,
			email: `${userId}@test.com`,
			name: userId,
			role: "member" as const,
			ownerId: "owner-1",
		},
		db,
		language: "en",
		t: ((key: string) => key) as any,
		req: {
			headers: { cookie: "session=abc123", "x-forwarded-for": "127.0.0.1" },
			socket: { remoteAddress: "127.0.0.1" },
		},
		res: { setHeader: vi.fn() },
	};
}

function createPublicCtx(db: any) {
	return {
		session: null,
		user: null,
		db,
		language: "en",
		t: ((key: string) => key) as any,
		req: {
			headers: { "x-forwarded-for": "127.0.0.1" },
			socket: { remoteAddress: "127.0.0.1" },
		},
		res: { setHeader: vi.fn() },
	};
}

function createCaller(ctx: any) {
	return authRouter.createCaller(ctx as any);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Auth Router", () => {
	let db: ReturnType<typeof createMockDb>;

	beforeEach(() => {
		vi.clearAllMocks();
		db = createMockDb();
		mockCheckRateLimit.mockResolvedValue({ allowed: true, retryAfter: 0 });
		process.env.ENCRYPTION_KEY = "test-only-encryption-key-for-hmac-salt";
	});

	// -----------------------------------------------------------------------
	// getSalt
	// -----------------------------------------------------------------------

	describe("getSalt", () => {
		it("returns real salt for existing user", async () => {
			db.query.user.findFirst.mockResolvedValue({ id: "user-1" });
			db.query.vault.findFirst.mockResolvedValue({
				kdfSalt: "real-salt-value-24chars!",
			});
			const caller = createCaller(createCtx("user-1", db));

			const result = await caller.getSalt({ email: "user@test.com" });

			expect(result.salt).toBe("real-salt-value-24chars!");
		});

		it("returns dummy salt for non-existent user (anti-enumeration)", async () => {
			db.query.user.findFirst.mockResolvedValue(null);
			const caller = createCaller(createCtx("user-1", db));

			const result = await caller.getSalt({ email: "nobody@test.com" });

			// Should return a salt (dummy) - not throw
			expect(result.salt).toBeTruthy();
			expect(typeof result.salt).toBe("string");
		});

		it("returns dummy salt when user has no vault", async () => {
			db.query.user.findFirst.mockResolvedValue({ id: "user-1" });
			db.query.vault.findFirst.mockResolvedValue(null);
			const caller = createCaller(createCtx("user-1", db));

			const result = await caller.getSalt({ email: "user@test.com" });

			expect(result.salt).toBeTruthy();
		});

		it("returns a non-null verification blob for non-existent users (anti-enumeration)", async () => {
			db.query.user.findFirst.mockResolvedValue(null);
			const caller = createCaller(createCtx("user-1", db));

			const result = await caller.getSalt({ email: "nobody@test.com" });

			// Previously this returned null, which let an attacker distinguish an
			// unknown email from a registered, fully set-up account (non-null blob).
			expect(result.encryptedVerificationBlob).toBeTruthy();
			expect(typeof result.encryptedVerificationBlob).toBe("string");
		});

		it("dummy blob is indistinguishable in shape from a real verification blob", async () => {
			// Real blob: base64 of [24-byte nonce][16-byte sentinel ct][16-byte tag] = 56 bytes.
			const realBlob = Buffer.alloc(56, 7).toString("base64");
			db.query.user.findFirst.mockResolvedValueOnce({ id: "user-1" });
			db.query.vault.findFirst.mockResolvedValueOnce({
				kdfSalt: "real-salt-value-24chars!",
				encryptedVerificationBlob: realBlob,
			});
			const real = await createCaller(createCtx("user-1", db)).getSalt({
				email: "user@test.com",
			});

			db.query.user.findFirst.mockResolvedValueOnce(null);
			const dummy = await createCaller(createCtx("user-1", db)).getSalt({
				email: "nobody@test.com",
			});

			expect(real.encryptedVerificationBlob).not.toBeNull();
			expect(dummy.encryptedVerificationBlob).not.toBeNull();
			// Same decoded byte length so a size side-channel cannot distinguish them.
			expect(
				Buffer.from(dummy.encryptedVerificationBlob as string, "base64").length,
			).toBe(
				Buffer.from(real.encryptedVerificationBlob as string, "base64").length,
			);
		});

		it("dummy blob is deterministic per email but differs across emails", async () => {
			db.query.user.findFirst.mockResolvedValue(null);
			const caller = createCaller(createCtx("user-1", db));

			const a1 = await caller.getSalt({ email: "a@test.com" });
			const a2 = await caller.getSalt({ email: "a@test.com" });
			const b = await caller.getSalt({ email: "b@test.com" });

			expect(a1.encryptedVerificationBlob).toBe(a2.encryptedVerificationBlob);
			expect(a1.encryptedVerificationBlob).not.toBe(
				b.encryptedVerificationBlob,
			);
		});

		it("keeps null blob for a registered user without a vault (onboarding path)", async () => {
			// Invited users have an account but no vault until onboarding; the
			// client relies on a null blob here to proceed to vault setup.
			db.query.user.findFirst.mockResolvedValue({ id: "user-1" });
			db.query.vault.findFirst.mockResolvedValue(null);
			const caller = createCaller(createCtx("user-1", db));

			const result = await caller.getSalt({ email: "user@test.com" });

			expect(result.encryptedVerificationBlob).toBeNull();
		});

		it("throws TOO_MANY_REQUESTS when rate limited", async () => {
			mockCheckRateLimit.mockResolvedValue({ allowed: false, retryAfter: 30 });
			const caller = createCaller(createCtx("user-1", db));

			await expect(caller.getSalt({ email: "user@test.com" })).rejects.toThrow(
				expect.objectContaining({ code: "TOO_MANY_REQUESTS" }),
			);
		});
	});

	// -----------------------------------------------------------------------
	// setupVault
	// -----------------------------------------------------------------------

	describe("setupVault", () => {
		it("creates vault with default name", async () => {
			db.query.vault.findFirst.mockResolvedValue(null); // no existing vault
			const created = makeVault({ name: "Personal Vault" });
			db.insert = mockInsert([created]);
			const caller = createCaller(createCtx("user-1", db));

			const result = await caller.setupVault({
				kdfSalt: "abcdefghijklmnopqrstuvwx",
			});

			expect(result!.name).toBe("Personal Vault");
		});

		it("creates vault with custom name", async () => {
			db.query.vault.findFirst.mockResolvedValue(null);
			const created = makeVault({ name: "Work Vault" });
			db.insert = mockInsert([created]);
			const caller = createCaller(createCtx("user-1", db));

			const result = await caller.setupVault({
				kdfSalt: "abcdefghijklmnopqrstuvwx",
				vaultName: "Work Vault",
			});

			expect(result!.name).toBe("Work Vault");
		});

		it("rejects duplicate vault", async () => {
			db.query.vault.findFirst.mockResolvedValue({ id: "existing-vault" });
			const caller = createCaller(createCtx("user-1", db));

			await expect(
				caller.setupVault({ kdfSalt: "abcdefghijklmnopqrstuvwx" }),
			).rejects.toThrow(
				expect.objectContaining({
					code: "CONFLICT",
					message: "errors:auth.vaultAlreadyExists",
				}),
			);
		});
	});

	// -----------------------------------------------------------------------
	// verifyTotp
	// -----------------------------------------------------------------------

	describe("verifyTotp", () => {
		it("verifies valid TOTP code", async () => {
			const verified = { verified: true };
			mockVerifyTOTP.mockResolvedValue(verified);
			const caller = createCaller(createCtx("user-1", db));

			const result = await caller.verifyTotp({ code: "123456" });

			expect(result).toEqual(verified);
		});

		it("wraps auth errors in BAD_REQUEST", async () => {
			mockVerifyTOTP.mockRejectedValue(new Error("Invalid code"));
			const caller = createCaller(createCtx("user-1", db));

			await expect(caller.verifyTotp({ code: "000000" })).rejects.toThrow(
				expect.objectContaining({ code: "BAD_REQUEST" }),
			);
		});

		it("enforces rate limiting", async () => {
			mockCheckRateLimit.mockResolvedValue({ allowed: false, retryAfter: 60 });
			const caller = createCaller(createCtx("user-1", db));

			await expect(caller.verifyTotp({ code: "123456" })).rejects.toThrow(
				expect.objectContaining({ code: "TOO_MANY_REQUESTS" }),
			);
		});
	});

	// -----------------------------------------------------------------------
	// listSessions
	// -----------------------------------------------------------------------

	describe("listSessions", () => {
		it("returns active sessions with isCurrent flag", async () => {
			const sessions = [
				makeSession({ id: "current-session" }),
				makeSession({ id: "other-session" }),
			];
			db.select = mockSelect(sessions);
			const caller = createCaller(createCtx("user-1", db, "current-session"));

			const result = await caller.listSessions();

			expect(result).toHaveLength(2);
			expect(
				result.find((s: any) => s.id === "current-session")?.isCurrent,
			).toBe(true);
			expect(result.find((s: any) => s.id === "other-session")?.isCurrent).toBe(
				false,
			);
		});

		it("returns empty when no active sessions", async () => {
			db.select = mockSelect([]);
			const caller = createCaller(createCtx("user-1", db));

			const result = await caller.listSessions();

			expect(result).toEqual([]);
		});
	});

	// -----------------------------------------------------------------------
	// revokeSession
	// -----------------------------------------------------------------------

	describe("revokeSession", () => {
		it("revokes non-current session", async () => {
			db.query.session.findFirst.mockResolvedValue(
				makeSession({ id: "other-session", userId: "user-1" }),
			);
			const caller = createCaller(createCtx("user-1", db, "current-session"));

			const result = await caller.revokeSession({ sessionId: "other-session" });

			expect(result.success).toBe(true);
			expect(db.delete).toHaveBeenCalled();
		});

		it("rejects revoking current session", async () => {
			const caller = createCaller(createCtx("user-1", db, "current-session"));

			await expect(
				caller.revokeSession({ sessionId: "current-session" }),
			).rejects.toThrow(
				expect.objectContaining({
					code: "BAD_REQUEST",
					message: "errors:auth.useLogout",
				}),
			);
		});

		it("rejects non-existent session", async () => {
			db.query.session.findFirst.mockResolvedValue(null);
			const caller = createCaller(createCtx("user-1", db, "current-session"));

			await expect(
				caller.revokeSession({ sessionId: "nonexistent" }),
			).rejects.toThrow(expect.objectContaining({ code: "NOT_FOUND" }));
		});
	});

	// -----------------------------------------------------------------------
	// revokeAllSessions
	// -----------------------------------------------------------------------

	describe("revokeAllSessions", () => {
		it("deletes all sessions except current", async () => {
			const caller = createCaller(createCtx("user-1", db, "current-session"));

			const result = await caller.revokeAllSessions();

			expect(result.success).toBe(true);
			expect(db.delete).toHaveBeenCalled();
		});
	});
});
