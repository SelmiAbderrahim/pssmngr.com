// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Filesystem behavior of the data-export bundle store. Uses a real
 * temp dir per test so concurrent vitest workers can't collide.
 */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	bundleAbsolutePath,
	bundleRelativePath,
	bundleSize,
	ensureUserDir,
	getStorageDir,
	removeBundleIfExists,
} from "../storage";

describe("data-export storage", () => {
	let dir: string;
	let prevEnv: string | undefined;

	beforeEach(async () => {
		prevEnv = process.env.EXPORT_STORAGE_DIR;
		dir = await mkdtemp(path.join(os.tmpdir(), "pssmngr-data-export-test-"));
		process.env.EXPORT_STORAGE_DIR = dir;
	});

	afterEach(async () => {
		if (prevEnv === undefined) delete process.env.EXPORT_STORAGE_DIR;
		else process.env.EXPORT_STORAGE_DIR = prevEnv;
		await rm(dir, { recursive: true, force: true }).catch(() => undefined);
	});

	it("getStorageDir honours EXPORT_STORAGE_DIR", () => {
		expect(getStorageDir()).toBe(path.resolve(dir));
	});

	it("bundleRelativePath sanitises path separators", () => {
		const rel = bundleRelativePath("u/1", "r\\2");
		expect(rel.includes("..")).toBe(false);
		expect(rel.includes("/")).toBe(true); // joined dir
		expect(rel).toBe("u_1/r_2.zip");
	});

	it("ensureUserDir creates the directory tree", async () => {
		const created = await ensureUserDir("user-x");
		expect(created.startsWith(dir)).toBe(true);
		// idempotent: second call must not throw
		await ensureUserDir("user-x");
	});

	it("removeBundleIfExists is a no-op for missing paths", async () => {
		await expect(removeBundleIfExists(null)).resolves.toBeUndefined();
		await expect(
			removeBundleIfExists("user-x/missing.zip"),
		).resolves.toBeUndefined();
	});

	it("removes an existing bundle file when present", async () => {
		await ensureUserDir("user-x");
		const rel = bundleRelativePath("user-x", "abc");
		const abs = bundleAbsolutePath(rel);
		await writeFile(abs, "stub");
		expect(await bundleSize(rel)).toBe(4);
		await removeBundleIfExists(rel);
		expect(await bundleSize(rel)).toBe(0);
	});
});
