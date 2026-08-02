// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * useVaultItems tests
 *
 * Covers the main data paths of the vault items hook:
 * - vault fetch + credentials list + decrypt (personal happy path)
 * - shared-vault list mapping + decryptItemWithKey
 * - bulk decrypt failure → vaultCrypto.lock() + onBulkDecryptFailure
 * - create: online (credentials.create), offline (offlineQueue enqueue),
 *   shared (sharedVault.addItem), and read-only shared no-op
 * - update: sharedVault.updateItem vs credentials.update
 * - delete: sharedVault.deleteItem vs credentials.softDelete
 * - toggleFavorite payload + local state flip
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useVaultItems } from "../useVaultItems";
import type { ServerItemRecord } from "@/services/vault-crypto";

const {
  mockTrpcQuery,
  mockTrpcMutation,
  mockVaultCrypto,
  mockEnqueue,
  mockBuildKey,
} = vi.hoisted(() => ({
  mockTrpcQuery: vi.fn(),
  mockTrpcMutation: vi.fn(),
  mockVaultCrypto: {
    decryptServerItem: vi.fn(),
    decryptItemWithKey: vi.fn(),
    encryptItemWithKey: vi.fn(),
    createVerificationBlob: vi.fn(),
    lock: vi.fn(),
  },
  mockEnqueue: vi.fn(),
  mockBuildKey: vi.fn(
    (meta: { op: string; itemId: string }) => `idem-${meta.op}-${meta.itemId}`,
  ),
}));

vi.mock("@/lib/api/trpc", () => ({
  trpcQuery: mockTrpcQuery,
  trpcMutation: mockTrpcMutation,
}));

vi.mock("@/services/vault-crypto", () => ({
  vaultCrypto: mockVaultCrypto,
}));

vi.mock("@/sync/offlineQueue", () => ({
  enqueue: mockEnqueue,
}));

vi.mock("@/sync/useOfflineMutation", () => ({
  buildVaultItemIdempotencyKey: mockBuildKey,
}));

const VAULT = {
  id: "v-1",
  name: "Personal",
  kdfSalt: "salt",
  // non-null so the verification-blob backfill branch stays quiet
  encryptedVerificationBlob: "blob",
};

const ENVELOPE = {
  ciphertext: "C",
  nonce: "N",
  authTag: "A",
  wrappedDataKey: "W",
  wrappedDataKeyNonce: "WN",
  wrappedDataKeyAuthTag: "WA",
};

function makeServerItem(id = "item-1"): ServerItemRecord {
  return {
    id,
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
    updatedAt: "2026-01-02T00:00:00Z",
  };
}

const SHARED_KEY = new Uint8Array(32).fill(7);
const SHARED_ACCESS = {
  vaultId: "sv-1",
  key: SHARED_KEY,
  permission: "edit" as const,
};

// Mutable fixtures the trpcQuery impl reads per test.
let listItems: ServerItemRecord[] = [];
let sharedListItems: Array<Record<string, unknown>> = [];

const mockEncryptItem = vi.fn(async () => ENVELOPE);
const loadOrBuildIndex = vi.fn();
const indexAddItem = vi.fn();
const indexRemoveItem = vi.fn();
const indexUpdateItem = vi.fn();
const onBulkDecryptFailure = vi.fn();

function makeArgs(
  overrides: Partial<Parameters<typeof useVaultItems>[0]> = {},
): Parameters<typeof useVaultItems>[0] {
  return {
    userId: "u-1",
    activeWorkspaceId: "ws-1",
    isUnlocked: true,
    isPersonalWorkspace: true,
    orgVault: null,
    sharedAccess: null,
    canMutateItems: true,
    vaultIsOnline: true,
    encryptItem: mockEncryptItem,
    loadOrBuildIndex,
    indexAddItem,
    indexRemoveItem,
    indexUpdateItem,
    onBulkDecryptFailure,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  listItems = [makeServerItem()];
  sharedListItems = [];

  mockTrpcQuery.mockImplementation(
    async (router: string, procedure: string) => {
      if (router === "vault" && procedure === "list") return [VAULT];
      if (router === "credentials" && procedure === "list")
        return { items: listItems, nextCursor: undefined };
      if (router === "credentials" && procedure === "listTrash")
        return { items: [] };
      if (router === "sharedVault" && procedure === "listItems")
        return sharedListItems;
      return [];
    },
  );
  mockTrpcMutation.mockImplementation(
    async (router: string, procedure: string) => {
      if (router === "credentials" && procedure === "create")
        return { id: "created-1" };
      return {};
    },
  );
  mockVaultCrypto.decryptServerItem.mockResolvedValue({
    title: "Decrypted One",
    username: "user",
  });
  mockVaultCrypto.decryptItemWithKey.mockResolvedValue({ title: "Shared One" });
  mockVaultCrypto.encryptItemWithKey.mockResolvedValue(ENVELOPE);
  mockEnqueue.mockResolvedValue({});
});

describe("useVaultItems — list + decrypt", () => {
  it("loads the vault, lists credentials, and decrypts items (happy path)", async () => {
    const { result } = renderHook(() => useVaultItems(makeArgs()));

    await waitFor(() => expect(result.current.decryptedItems).toHaveLength(1));

    // Vault list must be scoped to the active workspace org, not the
    // ambient session (prevents the wrong-org "vault not found" 404 on write).
    expect(mockTrpcQuery).toHaveBeenCalledWith("vault", "list", {
      organizationId: "ws-1",
    });
    expect(mockTrpcQuery).toHaveBeenCalledWith("credentials", "list", {
      vaultId: "v-1",
      limit: 50,
      organizationId: "ws-1",
    });
    expect(mockVaultCrypto.decryptServerItem).toHaveBeenCalledWith(
      expect.objectContaining({ id: "item-1" }),
    );
    expect(mockVaultCrypto.decryptItemWithKey).not.toHaveBeenCalled();
    expect(result.current.vault).toEqual(VAULT);
    expect(result.current.decryptedItems[0]).toMatchObject({
      id: "item-1",
      itemType: "login",
      decrypted: { title: "Decrypted One" },
    });
    expect(result.current.lastSyncedAt).not.toBeNull();
    expect(loadOrBuildIndex).toHaveBeenCalledWith(
      result.current.decryptedItems,
    );
    expect(onBulkDecryptFailure).not.toHaveBeenCalled();
  });

  it("keeps paginated credential reads scoped to the active workspace", async () => {
    const { result } = renderHook(() => useVaultItems(makeArgs()));
    await waitFor(() => expect(result.current.vault).toEqual(VAULT));

    await act(async () => {
      await result.current.fetchItems("v-1", "cursor-1");
    });

    expect(mockTrpcQuery).toHaveBeenLastCalledWith("credentials", "list", {
      vaultId: "v-1",
      limit: 50,
      organizationId: "ws-1",
      cursor: "cursor-1",
    });
  });

  it("lists via sharedVault.listItems and decrypts with the shared key", async () => {
    sharedListItems = [
      {
        id: "si-1",
        itemType: "note",
        ciphertext: "sct",
        nonce: "sn",
        authTag: "sat",
        wrappedDataKey: "swdk",
        wrappedDataKeyNonce: "swdkn",
        wrappedDataKeyAuthTag: "swdka",
        version: 1,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
    ];
    const { result } = renderHook(() =>
      useVaultItems(makeArgs({ sharedAccess: SHARED_ACCESS })),
    );

    await waitFor(() => expect(result.current.decryptedItems).toHaveLength(1));

    expect(mockTrpcQuery).toHaveBeenCalledWith("sharedVault", "listItems", {
      vaultId: "sv-1",
    });
    expect(mockVaultCrypto.decryptItemWithKey).toHaveBeenCalledWith(
      {
        ciphertext: "sct",
        nonce: "sn",
        authTag: "sat",
        wrappedDataKey: "swdk",
        wrappedDataKeyNonce: "swdkn",
        wrappedDataKeyAuthTag: "swdka",
      },
      SHARED_KEY,
    );
    expect(mockVaultCrypto.decryptServerItem).not.toHaveBeenCalled();
    expect(result.current.decryptedItems[0]).toMatchObject({
      id: "si-1",
      itemType: "note",
      isFavorite: false,
      decrypted: { title: "Shared One" },
    });
  });

  it("forces a re-lock via onBulkDecryptFailure when every item fails to decrypt", async () => {
    listItems = [makeServerItem("item-1"), makeServerItem("item-2")];
    mockVaultCrypto.decryptServerItem.mockRejectedValue(new Error("bad key"));

    const { result } = renderHook(() => useVaultItems(makeArgs()));

    await waitFor(() => expect(onBulkDecryptFailure).toHaveBeenCalledTimes(1));
    expect(mockVaultCrypto.lock).toHaveBeenCalled();
    // The hook returns early before publishing the failed results.
    expect(result.current.decryptedItems).toHaveLength(0);
  });
});

describe("useVaultItems — create", () => {
  it("creates online via credentials.create and indexes the new id", async () => {
    const { result } = renderHook(() => useVaultItems(makeArgs()));
    await waitFor(() => expect(result.current.vault).not.toBeNull());

    await act(async () => {
      await result.current.handleCreateItem("login", { title: "New" });
    });

    expect(mockEncryptItem).toHaveBeenCalledWith({ title: "New" });
    // organizationId pins the write to the active workspace so the server
    // scopes vault ownership to the same org the read used.
    expect(mockTrpcMutation).toHaveBeenCalledWith("credentials", "create", {
      vaultId: "v-1",
      itemType: "login",
      organizationId: "ws-1",
      ...ENVELOPE,
    });
    expect(indexAddItem).toHaveBeenCalledWith("created-1", { title: "New" });
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("enqueues offline instead of calling credentials.create when offline", async () => {
    const { result } = renderHook(() =>
      useVaultItems(makeArgs({ vaultIsOnline: false })),
    );
    await waitFor(() => expect(result.current.vault).not.toBeNull());

    await act(async () => {
      await result.current.handleCreateItem("login", { title: "Off" });
    });

    expect(mockEnqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        router: "credentials",
        procedure: "create",
        op: "create",
        encryptedBody: {
          vaultId: "v-1",
          itemType: "login",
          organizationId: "ws-1",
          ...ENVELOPE,
        },
        idempotencyKey: expect.stringMatching(/^idem-create-pending-/),
      }),
    );
    expect(indexAddItem).toHaveBeenCalledWith(
      expect.stringMatching(/^pending-/),
      { title: "Off" },
    );
    expect(mockTrpcMutation).not.toHaveBeenCalledWith(
      "credentials",
      "create",
      expect.anything(),
    );
  });

  it("routes to sharedVault.addItem in shared-vault mode", async () => {
    const { result } = renderHook(() =>
      useVaultItems(makeArgs({ sharedAccess: SHARED_ACCESS })),
    );

    await act(async () => {
      await result.current.handleCreateItem("login", { title: "Team" });
    });

    expect(mockVaultCrypto.encryptItemWithKey).toHaveBeenCalledWith(
      { title: "Team" },
      SHARED_KEY,
    );
    expect(mockTrpcMutation).toHaveBeenCalledWith("sharedVault", "addItem", {
      vaultId: "sv-1",
      itemType: "login",
      ...ENVELOPE,
    });
    // refetches the shared list afterwards
    expect(mockTrpcQuery).toHaveBeenCalledWith("sharedVault", "listItems", {
      vaultId: "sv-1",
    });
    expect(mockEncryptItem).not.toHaveBeenCalled();
  });

  it("is a no-op in shared-vault mode without mutate permission", async () => {
    const { result } = renderHook(() =>
      useVaultItems(
        makeArgs({ sharedAccess: SHARED_ACCESS, canMutateItems: false }),
      ),
    );

    await act(async () => {
      await result.current.handleCreateItem("login", { title: "Nope" });
    });

    expect(mockTrpcMutation).not.toHaveBeenCalledWith(
      "sharedVault",
      "addItem",
      expect.anything(),
    );
    expect(mockVaultCrypto.encryptItemWithKey).not.toHaveBeenCalled();
  });
});

describe("useVaultItems — complete duplicate-check snapshot", () => {
  it("loads every active personal-vault page and decrypts it client-side", async () => {
    mockTrpcQuery.mockImplementation(
      async (
        router: string,
        procedure: string,
        input?: Record<string, unknown>,
      ) => {
        if (router === "vault" && procedure === "list") return [VAULT];
        if (router === "credentials" && procedure === "listTrash")
          return { items: [] };
        if (router === "credentials" && procedure === "list") {
          if (input?.limit === 50) return { items: [], nextCursor: undefined };
          if (!input?.cursor)
            return { items: [makeServerItem("page-1")], nextCursor: "next" };
          return { items: [makeServerItem("page-2")], nextCursor: undefined };
        }
        return [];
      },
    );
    mockVaultCrypto.decryptServerItem.mockImplementation(
      async (record: ServerItemRecord) => ({ title: record.id }),
    );

    const { result } = renderHook(() => useVaultItems(makeArgs()));
    await waitFor(() => expect(result.current.vault).not.toBeNull());

    let allItems: Awaited<
      ReturnType<typeof result.current.getAllDecryptedItems>
    > = [];
    await act(async () => {
      allItems = await result.current.getAllDecryptedItems();
    });

    expect(allItems.map((item) => item.id)).toEqual(["page-1", "page-2"]);
    expect(mockTrpcQuery).toHaveBeenCalledWith("credentials", "list", {
      vaultId: "v-1",
      limit: 100,
      organizationId: "ws-1",
    });
    expect(mockTrpcQuery).toHaveBeenCalledWith("credentials", "list", {
      vaultId: "v-1",
      limit: 100,
      organizationId: "ws-1",
      cursor: "next",
    });
  });
});

describe("useVaultItems — update", () => {
  it("updates via sharedVault.updateItem in shared-vault mode", async () => {
    const { result } = renderHook(() =>
      useVaultItems(makeArgs({ sharedAccess: SHARED_ACCESS })),
    );

    await act(async () => {
      await result.current.handleSaveItem("si-1", { title: "Edited" });
    });

    expect(mockVaultCrypto.encryptItemWithKey).toHaveBeenCalledWith(
      { title: "Edited" },
      SHARED_KEY,
    );
    expect(mockTrpcMutation).toHaveBeenCalledWith("sharedVault", "updateItem", {
      vaultId: "sv-1",
      itemId: "si-1",
      ...ENVELOPE,
    });
  });

  it("updates via credentials.update in personal mode and re-indexes", async () => {
    const { result } = renderHook(() => useVaultItems(makeArgs()));
    await waitFor(() => expect(result.current.vault).not.toBeNull());

    await act(async () => {
      await result.current.handleSaveItem("item-1", { title: "Edited" });
    });

    expect(mockTrpcMutation).toHaveBeenCalledWith("credentials", "update", {
      itemId: "item-1",
      ...ENVELOPE,
    });
    expect(indexUpdateItem).toHaveBeenCalledWith("item-1", { title: "Edited" });
    expect(mockEnqueue).not.toHaveBeenCalled();
  });
});

describe("useVaultItems — delete", () => {
  it("deletes via sharedVault.deleteItem and prunes local state", async () => {
    sharedListItems = [
      {
        id: "si-1",
        itemType: "login",
        ciphertext: "c",
        nonce: "n",
        authTag: "a",
        wrappedDataKey: "w",
        wrappedDataKeyNonce: "wn",
        wrappedDataKeyAuthTag: "wa",
        version: 1,
        createdAt: "2026-01-01",
        updatedAt: "2026-01-01",
      },
    ];
    const { result } = renderHook(() =>
      useVaultItems(makeArgs({ sharedAccess: SHARED_ACCESS })),
    );
    await waitFor(() => expect(result.current.decryptedItems).toHaveLength(1));

    await act(async () => {
      await result.current.handleDeleteItem("si-1");
    });

    expect(mockTrpcMutation).toHaveBeenCalledWith("sharedVault", "deleteItem", {
      vaultId: "sv-1",
      itemId: "si-1",
    });
    expect(result.current.serverItems).toHaveLength(0);
    expect(result.current.decryptedItems).toHaveLength(0);
  });

  it("deletes via credentials.softDelete in personal mode and bumps trash count", async () => {
    const { result } = renderHook(() => useVaultItems(makeArgs()));
    await waitFor(() => expect(result.current.decryptedItems).toHaveLength(1));

    await act(async () => {
      await result.current.handleDeleteItem("item-1");
    });

    expect(mockTrpcMutation).toHaveBeenCalledWith("credentials", "softDelete", {
      itemId: "item-1",
    });
    expect(indexRemoveItem).toHaveBeenCalledWith("item-1");
    expect(result.current.serverItems).toHaveLength(0);
    expect(result.current.trashCount).toBe(1);
  });
});

describe("useVaultItems — toggleFavorite", () => {
  it("calls credentials.toggleFavorite and flips local favorite state", async () => {
    const { result } = renderHook(() => useVaultItems(makeArgs()));
    await waitFor(() => expect(result.current.decryptedItems).toHaveLength(1));

    await act(async () => {
      await result.current.handleToggleFavorite("item-1");
    });

    expect(mockTrpcMutation).toHaveBeenCalledWith(
      "credentials",
      "toggleFavorite",
      { itemId: "item-1" },
    );
    expect(result.current.decryptedItems[0]?.isFavorite).toBe(true);
    expect(result.current.favoriteLoadingId).toBeNull();
  });

  it("is a no-op in shared-vault mode", async () => {
    const { result } = renderHook(() =>
      useVaultItems(makeArgs({ sharedAccess: SHARED_ACCESS })),
    );

    await act(async () => {
      await result.current.handleToggleFavorite("si-1");
    });

    expect(mockTrpcMutation).not.toHaveBeenCalledWith(
      "credentials",
      "toggleFavorite",
      expect.anything(),
    );
  });
});
