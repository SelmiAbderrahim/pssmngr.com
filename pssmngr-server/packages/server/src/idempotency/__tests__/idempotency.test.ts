// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Unit tests for the idempotency helper.
 *
 * Uses a hand-rolled in-memory Db shim so the test never reaches Postgres.
 * The shim implements only the surface used by `runWithIdempotency` and
 * `purgeStaleIdempotencyKeys` — anything else throws so it can't silently
 * miss a regression.
 */
import { describe, expect, it, vi } from "vitest";
import { purgeStaleIdempotencyKeys, runWithIdempotency } from "../index";

type Row = {
	key: string;
	userId: string;
	router: string;
	procedure: string;
	responseStatus: number;
	responseBody: unknown;
	createdAt: Date;
};

function createDbShim() {
	const rows = new Map<string, Row>();
	const db = {
		_rows: rows,
		query: {
			idempotencyKey: {
				findFirst: vi.fn(async ({ where: _where }: { where: unknown }) => {
					// Where clauses are compiled drizzle nodes; the shim ignores
					// their content and trusts that the helper looks them up by
					// the same `(key, userId, router, procedure)` tuple that was
					// inserted. We index by `${key}|${router}|${procedure}|${userId}`.
					const wanted = (db._lastLookup ?? "") as string;
					return rows.get(wanted) ?? null;
				}),
			},
		},
		insert: vi.fn(() => ({
			values: (row: Row) => ({
				onConflictDoNothing: vi.fn(async () => {
					const k = `${row.key}|${row.router}|${row.procedure}|${row.userId}`;
					if (!rows.has(k)) rows.set(k, { ...row, createdAt: new Date() });
				}),
			}),
		})),
		delete: vi.fn(() => ({
			where: (_predicate: unknown) => ({
				returning: vi.fn(async () => {
					const cutoff = db._cutoff ?? new Date(0);
					const removed: { key: string }[] = [];
					for (const [k, v] of rows) {
						if (v.createdAt < cutoff) {
							rows.delete(k);
							removed.push({ key: v.key });
						}
					}
					return removed;
				}),
			}),
		})),
		_lastLookup: null as string | null,
		_cutoff: null as Date | null,
	};
	return db;
}

describe("runWithIdempotency", () => {
	it("executes when no key is supplied (legacy clients)", async () => {
		const db = createDbShim();
		const exec = vi.fn().mockResolvedValue({ id: "new" });
		const res = await runWithIdempotency({
			db: db as any,
			userId: "u1",
			router: "credentials",
			procedure: "create",
			key: undefined,
			executor: exec,
		});
		expect(res).toEqual({ id: "new" });
		expect(exec).toHaveBeenCalledTimes(1);
	});

	it("executes once and returns stored response on retry", async () => {
		const db = createDbShim();
		const exec = vi.fn().mockResolvedValue({ id: "i1" });
		const key = "vault-item:v1:i1:create:1";

		// First call: nothing stored yet. The shim's findFirst returns null,
		// so the executor runs and the helper inserts.
		db._lastLookup = `${key}|credentials|create|u1`;
		const first = await runWithIdempotency({
			db: db as any,
			userId: "u1",
			router: "credentials",
			procedure: "create",
			key,
			executor: exec,
		});
		expect(first).toEqual({ id: "i1" });
		expect(exec).toHaveBeenCalledTimes(1);

		// Second call with same key: findFirst now returns the stored row, so
		// the executor MUST NOT run again.
		const second = await runWithIdempotency({
			db: db as any,
			userId: "u1",
			router: "credentials",
			procedure: "create",
			key,
			executor: exec,
		});
		expect(second).toEqual({ id: "i1" });
		expect(exec).toHaveBeenCalledTimes(1); // not re-run
	});

	it("a different key for the same logical body creates a fresh execution", async () => {
		const db = createDbShim();
		const exec = vi
			.fn()
			.mockResolvedValueOnce({ id: "i1" })
			.mockResolvedValueOnce({ id: "i2" });

		db._lastLookup = "k-a|credentials|create|u1";
		await runWithIdempotency({
			db: db as any,
			userId: "u1",
			router: "credentials",
			procedure: "create",
			key: "k-a",
			executor: exec,
		});

		db._lastLookup = "k-b|credentials|create|u1";
		await runWithIdempotency({
			db: db as any,
			userId: "u1",
			router: "credentials",
			procedure: "create",
			key: "k-b",
			executor: exec,
		});

		expect(exec).toHaveBeenCalledTimes(2);
	});
});

describe("purgeStaleIdempotencyKeys", () => {
	it("removes rows older than the cutoff", async () => {
		const db = createDbShim();
		const old = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
		const recent = new Date();
		db._rows.set("old|r|p|u", {
			key: "old",
			userId: "u",
			router: "r",
			procedure: "p",
			responseStatus: 200,
			responseBody: {},
			createdAt: old,
		});
		db._rows.set("new|r|p|u", {
			key: "new",
			userId: "u",
			router: "r",
			procedure: "p",
			responseStatus: 200,
			responseBody: {},
			createdAt: recent,
		});
		db._cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

		const removed = await purgeStaleIdempotencyKeys(db as any);
		expect(removed).toBe(1);
		expect(db._rows.has("old|r|p|u")).toBe(false);
		expect(db._rows.has("new|r|p|u")).toBe(true);
	});
});
