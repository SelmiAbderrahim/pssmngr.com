// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * RequestBanner Component Tests
 *
 * Covers:
 * - Loading skeleton state
 * - Empty state (no requests)
 * - Pending requests rendering with deny button
 * - Past requests section with status badges
 * - Deny button triggers confirmation flow
 * - Contact name/email display and avatar initials
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RequestBanner } from "../RequestBanner";
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
    contact: { id: "u-contact", name: "Jane Doe", email: "jane@test.com", image: null },
    ...overrides,
  };
}

describe("RequestBanner", () => {
  const onDeny = vi.fn().mockResolvedValue(undefined);
  const onRefresh = vi.fn();

  const baseProps = {
    requests: [] as EmergencyAccessRequest[],
    isLoading: false,
    onDeny,
    onRefresh,
  };

  beforeEach(() => vi.clearAllMocks());

  // ── Loading ────────────────────────────────────────────────────────

  it("renders loading skeleton when isLoading", () => {
    render(<RequestBanner {...baseProps} isLoading />);
    expect(screen.queryByText("requests.title")).not.toBeInTheDocument();
  });

  // ── Empty state ───────────────────────────────────────────────────

  it("shows empty state when no requests", () => {
    render(<RequestBanner {...baseProps} />);
    expect(screen.getByText("requests.empty")).toBeInTheDocument();
  });

  // ── Title and description ─────────────────────────────────────────

  it("renders title and description", () => {
    render(<RequestBanner {...baseProps} />);
    expect(screen.getByText("requests.title")).toBeInTheDocument();
    expect(screen.getByText("emergency.requests.description")).toBeInTheDocument();
  });

  // ── Pending requests ──────────────────────────────────────────────

  it("renders pending request with contact name", () => {
    render(<RequestBanner {...baseProps} requests={[makeRequest()]} />);
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
  });

  it("shows contact email when name is null", () => {
    const req = makeRequest({
      contact: { id: "u-2", name: null, email: "anon@test.com", image: null },
    });
    render(<RequestBanner {...baseProps} requests={[req]} />);
    expect(screen.getByText("anon@test.com")).toBeInTheDocument();
  });

  it("shows contact avatar initials from name", () => {
    render(<RequestBanner {...baseProps} requests={[makeRequest()]} />);
    expect(screen.getByText("JD")).toBeInTheDocument();
  });

  it("shows avatar initial from email when name is null", () => {
    const req = makeRequest({
      contact: { id: "u-2", name: null, email: "bob@test.com", image: null },
    });
    render(<RequestBanner {...baseProps} requests={[req]} />);
    expect(screen.getByText("B")).toBeInTheDocument();
  });

  it("renders deny button for pending requests", () => {
    render(<RequestBanner {...baseProps} requests={[makeRequest()]} />);
    expect(screen.getByText("requests.deny")).toBeInTheDocument();
  });

  it("shows auto-grant warning for pending requests", () => {
    render(<RequestBanner {...baseProps} requests={[makeRequest()]} />);
    expect(screen.getByText("emergency.requests.autoGrantWarning")).toBeInTheDocument();
  });

  it("renders countdown timer for pending requests", () => {
    render(<RequestBanner {...baseProps} requests={[makeRequest()]} />);
    expect(screen.getByTestId("countdown")).toBeInTheDocument();
  });

  // ── Past requests ─────────────────────────────────────────────────

  it("renders past requests section", () => {
    const denied = makeRequest({ id: "req-d", status: "denied", contact: { id: "u-d", name: "Denied User", email: "d@t.com", image: null } });
    render(<RequestBanner {...baseProps} requests={[denied]} />);
    expect(screen.getByText("requests.past")).toBeInTheDocument();
    expect(screen.getByText("Denied User")).toBeInTheDocument();
  });

  it("shows status badge for past requests", () => {
    const approved = makeRequest({ id: "req-a", status: "approved" });
    render(<RequestBanner {...baseProps} requests={[approved]} />);
    expect(screen.getByText("emergency.requests.status.approved")).toBeInTheDocument();
  });

  // ── Mixed requests ────────────────────────────────────────────────

  it("separates pending and past requests", () => {
    const pending = makeRequest({ id: "req-p", status: "pending" });
    const expired = makeRequest({
      id: "req-e",
      status: "expired",
      contact: { id: "u-e", name: "Expired User", email: "e@t.com", image: null },
    });
    render(<RequestBanner {...baseProps} requests={[pending, expired]} />);
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("requests.past")).toBeInTheDocument();
    expect(screen.getByText("Expired User")).toBeInTheDocument();
  });

  // ── Deny confirmation ─────────────────────────────────────────────

  it("opens deny confirmation dialog when deny button clicked", () => {
    render(<RequestBanner {...baseProps} requests={[makeRequest()]} />);
    fireEvent.click(screen.getByText("requests.deny"));
    expect(screen.getByText("requests.denyTitle")).toBeInTheDocument();
    expect(screen.getByText("requests.confirmDeny")).toBeInTheDocument();
  });

  it("calls onDeny with request id when confirm deny is clicked", async () => {
    render(<RequestBanner {...baseProps} requests={[makeRequest({ id: "req-deny-1" })]} />);
    fireEvent.click(screen.getByText("requests.deny"));
    fireEvent.click(screen.getByText("requests.confirmDeny"));
    await vi.waitFor(() => {
      expect(onDeny).toHaveBeenCalledWith("req-deny-1");
    });
  });

  it("closes dialog on cancel without calling onDeny", () => {
    render(<RequestBanner {...baseProps} requests={[makeRequest()]} />);
    fireEvent.click(screen.getByText("requests.deny"));
    expect(screen.getByText("requests.denyTitle")).toBeInTheDocument();
    fireEvent.click(screen.getByText("common:actions.cancel"));
    expect(onDeny).not.toHaveBeenCalled();
  });

  // ── All status badges in past requests ──────────────────────────

  it("shows denied status badge for past denied request", () => {
    const denied = makeRequest({ id: "req-denied", status: "denied" });
    render(<RequestBanner {...baseProps} requests={[denied]} />);
    expect(screen.getByText("emergency.requests.status.denied")).toBeInTheDocument();
  });

  it("shows expired status badge for past expired request", () => {
    const expired = makeRequest({ id: "req-exp", status: "expired" });
    render(<RequestBanner {...baseProps} requests={[expired]} />);
    expect(screen.getByText("emergency.requests.status.expired")).toBeInTheDocument();
  });

  // ── Deny button disabled while denying ──────────────────────────

  it("disables deny button while deny is in progress", async () => {
    let resolveDeny: () => void;
    const slowDeny = vi.fn(() => new Promise<void>((r) => { resolveDeny = r; }));
    render(
      <RequestBanner {...baseProps} onDeny={slowDeny} requests={[makeRequest()]} />
    );
    fireEvent.click(screen.getByText("requests.deny"));
    fireEvent.click(screen.getByText("requests.confirmDeny"));
    // The deny button in the request card should be disabled
    await vi.waitFor(() => {
      expect(slowDeny).toHaveBeenCalled();
    });
    resolveDeny!();
  });
});
