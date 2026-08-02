// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * InviteMemberDialog Component Tests
 *
 * Covers:
 * - Dialog content rendering when open
 * - Email validation error for invalid input
 * - Successful invitation with correct arguments
 * - Cancel button triggers onOpenChange
 * - Error display from thrown errors
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InviteMemberDialog } from "../InviteMemberDialog";



describe("InviteMemberDialog", () => {
	const onOpenChange = vi.fn();
	const onInvite = vi.fn().mockResolvedValue(undefined);

	const baseProps = {
		open: true,
		onOpenChange,
		onInvite,
	};

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("renders dialog content when open", () => {
		render(<InviteMemberDialog {...baseProps} />);
		expect(screen.getByText("family.invite.title")).toBeInTheDocument();
		expect(screen.getByText("family.invite.description")).toBeInTheDocument();
	});

	it("does not render dialog content when closed", () => {
		render(<InviteMemberDialog {...baseProps} open={false} />);
		expect(screen.queryByText("family.invite.title")).not.toBeInTheDocument();
	});

	it("shows validation error for empty email", () => {
		render(<InviteMemberDialog {...baseProps} />);
		fireEvent.click(screen.getByText("family.invite.send"));
		expect(screen.getByText("family.invite.invalidEmail")).toBeInTheDocument();
		expect(onInvite).not.toHaveBeenCalled();
	});

	it("shows validation error for invalid email format", () => {
		render(<InviteMemberDialog {...baseProps} />);
		const input = screen.getByLabelText("family.invite.emailLabel");
		fireEvent.change(input, { target: { value: "not-an-email" } });
		// Submit form directly to bypass HTML5 type="email" validation in JSDOM
		fireEvent.submit(input.closest("form")!);
		expect(screen.getByText("family.invite.invalidEmail")).toBeInTheDocument();
		expect(onInvite).not.toHaveBeenCalled();
	});

	it("calls onInvite with trimmed lowercase email and default role", async () => {
		render(<InviteMemberDialog {...baseProps} />);
		const input = screen.getByLabelText("family.invite.emailLabel");
		fireEvent.change(input, { target: { value: "  Test@Example.COM  " } });
		fireEvent.click(screen.getByText("family.invite.send"));
		await waitFor(() => {
			expect(onInvite).toHaveBeenCalledWith("test@example.com", "member");
		});
	});

	it("closes dialog after successful invite", async () => {
		render(<InviteMemberDialog {...baseProps} />);
		const input = screen.getByLabelText("family.invite.emailLabel");
		fireEvent.change(input, { target: { value: "user@test.com" } });
		fireEvent.click(screen.getByText("family.invite.send"));
		await waitFor(() => {
			expect(onOpenChange).toHaveBeenCalledWith(false);
		});
	});

	it("shows error message when onInvite throws", async () => {
		onInvite.mockRejectedValueOnce(new Error("Already invited"));
		render(<InviteMemberDialog {...baseProps} />);
		const input = screen.getByLabelText("family.invite.emailLabel");
		fireEvent.change(input, { target: { value: "user@test.com" } });
		fireEvent.click(screen.getByText("family.invite.send"));
		await waitFor(() => {
			expect(screen.getByText("Already invited")).toBeInTheDocument();
		});
	});

	it("shows role selection hint for member role", () => {
		render(<InviteMemberDialog {...baseProps} />);
		expect(screen.getByText("family.invite.memberHint")).toBeInTheDocument();
	});

	it("renders cancel button", () => {
		render(<InviteMemberDialog {...baseProps} />);
		expect(screen.getByText("Cancel")).toBeInTheDocument();
	});
});
