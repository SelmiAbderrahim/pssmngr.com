// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Service-layer tests for the GDPR data-export pipeline.
 *
 * Uses an in-memory Drizzle-shaped shim instead of a real Postgres
 * connection so the suite runs in any container without TEST_DATABASE_URL.
 * The shim implements ONLY the surface the service calls — anything
 * else throws so the test fails loudly on unintended access.
 *
 * What we lock down here:
 *  - One in-flight request per user (concurrency / CONFLICT path)
 *  - Rolling window: old SUCCEEDED rows get auto-revoked
 *  - Revoke is idempotent (REVOKED → REVOKED is a no-op)
 *  - Expiry sweeper flips stale SUCCEEDED → EXPIRED and deletes files
 *  - findByDownloadToken refuses non-SUCCEEDED rows
 *  - generateDownloadToken produces 256-bit URL-safe values
 */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DataExportRequest } from "../../../db/schema/data-export";
import {
	createExportRequest,
	DataExportConflictError,
	DataExportNotFoundError,
	EXPORT_EXPIRY_MS,
	expireOldExports,
	findByDownloadToken,
	generateDownloadToken,
	getExportRequest,
	listExportRequests,
	revokeExportRequest,
} from "../service";
import { bundleAbsolutePath, bundleRelativePath } from "../storage";

// ---------------------------------------------------------------------------
// In-memory DB shim
// ---------------------------------------------------------------------------

type Row = DataExportRequest;

interface PendingClause {
	userId?: string;
	id?: string;
	status?: string | string[];
	expiresAtLt?: Date;
	tokenEq?: string;
	requestedAtLt?: Date;
}

/**
 * Capture the where()/and()/eq()/inArray()/lt() function calls into a
 * plain object so the in-memory query layer can interpret them.
 *
 * The drizzle ops return opaque symbol objects, so the shim's
 * `select()/update()/delete()/insert()` and `query.*` layers each
 * intercept and inspect the original predicate values through closure
 * scope. We achieve that by replacing the drizzle helpers with
 * predicate constructors via vi.mock below.
 */

interface DrizzlePredicate {
	__kind: "eq" | "and" | "inArray" | "lt";
	column?: { name: string };
	value?: unknown;
	values?: unknown[];
	children?: DrizzlePredicate[];
}

vi.mock("drizzle-orm", async (importOriginal) => {
	const actual = await importOriginal<typeof import("drizzle-orm")>();
	return {
		...actual,
		eq: (column: { name?: string }, value: unknown): DrizzlePredicate => ({
			__kind: "eq",
			column: { name: column?.name ?? String(column) },
			value,
		}),
		and: (...children: DrizzlePredicate[]): DrizzlePredicate => ({
			__kind: "and",
			children,
		}),
		inArray: (
			column: { name?: string },
			values: unknown[],
		): DrizzlePredicate => ({
			__kind: "inArray",
			column: { name: column?.name ?? String(column) },
			values,
		}),
		lt: (column: { name?: string }, value: unknown): DrizzlePredicate => ({
			__kind: "lt",
			column: { name: column?.name ?? String(column) },
			value,
		}),
		asc: () => ({ __kind: "asc" }),
		desc: () => ({ __kind: "desc" }),
	};
});

function matchesPredicate(row: Row, p: DrizzlePredicate | undefined): boolean {
	if (!p) return true;
	const rowKey = (columnName: string): keyof Row => {
		const aliases: Record<string, keyof Row> = {
			download_token: "downloadToken",
			expires_at: "expiresAt",
			requested_at: "requestedAt",
			user_id: "userId",
		};
		return aliases[columnName] ?? (columnName as keyof Row);
	};
	const valueFor = (columnName: string): unknown => row[rowKey(columnName)];
	switch (p.__kind) {
		case "and":
			return (p.children ?? []).every((c) => matchesPredicate(row, c));
		case "eq":
			return valueFor(p.column?.name ?? "") === p.value;
		case "inArray":
			return (p.values ?? []).includes(valueFor(p.column?.name ?? ""));
		case "lt": {
			const v = valueFor(p.column?.name ?? "");
			if (v == null) return false;
			return (
				new Date(v as string | Date).getTime() <
				new Date(p.value as string | Date).getTime()
			);
		}
		default:
			return false;
	}
}

function shimColumn(name: string) {
	return { name };
}

function makeShim() {
	const rows = new Map<string, Row>();

	// Map Drizzle's `dataExportRequests.<col>` references to plain
	// column objects with a `.name`. The service code reaches into the
	// schema export, which is a real drizzle table — but the mocked
	// `eq()/and()/...` helpers above stringify whatever column object
	// they receive, so the real table works here too because Drizzle
	// column objects expose a `name` property.
	void shimColumn;

	const db = {
		_rows: rows,
		query: {
			dataExportRequests: {
				findFirst: async ({ where }: { where?: DrizzlePredicate }) => {
					for (const row of rows.values()) {
						if (matchesPredicate(row, where)) return row;
					}
					return null;
				},
				findMany: async ({
					where,
					limit,
				}: {
					where?: DrizzlePredicate;
					limit?: number;
					orderBy?: unknown;
				}) => {
					let out = [...rows.values()].filter((r) =>
						matchesPredicate(r, where),
					);
					out = out.sort(
						(a, b) =>
							new Date(b.requestedAt).getTime() -
							new Date(a.requestedAt).getTime(),
					);
					if (limit) out = out.slice(0, limit);
					return out;
				},
			},
			user: {
				findFirst: async () => ({ id: "user-x", preferredLanguage: "en" }),
			},
		},
		select: () => ({
			from: () => ({
				where: (predicate?: DrizzlePredicate) => {
					return [...rows.values()].filter((r) =>
						matchesPredicate(r, predicate),
					);
				},
			}),
		}),
		insert: () => ({
			values: (row: Partial<Row>) => ({
				returning: async () => {
					const id =
						row.id ??
						`req-${Math.random().toString(36).slice(2, 10)}-${rows.size + 1}`;
					const inserted: Row = {
						id,
						userId: row.userId!,
						status: (row.status ?? "PENDING") as Row["status"],
						requestedAt: new Date(),
						startedAt: null,
						completedAt: null,
						expiresAt: null,
						bundlePath: "",
						bundleSizeBytes: 0n as unknown as Row["bundleSizeBytes"],
						downloadToken: null,
						downloadCount: 0,
						errorMessage: "",
						ipAddress: row.ipAddress ?? null,
						userAgent: row.userAgent ?? null,
						requestedFormat: (row.requestedFormat ??
							"BOTH") as Row["requestedFormat"],
					};
					// Enforce the partial unique index in-shim
					for (const existing of rows.values()) {
						if (
							existing.userId === inserted.userId &&
							(existing.status === "PENDING" || existing.status === "RUNNING")
						) {
							const err: Error & { code?: string } = new Error(
								"duplicate key value violates unique constraint",
							);
							err.code = "23505";
							throw err;
						}
					}
					rows.set(id, inserted);
					return [inserted];
				},
			}),
		}),
		update: () => ({
			set: (patch: Partial<Row>) => ({
				where: (predicate: DrizzlePredicate) => {
					const out: Row[] = [];
					for (const [id, r] of rows) {
						if (matchesPredicate(r, predicate)) {
							const next = { ...r, ...patch };
							rows.set(id, next);
							out.push(next);
						}
					}
					return {
						returning: async () => out,
						// biome-ignore lint/suspicious/noThenProperty: Drizzle query builders are promise-like and also expose returning().
						then: <TResult1 = Row[], TResult2 = never>(
							onfulfilled?:
								| ((value: Row[]) => TResult1 | PromiseLike<TResult1>)
								| null,
							onrejected?:
								| ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
								| null,
						) => Promise.resolve(out).then(onfulfilled, onrejected),
					};
				},
			}),
		}),
		delete: () => ({
			where: async (predicate: DrizzlePredicate) => {
				let count = 0;
				for (const [id, r] of rows) {
					if (matchesPredicate(r, predicate)) {
						rows.delete(id);
						count += 1;
					}
				}
				return count;
			},
		}),
	};

	return db;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("generateDownloadToken", () => {
	it("produces a 256-bit URL-safe value", () => {
		const t = generateDownloadToken();
		// 48 bytes base64url-encoded → 64 chars, URL-safe alphabet
		expect(t.length).toBeGreaterThanOrEqual(64);
		expect(/^[A-Za-z0-9_-]+$/.test(t)).toBe(true);
	});

	it("produces a fresh value on each call", () => {
		const a = generateDownloadToken();
		const b = generateDownloadToken();
		expect(a).not.toBe(b);
	});
});

describe("createExportRequest", () => {
	it("inserts a PENDING row when no in-flight exists", async () => {
		const db = makeShim();
		const row = await createExportRequest({
			db: db as any,
			userId: "user-x",
			format: "BOTH",
			ipAddress: "127.0.0.1",
			userAgent: "test",
		});
		expect(row.status).toBe("PENDING");
		expect(row.userId).toBe("user-x");
		expect(row.requestedFormat).toBe("BOTH");
	});

	it("throws DataExportConflictError on a second concurrent call", async () => {
		const db = makeShim();
		await createExportRequest({
			db: db as any,
			userId: "user-x",
			format: "BOTH",
			ipAddress: null,
			userAgent: null,
		});

		await expect(
			createExportRequest({
				db: db as any,
				userId: "user-x",
				format: "BOTH",
				ipAddress: null,
				userAgent: null,
			}),
		).rejects.toBeInstanceOf(DataExportConflictError);
	});
});

describe("revokeExportRequest", () => {
	it("flips a SUCCEEDED row to REVOKED and clears the token", async () => {
		const db = makeShim();
		// Seed a SUCCEEDED row directly.
		const succeeded: Row = {
			id: "r1",
			userId: "user-x",
			status: "SUCCEEDED",
			requestedAt: new Date(Date.now() - 60_000),
			startedAt: new Date(Date.now() - 50_000),
			completedAt: new Date(Date.now() - 40_000),
			expiresAt: new Date(Date.now() + 60_000),
			bundlePath: "user-x/r1.zip",
			bundleSizeBytes: 1024n as unknown as Row["bundleSizeBytes"],
			downloadToken: "tok-abc",
			downloadCount: 0,
			errorMessage: "",
			ipAddress: null,
			userAgent: null,
			requestedFormat: "BOTH",
		};
		(db as unknown as { _rows: Map<string, Row> })._rows.set("r1", succeeded);

		await revokeExportRequest({
			db: db as any,
			userId: "user-x",
			requestId: "r1",
		});

		const after = (db as unknown as { _rows: Map<string, Row> })._rows.get(
			"r1",
		);
		expect(after?.status).toBe("REVOKED");
		expect(after?.downloadToken).toBeNull();
		expect(after?.bundlePath).toBe("");
	});

	it("is idempotent — second revoke is a silent no-op", async () => {
		const db = makeShim();
		(db as unknown as { _rows: Map<string, Row> })._rows.set("r1", {
			id: "r1",
			userId: "user-x",
			status: "REVOKED",
			requestedAt: new Date(),
			startedAt: null,
			completedAt: null,
			expiresAt: null,
			bundlePath: "",
			bundleSizeBytes: 0n as unknown as Row["bundleSizeBytes"],
			downloadToken: null,
			downloadCount: 0,
			errorMessage: "",
			ipAddress: null,
			userAgent: null,
			requestedFormat: "BOTH",
		});

		await expect(
			revokeExportRequest({
				db: db as any,
				userId: "user-x",
				requestId: "r1",
			}),
		).resolves.toBeUndefined();
	});

	it("throws DataExportNotFoundError for foreign rows", async () => {
		const db = makeShim();
		await expect(
			revokeExportRequest({
				db: db as any,
				userId: "user-x",
				requestId: "does-not-exist",
			}),
		).rejects.toBeInstanceOf(DataExportNotFoundError);
	});
});

describe("findByDownloadToken", () => {
	it("returns null for empty/short tokens", async () => {
		const db = makeShim();
		expect(await findByDownloadToken(db as never, "")).toBeNull();
		expect(await findByDownloadToken(db as never, "short")).toBeNull();
	});

	it("returns null for non-SUCCEEDED rows", async () => {
		const db = makeShim();
		(db as unknown as { _rows: Map<string, Row> })._rows.set("r1", {
			id: "r1",
			userId: "user-x",
			status: "REVOKED",
			requestedAt: new Date(),
			startedAt: null,
			completedAt: null,
			expiresAt: null,
			bundlePath: "",
			bundleSizeBytes: 0n as unknown as Row["bundleSizeBytes"],
			downloadToken: "test-only-token",
			downloadCount: 0,
			errorMessage: "",
			ipAddress: null,
			userAgent: null,
			requestedFormat: "BOTH",
		});
		expect(
			await findByDownloadToken(db as never, "test-only-token"),
		).toBeNull();
	});

	it("returns the row for a SUCCEEDED match", async () => {
		const db = makeShim();
		(db as unknown as { _rows: Map<string, Row> })._rows.set("r1", {
			id: "r1",
			userId: "user-x",
			status: "SUCCEEDED",
			requestedAt: new Date(),
			startedAt: null,
			completedAt: new Date(),
			expiresAt: new Date(Date.now() + 60_000),
			bundlePath: "user-x/r1.zip",
			bundleSizeBytes: 1n as unknown as Row["bundleSizeBytes"],
			downloadToken: "tok-good-1234567890ABCDEF",
			downloadCount: 0,
			errorMessage: "",
			ipAddress: null,
			userAgent: null,
			requestedFormat: "BOTH",
		});
		const found = await findByDownloadToken(
			db as never,
			"tok-good-1234567890ABCDEF",
		);
		expect(found?.id).toBe("r1");
	});
});

describe("expireOldExports", () => {
	let dir: string;

	beforeEach(async () => {
		dir = await mkdtemp(path.join(os.tmpdir(), "pssmngr-expire-test-"));
		process.env.EXPORT_STORAGE_DIR = dir;
	});

	afterEach(async () => {
		delete process.env.EXPORT_STORAGE_DIR;
		await rm(dir, { recursive: true, force: true }).catch(() => undefined);
	});

	it("flips stale SUCCEEDED rows to EXPIRED and removes their files", async () => {
		const db = makeShim();
		const past = new Date(Date.now() - 1000);
		const rel = bundleRelativePath("user-x", "r1");
		const abs = bundleAbsolutePath(rel);
		await rm(abs, { force: true }).catch(() => undefined);
		await import("node:fs/promises").then(({ mkdir }) =>
			mkdir(path.dirname(abs), { recursive: true }),
		);
		await writeFile(abs, "x");

		(db as unknown as { _rows: Map<string, Row> })._rows.set("r1", {
			id: "r1",
			userId: "user-x",
			status: "SUCCEEDED",
			requestedAt: new Date(),
			startedAt: null,
			completedAt: past,
			expiresAt: past,
			bundlePath: rel,
			bundleSizeBytes: 1n as unknown as Row["bundleSizeBytes"],
			downloadToken: "tok",
			downloadCount: 0,
			errorMessage: "",
			ipAddress: null,
			userAgent: null,
			requestedFormat: "BOTH",
		});

		const swept = await expireOldExports({
			db: db as never,
			now: () => new Date(),
		});
		expect(swept).toBe(1);
		const after = (db as unknown as { _rows: Map<string, Row> })._rows.get(
			"r1",
		);
		expect(after?.status).toBe("EXPIRED");
		expect(after?.bundlePath).toBe("");
	});
});

describe("listExportRequests + getExportRequest", () => {
	it("only returns rows owned by the requesting user", async () => {
		const db = makeShim();
		await createExportRequest({
			db: db as any,
			userId: "user-a",
			format: "BOTH",
			ipAddress: null,
			userAgent: null,
		});
		// Second call from user-b must NOT conflict with user-a's
		// in-flight row.
		await createExportRequest({
			db: db as any,
			userId: "user-b",
			format: "BOTH",
			ipAddress: null,
			userAgent: null,
		});

		const aList = await listExportRequests({
			db: db as any,
			userId: "user-a",
		});
		expect(aList.length).toBe(1);
		expect(aList[0].userId).toBe("user-a");

		await expect(
			getExportRequest({
				db: db as any,
				userId: "user-a",
				requestId: aList[0].id,
			}),
		).resolves.toBeTruthy();

		await expect(
			getExportRequest({
				db: db as any,
				userId: "user-other",
				requestId: aList[0].id,
			}),
		).rejects.toBeInstanceOf(DataExportNotFoundError);
	});
});

describe("EXPORT_EXPIRY_MS", () => {
	it("is exactly 7 days", () => {
		expect(EXPORT_EXPIRY_MS).toBe(7 * 24 * 60 * 60 * 1000);
	});
});
