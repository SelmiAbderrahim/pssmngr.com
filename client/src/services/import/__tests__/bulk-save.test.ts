// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Encrypted batch save tests. All item data is synthetic.
 */

import { describe, it, expect, vi } from "vitest";
import {
  BULK_BATCH_SIZE,
  assertValidOperationId,
  buildBulkIdempotencyKey,
  saveEncryptedBatches,
  type BulkSaveEntry,
} from "../bulk-save";

const ENVELOPE = {
  ciphertext: "C",
  nonce: "N",
  authTag: "A",
  wrappedDataKey: "W",
  wrappedDataKeyNonce: "WN",
  wrappedDataKeyAuthTag: "WA",
};

function entries(count: number, batchIndex?: (i: number) => number) {
  return Array.from({ length: count }, (_, i) => ({
    key: `row-${i}`,
    itemType: "login",
    data: { title: `Synthetic ${i}`, password: `Synthetic-Pw-${i}` },
    ...(batchIndex ? { batchIndex: batchIndex(i) } : {}),
  })) satisfies BulkSaveEntry[];
}

function harness(
  submit = vi.fn(async ({ items }: { items: unknown[] }) => ({
    created: items.length,
  })),
) {
  return {
    submit,
    encrypt: vi.fn(async () => ENVELOPE),
    calls: () => submit.mock.calls.map((call) => call[0]),
  };
}

describe("buildBulkIdempotencyKey", () => {
  it("derives keys only from operation, vault, and batch index", () => {
    expect(buildBulkIdempotencyKey("op-1", "v-1", 3)).toBe(
      "bulk-import:op-1:v-1:3",
    );
  });

  it("produces a key the server's format guard accepts", () => {
    const key = buildBulkIdempotencyKey("a".repeat(64), "v".repeat(36), 999);
    expect(key.length).toBeLessThanOrEqual(128);
    expect(key.length).toBeGreaterThanOrEqual(8);
    expect(key).toMatch(/^[a-zA-Z0-9:_.-]+$/);
  });
});

describe("assertValidOperationId", () => {
  it("accepts key-safe tokens and rejects anything else", () => {
    expect(() => assertValidOperationId("import-abc_123")).not.toThrow();
    for (const bad of ["", "has space", "a/b", "x".repeat(65), "sec:ret"]) {
      expect(() => assertValidOperationId(bad)).toThrow(/operation id/i);
    }
  });
});

describe("saveEncryptedBatches", () => {
  it("splits by the server ceiling and submits ciphertext only", async () => {
    const h = harness();
    const result = await saveEncryptedBatches(entries(125), {
      operationId: "op-1",
      vaultId: "v-1",
      encrypt: h.encrypt,
      submit: h.submit,
    });

    expect(h.calls().map((c) => c.items.length)).toEqual([50, 50, 25]);
    expect(h.calls().map((c) => c.idempotencyKey)).toEqual([
      "bulk-import:op-1:v-1:0",
      "bulk-import:op-1:v-1:1",
      "bulk-import:op-1:v-1:2",
    ]);
    expect(result.saved).toHaveLength(125);
    expect(JSON.stringify(h.calls())).not.toContain("Synthetic");
    expect(BULK_BATCH_SIZE).toBe(50);
  });

  it("honours caller-supplied batch indexes on a retry", async () => {
    const h = harness();
    // A retry of the 50 rows that originally formed batch 1.
    await saveEncryptedBatches(entries(50, () => 1), {
      operationId: "op-1",
      vaultId: "v-1",
      encrypt: h.encrypt,
      submit: h.submit,
    });

    expect(h.calls()).toHaveLength(1);
    expect(h.calls()[0]!.idempotencyKey).toBe("bulk-import:op-1:v-1:1");
  });

  it("records the batch index on every failure so a retry can reuse it", async () => {
    const submit = vi.fn(async ({ idempotencyKey, items }: any) =>
      idempotencyKey.endsWith(":1")
        ? Promise.reject(new Error("network"))
        : { created: items.length },
    );
    const h = harness(submit as never);

    const result = await saveEncryptedBatches(entries(125), {
      operationId: "op-1",
      vaultId: "v-1",
      encrypt: h.encrypt,
      submit: h.submit,
    });

    expect(result.failed).toHaveLength(50);
    expect(new Set(result.failures.map((f) => f.batchIndex))).toEqual(
      new Set([1]),
    );
    expect(result.failures.every((f) => f.stage === "save")).toBe(true);
    expect(result.failures.every((f) => f.message === "network")).toBe(true);
  });

  it("maps a per-item encryption failure without dropping the batch", async () => {
    const h = harness();
    h.encrypt.mockImplementation(async (data: Record<string, unknown>) =>
      data.title === "Synthetic 1"
        ? Promise.reject(new Error("Vault is locked"))
        : ENVELOPE,
    );

    const result = await saveEncryptedBatches(entries(3), {
      operationId: "op-1",
      vaultId: "v-1",
      encrypt: h.encrypt,
      submit: h.submit,
    });

    expect(result.saved).toEqual(["row-0", "row-2"]);
    expect(result.failures).toEqual([
      { key: "row-1", batchIndex: 0, stage: "encrypt", message: "Vault is locked" },
    ]);
    expect(h.calls()[0]!.items).toHaveLength(2);
  });

  it("counts only server-confirmed rows", async () => {
    const h = harness(vi.fn(async () => ({ created: 1 })) as never);

    const result = await saveEncryptedBatches(entries(3), {
      operationId: "op-1",
      vaultId: "v-1",
      encrypt: h.encrypt,
      submit: h.submit,
    });

    expect(result.saved).toEqual(["row-0"]);
    expect(result.failed).toEqual(["row-1", "row-2"]);
  });

  it("runs batches sequentially", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const h = harness(
      vi.fn(async ({ items }: any) => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await Promise.resolve();
        inFlight--;
        return { created: items.length };
      }) as never,
    );

    await saveEncryptedBatches(entries(150), {
      operationId: "op-1",
      vaultId: "v-1",
      encrypt: h.encrypt,
      submit: h.submit,
    });

    expect(maxInFlight).toBe(1);
  });

  it("rejects a secret-shaped operation id before encrypting anything", async () => {
    const h = harness();
    await expect(
      saveEncryptedBatches(entries(1), {
        operationId: "Synthetic-Pw-0 leaked",
        vaultId: "v-1",
        encrypt: h.encrypt,
        submit: h.submit,
      }),
    ).rejects.toThrow(/operation id/i);
    expect(h.encrypt).not.toHaveBeenCalled();
  });
});
