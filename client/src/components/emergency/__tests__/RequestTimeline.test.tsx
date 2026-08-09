// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * RequestTimeline Component Tests
 *
 * Covers:
 * - Loading skeleton state
 * - Empty state (no requests)
 * - Pending request with countdown
 * - Denied request with re-request button
 * - Approved request state
 * - Request again callback
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RequestTimeline } from "../RequestTimeline";
import type { EmergencyAccessRequest } from "@/types/emergency";

// Mock CountdownTimer to avoid interval side-effects
vi.mock("../CountdownTimer", () => ({
  CountdownTimer: ({ expiresAt }: { expiresAt: string; onExpired?: () => void }) => (
    <span data-testid="countdown">{expiresAt}</span>
  ),
}));

function makeRequest(overrides: Partial<EmergencyAccessRequest> = {}): EmergencyAccessRequest {
  return {
    id: "req-1",
    status: "pending",
    waitingPeriodDays: 7,
    requestedAt: "2025-06-01T10:00:00Z",
    expiresAt: "2025-06-08T10:00:00Z",
    deniedAt: null,
    grantedAt: null,
    owner: { id: "u-owner", name: "Vault Owner", email: "owner@test.com", image: null },
    contact: { id: "u-contact", name: "Contact", email: "contact@test.com", image: null },
    ...overrides,
  };
}

describe("RequestTimeline", () => {
  const onRequestAccess = vi.fn().mockResolvedValue(undefined);
  const onRefresh = vi.fn();

  const baseProps = {
    requests: [] as EmergencyAccessRequest[],
    isLoading: false,
    onRequestAccess,
    onRefresh,
  };

  beforeEach(() => vi.clearAllMocks());

  // ── Loading ────────────────────────────────────────────────────────

  it("renders loading skeleton when isLoading", () => {
    render(<RequestTimeline {...baseProps} isLoading />);
    expect(screen.queryByText("timeline.title")).not.toBeInTheDocument();
  });

  // ── Empty state ───────────────────────────────────────────────────

  it("shows empty state when no requests", () => {
    render(<RequestTimeline {...baseProps} />);
    expect(screen.getByText("emergency.timeline.empty")).toBeInTheDocument();
  });

  it("shows title and description in empty state", () => {
    render(<RequestTimeline {...baseProps} />);
    expect(screen.getByText("timeline.title")).toBeInTheDocument();
    expect(screen.getByText("emergency.timeline.description")).toBeInTheDocument();
  });

  // ── Pending request ───────────────────────────────────────────────

  it("renders pending request with owner name", () => {
    render(<RequestTimeline {...baseProps} requests={[makeRequest()]} />);
    expect(screen.getByText("Vault Owner")).toBeInTheDocument();
  });

  it("shows status badge for pending request", () => {
    render(<RequestTimeline {...baseProps} requests={[makeRequest()]} />);
    expect(screen.getByText("emergency.timeline.status.pending")).toBeInTheDocument();
  });

  it("shows countdown timer for pending request", () => {
    render(<RequestTimeline {...baseProps} requests={[makeRequest()]} />);
    expect(screen.getByTestId("countdown")).toBeInTheDocument();
  });

  it("shows waiting hint for pending request", () => {
    render(<RequestTimeline {...baseProps} requests={[makeRequest()]} />);
    expect(screen.getByText("emergency.timeline.waitingHint")).toBeInTheDocument();
  });

  // ── Denied request ────────────────────────────────────────────────

  it("renders denied request with re-request button", () => {
    const denied = makeRequest({ status: "denied" });
    render(<RequestTimeline {...baseProps} requests={[denied]} />);
    expect(screen.getByText("emergency.timeline.status.denied")).toBeInTheDocument();
    expect(screen.getByText("timeline.requestAgain")).toBeInTheDocument();
  });

  it("shows denied hint text", () => {
    const denied = makeRequest({ status: "denied" });
    render(<RequestTimeline {...baseProps} requests={[denied]} />);
    expect(screen.getByText("emergency.timeline.deniedHint")).toBeInTheDocument();
  });

  it("calls onRequestAccess when re-request button clicked", async () => {
    const denied = makeRequest({ status: "denied", owner: { id: "owner-123", name: "Owner", email: "o@t.com", image: null } });
    render(<RequestTimeline {...baseProps} requests={[denied]} />);
    fireEvent.click(screen.getByText("timeline.requestAgain"));
    await waitFor(() => {
      expect(onRequestAccess).toHaveBeenCalledWith("owner-123");
    });
  });

  // ── Approved request ──────────────────────────────────────────────

  it("renders the approved request state", () => {
    const approved = makeRequest({ status: "approved" });
    render(<RequestTimeline {...baseProps} requests={[approved]} />);
    expect(screen.getByText("emergency.timeline.status.approved")).toBeInTheDocument();
  });

  it("shows granted hint text", () => {
    const approved = makeRequest({ status: "approved" });
    render(<RequestTimeline {...baseProps} requests={[approved]} />);
    expect(screen.getByText("emergency.timeline.grantedHint")).toBeInTheDocument();
  });

  // ── Expired request ───────────────────────────────────────────────

  it("renders expired request with status badge", () => {
    const expired = makeRequest({ status: "expired" });
    render(<RequestTimeline {...baseProps} requests={[expired]} />);
    expect(screen.getByText("emergency.timeline.status.expired")).toBeInTheDocument();
  });

  // ── Owner email fallback ──────────────────────────────────────────

  it("shows owner email when name is null", () => {
    const req = makeRequest({
      owner: { id: "u-o", name: null, email: "vault-owner@test.com", image: null },
    });
    render(<RequestTimeline {...baseProps} requests={[req]} />);
    expect(screen.getByText("vault-owner@test.com")).toBeInTheDocument();
  });

  // ── Multiple requests ─────────────────────────────────────────────

  it("renders multiple requests", () => {
    const requests = [
      makeRequest({ id: "r1", status: "pending", owner: { id: "o1", name: "Owner A", email: "a@t.com", image: null } }),
      makeRequest({ id: "r2", status: "approved", owner: { id: "o2", name: "Owner B", email: "b@t.com", image: null } }),
    ];
    render(<RequestTimeline {...baseProps} requests={requests} />);
    expect(screen.getByText("Owner A")).toBeInTheDocument();
    expect(screen.getByText("Owner B")).toBeInTheDocument();
  });

  // ── Expired has no action buttons ───────────────────────────────

  it("does not show action buttons for expired requests", () => {
    const expired = makeRequest({ status: "expired" });
    render(<RequestTimeline {...baseProps} requests={[expired]} />);
    expect(screen.queryByText("timeline.requestAgain")).not.toBeInTheDocument();
    expect(screen.queryByText("timeline.accessVault")).not.toBeInTheDocument();
  });

  // ── Pending has no action buttons (only countdown) ──────────────

  it("does not show action buttons for pending requests", () => {
    render(<RequestTimeline {...baseProps} requests={[makeRequest()]} />);
    expect(screen.queryByText("timeline.requestAgain")).not.toBeInTheDocument();
    expect(screen.queryByText("timeline.accessVault")).not.toBeInTheDocument();
  });

  // ── Request again disables button while loading ─────────────────

  it("disables request again button while request is in progress", async () => {
    let resolveRequest: () => void;
    const slowRequest = vi.fn(() => new Promise<void>((r) => { resolveRequest = r; }));
    const denied = makeRequest({ status: "denied" });
    render(<RequestTimeline {...baseProps} onRequestAccess={slowRequest} requests={[denied]} />);
    fireEvent.click(screen.getByText("timeline.requestAgain"));
    await waitFor(() => {
      expect(slowRequest).toHaveBeenCalled();
    });
    const btn = screen.getByText("timeline.requestAgain").closest("button");
    expect(btn).toBeDisabled();
    resolveRequest!();
  });

  // ── Requested date shown for all statuses ───────────────────────

  it("shows requested date for each request", () => {
    const requests = [
      makeRequest({ id: "r1", status: "pending" }),
      makeRequest({ id: "r2", status: "denied" }),
      makeRequest({ id: "r3", status: "approved" }),
      makeRequest({ id: "r4", status: "expired" }),
    ];
    render(<RequestTimeline {...baseProps} requests={requests} />);
    // All four should show the requested date text
    const dateTexts = screen.getAllByText(/timeline\.requestedOn/);
    expect(dateTexts).toHaveLength(4);
  });
});
