// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Filesystem helpers for the data-export bundle store.
 *
 * Bundles live at `${EXPORT_STORAGE_DIR}/<userId>/<requestId>.zip`.
 * All paths returned from `getStorageDir()` are absolute; the row
 * `bundlePath` is stored *relative* to the storage dir so the
 * deployment can move the dir without breaking links.
 */
import { mkdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * Absolute root directory where export bundles are written.
 *
 * Resolution order:
 *  1. `EXPORT_STORAGE_DIR` env var (production)
 *  2. `<os.tmpdir()>/pssmngr-data-exports` (default — works in dev & tests)
 */
export function getStorageDir(): string {
	const explicit = process.env.EXPORT_STORAGE_DIR?.trim();
	if (explicit && explicit.length > 0) {
		return path.resolve(explicit);
	}
	return path.join(os.tmpdir(), "pssmngr-data-exports");
}

/** Relative-path slug for a request, used in the DB `bundle_path` field. */
export function bundleRelativePath(userId: string, requestId: string): string {
	// Strip any path separators defensively — these come from generated
	// ids but staying paranoid costs us nothing.
	const safeUser = userId.replace(/[\\/]/g, "_");
	const safeReq = requestId.replace(/[\\/]/g, "_");
	return path.posix.join(safeUser, `${safeReq}.zip`);
}

export function bundleAbsolutePath(relative: string): string {
	return path.join(getStorageDir(), relative);
}

/** Make sure the per-user subdirectory exists before writing into it. */
export async function ensureUserDir(userId: string): Promise<string> {
	const dir = path.join(getStorageDir(), userId.replace(/[\\/]/g, "_"));
	await mkdir(dir, { recursive: true });
	return dir;
}

/** Best-effort removal — never throws (callers may double-revoke). */
export async function removeBundleIfExists(
	relative: string | null | undefined,
): Promise<void> {
	if (!relative) return;
	try {
		await rm(bundleAbsolutePath(relative), { force: true });
	} catch {
		// Swallow — caller has already updated DB state to REVOKED/EXPIRED.
	}
}

/** Returns size in bytes, or 0 if the file is missing. */
export async function bundleSize(relative: string): Promise<number> {
	try {
		const s = await stat(bundleAbsolutePath(relative));
		return s.size;
	} catch {
		return 0;
	}
}
