// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { TRPCError } from "@trpc/server";
import type { TFunction } from "i18next";

/**
 * Organization role type matching the DB schema.
 */
export type OrgRole = "owner" | "admin" | "member";

/**
 * Centralized permission matrix for organization operations.
 *
 * Each key is a permission name and the value is an array of roles
 * that are allowed to perform that action.
 */
export const ORG_PERMISSIONS = {
	"org:update": ["owner", "admin"],
	"org:delete": ["owner"],
	"org:transfer": ["owner"],
	"member:invite": ["owner", "admin"],
	"member:remove": ["owner", "admin"],
	"member:updateRole": ["owner"],
	"member:list": ["owner", "admin", "member"],
	"invitation:list": ["owner", "admin", "member"],
	"invitation:cancel": ["owner", "admin"],
	"self:leave": ["admin", "member"],
	"self:viewProfile": ["owner", "admin", "member"],
} as const satisfies Record<string, readonly OrgRole[]>;

export type OrgPermission = keyof typeof ORG_PERMISSIONS;

/**
 * Shared-vault permission level, matching `sharedVaultPermissionEnum`
 * (`view < edit < share < manage`). Only `manage` may grant others access.
 */
export type SharedVaultPermission = "view" | "edit" | "share" | "manage";

/**
 * Map an organization role to the shared-vault permission a member should
 * receive when access is auto-granted from their invite role.
 *
 * - `member` → `view` (read-only)
 * - `admin` / `owner` → `manage` (read/write AND able to re-grant pending
 *   members, so auto-grant isn't bottlenecked on the owner)
 *
 * This is the single source of truth for the role → access mapping; the client
 * mirrors it in `client/src/components/vault/page/utils.ts`.
 */
export function sharedVaultPermissionForOrgRole(
	role: OrgRole | string,
): SharedVaultPermission {
	return role === "member" ? "view" : "manage";
}

/**
 * Check whether a given role has a specific organization permission.
 *
 * @param role - The user's role in the organization
 * @param permission - The permission to check
 * @returns true if the role is allowed, false otherwise
 */
export function hasPermission(
	role: string,
	permission: OrgPermission,
): boolean {
	const allowedRoles = ORG_PERMISSIONS[permission];
	return (allowedRoles as readonly string[]).includes(role);
}

/**
 * Assert that a role has the given permission. Throws FORBIDDEN if not.
 *
 * @param role - The user's role in the organization
 * @param permission - The permission to check
 * @param t - i18n translation function for error messages
 * @throws TRPCError with FORBIDDEN code if the role lacks the permission
 */
export function requirePermission(
	role: string,
	permission: OrgPermission,
	t: TFunction,
): void {
	if (!hasPermission(role, permission)) {
		// Use the most specific error message available
		const messageKey =
			PERMISSION_ERROR_KEYS[permission] ?? "errors:auth.forbidden";
		throw new TRPCError({
			code: "FORBIDDEN",
			message: t(messageKey),
		});
	}
}

/**
 * Map each permission to its most appropriate i18n error key.
 */
const PERMISSION_ERROR_KEYS: Record<OrgPermission, string> = {
	"org:update": "errors:organization.notAdmin",
	"org:delete": "errors:organization.notOwner",
	"org:transfer": "errors:organization.notOwner",
	"member:invite": "errors:organization.notAdmin",
	"member:remove": "errors:organization.notAdmin",
	"member:updateRole": "errors:organization.notOwner",
	"member:list": "errors:organization.notMember",
	"invitation:list": "errors:organization.notMember",
	"invitation:cancel": "errors:organization.notAdmin",
	"self:leave": "errors:organization.cannotLeaveAsOwner",
	"self:viewProfile": "errors:organization.notMember",
};
