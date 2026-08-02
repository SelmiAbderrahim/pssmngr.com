// Copyright (c) 2026 Password Manager contributors
/**
 * Dashboard index redirect to /dashboard/vault.
 */
import { describe, expect, it, vi } from "vitest";
import { Route } from "../index";

describe("dashboard/index redirect", () => {
	it("throws a redirect to /dashboard/vault with default vault search params", () => {
		let thrown: unknown = null;
		try {
			// beforeLoad is a static option on the route
			const beforeLoad = Route.options?.beforeLoad;
			if (typeof beforeLoad === "function") {
				beforeLoad({} as never);
			}
		} catch (err) {
			thrown = err;
		}
		expect(thrown).toBeTruthy();
		const options = (thrown as { options: { to?: string; search?: Record<string, unknown>; replace?: boolean } }).options;
		expect(options.to).toBe("/dashboard/vault");
		expect(options.replace).toBe(true);
		expect(options.search).toMatchObject({
			tab: "items",
			filter: "all",
			sort: "modified",
			q: "",
		});
	});

	it("beforeLoad is declared as a function", () => {
		expect(typeof Route.options?.beforeLoad).toBe("function");
	});

	it("never returns a non-redirect value", () => {
		let returnValue: unknown = "sentinel";
		try {
			const beforeLoad = Route.options?.beforeLoad;
			if (typeof beforeLoad === "function") {
				returnValue = beforeLoad({} as never);
			}
		} catch {
			returnValue = undefined;
		}
		expect(returnValue).toBeUndefined();
	});
});

// Silence any React 18 act warnings from unrelated modules the file may pull in.
vi.mock("@/providers/AuthProvider", () => ({
	useAuthState: () => ({ user: null, isLoading: false, status: "unauthenticated" }),
}));
