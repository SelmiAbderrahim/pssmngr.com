// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SharingCenter } from "../SharingCenter";
import type { ShareRecord } from "@/types/sharing";

const { mockTrpcQuery, mockTrpcMutation } = vi.hoisted(() => ({
  mockTrpcQuery: vi.fn(),
  mockTrpcMutation: vi.fn(),
}));

vi.mock("@/lib/api/trpc", () => ({
  trpcQuery: mockTrpcQuery,
  trpcMutation: mockTrpcMutation,
}));

function received(id: string, overrides: Partial<ShareRecord> = {}): ShareRecord {
  return {
    id,
    itemId: `item-${id}`,
    itemType: "login",
    itemTitle: `Item ${id}`,
    senderName: "Alice",
    senderEmail: "alice@example.test",
    recipientName: "Me",
    recipientEmail: "me@example.test",
    permission: "view",
    status: "pending",
    createdAt: new Date().toISOString(),
    ...overrides,
  } as ShareRecord;
}

function sent(id: string, overrides: Partial<ShareRecord> = {}): ShareRecord {
  return received(id, { status: "accepted", ...overrides });
}

describe("SharingCenter", () => {
  beforeEach(() => {
    mockTrpcQuery.mockReset();
    mockTrpcMutation.mockReset();
    mockTrpcMutation.mockResolvedValue({});
  });

  it("renders received + sent lists once fetches resolve", async () => {
    mockTrpcQuery.mockImplementation((_router: string, proc: string) => {
      if (proc === "listReceivedShares") return Promise.resolve([received("r1")]);
      if (proc === "listSentShares") return Promise.resolve([sent("s1")]);
      return Promise.resolve([]);
    });
    render(<SharingCenter />);
    await waitFor(() => expect(screen.getByText("Item r1")).toBeInTheDocument());
    expect(screen.getByText("Item s1")).toBeInTheDocument();
  });

  it("accept flow calls sharing.acceptShare", async () => {
    mockTrpcQuery.mockImplementation((_r: string, proc: string) =>
      proc === "listReceivedShares"
        ? Promise.resolve([received("r1")])
        : Promise.resolve([]),
    );
    render(<SharingCenter />);
    await waitFor(() => expect(screen.getByText("Item r1")).toBeInTheDocument());
    // First non-ghost button in the row is Accept.
    const acceptBtn = screen
      .getAllByRole("button")
      .find((b) => b.textContent?.includes("sharing.accept"));
    if (!acceptBtn) throw new Error("Accept button not found");
    fireEvent.click(acceptBtn);
    await waitFor(() =>
      expect(mockTrpcMutation).toHaveBeenCalledWith("sharing", "acceptShare", { shareId: "r1" }),
    );
  });

  it("decline flow calls sharing.declineShare", async () => {
    mockTrpcQuery.mockImplementation((_r: string, proc: string) =>
      proc === "listReceivedShares"
        ? Promise.resolve([received("r1")])
        : Promise.resolve([]),
    );
    render(<SharingCenter />);
    await waitFor(() => expect(screen.getByText("Item r1")).toBeInTheDocument());
    const declineBtn = screen.getByLabelText(/sharing.decline|Decline/i);
    fireEvent.click(declineBtn);
    await waitFor(() =>
      expect(mockTrpcMutation).toHaveBeenCalledWith("sharing", "declineShare", { shareId: "r1" }),
    );
  });

  it("revoke flow calls sharing.revokeShare after confirming", async () => {
    mockTrpcQuery.mockImplementation((_r: string, proc: string) =>
      proc === "listSentShares"
        ? Promise.resolve([sent("s1", { status: "accepted" })])
        : Promise.resolve([]),
    );
    render(<SharingCenter />);
    await waitFor(() => expect(screen.getByText("Item s1")).toBeInTheDocument());
    const revoke = screen
      .getAllByRole("button")
      .find((b) => b.textContent?.includes("sharing.revoke"));
    if (!revoke) throw new Error("Revoke button not found");
    fireEvent.click(revoke);
    const confirm = await screen.findByRole("button", {
      name: /sharing\.revokeConfirm|Revoke access/i,
    });
    fireEvent.click(confirm);
    await waitFor(() =>
      expect(mockTrpcMutation).toHaveBeenCalledWith("sharing", "revokeShare", { shareId: "s1" }),
    );
  });

  it("shows both empty states when both queries resolve empty", async () => {
    mockTrpcQuery.mockImplementation(() => Promise.resolve([]));
    render(<SharingCenter />);
    await waitFor(() => {
      expect(
        screen.getAllByText(/sharing\.noReceived$|No pending shares/).length,
      ).toBeGreaterThan(0);
    });
    expect(
      screen.getAllByText(/sharing\.noSent$|No shared items/).length,
    ).toBeGreaterThan(0);
  });

  it("renders a destructive alert when a fetch rejects", async () => {
    mockTrpcQuery.mockImplementation((_r: string, proc: string) =>
      proc === "listReceivedShares"
        ? Promise.reject(new Error("nope"))
        : Promise.resolve([]),
    );
    render(<SharingCenter />);
    await waitFor(() =>
      expect(screen.getByText(/nope/)).toBeInTheDocument(),
    );
  });
});
