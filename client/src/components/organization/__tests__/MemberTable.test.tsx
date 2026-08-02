// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * MemberTable Component Tests
 *
 * Covers:
 * - Renders member rows with name, email, role badges
 * - Empty state when no members
 * - Action dropdown trigger respects role permissions (owner vs admin vs member)
 * - Owner row has no action trigger
 * - Current user sees "(you)" label
 * - Actions column hidden for regular members
 * - Transfer ownership option: dropdown trigger visible for owner managing non-owners
 *
 * Note: Radix DropdownMenu cannot be reliably opened in jsdom (requires full
 * pointer event pipeline). We verify action triggers exist via class selectors.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemberTable, type OrgMember } from "../MemberTable";

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

const ownerMember = makeMember({
  id: "mem-owner",
  userId: "user-owner",
  role: "owner",
  user: {
    id: "user-owner",
    name: "Owner User",
    email: "owner@example.com",
    image: null,
  },
});

const adminMember = makeMember({
  id: "mem-admin",
  userId: "user-admin",
  role: "admin",
  user: {
    id: "user-admin",
    name: "Admin User",
    email: "admin@example.com",
    image: null,
  },
});

const regularMember = makeMember({
  id: "mem-regular",
  userId: "user-regular",
  role: "member",
  user: {
    id: "user-regular",
    name: "Regular User",
    email: "regular@example.com",
    image: null,
  },
});

const defaultProps = {
  members: [ownerMember, adminMember, regularMember],
  currentUserId: "user-owner",
  isOwner: true,
  isOwnerOrAdmin: true,
  onChangeRole: vi.fn().mockResolvedValue(undefined),
  onRemoveMember: vi.fn().mockResolvedValue(undefined),
  onTransferOwnership: vi.fn().mockResolvedValue(undefined),
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Tests ──────────────────────────────────────────────────────────

describe("MemberTable", () => {
  describe("rendering", () => {
    it("renders all member rows", () => {
      render(<MemberTable {...defaultProps} />);

      expect(screen.getByText("Owner User")).toBeInTheDocument();
      expect(screen.getByText("Admin User")).toBeInTheDocument();
      expect(screen.getByText("Regular User")).toBeInTheDocument();
    });

    it("renders role badges for each member", () => {
      render(<MemberTable {...defaultProps} />);

      expect(screen.getByText("organization:role.owner")).toBeInTheDocument();
      expect(screen.getByText("organization:role.admin")).toBeInTheDocument();
      expect(screen.getByText("organization:role.member")).toBeInTheDocument();
    });

    it("shows (you) label for current user", () => {
      render(<MemberTable {...defaultProps} />);

      expect(
        screen.getByText("(organization:members.you)"),
      ).toBeInTheDocument();
    });

    it("renders table headers", () => {
      render(<MemberTable {...defaultProps} />);

      expect(
        screen.getByText("organization:members.name"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("organization:members.role"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("organization:members.actions"),
      ).toBeInTheDocument();
    });

    it("renders joined date for members", () => {
      render(<MemberTable {...defaultProps} />);

      // All members have same date: 2024-01-15
      const dateCells = screen.getAllByText("1/15/2024");
      expect(dateCells.length).toBe(3);
    });

    it("renders avatar initials", () => {
      render(<MemberTable {...defaultProps} />);

      expect(screen.getByText("O")).toBeInTheDocument(); // Owner User
      expect(screen.getByText("A")).toBeInTheDocument(); // Admin User
      expect(screen.getByText("R")).toBeInTheDocument(); // Regular User
    });
  });

  describe("empty state", () => {
    it("renders empty state when no members", () => {
      render(<MemberTable {...defaultProps} members={[]} />);

      expect(
        screen.getByText("organization:noMembers"),
      ).toBeInTheDocument();
    });

    it("does not render table when empty", () => {
      const { container } = render(
        <MemberTable {...defaultProps} members={[]} />,
      );

      expect(container.querySelector("table")).not.toBeInTheDocument();
    });
  });

  describe("action dropdown triggers", () => {
    // Note: Radix DropdownMenu cannot be reliably opened in jsdom.
    // We verify action triggers exist via button class selectors.

    it("shows action trigger for non-owner, non-self members when user is owner", () => {
      const { container } = render(<MemberTable {...defaultProps} />);

      // Action triggers are h-[44px] w-[44px] ghost buttons
      const actionButtons = Array.from(
        container.querySelectorAll("button"),
      ).filter(
        (btn) =>
          btn.classList.contains("h-\\[44px\\]") ||
          btn.className.includes("h-[44px]"),
      );
      // Admin row + Regular row = 2 action triggers
      expect(actionButtons).toHaveLength(2);
    });

    it("does not show action trigger for owner member row", () => {
      // Owner row should have no dropdown trigger (owner cannot be managed)
      const ownerRow = render(<MemberTable {...defaultProps} />);
      const row = screen.getByText("Owner User").closest("tr");
      expect(row).toBeTruthy();

      // Owner row: the last cell (actions) should be empty
      const cells = row!.querySelectorAll("td");
      const lastCell = cells[cells.length - 1];
      expect(lastCell?.querySelector("button")).toBeNull();
    });

    it("does not show action trigger for current user row", () => {
      render(
        <MemberTable
          {...defaultProps}
          currentUserId="user-admin"
          isOwner={false}
          isOwnerOrAdmin={true}
        />,
      );

      // Admin is current user: their row should not have an action trigger
      const adminRow = screen.getByText("Admin User").closest("tr");
      expect(adminRow).toBeTruthy();
      const cells = adminRow!.querySelectorAll("td");
      const lastCell = cells[cells.length - 1];
      expect(lastCell?.querySelector("button")).toBeNull();
    });

    it("hides actions column entirely when user is a regular member", () => {
      render(
        <MemberTable
          {...defaultProps}
          currentUserId="user-regular"
          isOwner={false}
          isOwnerOrAdmin={false}
        />,
      );

      expect(
        screen.queryByText("organization:members.actions"),
      ).not.toBeInTheDocument();
    });
  });

  describe("action visibility per role", () => {
    it("admin user sees action triggers for regular members only", () => {
      const { container } = render(
        <MemberTable
          {...defaultProps}
          currentUserId="user-admin"
          isOwner={false}
          isOwnerOrAdmin={true}
        />,
      );

      // Only regular member should have action trigger
      // Owner row: no trigger (role is owner)
      // Admin row: no trigger (is current user)
      // Regular row: has trigger
      const actionButtons = Array.from(
        container.querySelectorAll("button"),
      ).filter((btn) => btn.className.includes("h-[44px]"));
      expect(actionButtons).toHaveLength(1);
    });

    it("owner sees action triggers for admin and regular members", () => {
      const { container } = render(<MemberTable {...defaultProps} />);

      const actionButtons = Array.from(
        container.querySelectorAll("button"),
      ).filter((btn) => btn.className.includes("h-[44px]"));
      // Admin + Regular = 2 triggers
      expect(actionButtons).toHaveLength(2);
    });
  });

  describe("(you) label placement", () => {
    it("shows (you) label only for the matching userId", () => {
      render(
        <MemberTable {...defaultProps} currentUserId="user-admin" />,
      );

      // Only Admin User row should show (you)
      const youLabel = screen.getByText("(organization:members.you)");
      const row = youLabel.closest("tr");
      expect(row).toBeTruthy();
      expect(row!.textContent).toContain("Admin User");
    });

    it("does not show (you) label when no user matches", () => {
      render(
        <MemberTable {...defaultProps} currentUserId="user-nonexistent" />,
      );

      expect(
        screen.queryByText("(organization:members.you)"),
      ).not.toBeInTheDocument();
    });
  });
});
