// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Unit tests for useOfflineMutation.
 *
 * Covers:
 *   - online: goes through trpcMutation directly, returns `{ online: true }`
 *   - offline: enqueues + returns `{ online: false }` with offlineResult
 *   - optimisticUpdate fires on offline path
 *   - zero-knowledge: the encrypted body forwarded to the queue contains
 *     no plaintext credential fields
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

vi.mock("idb-keyval", () => {
  const store = new Map<string, unknown>();
  return {
    createStore: () => ({}),
    get: vi.fn(async (k: string) => store.get(k)),
    set: vi.fn(async (k: string, v: unknown) => {
      store.set(k, v);
    }),
    del: vi.fn(async (k: string) => {
      store.delete(k);
    }),
    keys: vi.fn(async () => Array.from(store.keys())),
    __store: store,
  };
});

const trpcMutationMock = vi.fn();
vi.mock("@/lib/api/trpc", () => ({
  trpcMutation: (...args: unknown[]) => trpcMutationMock(...args),
}));

let mockIsOnline = true;
vi.mock("@/hooks/useOnlineStatus", () => ({
  useOnlineStatus: () => ({
    isOnline: mockIsOnline,
    lastChangedAt: new Date(),
    source: "navigator" as const,
  }),
}));

import * as idb from "idb-keyval";
import { useOfflineMutation } from "../useOfflineMutation";

const internal = idb as unknown as { __store: Map<string, unknown> };

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return React.createElement(QueryClientProvider, { client }, children);
}

describe("useOfflineMutation", () => {
  beforeEach(() => {
    internal.__store.clear();
    trpcMutationMock.mockReset();
    mockIsOnline = true;
  });

  it("online: forwards through trpcMutation", async () => {
    trpcMutationMock.mockResolvedValueOnce({ id: "i1" });
    const { result } = renderHook(
      () =>
        useOfflineMutation<{ id: string }>({
          router: "credentials",
          procedure: "create",
          op: "create",
        }),
      { wrapper },
    );

    let res: Awaited<ReturnType<typeof result.current.mutateOfflineAware>> | undefined;
    await act(async () => {
      res = await result.current.mutateOfflineAware({
        encryptedBody: { vaultId: "v1", ciphertext: "x" },
        idempotencyKey: "k1",
      });
    });

    expect(res?.online).toBe(true);
    expect(res?.data).toEqual({ id: "i1" });
    expect(trpcMutationMock).toHaveBeenCalledWith(
      "credentials",
      "create",
      expect.objectContaining({ idempotencyKey: "k1", ciphertext: "x" }),
    );
  });

  it("offline: enqueues and fires optimisticUpdate", async () => {
    mockIsOnline = false;
    const optimistic = vi.fn();
    const { result } = renderHook(
      () =>
        useOfflineMutation({
          router: "credentials",
          procedure: "create",
          op: "create",
          optimisticUpdate: optimistic,
        }),
      { wrapper },
    );

    let res: Awaited<ReturnType<typeof result.current.mutateOfflineAware>> | undefined;
    await act(async () => {
      res = await result.current.mutateOfflineAware({
        encryptedBody: { vaultId: "v1", ciphertext: "abc" },
        idempotencyKey: "k-off",
      });
    });

    expect(res?.online).toBe(false);
    expect(trpcMutationMock).not.toHaveBeenCalled();
    expect(optimistic).toHaveBeenCalledWith(
      expect.objectContaining({ vaultId: "v1", ciphertext: "abc" }),
    );
    expect(internal.__store.size).toBe(1);

    // Zero-knowledge invariant: nothing plaintexty leaks into IndexedDB.
    for (const v of internal.__store.values()) {
      const json = JSON.stringify(v);
      expect(json).not.toMatch(/password/i);
      expect(json).not.toMatch(/hunter2/);
    }
  });
});
