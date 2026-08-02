// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Unit tests for the sync worker.
 *
 * Covers:
 *   - flush() replays queued entries
 *   - successful replays are dequeued
 *   - failures bump attempts and eventually mark `failed` after MAX_REPLAY_ATTEMPTS
 *   - flush is re-entrant (concurrent calls return immediately)
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

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

import * as idb from "idb-keyval";
import { flush } from "../syncWorker";
import { enqueue, peekAll } from "../offlineQueue";
import { MAX_REPLAY_ATTEMPTS } from "../types";

const internal = idb as unknown as { __store: Map<string, unknown> };

describe("syncWorker.flush", () => {
  beforeEach(() => {
    internal.__store.clear();
    trpcMutationMock.mockReset();
  });

  it("replays a pending entry and dequeues it on success", async () => {
    trpcMutationMock.mockResolvedValueOnce({ id: "i1" });
    await enqueue({
      router: "credentials",
      procedure: "create",
      op: "create",
      encryptedBody: { vaultId: "v1", ciphertext: "x" },
      idempotencyKey: "k1",
    });

    const result = await flush();
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(0);
    expect(await peekAll()).toHaveLength(0);
    // Idempotency key MUST be attached to the replayed request.
    expect(trpcMutationMock).toHaveBeenCalledWith(
      "credentials",
      "create",
      expect.objectContaining({ idempotencyKey: "k1" }),
    );
  });

  it("marks failed after MAX_REPLAY_ATTEMPTS consecutive errors", async () => {
    trpcMutationMock.mockRejectedValue(new Error("server down"));
    await enqueue({
      router: "credentials",
      procedure: "update",
      op: "update",
      encryptedBody: { itemId: "i1", ciphertext: "y" },
      idempotencyKey: "k-fail",
    });

    // Each flush only re-attempts when elapsed >= cumulative backoff. We
    // simulate the worst case by manually marking attempts to push the
    // entry to MAX_REPLAY_ATTEMPTS - 1 before final flush.
    const all = internal.__store;
    const [id, entry] = Array.from(all.entries())[0] as [
      string,
      Record<string, unknown>,
    ];
    entry.attempts = MAX_REPLAY_ATTEMPTS - 1;
    // Backdate so the cooldown is satisfied.
    entry.createdAt = new Date(0).toISOString();
    all.set(id, entry);

    const result = await flush();
    expect(result.failed).toBe(1);
    const after = await peekAll();
    expect(after[0]?.status).toBe("failed");
  });

  it("is re-entrant — concurrent flushes return immediately", async () => {
    trpcMutationMock.mockImplementation(
      () => new Promise((r) => setTimeout(() => r({ id: "x" }), 20)),
    );
    await enqueue({
      router: "credentials",
      procedure: "create",
      op: "create",
      encryptedBody: { vaultId: "v1", ciphertext: "x" },
      idempotencyKey: "k-concurrent",
    });

    const [a, b] = await Promise.all([flush(), flush()]);
    // Exactly one of them does the work; the re-entrant call returns 0s.
    expect(a.succeeded + b.succeeded).toBe(1);
  });
});
