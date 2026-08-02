// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Emergency Access Auto-Grant Job Tests
 *
 * Tests for the background job that auto-grants emergency access
 * after timer expiry. Verifies signature validation, escrow copying,
 * notification delivery, and error handling.
 */

// @ts-expect-error - vitest types not installed in this package
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks (hoisted so they're available before imports)
// ---------------------------------------------------------------------------

const {
	mockFindMany,
	mockFindFirst,
	mockUpdate,
	mockInsert,
	mockVerifyTimestamp,
} = vi.hoisted(() => {
	const mockSetWhere = vi.fn().mockResolvedValue(undefined);
	const mockSet = vi.fn().mockReturnValue({ where: mockSetWhere });

	return {
		mockFindMany: vi.fn().mockResolvedValue([]),
		mockFindFirst: vi.fn().mockResolvedValue(null),
		mockUpdate: vi.fn().mockReturnValue({ set: mockSet }),
		mockInsert: vi.fn().mockReturnValue({
			values: vi.fn().mockResolvedValue(undefined),
		}),
		mockVerifyTimestamp: vi.fn().mockReturnValue(true),
	};
});

vi.mock("../../../db", () => ({
	db: {
		query: {
			emergencyAccessRequest: { findMany: mockFindMany },
			trustedContact: { findFirst: mockFindFirst },
		},
		update: mockUpdate,
		insert: mockInsert,
	},
}));

vi.mock("../../../utils/emergency-timelock", () => ({
	verifyTimestamp: mockVerifyTimestamp,
}));

// Mock schema tables (drizzle references them by identity)
vi.mock("../../../db/schema", () => ({
	emergencyAccessRequest: Symbol("emergencyAccessRequest"),
	emergencyAuditLog: Symbol("emergencyAuditLog"),
	notifications: Symbol("notifications"),
	trustedContact: Symbol("trustedContact"),
}));

import { runAutoGrantCheck } from "../auto-grant";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeExpiredRequest(overrides: Record<string, unknown> = {}) {
	return {
		id: "req-1",
		trustedContactId: "tc-1",
		ownerId: "user-owner",
		contactId: "user-contact",
		status: "pending",
		waitingPeriodDays: 7,
		requestedAt: new Date("2026-01-01T00:00:00Z"),
		expiresAt: new Date("2026-01-08T00:00:00Z"), // already expired
		timestampSignature: "valid-sig",
		...overrides,
	};
}

function makeTrustedContactWithEscrow() {
	return {
		id: "tc-1",
		ownerId: "user-owner",
		contactId: "user-contact",
		escrowBlob: "enc-blob",
		escrowNonce: "enc-nonce",
		escrowAuthTag: "enc-tag",
		ephemeralPublicKey: "pub-key",
		escrowSignature: "sig",
	};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runAutoGrantCheck", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockVerifyTimestamp.mockReturnValue(true);
		mockFindMany.mockResolvedValue([]);
		mockFindFirst.mockResolvedValue(makeTrustedContactWithEscrow());

		// Reset chainable mocks
		const mockSetWhere = vi.fn().mockResolvedValue(undefined);
		const mockSet = vi.fn().mockReturnValue({ where: mockSetWhere });
		mockUpdate.mockReturnValue({ set: mockSet });
		mockInsert.mockReturnValue({
			values: vi.fn().mockResolvedValue(undefined),
		});
	});

	it("returns empty result when no pending expired requests", async () => {
		mockFindMany.mockResolvedValue([]);

		const result = await runAutoGrantCheck();

		expect(result.success).toBe(true);
		expect(result.requestsProcessed).toBe(0);
		expect(result.requestsGranted).toBe(0);
		expect(result.requestsSkipped).toBe(0);
		expect(result.errors).toEqual([]);
	});

	it("auto-grants expired request with valid signature", async () => {
		const req = makeExpiredRequest();
		mockFindMany.mockResolvedValue([req]);

		const result = await runAutoGrantCheck();

		expect(result.success).toBe(true);
		expect(result.requestsProcessed).toBe(1);
		expect(result.requestsGranted).toBe(1);
		expect(result.requestsSkipped).toBe(0);
		expect(mockVerifyTimestamp).toHaveBeenCalledWith(
			req.id,
			req.requestedAt,
			req.expiresAt,
			req.waitingPeriodDays,
			req.timestampSignature,
		);
		// Should update status to approved
		expect(mockUpdate).toHaveBeenCalled();
		// Should write audit log + notifications
		expect(mockInsert).toHaveBeenCalledTimes(2);
	});

	it("skips request with invalid signature and logs failure", async () => {
		mockVerifyTimestamp.mockReturnValue(false);
		const req = makeExpiredRequest();
		mockFindMany.mockResolvedValue([req]);

		const result = await runAutoGrantCheck();

		expect(result.requestsProcessed).toBe(1);
		expect(result.requestsGranted).toBe(0);
		expect(result.requestsSkipped).toBe(1);
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0].requestId).toBe("req-1");
		expect(result.errors[0].error).toContain("signature");
		// Should insert audit log for signature failure
		expect(mockInsert).toHaveBeenCalledTimes(1);
		// Should NOT update status
		expect(mockUpdate).not.toHaveBeenCalled();
	});

	it("copies escrow from trusted contact when available", async () => {
		const req = makeExpiredRequest();
		const tc = makeTrustedContactWithEscrow();
		mockFindMany.mockResolvedValue([req]);
		mockFindFirst.mockResolvedValue(tc);

		const mockSetWhere = vi.fn().mockResolvedValue(undefined);
		const mockSet = vi.fn().mockReturnValue({ where: mockSetWhere });
		mockUpdate.mockReturnValue({ set: mockSet });

		await runAutoGrantCheck();

		// Verify set was called with escrow data
		expect(mockSet).toHaveBeenCalledWith(
			expect.objectContaining({
				status: "approved",
				escrowBlob: "enc-blob",
				escrowNonce: "enc-nonce",
				escrowAuthTag: "enc-tag",
				ephemeralPublicKey: "pub-key",
				escrowSignature: "sig",
			}),
		);
	});

	it("leaves a request pending when the trusted contact has no escrow", async () => {
		const req = makeExpiredRequest();
		mockFindMany.mockResolvedValue([req]);
		mockFindFirst.mockResolvedValue({
			id: "tc-1",
			ownerId: "user-owner",
			contactId: "user-contact",
			escrowBlob: null,
		});

		const mockSetWhere = vi.fn().mockResolvedValue(undefined);
		const mockSet = vi.fn().mockReturnValue({ where: mockSetWhere });
		mockUpdate.mockReturnValue({ set: mockSet });

		const result = await runAutoGrantCheck();

		expect(result.requestsGranted).toBe(0);
		expect(result.requestsSkipped).toBe(1);
		expect(result.errors[0]?.error).toContain("escrow");
		expect(mockSet).not.toHaveBeenCalled();
	});

	it("leaves a request pending when the trusted contact is not found", async () => {
		const req = makeExpiredRequest();
		mockFindMany.mockResolvedValue([req]);
		mockFindFirst.mockResolvedValue(null);

		const result = await runAutoGrantCheck();

		expect(result.requestsGranted).toBe(0);
		expect(result.requestsSkipped).toBe(1);
		expect(mockUpdate).not.toHaveBeenCalled();
	});

	it("processes multiple expired requests", async () => {
		const req1 = makeExpiredRequest({ id: "req-1" });
		const req2 = makeExpiredRequest({
			id: "req-2",
			contactId: "user-contact-2",
		});
		mockFindMany.mockResolvedValue([req1, req2]);

		const result = await runAutoGrantCheck();

		expect(result.requestsProcessed).toBe(2);
		expect(result.requestsGranted).toBe(2);
	});

	it("handles per-request errors gracefully", async () => {
		const req1 = makeExpiredRequest({ id: "req-1" });
		const req2 = makeExpiredRequest({ id: "req-2" });
		mockFindMany.mockResolvedValue([req1, req2]);

		// First request causes an error, second succeeds
		let callCount = 0;
		mockUpdate.mockImplementation(() => {
			callCount++;
			if (callCount === 1) {
				throw new Error("DB write failed");
			}
			return {
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue(undefined),
				}),
			};
		});

		const result = await runAutoGrantCheck();

		expect(result.requestsProcessed).toBe(2);
		expect(result.requestsGranted).toBe(1);
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0].requestId).toBe("req-1");
		expect(result.errors[0].error).toBe("DB write failed");
		// success is true because at least one request was granted
		expect(result.success).toBe(true);
	});

	it("returns success=false when global error occurs", async () => {
		mockFindMany.mockRejectedValue(new Error("Connection refused"));

		const result = await runAutoGrantCheck();

		expect(result.success).toBe(false);
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0].requestId).toBe("global");
		expect(result.errors[0].error).toBe("Connection refused");
	});

	it("returns success=false when all requests fail", async () => {
		const req = makeExpiredRequest();
		mockFindMany.mockResolvedValue([req]);
		mockUpdate.mockImplementation(() => {
			throw new Error("DB error");
		});

		const result = await runAutoGrantCheck();

		expect(result.success).toBe(false);
		expect(result.requestsGranted).toBe(0);
	});

	it("writes audit log entry for each auto-granted request", async () => {
		const req = makeExpiredRequest();
		mockFindMany.mockResolvedValue([req]);

		await runAutoGrantCheck();

		// insert called for: audit log (request_auto_granted) + notifications
		expect(mockInsert).toHaveBeenCalledTimes(2);
	});

	it("notifies both owner and contact on auto-grant", async () => {
		const req = makeExpiredRequest();
		mockFindMany.mockResolvedValue([req]);

		const insertValues: unknown[] = [];
		mockInsert.mockReturnValue({
			values: vi.fn().mockImplementation((vals: unknown) => {
				insertValues.push(vals);
				return Promise.resolve(undefined);
			}),
		});

		await runAutoGrantCheck();

		// Second insert call should be notifications for both parties
		const notificationInsert = insertValues[1];
		expect(Array.isArray(notificationInsert)).toBe(true);
		expect((notificationInsert as any[]).length).toBe(2);
	});
});
