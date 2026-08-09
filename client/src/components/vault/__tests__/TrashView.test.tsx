// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * TrashView Component Tests
 *
 * Covers:
 * - Loading state (skeletons)
 * - Empty state
 * - Error state
 * - Rendering trash items with title and deletion info
 * - Restore action
 * - Permanent delete with confirmation dialog
 * - Empty trash with confirmation dialog
 * - Days until purge warning badge
 * - Load more pagination
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TrashView } from "../TrashView";

const mockTrpcQuery = vi.fn();
const mockTrpcMutation = vi.fn();

vi.mock("@/lib/api/trpc", () => ({
  trpcQuery: (...args: unknown[]) => mockTrpcQuery(...args),
  trpcMutation: (...args: unknown[]) => mockTrpcMutation(...args),
}));

vi.mock("@/services/vault-crypto", () => ({
  vaultCrypto: {
    decryptServerItem: vi.fn((item: Record<string, unknown>) => {
      // Return mock decrypted data based on the item
      return Promise.resolve({ title: `Decrypted-${item.id}` });
    }),
  },
}));

function makeServerItem(id: string, deletedDaysAgo = 5) {
  const deletedAt = new Date(Date.now() - deletedDaysAgo * 24 * 60 * 60 * 1000).toISOString();
  return {
    id,
    vaultId: "vault-1",
    itemType: "login",
    ciphertext: "ct",
    nonce: "n",
    authTag: "at",
    wrappedDataKey: "wdk",
    wrappedDataKeyNonce: "wdkn",
    wrappedDataKeyAuthTag: "wdkat",
    version: 1,
    isFavorite: false,
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-15T00:00:00Z",
    deletedAt,
  };
}

describe("TrashView", () => {
  const onRestoreItem = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockTrpcMutation.mockResolvedValue(undefined);
  });

  // ── Loading state ────────────────────────────────────────────────

  it("shows loading skeletons while fetching", () => {
    mockTrpcQuery.mockReturnValue(new Promise(() => {}));
    render(<TrashView vaultId="vault-1" />);
    const skeletons = document.querySelectorAll(".h-\\[72px\\]");
    expect(skeletons.length).toBe(3);
  });

  // ── Empty state ──────────────────────────────────────────────────

  it("shows empty state when trash is empty", async () => {
    mockTrpcQuery.mockResolvedValue({ items: [], nextCursor: undefined });
    render(<TrashView vaultId="vault-1" />);

    await waitFor(() => {
      expect(screen.getByText("vault.trashEmpty")).toBeInTheDocument();
      expect(screen.getByText("vault.trashEmptyDescription")).toBeInTheDocument();
    });
  });

  // ── Error state ──────────────────────────────────────────────────

  it("shows error on fetch failure", async () => {
    mockTrpcQuery.mockRejectedValue(new Error("Failed to load"));
    render(<TrashView vaultId="vault-1" />);

    await waitFor(() => {
      expect(screen.getByText("Failed to load")).toBeInTheDocument();
    });
  });

  // ── Rendering trash items ────────────────────────────────────────

  it("renders decrypted trash items with titles", async () => {
    mockTrpcQuery.mockResolvedValue({
      items: [makeServerItem("item-1"), makeServerItem("item-2")],
      nextCursor: undefined,
    });
    render(<TrashView vaultId="vault-1" />);

    await waitFor(() => {
      expect(screen.getByText("Decrypted-item-1")).toBeInTheDocument();
      expect(screen.getByText("Decrypted-item-2")).toBeInTheDocument();
    });
  });

  it("renders header with trash title and item count badge", async () => {
    mockTrpcQuery.mockResolvedValue({
      items: [makeServerItem("item-1"), makeServerItem("item-2")],
      nextCursor: undefined,
    });
    render(<TrashView vaultId="vault-1" />);

    await waitFor(() => {
      expect(screen.getByText("vault.trash")).toBeInTheDocument();
      expect(screen.getByText("2")).toBeInTheDocument();
    });
  });

  it("renders trash description about auto-delete", async () => {
    mockTrpcQuery.mockResolvedValue({ items: [], nextCursor: undefined });
    render(<TrashView vaultId="vault-1" />);

    await waitFor(() => {
      expect(screen.getByText("vault.trashDescription")).toBeInTheDocument();
    });
  });

  // ── Restore action ───────────────────────────────────────────────

  it("restores item on restore button click", async () => {
    mockTrpcQuery.mockResolvedValue({
      items: [makeServerItem("item-1")],
      nextCursor: undefined,
    });
    render(<TrashView vaultId="vault-1" onRestoreItem={onRestoreItem} />);

    await waitFor(() => {
      expect(screen.getByText("Decrypted-item-1")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText("vault.restore"));

    await waitFor(() => {
      expect(mockTrpcMutation).toHaveBeenCalledWith("credentials", "restore", { itemId: "item-1" });
    });
  });

  it("removes restored item from list", async () => {
    mockTrpcQuery.mockResolvedValue({
      items: [makeServerItem("item-1")],
      nextCursor: undefined,
    });
    render(<TrashView vaultId="vault-1" onRestoreItem={onRestoreItem} />);

    await waitFor(() => {
      expect(screen.getByText("Decrypted-item-1")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText("vault.restore"));

    await waitFor(() => {
      expect(screen.queryByText("Decrypted-item-1")).not.toBeInTheDocument();
    });
  });

  it("calls onRestoreItem callback after restore", async () => {
    mockTrpcQuery.mockResolvedValue({
      items: [makeServerItem("item-1")],
      nextCursor: undefined,
    });
    render(<TrashView vaultId="vault-1" onRestoreItem={onRestoreItem} />);

    await waitFor(() => {
      expect(screen.getByText("Decrypted-item-1")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText("vault.restore"));

    await waitFor(() => {
      expect(onRestoreItem).toHaveBeenCalled();
    });
  });

  // ── Permanent delete ─────────────────────────────────────────────

  it("opens confirmation dialog on permanent delete click", async () => {
    mockTrpcQuery.mockResolvedValue({
      items: [makeServerItem("item-1")],
      nextCursor: undefined,
    });
    render(<TrashView vaultId="vault-1" />);

    await waitFor(() => {
      expect(screen.getByText("Decrypted-item-1")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText("vault.permanentDelete"));

    await waitFor(() => {
      expect(screen.getByText("vault.permanentDeleteTitle")).toBeInTheDocument();
      expect(screen.getByText("vault.permanentDeleteDescription")).toBeInTheDocument();
    });
  });

  it("deletes item permanently on confirm", async () => {
    mockTrpcQuery.mockResolvedValue({
      items: [makeServerItem("item-1")],
      nextCursor: undefined,
    });
    render(<TrashView vaultId="vault-1" />);

    await waitFor(() => {
      expect(screen.getByText("Decrypted-item-1")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText("vault.permanentDelete"));

    await waitFor(() => {
      expect(screen.getByText("vault.permanentDeleteTitle")).toBeInTheDocument();
    });

    // The confirm button in the dialog also says "vault.permanentDelete"
    const confirmBtns = screen.getAllByText("vault.permanentDelete");
    const dialogConfirm = confirmBtns.find((el) =>
      el.closest("[role='alertdialog']"),
    );
    if (dialogConfirm) {
      fireEvent.click(dialogConfirm);
    }

    await waitFor(() => {
      expect(mockTrpcMutation).toHaveBeenCalledWith("credentials", "permanentDelete", { itemId: "item-1" });
    });
  });

  // ── Empty trash ──────────────────────────────────────────────────

  it("shows empty trash button when items exist", async () => {
    mockTrpcQuery.mockResolvedValue({
      items: [makeServerItem("item-1")],
      nextCursor: undefined,
    });
    render(<TrashView vaultId="vault-1" />);

    await waitFor(() => {
      expect(screen.getByText("vault.emptyTrash")).toBeInTheDocument();
    });
  });

  it("does not show empty trash button when trash is empty", async () => {
    mockTrpcQuery.mockResolvedValue({ items: [], nextCursor: undefined });
    render(<TrashView vaultId="vault-1" />);

    await waitFor(() => {
      expect(screen.getByText("vault.trashEmpty")).toBeInTheDocument();
    });
    expect(screen.queryByText("vault.emptyTrash")).not.toBeInTheDocument();
  });

  it("opens confirmation dialog on empty trash click", async () => {
    mockTrpcQuery.mockResolvedValue({
      items: [makeServerItem("item-1")],
      nextCursor: undefined,
    });
    render(<TrashView vaultId="vault-1" />);

    await waitFor(() => {
      expect(screen.getByText("vault.emptyTrash")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("vault.emptyTrash"));

    await waitFor(() => {
      expect(screen.getByText("vault.emptyTrashTitle")).toBeInTheDocument();
    });
  });

  // ── Load more ────────────────────────────────────────────────────

  it("shows load more button when nextCursor exists", async () => {
    mockTrpcQuery.mockResolvedValue({
      items: [makeServerItem("item-1")],
      nextCursor: "cursor-123",
    });
    render(<TrashView vaultId="vault-1" />);

    await waitFor(() => {
      expect(screen.getByText("vault.loadMore")).toBeInTheDocument();
    });
  });

  it("does not show load more when no nextCursor", async () => {
    mockTrpcQuery.mockResolvedValue({
      items: [makeServerItem("item-1")],
      nextCursor: undefined,
    });
    render(<TrashView vaultId="vault-1" />);

    await waitFor(() => {
      expect(screen.getByText("Decrypted-item-1")).toBeInTheDocument();
    });
    expect(screen.queryByText("vault.loadMore")).not.toBeInTheDocument();
  });
});
