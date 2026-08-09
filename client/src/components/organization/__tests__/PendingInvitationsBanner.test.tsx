// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * PendingInvitationsBanner Component Tests
 *
 * Covers:
 * - Renders nothing when no pending invitations
 * - Renders invitation cards with org name and expiry
 * - Accept button triggers mutation and shows success toast
 * - Decline button triggers mutation and removes invitation
 * - Loading state while mutations are pending
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PendingInvitationsBanner } from "../PendingInvitationsBanner";

// ── Mocks ──────────────────────────────────────────────────────────

const mockTrpcQuery = vi.fn();
const mockTrpcMutation = vi.fn();

vi.mock("@/lib/api/trpc", () => ({
  trpcQuery: (...args: unknown[]) => mockTrpcQuery(...args),
  trpcMutation: (...args: unknown[]) => mockTrpcMutation(...args),
}));

// The banner consumes WorkspaceContext (switchWorkspace/refreshWorkspaces) to
// refresh the workspace list after accepting an invitation. The test renders the
// component without a provider, so stub the context to its used surface.
vi.mock("@/providers/WorkspaceContext", () => ({
  useWorkspaceContext: () => ({
    switchWorkspace: vi.fn(),
    refreshWorkspaces: vi.fn(),
  }),
}));

const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();

vi.mock("sonner", () => ({
  toast: {
    success: (msg: string) => mockToastSuccess(msg),
    error: (msg: string) => mockToastError(msg),
  },
}));

// ── Helpers ────────────────────────────────────────────────────────

interface InvitationOverrides {
  id?: string;
  email?: string;
  role?: "owner" | "admin" | "member" | null;
  status?: string;
  expiresAt?: string;
  organization?: {
    id?: string;
    name?: string;
    logo?: string | null;
  };
}

function makeInvitation(overrides: InvitationOverrides = {}) {
  return {
    id: "inv-1",
    email: "user@example.com",
    role: "member" as const,
    status: "pending",
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    organization: {
      id: "org-1",
      name: "Acme Corp",
      logo: null,
      ...overrides.organization,
    },
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────

describe("PendingInvitationsBanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTrpcMutation.mockResolvedValue(undefined);
  });

  // ── Empty state ──────────────────────────────────────────────────

  it("renders nothing when no pending invitations", async () => {
    mockTrpcQuery.mockResolvedValue([]);
    const { container } = render(<PendingInvitationsBanner />);

    await waitFor(() => {
      expect(
        screen.queryByTestId("pending-invitations-banner"),
      ).not.toBeInTheDocument();
    });
    // Container should be effectively empty
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when query fails", async () => {
    mockTrpcQuery.mockRejectedValue(new Error("Network error"));
    const { container } = render(<PendingInvitationsBanner />);

    await waitFor(() => {
      expect(
        screen.queryByTestId("pending-invitations-banner"),
      ).not.toBeInTheDocument();
    });
    expect(container.innerHTML).toBe("");
  });

  // ── Renders invitations ──────────────────────────────────────────

  it("renders invitation cards with org name and expiry", async () => {
    const inv = makeInvitation({
      organization: { name: "Test Organization" },
    });
    mockTrpcQuery.mockResolvedValue([inv]);

    render(<PendingInvitationsBanner />);

    await waitFor(() => {
      expect(
        screen.getByTestId("pending-invitations-banner"),
      ).toBeInTheDocument();
    });

    // Shows the pending title
    expect(
      screen.getByText("organization:invitation.pendingTitle"),
    ).toBeInTheDocument();

    // Shows the invitation card
    expect(
      screen.getByTestId(`invitation-card-${inv.id}`),
    ).toBeInTheDocument();

    // Shows org name in the pending message (i18n key with interpolation)
    expect(
      screen.getByText("organization:invitation.pendingMessage"),
    ).toBeInTheDocument();

    // Shows expiry
    expect(
      screen.getByText("organization:invitation.expiresAt"),
    ).toBeInTheDocument();
  });

  it("renders multiple invitation cards", async () => {
    const invitations = [
      makeInvitation({ id: "inv-1", organization: { name: "Org A" } }),
      makeInvitation({ id: "inv-2", organization: { name: "Org B" } }),
    ];
    mockTrpcQuery.mockResolvedValue(invitations);

    render(<PendingInvitationsBanner />);

    await waitFor(() => {
      expect(screen.getByTestId("invitation-card-inv-1")).toBeInTheDocument();
      expect(screen.getByTestId("invitation-card-inv-2")).toBeInTheDocument();
    });
  });

  // ── Accept action ────────────────────────────────────────────────

  it("accept button triggers mutation and shows success toast", async () => {
    const inv = makeInvitation();
    mockTrpcQuery.mockResolvedValue([inv]);
    mockTrpcMutation.mockResolvedValue({
      organization: { id: "org-1", name: "Acme Corp", logo: null },
    });

    render(<PendingInvitationsBanner />);

    await waitFor(() => {
      expect(screen.getByTestId(`invitation-card-${inv.id}`)).toBeInTheDocument();
    });

    // Find accept button by aria-label
    const acceptButton = screen.getByRole("button", {
      name: "organization:invitation.accept",
    });
    fireEvent.click(acceptButton);

    await waitFor(() => {
      // Mutation was called with correct args
      expect(mockTrpcMutation).toHaveBeenCalledWith(
        "organization",
        "acceptInvitation",
        { invitationId: inv.id },
      );
    });

    await waitFor(() => {
      // Success toast shown
      expect(mockToastSuccess).toHaveBeenCalledWith(
        "organization:invitation.accepted",
      );
    });

    // Invitation card should be removed
    await waitFor(() => {
      expect(
        screen.queryByTestId(`invitation-card-${inv.id}`),
      ).not.toBeInTheDocument();
    });
  });

  // ── Decline action ───────────────────────────────────────────────

  it("decline button triggers mutation and removes invitation", async () => {
    const inv = makeInvitation();
    mockTrpcQuery.mockResolvedValue([inv]);
    mockTrpcMutation.mockResolvedValue({ success: true });

    render(<PendingInvitationsBanner />);

    await waitFor(() => {
      expect(screen.getByTestId(`invitation-card-${inv.id}`)).toBeInTheDocument();
    });

    const declineButton = screen.getByRole("button", {
      name: "organization:invitation.decline",
    });
    fireEvent.click(declineButton);

    await waitFor(() => {
      expect(mockTrpcMutation).toHaveBeenCalledWith(
        "organization",
        "declineInvitation",
        { invitationId: inv.id },
      );
    });

    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith(
        "organization:invitation.declined",
      );
    });

    // Invitation card removed
    await waitFor(() => {
      expect(
        screen.queryByTestId(`invitation-card-${inv.id}`),
      ).not.toBeInTheDocument();
    });
  });

  // ── Loading state during mutations ───────────────────────────────

  it("shows loading spinner while accepting", async () => {
    const inv = makeInvitation();
    mockTrpcQuery.mockResolvedValue([inv]);
    // Make mutation hang so we can observe loading state
    mockTrpcMutation.mockReturnValue(new Promise(() => {}));

    render(<PendingInvitationsBanner />);

    await waitFor(() => {
      expect(screen.getByTestId(`invitation-card-${inv.id}`)).toBeInTheDocument();
    });

    const acceptButton = screen.getByRole("button", {
      name: "organization:invitation.accept",
    });
    fireEvent.click(acceptButton);

    // Both buttons should be disabled while accepting
    await waitFor(() => {
      const buttons = screen.getAllByRole("button");
      buttons.forEach((btn) => {
        expect(btn).toBeDisabled();
      });
    });

    // Spinner should be visible (svg with animate-spin class)
    const spinners = document.querySelectorAll(".animate-spin");
    expect(spinners.length).toBeGreaterThan(0);
  });

  it("shows loading spinner while declining", async () => {
    const inv = makeInvitation();
    mockTrpcQuery.mockResolvedValue([inv]);
    mockTrpcMutation.mockReturnValue(new Promise(() => {}));

    render(<PendingInvitationsBanner />);

    await waitFor(() => {
      expect(screen.getByTestId(`invitation-card-${inv.id}`)).toBeInTheDocument();
    });

    const declineButton = screen.getByRole("button", {
      name: "organization:invitation.decline",
    });
    fireEvent.click(declineButton);

    await waitFor(() => {
      const buttons = screen.getAllByRole("button");
      buttons.forEach((btn) => {
        expect(btn).toBeDisabled();
      });
    });
  });

  // ── Error handling ───────────────────────────────────────────────

  it("shows error toast when accept fails", async () => {
    const inv = makeInvitation();
    mockTrpcQuery.mockResolvedValue([inv]);
    mockTrpcMutation.mockRejectedValue(new Error("Invitation expired"));

    render(<PendingInvitationsBanner />);

    await waitFor(() => {
      expect(screen.getByTestId(`invitation-card-${inv.id}`)).toBeInTheDocument();
    });

    const acceptButton = screen.getByRole("button", {
      name: "organization:invitation.accept",
    });
    fireEvent.click(acceptButton);

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("Invitation expired");
    });

    // Card should still be visible (not removed on error)
    expect(screen.getByTestId(`invitation-card-${inv.id}`)).toBeInTheDocument();
  });

  it("shows error toast when decline fails", async () => {
    const inv = makeInvitation();
    mockTrpcQuery.mockResolvedValue([inv]);
    mockTrpcMutation.mockRejectedValue(new Error("Network error"));

    render(<PendingInvitationsBanner />);

    await waitFor(() => {
      expect(screen.getByTestId(`invitation-card-${inv.id}`)).toBeInTheDocument();
    });

    const declineButton = screen.getByRole("button", {
      name: "organization:invitation.decline",
    });
    fireEvent.click(declineButton);

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("Network error");
    });

    // Card should still be visible
    expect(screen.getByTestId(`invitation-card-${inv.id}`)).toBeInTheDocument();
  });

  // ── Banner hides after last invitation is handled ────────────────

  it("hides banner after all invitations are accepted", async () => {
    const inv = makeInvitation();
    mockTrpcQuery.mockResolvedValue([inv]);
    mockTrpcMutation.mockResolvedValue({
      organization: { id: "org-1", name: "Acme Corp", logo: null },
    });

    const { container } = render(<PendingInvitationsBanner />);

    await waitFor(() => {
      expect(screen.getByTestId(`invitation-card-${inv.id}`)).toBeInTheDocument();
    });

    const acceptButton = screen.getByRole("button", {
      name: "organization:invitation.accept",
    });
    fireEvent.click(acceptButton);

    await waitFor(() => {
      expect(
        screen.queryByTestId("pending-invitations-banner"),
      ).not.toBeInTheDocument();
    });
    expect(container.innerHTML).toBe("");
  });
});
