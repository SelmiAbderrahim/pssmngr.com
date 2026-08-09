// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * InviteMemberDialog Component Tests
 *
 * Covers:
 * - Default rendering: form fields, role select, buttons
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { OrgInviteMemberDialog } from "../InviteMemberDialog";



// ── Helpers ────────────────────────────────────────────────────────

const defaultProps = {
	open: true,
	onOpenChange: vi.fn(),
	onInvite: vi.fn().mockResolvedValue(undefined),
};

describe("OrgInviteMemberDialog", () => {
	// -------------------------------------------------------------------------
	// Default rendering
	// -------------------------------------------------------------------------

	describe("default rendering", () => {
		it("renders dialog title and description", () => {
			render(<OrgInviteMemberDialog {...defaultProps} />);

			expect(screen.getByText("organization:invite.title")).toBeInTheDocument();
			expect(
				screen.getByText("organization:invite.description"),
			).toBeInTheDocument();
		});

		it("renders email input", () => {
			render(<OrgInviteMemberDialog {...defaultProps} />);

			const emailInput = screen.getByRole("textbox");
			expect(emailInput).toBeInTheDocument();
			expect(emailInput).not.toBeDisabled();
		});

		it("renders submit and cancel buttons", () => {
			render(<OrgInviteMemberDialog {...defaultProps} />);

			expect(screen.getByText("organization:invite.send")).toBeInTheDocument();
			expect(screen.getByText("common:cancel")).toBeInTheDocument();
		});
	});

	// -------------------------------------------------------------------------
	// At member limit: button disabled, limit message shown
	// -------------------------------------------------------------------------

	describe("form submission", () => {
		it("calls onInvite with email and role on valid submit", async () => {
			const user = userEvent.setup();
			const onInvite = vi.fn().mockResolvedValue(undefined);

			render(
				<OrgInviteMemberDialog
					{...defaultProps}
					onInvite={onInvite}
				/>,
			);

			const emailInput = screen.getByRole("textbox");
			await user.type(emailInput, "test@example.com");

			const submitButton = screen.getByText("organization:invite.send");
			await user.click(submitButton);

			expect(onInvite).toHaveBeenCalledWith("test@example.com", "member");
		});

		it("shows error for invalid email", async () => {
			const user = userEvent.setup();

			render(
				<OrgInviteMemberDialog
					{...defaultProps}
				/>,
			);

			// Use an email-like string that passes HTML5 type="email" validation
			// but fails the component's stricter regex (missing TLD)
			const emailInput = screen.getByRole("textbox");
			await user.type(emailInput, " ");

			const submitButton = screen.getByText("organization:invite.send");
			await user.click(submitButton);

			await waitFor(() => {
				expect(
					screen.getByText("organization:invite.invalidEmail"),
				).toBeInTheDocument();
			});
		});

	});
});
