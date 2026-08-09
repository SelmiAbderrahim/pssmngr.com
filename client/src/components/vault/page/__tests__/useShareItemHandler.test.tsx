// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * useShareItemHandler tests
 *
 * Covers:
 * - early return when the active dialog is not a share dialog
 * - "Item not found" throw when the itemId is not in serverItems
 * - happy path: prepareSharePayload → sharing.shareItem → shares-changed event
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useShareItemHandler } from "../useShareItemHandler";
import type { ServerItemRecord } from "@/services/vault-crypto";
import type { ActiveDialog } from "../types";

const { mockTrpcMutation, mockPrepareSharePayload } = vi.hoisted(() => ({
  mockTrpcMutation: vi.fn(),
  mockPrepareSharePayload: vi.fn(),
}));

vi.mock("@/lib/api/trpc", () => ({
  trpcQuery: vi.fn(),
  trpcMutation: mockTrpcMutation,
}));

// vi.mock also intercepts the hook's dynamic import of this module.
vi.mock("@/services/sharing-crypto", () => ({
  prepareSharePayload: mockPrepareSharePayload,
}));

const ITEM: ServerItemRecord = {
  id: "item-1",
  vaultId: "v-1",
  itemType: "login",
  ciphertext: "ct",
  nonce: "n",
  authTag: "at",
  wrappedDataKey: "wdk",
  wrappedDataKeyNonce: "wdkn",
  wrappedDataKeyAuthTag: "wdka",
  version: 1,
  isFavorite: false,
  deletedAt: null,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

const ENVELOPE = {
  recipientUserId: "recipient-1",
  wrappedKey: "WK",
  wrappedKeyNonce: "WKN",
  wrappedKeyAuthTag: "WKA",
  senderSignature: "SIG",
};

function renderHandler(dialog: ActiveDialog, items: ServerItemRecord[]) {
  return renderHook(() => useShareItemHandler(dialog, items)).result.current;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrepareSharePayload.mockResolvedValue(ENVELOPE);
  mockTrpcMutation.mockResolvedValue({});
});

describe("useShareItemHandler", () => {
  it("returns early when the dialog is not a share dialog", async () => {
    const handler = renderHandler({ kind: "none" }, [ITEM]);

    await expect(handler("r@example.com", "view")).resolves.toBeUndefined();

    expect(mockPrepareSharePayload).not.toHaveBeenCalled();
    expect(mockTrpcMutation).not.toHaveBeenCalled();
  });

  it("throws when the dialog item is not in serverItems", async () => {
    const handler = renderHandler({ kind: "share", itemId: "missing" }, [ITEM]);

    await expect(handler("r@example.com", "view")).rejects.toThrow(
      "Item not found",
    );
    expect(mockTrpcMutation).not.toHaveBeenCalled();
  });

  it("prepares the share payload, calls sharing.shareItem, and emits shares-changed", async () => {
    const eventListener = vi.fn();
    window.addEventListener("pssmngr:shares-changed", eventListener);

    try {
      const handler = renderHandler({ kind: "share", itemId: "item-1" }, [
        ITEM,
      ]);

      await handler("recipient@example.com", "edit");

      expect(mockPrepareSharePayload).toHaveBeenCalledWith(
        "recipient@example.com",
        "wdk",
        "wdkn",
        "wdka",
      );
      expect(mockTrpcMutation).toHaveBeenCalledWith("sharing", "shareItem", {
        itemId: "item-1",
        recipientUserId: "recipient-1",
        wrappedKey: "WK",
        wrappedKeyNonce: "WKN",
        wrappedKeyAuthTag: "WKA",
        senderSignature: "SIG",
        permission: "edit",
      });
      expect(eventListener).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener("pssmngr:shares-changed", eventListener);
    }
  });

  it("does not emit shares-changed when the server mutation fails", async () => {
    const eventListener = vi.fn();
    window.addEventListener("pssmngr:shares-changed", eventListener);

    try {
      mockTrpcMutation.mockRejectedValue(new Error("server down"));
      const handler = renderHandler({ kind: "share", itemId: "item-1" }, [
        ITEM,
      ]);

      await expect(handler("r@example.com", "view")).rejects.toThrow(
        "server down",
      );
      expect(eventListener).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener("pssmngr:shares-changed", eventListener);
    }
  });
});
