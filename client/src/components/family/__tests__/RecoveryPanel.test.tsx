// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * RecoveryPanel Component Tests
 *
 * Covers:
 * - Loading skeleton state
 * - Member view: no request → request button
 * - Member view: active request → status display
 * - Member view: approved request hint
 * - Organizer view: empty state
 * - Organizer view: pending/past request sections
 * - Organizer view: approve/reject button rendering
 * - Request recovery callback
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RecoveryPanel } from "../RecoveryPanel";
import type { RecoveryRequest } from "@/types/family";

function makeRequest(overrides: Partial<RecoveryRequest> = {}): RecoveryRequest {
  return {
    id: "req-1",
    requesterId: "u-member",
    requesterEmail: "member@test.com",
    requesterName: "Member User",
    status: "pending",
    requestedAt: "2025-06-01T10:00:00Z",
    expiresAt: "2025-06-08T10:00:00Z",
    ...overrides,
  };
}

describe("RecoveryPanel", () => {
  const onRequestRecovery = vi.fn().mockResolvedValue(undefined);
  const onApproveRecovery = vi.fn().mockResolvedValue(undefined);
  const onRejectRecovery = vi.fn().mockResolvedValue(undefined);

  const baseProps = {
    isOrganizer: false,
    requests: [] as RecoveryRequest[],
    memberRecoveryStatus: null as RecoveryRequest | null,
    isLoading: false,
    onRequestRecovery,
    onApproveRecovery,
    onRejectRecovery,
  };

  beforeEach(() => vi.clearAllMocks());

  // ── Loading ────────────────────────────────────────────────────────

  it("renders loading skeleton when isLoading", () => {
    render(<RecoveryPanel {...baseProps} isLoading />);
    expect(screen.queryByText(/family\.recovery\.title/)).not.toBeInTheDocument();
  });

  // ── Member view ───────────────────────────────────────────────────

  describe("member view", () => {
    it("shows request button when no active recovery", () => {
      render(<RecoveryPanel {...baseProps} />);
      expect(screen.getByText("family.recovery.requestRecovery")).toBeInTheDocument();
      expect(screen.getByText("family.recovery.noActiveRequest")).toBeInTheDocument();
    });

    it("calls onRequestRecovery when request button clicked", async () => {
      render(<RecoveryPanel {...baseProps} />);
      fireEvent.click(screen.getByText("family.recovery.requestRecovery"));
      await waitFor(() => {
        expect(onRequestRecovery).toHaveBeenCalledOnce();
      });
    });

    it("shows status badge for active request", () => {
      const pendingRequest = makeRequest({ status: "pending" });
      render(<RecoveryPanel {...baseProps} memberRecoveryStatus={pendingRequest} />);
      expect(screen.getByText("family.recovery.yourRequest")).toBeInTheDocument();
      expect(screen.getByText("family.recovery.status.pending")).toBeInTheDocument();
      expect(screen.getByText("family.recovery.timeline.trustedContact")).toBeInTheDocument();
      expect(screen.getByText("family.recovery.timeline.waitingPeriod")).toBeInTheDocument();
    });

    it("shows approved hint when status is approved", () => {
      const approvedRequest = makeRequest({ status: "approved" });
      render(<RecoveryPanel {...baseProps} memberRecoveryStatus={approvedRequest} />);
      expect(screen.getByText("family.recovery.approvedHint")).toBeInTheDocument();
    });

    it("shows expiration date when expiresAt is set", () => {
      const request = makeRequest({ expiresAt: "2025-06-08T10:00:00Z" });
      render(<RecoveryPanel {...baseProps} memberRecoveryStatus={request} />);
      expect(screen.getByText(/family\.recovery\.expires/)).toBeInTheDocument();
    });

    it("hides request button when active request exists", () => {
      const request = makeRequest({ status: "pending" });
      render(<RecoveryPanel {...baseProps} memberRecoveryStatus={request} />);
      expect(screen.queryByText("family.recovery.requestRecovery")).not.toBeInTheDocument();
    });
  });

  // ── Organizer view ────────────────────────────────────────────────

  describe("organizer view", () => {
    it("shows empty state when no requests", () => {
      render(<RecoveryPanel {...baseProps} isOrganizer requests={[]} />);
      expect(screen.getByText("family.recovery.noRequests")).toBeInTheDocument();
    });

    it("shows organizer description", () => {
      render(<RecoveryPanel {...baseProps} isOrganizer requests={[]} />);
      expect(screen.getByText("family.recovery.organizerDescription")).toBeInTheDocument();
    });

    it("renders pending requests with approve/reject buttons", () => {
      const pending = makeRequest({ id: "req-p", status: "pending" });
      render(<RecoveryPanel {...baseProps} isOrganizer requests={[pending]} />);
      expect(screen.getByText("family.recovery.activeRequests")).toBeInTheDocument();
      expect(screen.getByText("Member User")).toBeInTheDocument();
      expect(screen.getByText("family.recovery.approve")).toBeInTheDocument();
      expect(screen.getByText("family.recovery.reject")).toBeInTheDocument();
      expect(screen.getByText("family.recovery.timeline.finalAccess")).toBeInTheDocument();
    });

    it("renders past requests section", () => {
      const completed = makeRequest({ id: "req-c", status: "completed" });
      render(<RecoveryPanel {...baseProps} isOrganizer requests={[completed]} />);
      expect(screen.getByText("family.recovery.pastRequests")).toBeInTheDocument();
      expect(screen.getByText("family.recovery.status.completed")).toBeInTheDocument();
    });

    it("shows requester email when name is absent", () => {
      const req = makeRequest({ requesterName: undefined, requesterEmail: "anon@test.com" });
      render(<RecoveryPanel {...baseProps} isOrganizer requests={[req]} />);
      expect(screen.getByText("anon@test.com")).toBeInTheDocument();
    });

    it("separates active and past requests", () => {
      const pending = makeRequest({ id: "req-p", status: "pending" });
      const rejected = makeRequest({ id: "req-r", status: "rejected", requesterName: "Rejected User" });
      render(<RecoveryPanel {...baseProps} isOrganizer requests={[pending, rejected]} />);
      expect(screen.getByText("family.recovery.activeRequests")).toBeInTheDocument();
      expect(screen.getByText("family.recovery.pastRequests")).toBeInTheDocument();
    });

    it("opens approve confirmation and calls onApproveRecovery", async () => {
      const pending = makeRequest({ id: "req-approve", status: "pending" });
      render(<RecoveryPanel {...baseProps} isOrganizer requests={[pending]} />);

      // Click approve button
      fireEvent.click(screen.getByText("family.recovery.approve"));

      // Confirmation dialog should appear
      await waitFor(() => {
        expect(screen.getByText("family.recovery.approveTitle")).toBeInTheDocument();
        expect(screen.getByText("family.recovery.approveDescription")).toBeInTheDocument();
      });

      // Confirm approval
      fireEvent.click(screen.getByText("family.recovery.confirmApprove"));
      await waitFor(() => {
        expect(onApproveRecovery).toHaveBeenCalledWith("req-approve");
      });
    });

    it("opens reject confirmation and calls onRejectRecovery", async () => {
      const pending = makeRequest({ id: "req-reject", status: "pending" });
      render(<RecoveryPanel {...baseProps} isOrganizer requests={[pending]} />);

      // Click reject button
      fireEvent.click(screen.getByText("family.recovery.reject"));

      // Confirmation dialog should appear
      await waitFor(() => {
        expect(screen.getByText("family.recovery.rejectTitle")).toBeInTheDocument();
        expect(screen.getByText("family.recovery.rejectDescription")).toBeInTheDocument();
      });

      // Confirm rejection
      fireEvent.click(screen.getByText("family.recovery.confirmReject"));
      await waitFor(() => {
        expect(onRejectRecovery).toHaveBeenCalledWith("req-reject");
      });
    });

    it("does not show approve/reject for non-pending active requests", () => {
      const approved = makeRequest({ id: "req-a", status: "approved" });
      render(<RecoveryPanel {...baseProps} isOrganizer requests={[approved]} />);
      expect(screen.getByText("family.recovery.status.approved")).toBeInTheDocument();
      expect(screen.queryByText("family.recovery.approve")).not.toBeInTheDocument();
      expect(screen.queryByText("family.recovery.reject")).not.toBeInTheDocument();
    });

    it("shows expiration date on organizer requests", () => {
      const pending = makeRequest({ id: "req-exp", status: "pending", expiresAt: "2025-06-08T10:00:00Z" });
      render(<RecoveryPanel {...baseProps} isOrganizer requests={[pending]} />);
      expect(screen.getByText(/family\.recovery\.expires/)).toBeInTheDocument();
    });
  });
});
