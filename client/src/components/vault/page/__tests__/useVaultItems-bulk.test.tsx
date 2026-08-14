// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * useVaultItems — bulk create tests.
 *
 * Covers the encrypted batch path used by Smart add:
 * sequential 50-item batches, per-user vs shared routing, ciphertext-only
 * payloads, per-item and whole-batch failure mapping, confirmed-save progress,
 * idempotency-key reuse on retry, and a single vault refresh per run.
 *
 * All item data here is synthetic. No real credential appears in any fixture.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import {
  useVaultItems,
  BULK_CREATE_BATCH_SIZE,
  type BulkCreateItem,
  type BulkCreateProgress,
} from "../useVaultItems";
import type { ServerItemRecord } from "@/services/vault-crypto";

const { mockTrpcQuery, mockTrpcMutation, mockVaultCrypto, mockEnqueue } =
  vi.hoisted(() => ({
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
  }));

vi.mock("@/lib/api/trpc", () => ({
  trpcQuery: mockTrpcQuery,
  trpcMutation: mockTrpcMutation,
}));

vi.mock("@/services/vault-crypto", () => ({ vaultCrypto: mockVaultCrypto }));
vi.mock("@/sync/offlineQueue", () => ({ enqueue: mockEnqueue }));
vi.mock("@/sync/useOfflineMutation", () => ({
  buildVaultItemIdempotencyKey: vi.fn(() => "unused"),
}));

const VAULT = {
  id: "v-1",
  name: "Personal",
  kdfSalt: "salt",
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

const SHARED_ACCESS = {
  vaultId: "sv-1",
  key: new Uint8Array(32).fill(7),
  permission: "edit" as const,
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

/** Synthetic plaintext rows. Never a real credential. */
function makeBulkItems(count: number): BulkCreateItem[] {
  return Array.from({ length: count }, (_, i) => ({
    key: `row-${i}`,
    itemType: "login" as const,
    data: {
      title: `Synthetic Item ${i}`,
      username: `user${i}@synthetic.invalid`,
      password: `Synthetic-Pw-${i}`,
    },
  }));
}

const mockEncryptItem = vi.fn(async () => ENVELOPE);
const hookDeps = {
  loadOrBuildIndex: vi.fn(),
  indexAddItem: vi.fn(),
  indexRemoveItem: vi.fn(),
  indexUpdateItem: vi.fn(),
  onBulkDecryptFailure: vi.fn(),
};

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
    ...hookDeps,
    ...overrides,
  };
}

/** Render the hook and wait for its initial vault + item load to settle. */
async function renderLoaded(
  overrides: Partial<Parameters<typeof useVaultItems>[0]> = {},
) {
  const rendered = renderHook(() => useVaultItems(makeArgs(overrides)));
  await waitFor(() => expect(rendered.result.current.vault).not.toBeNull());
  return rendered;
}

function batchCalls(router: string, procedure: string) {
  return mockTrpcMutation.mock.calls.filter(
    (call) => call[0] === router && call[1] === procedure,
  );
}

/**
 * The hook fires unrelated mutations on mount (e.g. `credentials.autoPurge`),
 * so assert on write procedures rather than on the shared mutation spy.
 */
function expectNoItemWrites() {
  const writes = mockTrpcMutation.mock.calls.filter((call) =>
    ["batchCreate", "batchAddItems", "create", "addItem"].includes(
      call[1] as string,
    ),
  );
  expect(writes).toEqual([]);
}

function listQueryCount(router: string, procedure: string) {
  return mockTrpcQuery.mock.calls.filter(
    (call) => call[0] === router && call[1] === procedure,
  ).length;
}

beforeEach(() => {
  vi.clearAllMocks();

  mockTrpcQuery.mockImplementation(async (router: string, procedure: string) => {
    if (router === "vault" && procedure === "list") return [VAULT];
    if (router === "credentials" && procedure === "list")
      return { items: [makeServerItem()], nextCursor: undefined };
    if (router === "credentials" && procedure === "listTrash")
      return { items: [] };
    if (router === "sharedVault" && procedure === "listItems") return [];
    return [];
  });

  mockTrpcMutation.mockImplementation(
    async (_router: string, _procedure: string, input: any) => ({
      created: input.items.length,
    }),
  );

  mockVaultCrypto.decryptServerItem.mockResolvedValue({ title: "Decrypted" });
  mockVaultCrypto.decryptItemWithKey.mockResolvedValue({ title: "Shared" });
  mockVaultCrypto.encryptItemWithKey.mockResolvedValue(ENVELOPE);
  mockEncryptItem.mockResolvedValue(ENVELOPE);
});

describe("handleBulkCreateItems — batching", () => {
  it("splits 125 items into 50/50/25 sequential mutations with one refresh", async () => {
    const { result } = await renderLoaded();
    const listsBefore = listQueryCount("credentials", "list");

    let inFlight = 0;
    let maxInFlight = 0;
    mockTrpcMutation.mockImplementation(async (_r, _p, input: any) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await Promise.resolve();
      inFlight--;
      return { created: input.items.length };
    });

    let outcome!: Awaited<
      ReturnType<typeof result.current.handleBulkCreateItems>
    >;
    await act(async () => {
      outcome = await result.current.handleBulkCreateItems(makeBulkItems(125), {
        operationId: "op-125",
      });
    });

    const calls = batchCalls("credentials", "batchCreate");
    expect(calls.map((call) => call[2].items.length)).toEqual([50, 50, 25]);
    expect(maxInFlight).toBe(1);
    expect(outcome.saved).toHaveLength(125);
    expect(outcome.failed).toEqual([]);
    // Exactly one refresh for the whole run.
    expect(listQueryCount("credentials", "list")).toBe(listsBefore + 1);
  });

  it("keeps the client batch size aligned with the server ceiling", () => {
    expect(BULK_CREATE_BATCH_SIZE).toBe(50);
  });

  it("issues six batches for a 300-item run", async () => {
    const { result } = await renderLoaded();

    await act(async () => {
      await result.current.handleBulkCreateItems(makeBulkItems(300), {
        operationId: "op-300",
      });
    });

    const calls = batchCalls("credentials", "batchCreate");
    expect(calls).toHaveLength(6);
    expect(calls.map((call) => call[2].items.length)).toEqual([
      50, 50, 50, 50, 50, 50,
    ]);
  });

  it("does not call the single-item create path", async () => {
    const { result } = await renderLoaded();

    await act(async () => {
      await result.current.handleBulkCreateItems(makeBulkItems(60), {
        operationId: "op-single",
      });
    });

    expect(batchCalls("credentials", "create")).toHaveLength(0);
  });
});

describe("handleBulkCreateItems — routing and payload", () => {
  it("sends ciphertext envelopes only, with the workspace org id", async () => {
    const { result } = await renderLoaded();

    await act(async () => {
      await result.current.handleBulkCreateItems(makeBulkItems(2), {
        operationId: "op-shape",
      });
    });

    const [call] = batchCalls("credentials", "batchCreate");
    expect(call![2]).toEqual({
      vaultId: "v-1",
      organizationId: "ws-1",
      items: [
        { itemType: "login", ...ENVELOPE },
        { itemType: "login", ...ENVELOPE },
      ],
      idempotencyKey: "bulk-import:op-shape:v-1:0",
    });

    const body = JSON.stringify(mockTrpcMutation.mock.calls);
    for (const secret of [
      "Synthetic Item",
      "synthetic.invalid",
      "Synthetic-Pw",
      "title",
      "username",
      "password",
    ]) {
      expect(body).not.toContain(secret);
    }
  });

  it("routes to sharedVault.batchAddItems and encrypts with the shared key", async () => {
    const { result } = await renderLoaded({ sharedAccess: SHARED_ACCESS });

    await act(async () => {
      await result.current.handleBulkCreateItems(makeBulkItems(51), {
        operationId: "op-shared",
      });
    });

    const calls = batchCalls("sharedVault", "batchAddItems");
    expect(calls.map((call) => call[2].items.length)).toEqual([50, 1]);
    expect(calls[0]![2].vaultId).toBe("sv-1");
    expect(calls[0]![2].idempotencyKey).toBe("bulk-import:op-shared:sv-1:0");
    expect(calls[1]![2].idempotencyKey).toBe("bulk-import:op-shared:sv-1:1");
    expect(batchCalls("credentials", "batchCreate")).toHaveLength(0);
    expect(mockVaultCrypto.encryptItemWithKey).toHaveBeenCalledTimes(51);
    expect(mockEncryptItem).not.toHaveBeenCalled();
    expect(calls[0]![2].organizationId).toBeUndefined();
  });

  it("refuses a read-only shared vault without mutating", async () => {
    const { result } = await renderLoaded({
      sharedAccess: SHARED_ACCESS,
      canMutateItems: false,
    });

    let outcome!: Awaited<
      ReturnType<typeof result.current.handleBulkCreateItems>
    >;
    await act(async () => {
      outcome = await result.current.handleBulkCreateItems(makeBulkItems(3), {
        operationId: "op-readonly",
      });
    });

    expect(outcome.saved).toEqual([]);
    expect(outcome.failed).toEqual(["row-0", "row-1", "row-2"]);
    expectNoItemWrites();
  });

  it("never queues plaintext when the vault is offline", async () => {
    const { result } = await renderLoaded({ vaultIsOnline: false });

    let outcome!: Awaited<
      ReturnType<typeof result.current.handleBulkCreateItems>
    >;
    await act(async () => {
      outcome = await result.current.handleBulkCreateItems(makeBulkItems(3), {
        operationId: "op-offline",
      });
    });

    expect(outcome.saved).toEqual([]);
    expect(outcome.failed).toHaveLength(3);
    expect(mockEnqueue).not.toHaveBeenCalled();
    expectNoItemWrites();
  });

  it("rejects an operation id that could carry a secret", async () => {
    const { result } = await renderLoaded();

    await expect(
      result.current.handleBulkCreateItems(makeBulkItems(1), {
        operationId: "Synthetic-Pw-0 with spaces",
      }),
    ).rejects.toThrow(/operation id/i);
    expectNoItemWrites();
  });
});

describe("handleBulkCreateItems — failures and progress", () => {
  it("maps a per-item encryption failure to its original key", async () => {
    const { result } = await renderLoaded();
    mockEncryptItem.mockImplementation(async (data: Record<string, unknown>) =>
      data.title === "Synthetic Item 1"
        ? Promise.reject(new Error("encrypt failed"))
        : ENVELOPE,
    );

    let outcome!: Awaited<
      ReturnType<typeof result.current.handleBulkCreateItems>
    >;
    await act(async () => {
      outcome = await result.current.handleBulkCreateItems(makeBulkItems(3), {
        operationId: "op-encfail",
      });
    });

    expect(outcome.failed).toEqual(["row-1"]);
    expect(outcome.saved).toEqual(["row-0", "row-2"]);
    const [call] = batchCalls("credentials", "batchCreate");
    expect(call![2].items).toHaveLength(2);
  });

  it("retains only the failed batch when one batch fails", async () => {
    const { result } = await renderLoaded();
    mockTrpcMutation.mockImplementation(async (_r, _p, input: any) =>
      input.idempotencyKey.endsWith(":1")
        ? Promise.reject(new Error("network"))
        : { created: input.items.length },
    );

    let outcome!: Awaited<
      ReturnType<typeof result.current.handleBulkCreateItems>
    >;
    await act(async () => {
      outcome = await result.current.handleBulkCreateItems(makeBulkItems(125), {
        operationId: "op-batchfail",
      });
    });

    expect(outcome.saved).toHaveLength(75);
    expect(outcome.failed).toHaveLength(50);
    expect(outcome.failed[0]).toBe("row-50");
    expect(outcome.failed.at(-1)).toBe("row-99");
  });

  it("counts only server-confirmed saves", async () => {
    const { result } = await renderLoaded();
    mockTrpcMutation.mockResolvedValue({ created: 2 });

    const progress: BulkCreateProgress[] = [];
    let outcome!: Awaited<
      ReturnType<typeof result.current.handleBulkCreateItems>
    >;
    await act(async () => {
      outcome = await result.current.handleBulkCreateItems(makeBulkItems(60), {
        operationId: "op-partial",
        onProgress: (p) => progress.push(p),
      });
    });

    expect(outcome.saved).toHaveLength(4);
    expect(outcome.failed).toHaveLength(56);
    expect(progress).toEqual([
      { saved: 2, total: 60, batch: 1, batches: 2 },
      { saved: 4, total: 60, batch: 2, batches: 2 },
    ]);
  });

  it("reuses the idempotency key when a retry keeps the operation id", async () => {
    const { result } = await renderLoaded();
    mockTrpcMutation.mockImplementation(async (_r, _p, input: any) =>
      input.idempotencyKey.endsWith(":1")
        ? Promise.reject(new Error("network"))
        : { created: input.items.length },
    );

    let first!: Awaited<ReturnType<typeof result.current.handleBulkCreateItems>>;
    await act(async () => {
      first = await result.current.handleBulkCreateItems(makeBulkItems(125), {
        operationId: "op-retry",
      });
    });
    const firstKeys = batchCalls("credentials", "batchCreate").map(
      (call) => call[2].idempotencyKey,
    );
    expect(firstKeys).toEqual([
      "bulk-import:op-retry:v-1:0",
      "bulk-import:op-retry:v-1:1",
      "bulk-import:op-retry:v-1:2",
    ]);

    // Retry only the failed rows, reusing the same operation id.
    mockTrpcMutation.mockClear();
    mockTrpcMutation.mockImplementation(async (_r, _p, input: any) => ({
      created: input.items.length,
    }));
    const retryItems = makeBulkItems(125).filter((item) =>
      first.failed.includes(item.key),
    );

    let retry!: Awaited<ReturnType<typeof result.current.handleBulkCreateItems>>;
    await act(async () => {
      retry = await result.current.handleBulkCreateItems(retryItems, {
        operationId: "op-retry",
      });
    });

    expect(retry.saved).toHaveLength(50);
    expect(retry.failed).toEqual([]);
    const retryKeys = batchCalls("credentials", "batchCreate").map(
      (call) => call[2].idempotencyKey,
    );
    // The retry reuses a key from the same operation, so a batch the server
    // already committed cannot be inserted twice.
    expect(retryKeys).toEqual(["bulk-import:op-retry:v-1:0"]);
  });

  it("does not refresh the vault when nothing was saved", async () => {
    const { result } = await renderLoaded();
    const listsBefore = listQueryCount("credentials", "list");
    mockTrpcMutation.mockRejectedValue(new Error("network"));

    await act(async () => {
      await result.current.handleBulkCreateItems(makeBulkItems(3), {
        operationId: "op-norefresh",
      });
    });

    expect(listQueryCount("credentials", "list")).toBe(listsBefore);
  });

  it("returns immediately for an empty run", async () => {
    const { result } = await renderLoaded();

    let outcome!: Awaited<
      ReturnType<typeof result.current.handleBulkCreateItems>
    >;
    await act(async () => {
      outcome = await result.current.handleBulkCreateItems([], {
        operationId: "op-empty",
      });
    });

    expect(outcome).toEqual({ saved: [], failed: [], failures: [] });
    expectNoItemWrites();
  });
});
