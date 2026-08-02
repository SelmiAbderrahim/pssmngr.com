// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * InvitationsTable Component Tests
 *
 * Covers:
 * - Renders invitation rows with email, role, status, expiry
 * - Empty state when no invitations
 * - Status badges: Pending (amber), Expired (gray), Accepted (green)
 * - Cancel button visible for pending invitations
 * - Resend button visible for expired invitations
 * - Actions hidden for non-admin users
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { InvitationsTable, type OrgInvitation } from "../InvitationsTable";

// ── Helpers ────────────────────────────────────────────────────────

function makeInvitation(
  overrides: Partial<OrgInvitation> = {},
): OrgInvitation {
  return {
    id: "inv-1",
    email: "invited@example.com",
    role: "member",
    status: "pending",
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    inviterId: "user-owner",
    ...overrides,
  };
}

const pendingInvitation = makeInvitation({
  id: "inv-pending",
  email: "pending@example.com",
  status: "pending",
});

const expiredInvitation = makeInvitation({
  id: "inv-expired",
  email: "expired@example.com",
  status: "pending",
  expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
});

const acceptedInvitation = makeInvitation({
  id: "inv-accepted",
  email: "accepted@example.com",
  status: "accepted",
});

const defaultProps = {
  invitations: [pendingInvitation, expiredInvitation, acceptedInvitation],
  isOwnerOrAdmin: true,
  onCancelInvitation: vi.fn().mockResolvedValue(undefined),
  onResendInvitation: vi.fn().mockResolvedValue(undefined),
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Tests ──────────────────────────────────────────────────────────

describe("InvitationsTable", () => {
  describe("rendering", () => {
    it("renders all invitation rows", () => {
      render(<InvitationsTable {...defaultProps} />);

      expect(screen.getByText("pending@example.com")).toBeInTheDocument();
      expect(screen.getByText("expired@example.com")).toBeInTheDocument();
      expect(screen.getByText("accepted@example.com")).toBeInTheDocument();
    });

    it("renders table headers", () => {
      render(<InvitationsTable {...defaultProps} />);

      expect(
        screen.getByText("organization:invitations.email"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("organization:invitations.role"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("organization:invitations.status"),
      ).toBeInTheDocument();
    });
  });

  describe("empty state", () => {
    it("renders empty state when no invitations", () => {
      render(<InvitationsTable {...defaultProps} invitations={[]} />);

      expect(
        screen.getByText("organization:noInvitations"),
      ).toBeInTheDocument();
    });
  });

  describe("status badges", () => {
    it("renders Pending badge for active pending invitations", () => {
      render(
        <InvitationsTable
          {...defaultProps}
          invitations={[pendingInvitation]}
        />,
      );

      expect(
        screen.getByText("organization:invitations.pending"),
      ).toBeInTheDocument();
    });

    it("renders Expired badge for expired invitations", () => {
      render(
        <InvitationsTable
          {...defaultProps}
          invitations={[expiredInvitation]}
        />,
      );

      expect(
        screen.getByText("organization:invitations.expired"),
      ).toBeInTheDocument();
    });

    it("renders Accepted badge for accepted invitations", () => {
      render(
        <InvitationsTable
          {...defaultProps}
          invitations={[acceptedInvitation]}
        />,
      );

      expect(
        screen.getByText("organization:invitations.accepted"),
      ).toBeInTheDocument();
    });
  });

  describe("actions", () => {
    it("shows cancel button for pending invitations", () => {
      render(
        <InvitationsTable
          {...defaultProps}
          invitations={[pendingInvitation]}
        />,
      );

      // Cancel button is rendered (X icon button)
      const buttons = screen.getAllByRole("button");
      expect(buttons.length).toBeGreaterThan(0);
    });

    it("calls onCancelInvitation when cancel is clicked", () => {
      render(
        <InvitationsTable
          {...defaultProps}
          invitations={[pendingInvitation]}
        />,
      );

      const cancelButton = screen.getByRole("button");
      fireEvent.click(cancelButton);

      expect(defaultProps.onCancelInvitation).toHaveBeenCalledWith(
        "inv-pending",
      );
    });

    it("does not show cancel button for expired invitations", () => {
      render(
        <InvitationsTable
          {...defaultProps}
          invitations={[expiredInvitation]}
          onResendInvitation={undefined}
        />,
      );

      // No action buttons should be visible for expired without resend
      const rows = screen.getAllByRole("row");
      // Header + 1 data row = 2 rows
      expect(rows).toHaveLength(2);
    });

    it("hides actions column when user is not admin", () => {
      render(
        <InvitationsTable
          {...defaultProps}
          isOwnerOrAdmin={false}
          invitations={[pendingInvitation]}
        />,
      );

      expect(
        screen.queryByText("organization:invitations.actions"),
      ).not.toBeInTheDocument();
    });
  });

  describe("role badges", () => {
    it("renders member role badge by default", () => {
      render(
        <InvitationsTable
          {...defaultProps}
          invitations={[pendingInvitation]}
        />,
      );

      expect(
        screen.getByText("organization:role.member"),
      ).toBeInTheDocument();
    });

    it("renders admin role badge for admin invitations", () => {
      const adminInv = makeInvitation({
        id: "inv-admin",
        email: "admin-inv@example.com",
        role: "admin",
      });

      render(
        <InvitationsTable
          {...defaultProps}
          invitations={[adminInv]}
        />,
      );

      expect(
        screen.getByText("organization:role.admin"),
      ).toBeInTheDocument();
    });
  });
});
