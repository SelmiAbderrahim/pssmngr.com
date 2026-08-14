// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Smart add — deterministic 300-record regression.
 *
 * Renders the real wizard with the real pipeline hook and the real local
 * parser; only the transport and the crypto helpers are replaced. The crypto
 * double is a reversible encoding so a saved envelope can be read back through
 * the normal client decrypt path.
 *
 * Every credential here is synthetic and generated in this file.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const { mockTrpcMutation, mockTrpcQuery, mockVaultCrypto } = vi.hoisted(() => {
  // Reversible stand-in for the real envelope, so a payload can be decoded
  // back in the test. Not encryption — it only proves the wiring.
  const encode = (data: unknown) =>
    Buffer.from(JSON.stringify(data), "utf8").toString("base64");

  return {
    mockTrpcMutation: vi.fn(),
    mockTrpcQuery: vi.fn(),
    mockVaultCrypto: {
      encryptItem: vi.fn(async (data: Record<string, unknown>) => ({
        ciphertext: encode(data),
        nonce: "N",
        authTag: "A",
        wrappedDataKey: "W",
        wrappedDataKeyNonce: "WN",
        wrappedDataKeyAuthTag: "WA",
      })),
      decryptServerItem: vi.fn(async (record: { ciphertext: string }) =>
        JSON.parse(Buffer.from(record.ciphertext, "base64").toString("utf8")),
      ),
      encryptItemWithKey: vi.fn(),
      decryptItemWithKey: vi.fn(),
      lock: vi.fn(),
    },
  };
});

vi.mock("@/lib/api/trpc", () => ({
  trpcMutation: mockTrpcMutation,
  trpcQuery: mockTrpcQuery,
}));
vi.mock("@/services/vault-crypto", () => ({ vaultCrypto: mockVaultCrypto }));

import { ImportWizard } from "../ImportWizard";
import { vaultCrypto } from "@/services/vault-crypto";

// ── Synthetic fixtures ───────────────────────────────────────────────

const RECORD_COUNT = 300;

function syntheticRecords(count = RECORD_COUNT) {
  return Array.from({ length: count }, (_, i) => ({
    title: `Synthetic Site ${i + 1}`,
    username: `user${i + 1}@synthetic.invalid`,
    password: `Synthetic-Pw-${i + 1}-${(i * 7919) % 10007}`,
    url: `https://site-${i + 1}.synthetic.invalid/login`,
    notes: `Synthetic note ${i + 1}`,
  }));
}

function syntheticPaste(count = RECORD_COUNT) {
  return syntheticRecords(count)
    .map((r) =>
      [
        `Title: ${r.title}`,
        `Username: ${r.username}`,
        `Password: ${r.password}`,
        `URL: ${r.url}`,
        `Notes: ${r.notes}`,
      ].join("\n"),
    )
    .join("\n\n");
}

function batchCalls() {
  return mockTrpcMutation.mock.calls.filter(
    (call) => call[0] === "credentials" && call[1] === "batchCreate",
  );
}

/** Paste the synthetic export and advance to the preview step. */
async function pasteAndReview(content = syntheticPaste()) {
  render(<ImportWizard vaultId="v-1" />);
  fireEvent.change(screen.getByLabelText("importExport.import.paste.label"), {
    target: { value: content },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "importExport.import.paste.analyze" }),
  );
  await screen.findByText("importExport.import.preview.title");
}

beforeEach(() => {
  vi.clearAllMocks();
  mockTrpcMutation.mockImplementation(async (_r, _p, input: any) => ({
    created: input.items.length,
  }));
  mockTrpcQuery.mockResolvedValue([]);
});

describe("Smart add — 300 records end to end", () => {
  it("previews 300 items with at most 50 mounted rows and reachable bounds", async () => {
    await pasteAndReview();

    expect(
      screen.getAllByLabelText("importExport.import.preview.editTitle"),
    ).toHaveLength(50);
    expect(screen.getAllByRole("row")).toHaveLength(51);

    const firstTitle = screen.getAllByLabelText(
      "importExport.import.preview.editTitle",
    )[0] as HTMLInputElement;
    expect(firstTitle.value).toBe("Synthetic Site 1");

    fireEvent.click(
      screen.getByRole("button", {
        name: "importExport.import.preview.lastPage",
      }),
    );

    const lastPageTitles = screen.getAllByLabelText(
      "importExport.import.preview.editTitle",
    ) as HTMLInputElement[];
    expect(lastPageTitles).toHaveLength(50);
    expect(lastPageTitles.at(-1)!.value).toBe("Synthetic Site 300");

    fireEvent.click(
      screen.getByRole("button", {
        name: "importExport.import.preview.firstPage",
      }),
    );
    expect(
      (
        screen.getAllByLabelText(
          "importExport.import.preview.editTitle",
        )[0] as HTMLInputElement
      ).value,
    ).toBe("Synthetic Site 1");
  });

  it("saves 300 items as exactly six ciphertext batches, not 300 creates", async () => {
    await pasteAndReview();
    fireEvent.click(
      screen.getByRole("button", { name: "importExport.import.preview.import" }),
    );
    await screen.findByText("importExport.import.summary.title");

    const calls = batchCalls();
    expect(calls).toHaveLength(6);
    expect(calls.map((call) => call[2].items.length)).toEqual([
      50, 50, 50, 50, 50, 50,
    ]);
    expect(calls.map((call) => call[2].idempotencyKey.split(":").at(-1))).toEqual(
      ["0", "1", "2", "3", "4", "5"],
    );
    // Nothing else was called: no per-item create, no AI route.
    expect(mockTrpcMutation.mock.calls).toHaveLength(6);
    expect(
      mockTrpcMutation.mock.calls.some((call) => call[0] === "aiImport"),
    ).toBe(false);
    expect(
      mockTrpcQuery.mock.calls.some((call) => call[0] === "aiImport"),
    ).toBe(false);
  });

  it("sends ciphertext envelopes with no source plaintext in any request body", async () => {
    await pasteAndReview();
    fireEvent.click(
      screen.getByRole("button", { name: "importExport.import.preview.import" }),
    );
    await screen.findByText("importExport.import.summary.title");

    for (const call of batchCalls()) {
      for (const item of call[2].items) {
        expect(Object.keys(item).sort()).toEqual([
          "authTag",
          "ciphertext",
          "itemType",
          "nonce",
          "wrappedDataKey",
          "wrappedDataKeyAuthTag",
          "wrappedDataKeyNonce",
        ]);
      }
      expect(Object.keys(call[2]).sort()).toEqual([
        "idempotencyKey",
        "items",
        "vaultId",
      ]);
    }

    // The literal request bodies must not contain the synthetic source text,
    // its titles, usernames, passwords, URLs, notes, or field names.
    const bodies = JSON.stringify(
      mockTrpcMutation.mock.calls.map((call) => ({
        router: call[0],
        procedure: call[1],
        input: { ...call[2], items: call[2].items },
      })),
    );
    const records = syntheticRecords();
    for (const record of [records[0]!, records[149]!, records.at(-1)!]) {
      for (const value of Object.values(record)) {
        expect(bodies).not.toContain(value);
      }
    }
    for (const fieldName of ["title", "username", "password", "url", "notes"]) {
      expect(bodies).not.toContain(`"${fieldName}"`);
    }
  });

  it("reads the first and last saved items back through the client decrypt path", async () => {
    await pasteAndReview();
    fireEvent.click(
      screen.getByRole("button", { name: "importExport.import.preview.import" }),
    );
    await screen.findByText("importExport.import.summary.title");

    const calls = batchCalls();
    const firstEnvelope = calls[0]![2].items[0];
    const lastEnvelope = calls[5]![2].items[49];
    const records = syntheticRecords();

    const first = await vaultCrypto.decryptServerItem(firstEnvelope as never);
    const last = await vaultCrypto.decryptServerItem(lastEnvelope as never);

    expect(first).toMatchObject({
      title: records[0]!.title,
      type: "login",
      fields: expect.objectContaining({
        username: records[0]!.username,
        password: records[0]!.password,
        url: records[0]!.url,
      }),
    });
    expect(last).toMatchObject({
      title: records[299]!.title,
      fields: expect.objectContaining({
        username: records[299]!.username,
        password: records[299]!.password,
      }),
    });
  });

  it("retries only the failed middle batch and reuses its idempotency key", async () => {
    // Batch index 2 fails; every other batch commits.
    mockTrpcMutation.mockImplementation(async (_r, _p, input: any) =>
      input.idempotencyKey.endsWith(":2")
        ? Promise.reject(new Error("network"))
        : { created: input.items.length },
    );

    await pasteAndReview();
    fireEvent.click(
      screen.getByRole("button", { name: "importExport.import.preview.import" }),
    );
    await screen.findByText("importExport.import.summary.title");

    expect(batchCalls()).toHaveLength(6);
    const firstRunKeys = batchCalls().map((call) => call[2].idempotencyKey);
    expect(
      screen.getByText("importExport.import.summary.retainedRows"),
    ).toBeInTheDocument();

    // Retry: only the failed batch is resubmitted, under its original key.
    mockTrpcMutation.mockClear();
    mockTrpcMutation.mockImplementation(async (_r, _p, input: any) => ({
      created: input.items.length,
    }));

    fireEvent.click(
      screen.getByRole("button", { name: "importExport.import.summary.retry" }),
    );
    await screen.findByText("importExport.import.preview.title");
    fireEvent.click(
      screen.getByRole("button", { name: "importExport.import.preview.import" }),
    );
    await screen.findByText("importExport.import.summary.title");

    const retryCalls = batchCalls();
    expect(retryCalls).toHaveLength(1);
    expect(retryCalls[0]![2].items).toHaveLength(50);
    expect(retryCalls[0]![2].idempotencyKey).toBe(firstRunKeys[2]);
    // The batches that already succeeded are not resent.
    expect(retryCalls[0]![2].idempotencyKey).not.toBe(firstRunKeys[0]);
    expect(
      screen.queryByText("importExport.import.summary.retainedRows"),
    ).not.toBeInTheDocument();
  });

  it("rejects a 300-record run that exceeds the item ceiling", async () => {
    render(<ImportWizard vaultId="v-1" />);
    fireEvent.change(screen.getByLabelText("importExport.import.paste.label"), {
      target: { value: syntheticPaste(501) },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "importExport.import.paste.analyze" }),
    );

    await screen.findByText("importExport.import.parseError.tooManyItems");
    expect(mockTrpcMutation).not.toHaveBeenCalled();
  });

  it("never issues a request while parsing", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("network access is forbidden"));

    await pasteAndReview();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockTrpcMutation).not.toHaveBeenCalled();
    expect(mockTrpcQuery).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("clamps the page after deleting rows on the last page", async () => {
    await pasteAndReview(syntheticPaste(51));

    fireEvent.click(
      screen.getByRole("button", {
        name: "importExport.import.preview.lastPage",
      }),
    );
    expect(
      screen.getAllByLabelText("importExport.import.preview.editTitle"),
    ).toHaveLength(1);

    fireEvent.click(
      screen.getAllByLabelText("importExport.import.preview.deleteRow")[0]!,
    );

    // The page clamps back rather than showing an empty page.
    await waitFor(() =>
      expect(
        screen.getAllByLabelText("importExport.import.preview.editTitle"),
      ).toHaveLength(50),
    );
    expect(
      screen.queryByRole("navigation", {
        name: "importExport.import.preview.pagination",
      }),
    ).not.toBeInTheDocument();
  });
});
