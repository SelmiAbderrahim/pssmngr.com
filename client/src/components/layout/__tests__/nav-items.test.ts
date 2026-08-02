// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Primary navigation information-architecture contract.
 *
 * The nav item list is the single source of truth for both the top navbar
 * (desktop) and the mobile Sheet sidebar. Tests here freeze the shape so a
 * forked-platform entry (`featureKey`) can't sneak back in.
 */
import { describe, expect, it } from "vitest";
import { primaryNavItems } from "../nav-items";

const fakeT = ((key: string, fallback?: string) => fallback ?? key) as never;

describe("primaryNavItems", () => {
	it("returns exactly the four primary destinations in tour order", () => {
		const items = primaryNavItems(fakeT);
		expect(items.map((i) => i.path)).toEqual([
			"/dashboard/vault",
			"/dashboard/watchtower",
			"/dashboard/organization",
			"/dashboard/settings",
		]);
	});

	it("exposes the guided-tour anchors for every item", () => {
		const items = primaryNavItems(fakeT);
		expect(items.map((i) => i.tour)).toEqual([
			"nav-vault",
			"nav-security",
			"nav-people",
			"nav-settings",
		]);
	});

	it("labels come from i18n with stable default fallbacks", () => {
		const items = primaryNavItems(fakeT);
		expect(items[0].label).toBe("Vault");
		expect(items[1].label).toBe("Security");
		expect(items[2].label).toBe("People");
		expect(items[3].label).toBe("Settings");
	});

	it("no forked-platform featureKey field is present on any item", () => {
		const items = primaryNavItems(fakeT);
		for (const item of items) {
			expect(item).not.toHaveProperty("featureKey");
		}
	});

	it("emits a Security badge only when there are issues", () => {
		const clean = primaryNavItems(fakeT, { watchtowerIssueCount: 0 });
		expect(clean[1].badge).toBeUndefined();
		const dirty = primaryNavItems(fakeT, { watchtowerIssueCount: 3 });
		expect(dirty[1].badge).toBe(3);
	});
});
