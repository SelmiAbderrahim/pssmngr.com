// Copyright (c) 2026 Password Manager contributors
/**
 * Legacy settings paths remain compatible redirects instead of returning 404.
 */
import { describe, expect, it } from "vitest";
import { Route as ProfileRoute } from "../profile";
import { Route as PasswordHistoryRoute } from "../password-history";
import { Route as DataExportRoute } from "../data-export";

function runBeforeLoad(route: { options?: { beforeLoad?: unknown } }): { to?: string; replace?: boolean } | null {
	let thrown: unknown = null;
	try {
		const fn = route.options?.beforeLoad;
		if (typeof fn === "function") {
			fn({} as never);
		}
	} catch (err) {
		thrown = err;
	}
	return (thrown as { options?: { to?: string; replace?: boolean } } | null)?.options ?? null;
}

describe("settings redirect stubs", () => {
	it("/dashboard/settings/profile → /dashboard/settings", () => {
		const r = runBeforeLoad(ProfileRoute);
		expect(r?.to).toBe("/dashboard/settings");
		expect(r?.replace).toBe(true);
	});

	it("/dashboard/settings/password-history → /dashboard/settings/security", () => {
		const r = runBeforeLoad(PasswordHistoryRoute);
		expect(r?.to).toBe("/dashboard/settings/security");
		expect(r?.replace).toBe(true);
	});

	it("/dashboard/settings/data-export → /dashboard/settings/import-export", () => {
		const r = runBeforeLoad(DataExportRoute);
		expect(r?.to).toBe("/dashboard/settings/import-export");
		expect(r?.replace).toBe(true);
	});
});
