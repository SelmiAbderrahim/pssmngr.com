// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * `consumeCreateQuota` falls back to an in-process counter when no
 * Redis is configured. The unit tests run without REDIS_URL so we
 * exercise the in-memory path.
 *
 * Spec: 2 requests per hour per user. The 3rd call within an hour
 * must be denied. Different users must NOT share the same bucket.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { __resetCreateQuotaForTests, consumeCreateQuota } from "../rate-limit";

describe("consumeCreateQuota (in-memory fallback)", () => {
	beforeEach(() => {
		// Make absolutely sure no Redis env vars leak into the test —
		// the fallback path is what we mean to exercise.
		delete process.env.REDIS_URL;
		delete process.env.REDIS_HOST;
	});

	afterEach(async () => {
		await __resetCreateQuotaForTests("user-a");
		await __resetCreateQuotaForTests("user-b");
	});

	it("allows the first two calls in a window", async () => {
		await __resetCreateQuotaForTests("user-a");
		expect(await consumeCreateQuota("user-a")).toBe(true);
		expect(await consumeCreateQuota("user-a")).toBe(true);
	});

	it("denies the third call inside the window", async () => {
		await __resetCreateQuotaForTests("user-a");
		await consumeCreateQuota("user-a");
		await consumeCreateQuota("user-a");
		expect(await consumeCreateQuota("user-a")).toBe(false);
	});

	it("counts users independently", async () => {
		await __resetCreateQuotaForTests("user-a");
		await __resetCreateQuotaForTests("user-b");
		await consumeCreateQuota("user-a");
		await consumeCreateQuota("user-a");
		// user-b should be unaffected by user-a hitting the cap
		expect(await consumeCreateQuota("user-b")).toBe(true);
		expect(await consumeCreateQuota("user-a")).toBe(false);
	});
});
