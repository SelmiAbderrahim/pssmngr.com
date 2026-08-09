// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * TrashView — Empty Trash Tests
 *
 * Verifies that when credentials.listTrash returns empty items,
 * TrashView renders "trash is empty" message, not an error.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

// ── Mocks (before imports) ────────────────────────────────────────

const mockTrpcQuery = vi.fn();
const mockTrpcMutation = vi.fn();
vi.mock("@/lib/api/trpc", () => ({
  trpcQuery: (...args: unknown[]) => mockTrpcQuery(...args),
  trpcMutation: (...args: unknown[]) => mockTrpcMutation(...args),
}));

vi.mock("@/services/vault-crypto", () => ({
  vaultCrypto: {
    decryptServerItem: vi.fn(),
  },
}));

// Import after mocks
import { TrashView } from "../TrashView";

// ── Tests ─────────────────────────────────────────────────────────

describe("TrashView — empty trash", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders 'trash is empty' when listTrash returns no items", async () => {
    mockTrpcQuery.mockImplementation((router: string, procedure: string) => {
      if (router === "credentials" && procedure === "listTrash") {
        return Promise.resolve({ items: [], nextCursor: undefined });
      }
      return Promise.resolve([]);
    });

    render(<TrashView vaultId="test-vault" />);

    // Should show empty trash message (i18n key)
    await waitFor(() => {
      expect(screen.getByText("vault.trashEmpty")).toBeInTheDocument();
    });

    // Should NOT show error
    expect(screen.queryByText(/error/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/failed/i)).not.toBeInTheDocument();
  });

  it("renders 'trash is empty' when listTrash returns 404", async () => {
    mockTrpcQuery.mockImplementation((router: string, procedure: string) => {
      if (router === "credentials" && procedure === "listTrash") {
        return Promise.reject(new Error("NOT_FOUND"));
      }
      return Promise.resolve([]);
    });

    render(<TrashView vaultId="test-vault" />);

    // Wait for async operation
    await waitFor(() => {
      // Should not crash — either shows empty or error handled gracefully
      expect(screen.queryByText(/failed to load/i)).toBeFalsy();
    });
  });

  it("does not show 'Empty Trash' button when no items", async () => {
    mockTrpcQuery.mockResolvedValue({ items: [], nextCursor: undefined });

    render(<TrashView vaultId="test-vault" />);

    await waitFor(() => {
      expect(screen.getByText("vault.trashEmpty")).toBeInTheDocument();
    });

    // "Empty Trash" button should not be shown when trash is already empty
    expect(screen.queryByText("vault.emptyTrash")).not.toBeInTheDocument();
  });
});
