// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Emergency Time-Lock Signing Utility Tests
 *
 * Tests HMAC-SHA256 signing and verification of timestamps
 * for tamper-proof emergency access time-locks.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	DENIAL_COOLDOWN_MS,
	signTimestamp,
	verifyTimestamp,
} from "../emergency-timelock";

describe("emergency-timelock", () => {
	const originalEnv = process.env.ENCRYPTION_KEY;

	beforeAll(() => {
		process.env.ENCRYPTION_KEY = "test-only-encryption-key-32-chars";
	});

	afterAll(() => {
		if (originalEnv !== undefined) {
			process.env.ENCRYPTION_KEY = originalEnv;
		} else {
			delete process.env.ENCRYPTION_KEY;
		}
	});

	describe("signTimestamp", () => {
		it("produces a hex signature string", () => {
			const sig = signTimestamp(
				"req-1",
				new Date("2026-01-01T00:00:00Z"),
				new Date("2026-01-08T00:00:00Z"),
				7,
			);

			expect(typeof sig).toBe("string");
			expect(sig).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex = 64 chars
		});

		it("produces deterministic output for same inputs", () => {
			const args = [
				"req-1",
				new Date("2026-01-01T00:00:00Z"),
				new Date("2026-01-08T00:00:00Z"),
				7,
			] as const;

			const sig1 = signTimestamp(...args);
			const sig2 = signTimestamp(...args);

			expect(sig1).toBe(sig2);
		});

		it("produces different signatures for different request IDs", () => {
			const date1 = new Date("2026-01-01T00:00:00Z");
			const date2 = new Date("2026-01-08T00:00:00Z");

			const sig1 = signTimestamp("req-1", date1, date2, 7);
			const sig2 = signTimestamp("req-2", date1, date2, 7);

			expect(sig1).not.toBe(sig2);
		});

		it("produces different signatures for different expiry times", () => {
			const date1 = new Date("2026-01-01T00:00:00Z");

			const sig1 = signTimestamp(
				"req-1",
				date1,
				new Date("2026-01-08T00:00:00Z"),
				7,
			);
			const sig2 = signTimestamp(
				"req-1",
				date1,
				new Date("2026-01-15T00:00:00Z"),
				14,
			);

			expect(sig1).not.toBe(sig2);
		});
	});

	describe("verifyTimestamp", () => {
		it("returns true for valid signature", () => {
			const requestedAt = new Date("2026-01-01T00:00:00Z");
			const expiresAt = new Date("2026-01-08T00:00:00Z");
			const sig = signTimestamp("req-1", requestedAt, expiresAt, 7);

			const valid = verifyTimestamp("req-1", requestedAt, expiresAt, 7, sig);

			expect(valid).toBe(true);
		});

		it("returns false for tampered signature", () => {
			const requestedAt = new Date("2026-01-01T00:00:00Z");
			const expiresAt = new Date("2026-01-08T00:00:00Z");

			const valid = verifyTimestamp(
				"req-1",
				requestedAt,
				expiresAt,
				7,
				"0000000000000000000000000000000000000000000000000000000000000000",
			);

			expect(valid).toBe(false);
		});

		it("returns false for tampered expiry date", () => {
			const requestedAt = new Date("2026-01-01T00:00:00Z");
			const expiresAt = new Date("2026-01-08T00:00:00Z");
			const sig = signTimestamp("req-1", requestedAt, expiresAt, 7);

			// Client tries to change expiresAt to an earlier date
			const tamperedExpiry = new Date("2026-01-02T00:00:00Z");
			const valid = verifyTimestamp(
				"req-1",
				requestedAt,
				tamperedExpiry,
				7,
				sig,
			);

			expect(valid).toBe(false);
		});

		it("returns false for tampered waiting period", () => {
			const requestedAt = new Date("2026-01-01T00:00:00Z");
			const expiresAt = new Date("2026-01-08T00:00:00Z");
			const sig = signTimestamp("req-1", requestedAt, expiresAt, 7);

			// Client tries to change waiting period
			const valid = verifyTimestamp("req-1", requestedAt, expiresAt, 1, sig);

			expect(valid).toBe(false);
		});

		it("returns false for tampered request ID", () => {
			const requestedAt = new Date("2026-01-01T00:00:00Z");
			const expiresAt = new Date("2026-01-08T00:00:00Z");
			const sig = signTimestamp("req-1", requestedAt, expiresAt, 7);

			const valid = verifyTimestamp(
				"req-different",
				requestedAt,
				expiresAt,
				7,
				sig,
			);

			expect(valid).toBe(false);
		});

		it("returns false for wrong-length signature", () => {
			const requestedAt = new Date("2026-01-01T00:00:00Z");
			const expiresAt = new Date("2026-01-08T00:00:00Z");

			const valid = verifyTimestamp(
				"req-1",
				requestedAt,
				expiresAt,
				7,
				"short",
			);

			expect(valid).toBe(false);
		});
	});

	describe("DENIAL_COOLDOWN_MS", () => {
		it("equals 24 hours in milliseconds", () => {
			expect(DENIAL_COOLDOWN_MS).toBe(24 * 60 * 60 * 1000);
		});
	});

	describe("missing ENCRYPTION_KEY", () => {
		it("throws if ENCRYPTION_KEY is not set", () => {
			const saved = process.env.ENCRYPTION_KEY;
			delete process.env.ENCRYPTION_KEY;

			expect(() => signTimestamp("req-1", new Date(), new Date(), 7)).toThrow(
				"ENCRYPTION_KEY",
			);

			process.env.ENCRYPTION_KEY = saved;
		});

		it("throws if ENCRYPTION_KEY is too short", () => {
			const saved = process.env.ENCRYPTION_KEY;
			process.env.ENCRYPTION_KEY = "short";

			expect(() => signTimestamp("req-1", new Date(), new Date(), 7)).toThrow(
				"ENCRYPTION_KEY",
			);

			process.env.ENCRYPTION_KEY = saved;
		});
	});
});
