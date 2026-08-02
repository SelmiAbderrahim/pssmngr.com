// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * DangerZone Component Tests
 *
 * Covers:
 * - Owner sees transfer ownership and delete organization sections
 * - Non-owner sees leave organization section
 * - Transfer ownership requires member selection
 * - Delete organization requires typing org name
 * - Leave organization confirmation dialog
 * - Owner-only visibility of transfer and delete
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DangerZone } from "../DangerZone";
import type { OrgMember } from "../MemberTable";

// ── Helpers ────────────────────────────────────────────────────────

function makeMember(overrides: Partial<OrgMember> = {}): OrgMember {
  return {
    id: "mem-1",
    userId: "user-1",
    role: "member",
    joinedAt: "2024-01-15T00:00:00.000Z",
    user: {
      id: "user-1",
      name: "Alice Smith",
      email: "alice@example.com",
      image: null,
    },
    ...overrides,
  };
}

const members: OrgMember[] = [
  makeMember({
    id: "mem-owner",
    userId: "user-owner",
    role: "owner",
    user: {
      id: "user-owner",
      name: "Owner User",
      email: "owner@example.com",
      image: null,
    },
  }),
  makeMember({
    id: "mem-admin",
    userId: "user-admin",
    role: "admin",
    user: {
      id: "user-admin",
      name: "Admin User",
      email: "admin@example.com",
      image: null,
    },
  }),
  makeMember({
    id: "mem-regular",
    userId: "user-regular",
    role: "member",
    user: {
      id: "user-regular",
      name: "Regular User",
      email: "regular@example.com",
      image: null,
    },
  }),
];

const defaultOwnerProps = {
  orgName: "Acme Corp",
  orgId: "org-1",
  isOwner: true,
  currentUserId: "user-owner",
  members,
  onTransferOwnership: vi.fn().mockResolvedValue(undefined),
  onDeleteOrganization: vi.fn().mockResolvedValue(undefined),
  onLeaveOrganization: vi.fn().mockResolvedValue(undefined),
};

const defaultMemberProps = {
  ...defaultOwnerProps,
  isOwner: false,
  currentUserId: "user-regular",
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Tests ──────────────────────────────────────────────────────────

describe("DangerZone", () => {
  describe("owner view", () => {
    it("renders danger zone title", () => {
      render(<DangerZone {...defaultOwnerProps} />);

      expect(
        screen.getByText("organization:dangerZone.title"),
      ).toBeInTheDocument();
    });

    it("renders transfer ownership section", () => {
      render(<DangerZone {...defaultOwnerProps} />);

      expect(
        screen.getByText("organization:dangerZone.transferOwnership"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("organization:dangerZone.transferDescription"),
      ).toBeInTheDocument();
    });

    it("renders delete organization section", () => {
      render(<DangerZone {...defaultOwnerProps} />);

      expect(
        screen.getByText("organization:dangerZone.deleteOrg"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("organization:dangerZone.deleteDescription"),
      ).toBeInTheDocument();
    });

    it("does NOT render leave organization section", () => {
      render(<DangerZone {...defaultOwnerProps} />);

      expect(
        screen.queryByText("organization:dangerZone.leaveOrg"),
      ).not.toBeInTheDocument();
    });
  });

  describe("non-owner view", () => {
    it("renders leave organization section", () => {
      render(<DangerZone {...defaultMemberProps} />);

      expect(
        screen.getByText("organization:dangerZone.leaveOrg"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("organization:dangerZone.leaveDescription"),
      ).toBeInTheDocument();
    });

    it("does NOT render transfer ownership section", () => {
      render(<DangerZone {...defaultMemberProps} />);

      expect(
        screen.queryByText("organization:dangerZone.transferOwnership"),
      ).not.toBeInTheDocument();
    });

    it("does NOT render delete organization section", () => {
      render(<DangerZone {...defaultMemberProps} />);

      expect(
        screen.queryByText("organization:dangerZone.deleteOrg"),
      ).not.toBeInTheDocument();
    });
  });

  describe("transfer ownership", () => {
    it("transfer button is disabled when no member is selected", () => {
      render(<DangerZone {...defaultOwnerProps} />);

      const transferButton = screen.getByText(
        "organization:dangerZone.transferButton",
      );
      expect(transferButton).toBeDisabled();
    });
  });

  describe("delete organization", () => {
    it("opens delete confirmation dialog", () => {
      render(<DangerZone {...defaultOwnerProps} />);

      const deleteButton = screen.getByText(
        "organization:dangerZone.deleteButton",
      );
      fireEvent.click(deleteButton);

      expect(
        screen.getByText("organization:dangerZone.deleteConfirmTitle"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("organization:dangerZone.deleteConfirmDescription"),
      ).toBeInTheDocument();
    });

    it("delete confirm button is disabled until org name is typed", () => {
      render(<DangerZone {...defaultOwnerProps} />);

      // Open delete dialog
      const deleteButton = screen.getByText(
        "organization:dangerZone.deleteButton",
      );
      fireEvent.click(deleteButton);

      // Find confirm button in dialog (there are two "Delete Organization" buttons)
      const dialogButtons = screen.getAllByText(
        "organization:dangerZone.deleteButton",
      );
      const confirmButton = dialogButtons[dialogButtons.length - 1];
      expect(confirmButton).toBeDisabled();
    });

    it("enables delete confirm button when org name matches", async () => {
      render(<DangerZone {...defaultOwnerProps} />);

      // Open delete dialog
      const deleteButton = screen.getByText(
        "organization:dangerZone.deleteButton",
      );
      fireEvent.click(deleteButton);

      // Type the org name
      const input = screen.getByPlaceholderText("Acme Corp");
      fireEvent.change(input, { target: { value: "Acme Corp" } });

      // Confirm button should now be enabled
      const dialogButtons = screen.getAllByText(
        "organization:dangerZone.deleteButton",
      );
      const confirmButton = dialogButtons[dialogButtons.length - 1];
      expect(confirmButton).not.toBeDisabled();
    });

    it("calls onDeleteOrganization when confirmed", async () => {
      render(<DangerZone {...defaultOwnerProps} />);

      // Open delete dialog
      const deleteButton = screen.getByText(
        "organization:dangerZone.deleteButton",
      );
      fireEvent.click(deleteButton);

      // Type the org name
      const input = screen.getByPlaceholderText("Acme Corp");
      fireEvent.change(input, { target: { value: "Acme Corp" } });

      // Click confirm
      const dialogButtons = screen.getAllByText(
        "organization:dangerZone.deleteButton",
      );
      const confirmButton = dialogButtons[dialogButtons.length - 1];
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(defaultOwnerProps.onDeleteOrganization).toHaveBeenCalled();
      });
    });

    it("keeps confirm button disabled for a lowercase/partial match (case-sensitive, exact match)", () => {
      render(<DangerZone {...defaultOwnerProps} />);

      const deleteButton = screen.getByText(
        "organization:dangerZone.deleteButton",
      );
      fireEvent.click(deleteButton);

      const input = screen.getByPlaceholderText("Acme Corp");

      const dialogButtons = screen.getAllByText(
        "organization:dangerZone.deleteButton",
      );
      const confirmButton = dialogButtons[dialogButtons.length - 1];

      fireEvent.change(input, { target: { value: "acme corp" } });
      expect(confirmButton).toBeDisabled();

      fireEvent.change(input, { target: { value: "Acme Cor" } });
      expect(confirmButton).toBeDisabled();

      fireEvent.change(input, { target: { value: "Acme Corp " } });
      expect(confirmButton).toBeDisabled();
    });

    it("resets typed confirm text after canceling and reopening the dialog", () => {
      render(<DangerZone {...defaultOwnerProps} />);

      const deleteButton = screen.getByText(
        "organization:dangerZone.deleteButton",
      );
      fireEvent.click(deleteButton);

      const input = screen.getByPlaceholderText("Acme Corp");
      fireEvent.change(input, { target: { value: "Acme Corp" } });

      let dialogButtons = screen.getAllByText(
        "organization:dangerZone.deleteButton",
      );
      expect(dialogButtons[dialogButtons.length - 1]).not.toBeDisabled();

      // Cancel closes the dialog and should reset the typed text
      fireEvent.click(screen.getByText("common:cancel"));

      // Reopen
      fireEvent.click(
        screen.getByText("organization:dangerZone.deleteButton"),
      );

      const reopenedInput = screen.getByPlaceholderText(
        "Acme Corp",
      ) as HTMLInputElement;
      expect(reopenedInput.value).toBe("");

      dialogButtons = screen.getAllByText(
        "organization:dangerZone.deleteButton",
      );
      expect(dialogButtons[dialogButtons.length - 1]).toBeDisabled();
    });

    it("closes the confirmation dialog immediately on click, even before the delete promise resolves", async () => {
      // AlertDialogAction is Radix's DialogPrimitive.Close under the hood, so
      // clicking confirm closes the dialog synchronously regardless of how
      // long the underlying onDeleteOrganization promise takes. The isDeleting
      // spinner therefore never has a chance to be visible in the dialog —
      // this test documents that real behavior rather than an assumed one.
      let resolveDelete!: () => void;
      const pendingDelete = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveDelete = resolve;
          }),
      );

      render(
        <DangerZone
          {...defaultOwnerProps}
          onDeleteOrganization={pendingDelete}
        />,
      );

      fireEvent.click(
        screen.getByText("organization:dangerZone.deleteButton"),
      );
      const input = screen.getByPlaceholderText("Acme Corp");
      fireEvent.change(input, { target: { value: "Acme Corp" } });

      const dialogButtons = screen.getAllByText(
        "organization:dangerZone.deleteButton",
      );
      fireEvent.click(dialogButtons[dialogButtons.length - 1]);

      // Dialog is gone right away — no waitFor needed.
      expect(
        screen.queryByText("organization:dangerZone.deleteConfirmTitle"),
      ).not.toBeInTheDocument();
      expect(pendingDelete).toHaveBeenCalledTimes(1);

      // Resolving later must not throw / re-open anything.
      resolveDelete();
      await waitFor(() => {
        expect(
          screen.queryByText("organization:dangerZone.deleteConfirmTitle"),
        ).not.toBeInTheDocument();
      });
    });

    it("closes the dialog after successful deletion", async () => {
      render(<DangerZone {...defaultOwnerProps} />);

      fireEvent.click(
        screen.getByText("organization:dangerZone.deleteButton"),
      );
      const input = screen.getByPlaceholderText("Acme Corp");
      fireEvent.change(input, { target: { value: "Acme Corp" } });

      const dialogButtons = screen.getAllByText(
        "organization:dangerZone.deleteButton",
      );
      fireEvent.click(dialogButtons[dialogButtons.length - 1]);

      await waitFor(() => {
        expect(
          screen.queryByText("organization:dangerZone.deleteConfirmTitle"),
        ).not.toBeInTheDocument();
      });
    });
  });

  describe("leave organization", () => {
    it("opens leave confirmation dialog", () => {
      render(<DangerZone {...defaultMemberProps} />);

      const leaveButton = screen.getByText(
        "organization:dangerZone.leaveButton",
      );
      fireEvent.click(leaveButton);

      expect(
        screen.getByText("organization:dangerZone.leaveConfirmTitle"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("organization:dangerZone.leaveConfirmDescription"),
      ).toBeInTheDocument();
    });

    it("calls onLeaveOrganization when confirmed", async () => {
      render(<DangerZone {...defaultMemberProps} />);

      // Open leave dialog
      const leaveButton = screen.getByText(
        "organization:dangerZone.leaveButton",
      );
      fireEvent.click(leaveButton);

      // There are two "Leave" texts: the section button and the confirm button
      const leaveButtons = screen.getAllByText(
        "organization:dangerZone.leaveButton",
      );
      const confirmButton = leaveButtons[leaveButtons.length - 1];
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(defaultMemberProps.onLeaveOrganization).toHaveBeenCalled();
      });
    });
  });
});
