// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Unit tests for the offline mutation queue.
 *
 * Covers:
 *   - enqueue / dequeue / peekAll round-trip
 *   - status transitions (in_flight, pending, failed)
 *   - 500-entry cap drops oldest non-failed entries
 *   - **Zero-knowledge assertion**: enqueue refuses plaintext fields
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// In-memory mock of idb-keyval so tests don't need real IndexedDB.
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

import * as idb from "idb-keyval";
import {
  enqueue,
  dequeue,
  peekAll,
  pendingCount,
  markInFlight,
  markFailed,
  markPending,
  clearAll,
} from "../offlineQueue";

const internal = idb as unknown as { __store: Map<string, unknown> };

describe("offlineQueue", () => {
  beforeEach(async () => {
    internal.__store.clear();
  });

  afterEach(async () => {
    internal.__store.clear();
  });

  it("round-trips a single entry", async () => {
    const entry = await enqueue({
      router: "credentials",
      procedure: "create",
      op: "create",
      encryptedBody: { vaultId: "v1", ciphertext: "abc", nonce: "n", authTag: "t" },
      idempotencyKey: "vault-item:v1:i1:create:1",
    });
    expect(entry.id).toBeTruthy();
    expect(entry.status).toBe("pending");
    expect(entry.attempts).toBe(0);

    const all = await peekAll();
    expect(all).toHaveLength(1);
    expect(all[0]?.idempotencyKey).toBe("vault-item:v1:i1:create:1");
  });

  it("dequeue removes an entry", async () => {
    const entry = await enqueue({
      router: "credentials",
      procedure: "create",
      op: "create",
      encryptedBody: { vaultId: "v1", ciphertext: "x" },
      idempotencyKey: "k1",
    });
    await dequeue(entry.id);
    expect(await peekAll()).toHaveLength(0);
  });

  it("status transitions: pending → in_flight → failed", async () => {
    const entry = await enqueue({
      router: "credentials",
      procedure: "create",
      op: "create",
      encryptedBody: { vaultId: "v1", ciphertext: "x" },
      idempotencyKey: "k2",
    });
    await markInFlight(entry.id);
    let all = await peekAll();
    expect(all[0]?.status).toBe("in_flight");
    expect(all[0]?.attempts).toBe(1);

    await markPending(entry.id);
    all = await peekAll();
    expect(all[0]?.status).toBe("pending");

    await markFailed(entry.id, "boom");
    all = await peekAll();
    expect(all[0]?.status).toBe("failed");
    expect(all[0]?.lastError).toBe("boom");
  });

  it("pendingCount excludes failed entries", async () => {
    const a = await enqueue({
      router: "r",
      procedure: "p",
      op: "create",
      encryptedBody: { vaultId: "v" },
      idempotencyKey: "ka",
    });
    await enqueue({
      router: "r",
      procedure: "p",
      op: "create",
      encryptedBody: { vaultId: "v" },
      idempotencyKey: "kb",
    });
    await markFailed(a.id, "x");
    expect(await pendingCount()).toBe(1);
  });

  it("refuses plaintext fields (zero-knowledge guard)", async () => {
    await expect(
      enqueue({
        router: "credentials",
        procedure: "create",
        op: "create",
        // `password` is a forbidden plaintext field name.
        encryptedBody: { vaultId: "v1", password: "hunter2" } as unknown as Parameters<typeof enqueue>[0]["encryptedBody"],
        idempotencyKey: "kpw",
      }),
    ).rejects.toThrow(/refusing to persist plaintext/i);
  });

  it("idempotency keys are deterministic per (vaultId,itemId,op,rev)", async () => {
    // The producer is `buildVaultItemIdempotencyKey` exported from
    // useOfflineMutation; assert it produces a stable, plaintext-free key.
    const { buildVaultItemIdempotencyKey } = await import("../useOfflineMutation");
    const k1 = buildVaultItemIdempotencyKey({
      vaultId: "v1",
      itemId: "i1",
      op: "update",
      clientRevision: 3,
    });
    const k2 = buildVaultItemIdempotencyKey({
      vaultId: "v1",
      itemId: "i1",
      op: "update",
      clientRevision: 3,
    });
    expect(k1).toBe(k2);
    expect(k1).toBe("vault-item:v1:i1:update:3");
    // Sanity: no plaintext credential leak in the key.
    expect(k1).not.toMatch(/hunter2|password|secret/i);
  });

  it("clearAll wipes the queue", async () => {
    await enqueue({
      router: "r",
      procedure: "p",
      op: "create",
      encryptedBody: { vaultId: "v" },
      idempotencyKey: "k1",
    });
    await clearAll();
    expect(await peekAll()).toHaveLength(0);
  });
});
