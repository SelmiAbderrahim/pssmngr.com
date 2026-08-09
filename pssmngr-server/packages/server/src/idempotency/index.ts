// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Idempotency helper — collapse client retries (especially from the
 * offline sync queue) into a single logical mutation.
 *
 * Contract:
 *   - Caller supplies `(userId, router, procedure, key, executor)`.
 *   - If a row already exists for `(userId, router, procedure, key)`,
 *     return its stored response without re-executing the mutation.
 *   - Otherwise, execute the mutation, persist its response, return it.
 *
 * The persisted response is itself ciphertext-only metadata (the row
 * the server inserted with its server-side id, version, timestamps,
 * etc.) — never plaintext vault contents.
 */
import { and, eq, lt } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { z } from "zod/v3";
import type * as schema from "../db/schema";
import { idempotencyKey as idempotencyKeyTable } from "../db/schema/idempotency";

type Db = PostgresJsDatabase<typeof schema>;

/** Format guard reused by every router input. */
export const idempotencyKeyZodSchema = z
	.string()
	.min(8)
	.max(128)
	.regex(/^[a-zA-Z0-9:_.-]+$/, {
		message: "invalid idempotency key format",
	})
	.optional();

/**
 * Run `executor` exactly once for a given `(userId, router, procedure, key)`
 * tuple. If `key` is undefined the executor runs every call (legacy path,
 * preserves backwards-compatibility with non-offline clients).
 */
export async function runWithIdempotency<TResult>(args: {
	db: Db;
	userId: string;
	router: string;
	procedure: string;
	key: string | undefined;
	executor: () => Promise<TResult>;
}): Promise<TResult> {
	const { db, userId, router, procedure, key, executor } = args;

	// No key → not an offline-replay path. Just run.
	if (!key) {
		return executor();
	}

	const existing = await db.query.idempotencyKey.findFirst({
		where: and(
			eq(idempotencyKeyTable.key, key),
			eq(idempotencyKeyTable.userId, userId),
			eq(idempotencyKeyTable.router, router),
			eq(idempotencyKeyTable.procedure, procedure),
		),
	});

	if (existing) {
		return existing.responseBody as TResult;
	}

	const result = await executor();

	// Persist the response. `onConflictDoNothing` avoids races where two
	// concurrent retries hit the same key simultaneously.
	await db
		.insert(idempotencyKeyTable)
		.values({
			key,
			userId,
			router,
			procedure,
			responseStatus: 200,
			responseBody: result as unknown as object,
		})
		.onConflictDoNothing({ target: idempotencyKeyTable.key });

	return result;
}

/**
 * Purge idempotency rows older than `olderThanMs` (default 30 days).
 * Returns the number of rows removed. Intended to be called from a
 * scheduled job.
 */
export async function purgeStaleIdempotencyKeys(
	db: Db,
	olderThanMs = 30 * 24 * 60 * 60 * 1000,
): Promise<number> {
	const cutoff = new Date(Date.now() - olderThanMs);
	const deleted = await db
		.delete(idempotencyKeyTable)
		.where(lt(idempotencyKeyTable.createdAt, cutoff))
		.returning({ key: idempotencyKeyTable.key });
	return deleted.length;
}
