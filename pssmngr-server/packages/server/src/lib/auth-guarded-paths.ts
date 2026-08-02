// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors

/**
 * Better Auth mutations that must go through the application's guarded APIs.
 *
 * Those APIs enforce capacity locks, ownership invariants, and step-up checks
 * that the generic Better Auth routes do not know about.
 */
export const GUARDED_AUTH_MUTATION_PATHS = [
	"/delete-user",
	"/admin/remove-user",
	// A zero-knowledge vault cannot safely turn an emailed reset token into a
	// new master password. Recovery must happen locally with the Secret Key.
	"/request-password-reset",
	"/reset-password",
	"/change-password",
	"/organization/create",
	"/organization/update",
	"/organization/delete",
	"/organization/invite-member",
	"/organization/accept-invitation",
	"/organization/remove-member",
	"/organization/update-member-role",
	"/organization/leave",
] as const;
