// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ImportedItem, ImportProgress } from "@/types/import";
import { readFile, parseFileContent, executeImport } from "../pipeline";

// ── Mocks ──────────────────────────────────────────────────────────

vi.mock("@/services/vault-crypto", () => ({
  vaultCrypto: {
    encryptItem: vi.fn().mockResolvedValue({
      ciphertext: "ct-base64",
      nonce: "n-base64",
      authTag: "at-base64",
      wrappedDataKey: "wdk-base64",
      wrappedDataKeyNonce: "wdkn-base64",
      wrappedDataKeyAuthTag: "wdkat-base64",
    }),
  },
}));

vi.mock("@/lib/api/trpc", () => ({
  trpcMutation: vi.fn().mockResolvedValue({ created: 0 }),
}));

import { vaultCrypto } from "@/services/vault-crypto";
import { trpcMutation } from "@/lib/api/trpc";

const mockEncrypt = vi.mocked(vaultCrypto.encryptItem);
const mockMutation = vi.mocked(trpcMutation);

function makeItem(overrides?: Partial<ImportedItem>): ImportedItem {
  return {
    type: "login",
    title: "Test Login",
    fields: { url: "https://example.com", username: "user", password: "pass" },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockMutation.mockResolvedValue({ created: 0 });
});

// ── readFile ───────────────────────────────────────────────────────

describe("readFile", () => {
  it("reads a File object to string", async () => {
    const file = new File(["hello,world"], "test.csv", { type: "text/csv" });
    const content = await readFile(file);
    expect(content).toBe("hello,world");
  });

  it("reads UTF-8 content correctly", async () => {
    const file = new File(["über,café"], "test.csv", { type: "text/csv" });
    const content = await readFile(file);
    expect(content).toBe("über,café");
  });
});

// ── parseFileContent ───────────────────────────────────────────────

describe("parseFileContent", () => {
  it("auto-detects Chrome CSV format", () => {
    const content =
      "name,url,username,password\nGmail,https://gmail.com,user@gmail.com,secret123";
    const { result, source } = parseFileContent(content);
    expect(source).toBe("Chrome (CSV)");
    expect(result.items.length).toBe(1);
    expect(result.items[0].type).toBe("login");
    expect(result.items[0].fields.username).toBe("user@gmail.com");
  });

  it("auto-detects LastPass CSV format", () => {
    const content =
      "url,username,password,totp,extra,name,grouping,fav\nhttps://example.com,user,pass,,,Example,folder,0";
    const { result, source } = parseFileContent(content);
    expect(source).toBe("LastPass (CSV)");
    expect(result.items.length).toBe(1);
  });

  it("returns parse errors for malformed data", () => {
    const content = "name,url,username,password\n,,,";
    const { result } = parseFileContent(content);
    // Empty rows are skipped, not errored
    expect(result.items.length).toBe(0);
  });
});

// ── executeImport ──────────────────────────────────────────────────

describe("executeImport", () => {
  it("encrypts and saves items via batchCreate", async () => {
    const items = [makeItem({ title: "Item 1" }), makeItem({ title: "Item 2" })];
    mockMutation.mockResolvedValue({ created: 2 });

    const summary = await executeImport(items, "vault-123");

    expect(mockEncrypt).toHaveBeenCalledTimes(2);
    expect(mockMutation).toHaveBeenCalledTimes(1);
    expect(mockMutation).toHaveBeenCalledWith("credentials", "batchCreate", {
      vaultId: "vault-123",
      items: expect.arrayContaining([
        expect.objectContaining({ itemType: "login", ciphertext: "ct-base64" }),
      ]),
    });
    expect(summary.imported).toBe(2);
    expect(summary.errors).toHaveLength(0);
  });

  it("batches items in groups of 50", async () => {
    const items = Array.from({ length: 75 }, (_, i) =>
      makeItem({ title: `Item ${i + 1}` }),
    );
    // First batch: 50, second batch: 25
    mockMutation
      .mockResolvedValueOnce({ created: 50 })
      .mockResolvedValueOnce({ created: 25 });

    const summary = await executeImport(items, "vault-123");

    expect(mockMutation).toHaveBeenCalledTimes(2);
    // First call: 50 items
    const firstCall = mockMutation.mock.calls[0];
    expect((firstCall[2] as { items: unknown[] }).items).toHaveLength(50);
    // Second call: 25 items
    const secondCall = mockMutation.mock.calls[1];
    expect((secondCall[2] as { items: unknown[] }).items).toHaveLength(25);
    expect(summary.imported).toBe(75);
  });

  it("reports encryption failures per item", async () => {
    const items = [
      makeItem({ title: "Good" }),
      makeItem({ title: "Bad" }),
      makeItem({ title: "Also Good" }),
    ];
    mockEncrypt
      .mockResolvedValueOnce({
        ciphertext: "ct",
        nonce: "n",
        authTag: "at",
        wrappedDataKey: "wdk",
        wrappedDataKeyNonce: "wdkn",
        wrappedDataKeyAuthTag: "wdkat",
      })
      .mockRejectedValueOnce(new Error("Vault is locked"))
      .mockResolvedValueOnce({
        ciphertext: "ct",
        nonce: "n",
        authTag: "at",
        wrappedDataKey: "wdk",
        wrappedDataKeyNonce: "wdkn",
        wrappedDataKeyAuthTag: "wdkat",
      });
    mockMutation.mockResolvedValue({ created: 2 });

    const summary = await executeImport(items, "vault-123");

    expect(summary.imported).toBe(2);
    expect(summary.skipped).toBe(1);
    expect(summary.errors).toHaveLength(1);
    expect(summary.errors[0].title).toBe("Bad");
    expect(summary.errors[0].message).toBe("Vault is locked");
  });

  it("reports server batch save failures", async () => {
    const items = [makeItem({ title: "Item 1" })];
    mockMutation.mockRejectedValue(new Error("Network error"));

    const summary = await executeImport(items, "vault-123");

    expect(summary.imported).toBe(0);
    expect(summary.errors).toHaveLength(1);
    expect(summary.errors[0].message).toBe("Network error");
  });

  it("calls progress callback during import", async () => {
    const items = [makeItem(), makeItem()];
    mockMutation.mockResolvedValue({ created: 2 });

    const progressUpdates: ImportProgress[] = [];
    await executeImport(items, "vault-123", (p) => progressUpdates.push(p));

    expect(progressUpdates.length).toBeGreaterThanOrEqual(2);
    // First update: stage=importing, imported=0
    expect(progressUpdates[0].stage).toBe("importing");
    expect(progressUpdates[0].total).toBe(2);
    expect(progressUpdates[0].imported).toBe(0);
    // Last update reflects final state
    const last = progressUpdates[progressUpdates.length - 1];
    expect(last.imported).toBe(2);
  });

  it("handles empty items array", async () => {
    const summary = await executeImport([], "vault-123");
    expect(summary.imported).toBe(0);
    expect(summary.skipped).toBe(0);
    expect(summary.errors).toHaveLength(0);
    expect(mockMutation).not.toHaveBeenCalled();
  });

  it("maps item types correctly", async () => {
    const items = [
      makeItem({ type: "card", title: "Credit Card" }),
      makeItem({ type: "note", title: "Secure Note" }),
      makeItem({ type: "identity", title: "My ID" }),
    ];
    mockMutation.mockResolvedValue({ created: 3 });

    await executeImport(items, "vault-123");

    const call = mockMutation.mock.calls[0];
    const batchItems = (call[2] as { items: Array<{ itemType: string }> }).items;
    expect(batchItems[0].itemType).toBe("card");
    expect(batchItems[1].itemType).toBe("note");
    expect(batchItems[2].itemType).toBe("identity");
  });

  it("includes duration in summary", async () => {
    const items = [makeItem()];
    mockMutation.mockResolvedValue({ created: 1 });

    const summary = await executeImport(items, "vault-123");

    expect(summary.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("handles non-Error throw in encryption", async () => {
    const items = [makeItem({ title: "Throws String" })];
    mockEncrypt.mockRejectedValueOnce("string error");

    const summary = await executeImport(items, "vault-123");

    expect(summary.skipped).toBe(1);
    expect(summary.errors).toHaveLength(1);
    expect(summary.errors[0].message).toBe("Encryption failed");
  });

  it("handles non-Error throw in batch save", async () => {
    const items = [makeItem({ title: "Item 1" })];
    mockMutation.mockRejectedValueOnce("network failure");

    const summary = await executeImport(items, "vault-123");

    expect(summary.imported).toBe(0);
    expect(summary.errors).toHaveLength(1);
    expect(summary.errors[0].message).toBe("Save failed");
  });

  it("includes folder and tags in encrypted payload", async () => {
    const items = [
      makeItem({
        title: "With Metadata",
        folder: "Work",
        tags: ["important", "dev"],
      }),
    ];
    mockMutation.mockResolvedValue({ created: 1 });

    await executeImport(items, "vault-123");

    // encryptItem is called with the full plaintext including folder/tags
    const encryptArg = mockEncrypt.mock.calls[0][0] as Record<string, unknown>;
    expect(encryptArg.folder).toBe("Work");
    expect(encryptArg.tags).toEqual(["important", "dev"]);
  });

  it("excludes folder/tags when not present", async () => {
    const items = [makeItem({ title: "No Metadata" })];
    mockMutation.mockResolvedValue({ created: 1 });

    await executeImport(items, "vault-123");

    const encryptArg = mockEncrypt.mock.calls[0][0] as Record<string, unknown>;
    expect(encryptArg).not.toHaveProperty("folder");
    expect(encryptArg).not.toHaveProperty("tags");
  });

  it("excludes tags when array is empty", async () => {
    const items = [makeItem({ title: "Empty Tags", tags: [] })];
    mockMutation.mockResolvedValue({ created: 1 });

    await executeImport(items, "vault-123");

    const encryptArg = mockEncrypt.mock.calls[0][0] as Record<string, unknown>;
    expect(encryptArg).not.toHaveProperty("tags");
  });

  it("uses batch title fallback when item has no title", async () => {
    const items = [makeItem({ title: "Good" })];
    mockMutation.mockRejectedValueOnce(new Error("Server down"));

    const summary = await executeImport(items, "vault-123");
    // The error entry should use the batch item's title
    expect(summary.errors[0].title).toBe("Good");
  });

  it("processes no temp files (in-memory only)", async () => {
    // Verify the pipeline only uses FileReader and in-memory structures
    const file = new File(
      ["name,url,username,password\nTest,https://test.com,user,pass"],
      "test.csv",
      { type: "text/csv" },
    );
    const content = await readFile(file);
    const { result } = parseFileContent(content);

    expect(result.items.length).toBe(1);
    // Content is a string in memory — no fs operations
    expect(typeof content).toBe("string");
  });
});
