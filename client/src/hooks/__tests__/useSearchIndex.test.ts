// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { useSearchIndex } from "../useSearchIndex";

// Use vi.hoisted so mock fns are available inside vi.mock factories
const {
  mockAddItem,
  mockRemoveItem,
  mockSearch,
  mockSerialize,
  mockClear,
  mockDeserialize,
  MockSearchIndex,
  mockExtractSearchableFields,
  mockVaultIsUnlocked,
  mockEncryptBlob,
  mockDecryptBlob,
  mockTrpcQuery,
  mockTrpcMutation,
} = vi.hoisted(() => {
  const mockAddItem = vi.fn();
  const mockRemoveItem = vi.fn();
  const mockSearch = vi.fn().mockReturnValue([]);
  const mockSerialize = vi.fn().mockReturnValue(new Uint8Array([1, 2]));
  const mockClear = vi.fn();

  // Must be a regular function (not an arrow) so it can be invoked with `new`
  // by the source's `new SearchIndex()`; arrow functions are not constructors.
  function createInstance() {
    return {
      addItem: mockAddItem,
      removeItem: mockRemoveItem,
      search: mockSearch,
      serialize: mockSerialize,
      clear: mockClear,
    };
  }

  const MockSearchIndex = vi.fn().mockImplementation(createInstance);
  const mockDeserialize = vi.fn().mockImplementation(createInstance);

  return {
    mockAddItem,
    mockRemoveItem,
    mockSearch,
    mockSerialize,
    mockClear,
    mockDeserialize,
    MockSearchIndex,
    mockExtractSearchableFields: vi.fn().mockReturnValue({ name: "test", url: "example.com" }),
    mockVaultIsUnlocked: vi.fn().mockReturnValue(true),
    mockEncryptBlob: vi.fn().mockResolvedValue("encrypted-blob"),
    mockDecryptBlob: vi.fn().mockResolvedValue(new Uint8Array([10, 20, 30])),
    mockTrpcQuery: vi.fn(),
    mockTrpcMutation: vi.fn(),
  };
});

vi.mock("@/services/search-index", () => ({
  SearchIndex: Object.assign(MockSearchIndex, { deserialize: mockDeserialize }),
  extractSearchableFields: (...args: unknown[]) =>
    mockExtractSearchableFields(...args),
}));

vi.mock("@/services/vault-crypto", () => ({
  vaultCrypto: {
    isUnlocked: () => mockVaultIsUnlocked(),
    encryptBlob: (...args: unknown[]) => mockEncryptBlob(...args),
    decryptBlob: (...args: unknown[]) => mockDecryptBlob(...args),
  },
}));

vi.mock("@/lib/api/trpc", () => ({
  trpcQuery: (...args: unknown[]) => mockTrpcQuery(...args),
  trpcMutation: (...args: unknown[]) => mockTrpcMutation(...args),
}));

describe("useSearchIndex", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVaultIsUnlocked.mockReturnValue(true);
    mockTrpcQuery.mockResolvedValue({ id: "v1", encryptedSearchIndex: null });
    mockTrpcMutation.mockResolvedValue(undefined);
    mockSearch.mockReturnValue([]);
  });

  it("starts with isReady false", () => {
    const { result } = renderHook(() => useSearchIndex("vault-1", true));
    expect(result.current.isReady).toBe(false);
  });

  it("search returns empty array when no index is built", () => {
    const { result } = renderHook(() => useSearchIndex("vault-1", true));
    const hits = result.current.search("test");
    expect(hits).toEqual([]);
  });

  it("addItem does nothing when no index is built", () => {
    const { result } = renderHook(() => useSearchIndex("vault-1", true));
    act(() => {
      result.current.addItem("item-1", { name: "test" });
    });
    expect(mockAddItem).not.toHaveBeenCalled();
  });

  it("removeItem does nothing when no index is built", () => {
    const { result } = renderHook(() => useSearchIndex("vault-1", true));
    act(() => {
      result.current.removeItem("item-1");
    });
    expect(mockRemoveItem).not.toHaveBeenCalled();
  });

  it("updateItem does nothing when no index is built", () => {
    const { result } = renderHook(() => useSearchIndex("vault-1", true));
    act(() => {
      result.current.updateItem("item-1", { name: "updated" });
    });
    expect(mockAddItem).not.toHaveBeenCalled();
  });

  it("clears index when isUnlocked becomes false", () => {
    const { result, rerender } = renderHook(
      ({ isUnlocked }) => useSearchIndex("vault-1", isUnlocked),
      { initialProps: { isUnlocked: true } }
    );

    // Rerender with locked state
    rerender({ isUnlocked: false });
    expect(result.current.isReady).toBe(false);
  });

  it("loadOrBuildIndex builds new index when no saved index exists", async () => {
    mockTrpcQuery.mockResolvedValue({ id: "v1", encryptedSearchIndex: null });

    const { result } = renderHook(() => useSearchIndex("vault-1", true));

    await act(async () => {
      await result.current.loadOrBuildIndex([
        {
          id: "item-1",
          itemType: "login",
          decrypted: { name: "Example", url: "example.com" },
          isFavorite: false,
          deletedAt: null,
          createdAt: "2024-01-01",
          updatedAt: "2024-01-01",
        },
      ]);
    });

    expect(result.current.isReady).toBe(true);
    expect(MockSearchIndex).toHaveBeenCalled();
    expect(mockExtractSearchableFields).toHaveBeenCalledWith({
      name: "Example",
      url: "example.com",
    });
  });

  it("loadOrBuildIndex loads saved index from server", async () => {
    mockTrpcQuery.mockResolvedValue({
      id: "v1",
      encryptedSearchIndex: "saved-blob",
    });
    mockDecryptBlob.mockResolvedValue(new Uint8Array([5, 6, 7]));

    const { result } = renderHook(() => useSearchIndex("vault-1", true));

    await act(async () => {
      await result.current.loadOrBuildIndex([]);
    });

    expect(result.current.isReady).toBe(true);
    expect(mockDecryptBlob).toHaveBeenCalledWith("saved-blob");
    expect(mockDeserialize).toHaveBeenCalledWith(new Uint8Array([5, 6, 7]));
  });

  it("loadOrBuildIndex does nothing when vault is locked", async () => {
    mockVaultIsUnlocked.mockReturnValue(false);

    const { result } = renderHook(() => useSearchIndex("vault-1", false));

    await act(async () => {
      await result.current.loadOrBuildIndex([]);
    });

    expect(result.current.isReady).toBe(false);
    expect(mockTrpcQuery).not.toHaveBeenCalled();
  });

  it("loadOrBuildIndex does nothing when vaultId is null", async () => {
    const { result } = renderHook(() => useSearchIndex(null, true));

    await act(async () => {
      await result.current.loadOrBuildIndex([]);
    });

    expect(result.current.isReady).toBe(false);
    expect(mockTrpcQuery).not.toHaveBeenCalled();
  });

  it("search delegates to index after loadOrBuildIndex", async () => {
    mockTrpcQuery.mockResolvedValue({ id: "v1", encryptedSearchIndex: null });
    mockSearch.mockReturnValue(["item-1", "item-2"]);

    const { result } = renderHook(() => useSearchIndex("vault-1", true));

    await act(async () => {
      await result.current.loadOrBuildIndex([]);
    });

    const hits = result.current.search("example");
    expect(hits).toEqual(["item-1", "item-2"]);
  });
});
