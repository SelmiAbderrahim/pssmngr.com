// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Passkeys Router Unit Tests
 *
 * Tests WebAuthn passkey registration, listing, and deletion. Passkey sign-in
 * is handled by Better Auth's authentication endpoint, not this tRPC router.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { passkeysRouter } from "../../routers/passkeys";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGenerateRegistrationOptions = vi.fn();
const mockVerifyRegistration = vi.fn();

vi.mock("@pssmngr/server/lib/auth", () => ({
	auth: {
		api: {
			generatePasskeyRegistrationOptions: (...args: any[]) =>
				mockGenerateRegistrationOptions(...args),
			verifyPasskeyRegistration: (...args: any[]) =>
				mockVerifyRegistration(...args),
		},
	},
}));

// ---------------------------------------------------------------------------
// Mock DB helpers
// ---------------------------------------------------------------------------

function mockDelete() {
	return vi.fn().mockReturnValue({
		where: vi.fn().mockResolvedValue(undefined),
	});
}

function makePasskey(overrides: Record<string, any> = {}) {
	return {
		id: "pk-1",
		userId: "user-1",
		name: "My Passkey",
		credentialID: "cred-id-1",
		deviceType: "platform",
		backedUp: true,
		transports: "internal",
		createdAt: new Date(),
		...overrides,
	};
}

function createMockDb() {
	return {
		query: {
			passkey: {
				findFirst: vi.fn().mockResolvedValue(null),
				findMany: vi.fn().mockResolvedValue([]),
			},
		},
		delete: mockDelete(),
	};
}

function createCtx(userId: string, db: any) {
	return {
		session: { id: `session-${userId}`, activeOrganizationId: "org-1" },
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
		req: { headers: { cookie: "session=abc123" } },
		res: { setHeader: () => {} },
	};
}

function createCaller(ctx: any) {
	return passkeysRouter.createCaller(ctx as any);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Passkeys Router", () => {
	let db: ReturnType<typeof createMockDb>;

	beforeEach(() => {
		vi.clearAllMocks();
		db = createMockDb();
	});

	// -----------------------------------------------------------------------
	// beginRegistration
	// -----------------------------------------------------------------------

	describe("beginRegistration", () => {
		it("returns registration options from auth.api", async () => {
			const options = { challenge: "abc", rp: { name: "PM" } };
			mockGenerateRegistrationOptions.mockResolvedValue(options);
			const caller = createCaller(createCtx("user-1", db));

			const result = await caller.beginRegistration();

			expect(result).toEqual(options);
			expect(mockGenerateRegistrationOptions).toHaveBeenCalled();
		});

		it("wraps errors in INTERNAL_SERVER_ERROR", async () => {
			mockGenerateRegistrationOptions.mockRejectedValue(
				new Error("WebAuthn not supported"),
			);
			const caller = createCaller(createCtx("user-1", db));

			await expect(caller.beginRegistration()).rejects.toThrow(
				expect.objectContaining({
					code: "INTERNAL_SERVER_ERROR",
					message: "errors:passkey.registrationOptionsFailed",
				}),
			);
		});
	});

	// -----------------------------------------------------------------------
	// finishRegistration
	// -----------------------------------------------------------------------

	describe("finishRegistration", () => {
		it("verifies credential and stores passkey", async () => {
			const result = { verified: true, registrationInfo: {} };
			mockVerifyRegistration.mockResolvedValue(result);
			const caller = createCaller(createCtx("user-1", db));

			const response = await caller.finishRegistration({
				credential: { id: "cred-1", rawId: "raw" },
				name: "My Key",
			});

			expect(response).toEqual(result);
			expect(mockVerifyRegistration).toHaveBeenCalledWith(
				expect.objectContaining({
					body: { response: { id: "cred-1", rawId: "raw" }, name: "My Key" },
				}),
			);
		});

		it("wraps errors in BAD_REQUEST", async () => {
			mockVerifyRegistration.mockRejectedValue(
				new Error("Invalid attestation"),
			);
			const caller = createCaller(createCtx("user-1", db));

			await expect(
				caller.finishRegistration({ credential: {} }),
			).rejects.toThrow(
				expect.objectContaining({
					code: "BAD_REQUEST",
					message: "errors:passkey.verificationFailed",
				}),
			);
		});
	});

	// -----------------------------------------------------------------------
	// list
	// -----------------------------------------------------------------------

	describe("list", () => {
		it("returns passkeys with safe fields only", async () => {
			const passkeys = [
				makePasskey({ id: "pk-1", name: "Key 1" }),
				makePasskey({ id: "pk-2", name: "Key 2" }),
			];
			db.query.passkey.findMany.mockResolvedValue(passkeys);
			const caller = createCaller(createCtx("user-1", db));

			const result = await caller.list();

			expect(result).toHaveLength(2);
			expect(result[0]!.id).toBe("pk-1");
			expect(result[0]!.credentialID).toBe("cred-id-1");
		});

		it("returns empty array when no passkeys", async () => {
			db.query.passkey.findMany.mockResolvedValue([]);
			const caller = createCaller(createCtx("user-1", db));

			const result = await caller.list();

			expect(result).toEqual([]);
		});
	});

	// -----------------------------------------------------------------------
	// delete
	// -----------------------------------------------------------------------

	describe("delete", () => {
		it("deletes passkey for owner", async () => {
			db.query.passkey.findFirst.mockResolvedValue(
				makePasskey({ id: "pk-1", userId: "user-1" }),
			);
			const caller = createCaller(createCtx("user-1", db));

			const result = await caller.delete({ passkeyId: "pk-1" });

			expect(result.success).toBe(true);
			expect(db.delete).toHaveBeenCalled();
		});

		it("throws NOT_FOUND for non-owner passkey", async () => {
			db.query.passkey.findFirst.mockResolvedValue(null);
			const caller = createCaller(createCtx("user-2", db));

			await expect(caller.delete({ passkeyId: "pk-1" })).rejects.toThrow(
				expect.objectContaining({ code: "NOT_FOUND" }),
			);
		});

		it("throws NOT_FOUND for nonexistent passkey", async () => {
			db.query.passkey.findFirst.mockResolvedValue(null);
			const caller = createCaller(createCtx("user-1", db));

			await expect(caller.delete({ passkeyId: "nonexistent" })).rejects.toThrow(
				expect.objectContaining({ code: "NOT_FOUND" }),
			);
		});
	});
});
