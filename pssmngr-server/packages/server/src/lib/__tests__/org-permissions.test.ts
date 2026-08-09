// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Organization Permissions Matrix - Unit Tests
 *
 * @vitest-environment node
 */

import { TRPCError } from "@trpc/server";
import type { TFunction } from "i18next";
import { describe, expect, it } from "vitest";
import {
	hasPermission,
	ORG_PERMISSIONS,
	type OrgPermission,
	type OrgRole,
	requirePermission,
	sharedVaultPermissionForOrgRole,
} from "../org-permissions";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockT(): TFunction {
	return ((key: string, params?: Record<string, unknown>) => {
		if (params) {
			let result = key;
			for (const [k, v] of Object.entries(params)) {
				result = result.replace(`{{${k}}}`, String(v));
			}
			return result;
		}
		return key;
	}) as unknown as TFunction;
}

const ALL_ROLES: OrgRole[] = ["owner", "admin", "member"];
const ALL_PERMISSIONS = Object.keys(ORG_PERMISSIONS) as OrgPermission[];

// ---------------------------------------------------------------------------
// hasPermission() — full matrix coverage
// ---------------------------------------------------------------------------

describe("hasPermission", () => {
	describe("owner permissions", () => {
		it("owner can org:update", () => {
			expect(hasPermission("owner", "org:update")).toBe(true);
		});

		it("owner can org:delete", () => {
			expect(hasPermission("owner", "org:delete")).toBe(true);
		});

		it("owner can org:transfer", () => {
			expect(hasPermission("owner", "org:transfer")).toBe(true);
		});

		it("owner can member:invite", () => {
			expect(hasPermission("owner", "member:invite")).toBe(true);
		});

		it("owner can member:remove", () => {
			expect(hasPermission("owner", "member:remove")).toBe(true);
		});

		it("owner can member:updateRole", () => {
			expect(hasPermission("owner", "member:updateRole")).toBe(true);
		});

		it("owner can member:list", () => {
			expect(hasPermission("owner", "member:list")).toBe(true);
		});

		it("owner can invitation:list", () => {
			expect(hasPermission("owner", "invitation:list")).toBe(true);
		});

		it("owner can invitation:cancel", () => {
			expect(hasPermission("owner", "invitation:cancel")).toBe(true);
		});

		it("owner CANNOT self:leave", () => {
			expect(hasPermission("owner", "self:leave")).toBe(false);
		});

		it("owner can self:viewProfile", () => {
			expect(hasPermission("owner", "self:viewProfile")).toBe(true);
		});
	});

	describe("admin permissions", () => {
		it("admin can org:update", () => {
			expect(hasPermission("admin", "org:update")).toBe(true);
		});

		it("admin CANNOT org:delete", () => {
			expect(hasPermission("admin", "org:delete")).toBe(false);
		});

		it("admin CANNOT org:transfer", () => {
			expect(hasPermission("admin", "org:transfer")).toBe(false);
		});

		it("admin can member:invite", () => {
			expect(hasPermission("admin", "member:invite")).toBe(true);
		});

		it("admin can member:remove", () => {
			expect(hasPermission("admin", "member:remove")).toBe(true);
		});

		it("admin CANNOT member:updateRole", () => {
			expect(hasPermission("admin", "member:updateRole")).toBe(false);
		});

		it("admin can member:list", () => {
			expect(hasPermission("admin", "member:list")).toBe(true);
		});

		it("admin can invitation:list", () => {
			expect(hasPermission("admin", "invitation:list")).toBe(true);
		});

		it("admin can invitation:cancel", () => {
			expect(hasPermission("admin", "invitation:cancel")).toBe(true);
		});

		it("admin can self:leave", () => {
			expect(hasPermission("admin", "self:leave")).toBe(true);
		});

		it("admin can self:viewProfile", () => {
			expect(hasPermission("admin", "self:viewProfile")).toBe(true);
		});
	});

	describe("member permissions", () => {
		it("member CANNOT org:update", () => {
			expect(hasPermission("member", "org:update")).toBe(false);
		});

		it("member CANNOT org:delete", () => {
			expect(hasPermission("member", "org:delete")).toBe(false);
		});

		it("member CANNOT org:transfer", () => {
			expect(hasPermission("member", "org:transfer")).toBe(false);
		});

		it("member CANNOT member:invite", () => {
			expect(hasPermission("member", "member:invite")).toBe(false);
		});

		it("member CANNOT member:remove", () => {
			expect(hasPermission("member", "member:remove")).toBe(false);
		});

		it("member CANNOT member:updateRole", () => {
			expect(hasPermission("member", "member:updateRole")).toBe(false);
		});

		it("member can member:list", () => {
			expect(hasPermission("member", "member:list")).toBe(true);
		});

		it("member can invitation:list", () => {
			expect(hasPermission("member", "invitation:list")).toBe(true);
		});

		it("member CANNOT invitation:cancel", () => {
			expect(hasPermission("member", "invitation:cancel")).toBe(false);
		});

		it("member can self:leave", () => {
			expect(hasPermission("member", "self:leave")).toBe(true);
		});

		it("member can self:viewProfile", () => {
			expect(hasPermission("member", "self:viewProfile")).toBe(true);
		});
	});

	describe("invalid role", () => {
		it("unknown role is denied for all permissions", () => {
			for (const perm of ALL_PERMISSIONS) {
				expect(hasPermission("guest", perm)).toBe(false);
			}
		});

		it("empty string role is denied for all permissions", () => {
			for (const perm of ALL_PERMISSIONS) {
				expect(hasPermission("", perm)).toBe(false);
			}
		});
	});

	describe("full matrix: every role x permission combination", () => {
		for (const perm of ALL_PERMISSIONS) {
			for (const role of ALL_ROLES) {
				const expected = (ORG_PERMISSIONS[perm] as readonly string[]).includes(
					role,
				);
				it(`${role} ${expected ? "CAN" : "CANNOT"} ${perm}`, () => {
					expect(hasPermission(role, perm)).toBe(expected);
				});
			}
		}
	});
});

// ---------------------------------------------------------------------------
// requirePermission() — throws on denial
// ---------------------------------------------------------------------------

describe("requirePermission", () => {
	const t = createMockT();

	it("does not throw when role has permission", () => {
		expect(() => requirePermission("owner", "org:delete", t)).not.toThrow();
	});

	it("throws FORBIDDEN when role lacks permission", () => {
		expect(() => requirePermission("admin", "org:delete", t)).toThrow(
			TRPCError,
		);
		try {
			requirePermission("admin", "org:delete", t);
		} catch (err) {
			expect(err).toBeInstanceOf(TRPCError);
			expect((err as TRPCError).code).toBe("FORBIDDEN");
		}
	});

	it("throws FORBIDDEN for member trying to invite", () => {
		expect(() => requirePermission("member", "member:invite", t)).toThrow(
			TRPCError,
		);
	});

	it("throws FORBIDDEN for owner trying to self:leave", () => {
		expect(() => requirePermission("owner", "self:leave", t)).toThrow(
			TRPCError,
		);
	});

	it("includes translated message in error", () => {
		try {
			requirePermission("member", "org:update", t);
		} catch (err) {
			expect((err as TRPCError).message).toBe("errors:organization.notAdmin");
		}
	});

	it("uses notOwner message for owner-only permissions", () => {
		try {
			requirePermission("admin", "org:transfer", t);
		} catch (err) {
			expect((err as TRPCError).message).toBe("errors:organization.notOwner");
		}
	});
});

// ---------------------------------------------------------------------------
// sharedVaultPermissionForOrgRole() — role → shared-vault access mapping
// ---------------------------------------------------------------------------

describe("sharedVaultPermissionForOrgRole", () => {
	it("member gets read-only view", () => {
		expect(sharedVaultPermissionForOrgRole("member")).toBe("view");
	});

	it("admin gets manage (read/write + can re-grant)", () => {
		expect(sharedVaultPermissionForOrgRole("admin")).toBe("manage");
	});

	it("owner gets manage", () => {
		expect(sharedVaultPermissionForOrgRole("owner")).toBe("manage");
	});

	it("only 'member' is read-only; every other role can write", () => {
		for (const role of ALL_ROLES) {
			const perm = sharedVaultPermissionForOrgRole(role);
			if (role === "member") {
				expect(perm).toBe("view");
			} else {
				expect(perm).toBe("manage");
			}
		}
	});

	it("unknown role is treated as non-member (manage) — never silently read-only", () => {
		// A defensive default: an unexpected role should not accidentally hand out
		// read-only when the caller expected write; membership is gated elsewhere.
		expect(sharedVaultPermissionForOrgRole("guest")).toBe("manage");
	});
});
