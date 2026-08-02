// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { describe, expect, it } from "vitest";
import { GUARDED_AUTH_MUTATION_PATHS } from "../auth-guarded-paths";

describe("guarded Better Auth mutations", () => {
	it("keeps security-sensitive HTTP routes disabled", () => {
		expect(new Set(GUARDED_AUTH_MUTATION_PATHS)).toEqual(
			new Set([
				"/delete-user",
				"/admin/remove-user",
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
			]),
		);
		expect(GUARDED_AUTH_MUTATION_PATHS).toHaveLength(
			new Set(GUARDED_AUTH_MUTATION_PATHS).size,
		);
	});
});
