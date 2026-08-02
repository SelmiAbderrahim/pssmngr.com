// Copyright (c) 2026 Password Manager contributors
/**
 * Compatibility redirect from /dashboard/family to the organization Family tab.
 */
import { describe, expect, it } from "vitest";
import { Route as FamilyRoute } from "../family";

describe("dashboard/family redirect", () => {
	it("redirects to /dashboard/organization with tab=family", () => {
		let thrown: unknown = null;
		try {
			const beforeLoad = FamilyRoute.options?.beforeLoad;
			if (typeof beforeLoad === "function") {
				beforeLoad({} as never);
			}
		} catch (err) {
			thrown = err;
		}
		expect(thrown).toBeTruthy();
		const options = (thrown as { options: { to?: string; search?: Record<string, unknown>; replace?: boolean } }).options;
		expect(options.to).toBe("/dashboard/organization");
		expect(options.search).toEqual({ tab: "family" });
		expect(options.replace).toBe(true);
	});
});
