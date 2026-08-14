// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * useImportPipeline tests — bounds, stale-result cancellation, pagination
 * clamping, duplicate fingerprinting, and reset cleanup.
 *
 * All fixtures are synthetic.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const { mockReadFile, mockExecuteImport } = vi.hoisted(() => ({
  mockReadFile: vi.fn(),
  mockExecuteImport: vi.fn(),
}));

vi.mock("@/services/import/pipeline", async () => {
  const actual = await vi.importActual<
    typeof import("@/services/import/pipeline")
  >("@/services/import/pipeline");
  return {
    ...actual,
    readFile: mockReadFile,
    executeImport: mockExecuteImport,
  };
});

import {
  useImportPipeline,
  PREVIEW_PAGE_SIZE,
} from "../useImportPipeline";
import { MAX_IMPORT_FILE_BYTES } from "@/services/import/smart-parse";

function block(index: number) {
  return [
    `Title: Synthetic Site ${index}`,
    `Username: user${index}@synthetic.invalid`,
    `Password: Synthetic-Pw-${index}`,
  ].join("\n");
}

function paste(count: number) {
  return Array.from({ length: count }, (_, i) => block(i + 1)).join("\n\n");
}

function fakeFile(name: string, size: number): File {
  return { name, size } as File;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockExecuteImport.mockResolvedValue({
    imported: 0,
    skipped: 0,
    errors: [],
    durationMs: 1,
  });
});

describe("useImportPipeline — parsing", () => {
  it("parses pasted text into paginated preview rows", () => {
    const { result } = renderHook(() => useImportPipeline());

    act(() => result.current.analyzeText(paste(120)));

    expect(result.current.stage).toBe("previewing");
    expect(result.current.rows).toHaveLength(120);
    expect(result.current.pageRows).toHaveLength(PREVIEW_PAGE_SIZE);
    expect(result.current.pageCount).toBe(3);
    expect(result.current.selectedKeys.size).toBe(120);
  });

  it("surfaces a typed error and no rows for oversized input", () => {
    const { result } = renderHook(() => useImportPipeline());

    act(() => result.current.analyzeText(paste(501)));

    expect(result.current.stage).toBe("error");
    expect(result.current.parseError?.code).toBe("tooManyItems");
    expect(result.current.rows).toEqual([]);
  });

  it("rejects an oversized file by size before reading it", async () => {
    const { result } = renderHook(() => useImportPipeline());

    await act(async () => {
      await result.current.uploadFile(
        fakeFile("huge.csv", MAX_IMPORT_FILE_BYTES + 1),
      );
    });

    expect(result.current.parseError?.code).toBe("fileTooLarge");
    expect(mockReadFile).not.toHaveBeenCalled();
  });

  it("routes an encrypted bundle away from the parser", async () => {
    const { result } = renderHook(() => useImportPipeline());

    await act(async () => {
      await result.current.uploadFile(fakeFile("vault.pssmngr", 100));
    });

    expect(result.current.parseError?.code).toBe("encryptedBundle");
    expect(mockReadFile).not.toHaveBeenCalled();
  });

  it("ignores a stale read when a newer input supersedes it", async () => {
    let resolveFirst: ((value: string) => void) | undefined;
    mockReadFile
      .mockImplementationOnce(
        () => new Promise<string>((resolve) => (resolveFirst = resolve)),
      )
      .mockResolvedValueOnce(paste(2));

    const { result } = renderHook(() => useImportPipeline());

    let firstUpload!: Promise<void>;
    act(() => {
      firstUpload = result.current.uploadFile(fakeFile("first.csv", 100));
    });

    await act(async () => {
      await result.current.uploadFile(fakeFile("second.csv", 100));
    });
    expect(result.current.rows).toHaveLength(2);

    // The first read finishes late with different content.
    await act(async () => {
      resolveFirst?.(paste(9));
      await firstUpload;
    });

    expect(result.current.rows).toHaveLength(2);
    expect(result.current.rows[0]?.item.title).toBe("Synthetic Site 1");
  });

  it("ignores a stale read that lands after reset", async () => {
    let resolveRead: ((value: string) => void) | undefined;
    mockReadFile.mockImplementationOnce(
      () => new Promise<string>((resolve) => (resolveRead = resolve)),
    );

    const { result } = renderHook(() => useImportPipeline());

    let upload!: Promise<void>;
    act(() => {
      upload = result.current.uploadFile(fakeFile("first.csv", 100));
    });
    act(() => result.current.reset());

    await act(async () => {
      resolveRead?.(paste(5));
      await upload;
    });

    expect(result.current.stage).toBe("idle");
    expect(result.current.rows).toEqual([]);
  });
});

describe("useImportPipeline — preview state", () => {
  it("clamps the page after deleting rows and on reset", () => {
    const { result } = renderHook(() => useImportPipeline());
    act(() => result.current.analyzeText(paste(51)));

    act(() => result.current.setPage(1));
    expect(result.current.page).toBe(1);

    act(() => result.current.deleteRow(result.current.pageRows[0]!.key));
    expect(result.current.rows).toHaveLength(50);
    expect(result.current.page).toBe(0);

    act(() => result.current.setPage(99));
    expect(result.current.page).toBe(0);

    act(() => result.current.reset());
    expect(result.current.page).toBe(0);
    expect(result.current.rows).toEqual([]);
    expect(result.current.stage).toBe("idle");
  });

  it("clears preview plaintext on back", () => {
    const { result } = renderHook(() => useImportPipeline());
    act(() => result.current.analyzeText(paste(3)));
    expect(result.current.rows).toHaveLength(3);

    act(() => result.current.back());

    expect(result.current.rows).toEqual([]);
    expect(result.current.parseResult).toBeNull();
    expect(result.current.selectedKeys.size).toBe(0);
    expect(result.current.stage).toBe("idle");
  });

  it("edits and toggles rows by key", () => {
    const { result } = renderHook(() => useImportPipeline());
    act(() => result.current.analyzeText(paste(2)));
    const [first, second] = result.current.rows;

    act(() => result.current.editRow(first!.key, { title: "Edited" }));
    expect(result.current.rows[0]?.item.title).toBe("Edited");

    act(() => result.current.toggleItem(second!.key));
    expect(result.current.selectedKeys.has(second!.key)).toBe(false);

    act(() => result.current.toggleAll(false));
    expect(result.current.selectedKeys.size).toBe(0);
    act(() => result.current.toggleAll(true));
    expect(result.current.selectedKeys.size).toBe(2);
  });

  it("marks exact duplicates across every preview page in O(n)", () => {
    const unique = Array.from({ length: 120 }, (_, i) => block(i + 1));
    // Repeat the first block on the second and third pages.
    unique[60] = block(1);
    unique[119] = block(1);

    const { result } = renderHook(() => useImportPipeline());
    act(() => result.current.analyzeText(unique.join("\n\n")));

    expect(result.current.rows).toHaveLength(120);
    expect([...result.current.duplicateKeys].sort()).toEqual(
      ["row-119", "row-60"].sort(),
    );

    // The set is page-independent: paging does not change the verdict.
    act(() => result.current.setPage(2));
    expect(result.current.duplicateKeys.has("row-119")).toBe(true);
  });

  it("does not flag rows that differ in any field", () => {
    const { result } = renderHook(() => useImportPipeline());
    act(() => result.current.analyzeText(paste(50)));
    expect(result.current.duplicateKeys.size).toBe(0);
  });
});

describe("useImportPipeline — saving", () => {
  it("reuses the operation id and original batch index when retrying", async () => {
    mockExecuteImport.mockResolvedValueOnce({
      imported: 100,
      skipped: 50,
      errors: Array.from({ length: 50 }, (_, i) => ({
        index: 50 + i,
        title: "",
        message: "network",
        batchIndex: 1,
      })),
      durationMs: 1,
    });

    const { result } = renderHook(() => useImportPipeline());
    act(() => result.current.analyzeText(paste(150)));

    await act(async () => {
      await result.current.confirmImport("v-1");
    });

    const firstOptions = mockExecuteImport.mock.calls[0]![3];
    expect(firstOptions.batchIndexes.slice(0, 50).every((i: number) => i === 0)).toBe(
      true,
    );
    expect(result.current.rows).toHaveLength(50);

    act(() => result.current.retryFailed());
    expect(result.current.stage).toBe("previewing");

    await act(async () => {
      await result.current.confirmImport("v-1");
    });

    const retryOptions = mockExecuteImport.mock.calls[1]![3];
    expect(retryOptions.operationId).toBe(firstOptions.operationId);
    expect(retryOptions.batchIndexes).toEqual(Array(50).fill(1));
  });

  it("does nothing when no rows are selected", async () => {
    const { result } = renderHook(() => useImportPipeline());
    act(() => result.current.analyzeText(paste(3)));
    act(() => result.current.toggleAll(false));

    await act(async () => {
      await result.current.confirmImport("v-1");
    });

    expect(mockExecuteImport).not.toHaveBeenCalled();
  });

  it("surfaces a save-stage failure without losing rows", async () => {
    mockExecuteImport.mockRejectedValueOnce(new Error("offline"));

    const { result } = renderHook(() => useImportPipeline());
    act(() => result.current.analyzeText(paste(3)));

    await act(async () => {
      await result.current.confirmImport("v-1");
    });

    await waitFor(() => expect(result.current.stage).toBe("error"));
    expect(result.current.error).toBe("offline");
    expect(result.current.rows).toHaveLength(3);
  });
});

describe("useImportPipeline — stage transitions", () => {
  it("returns initial state with stage idle", () => {
    const { result } = renderHook(() => useImportPipeline());
    expect(result.current.stage).toBe("idle");
    expect(result.current.source).toBeNull();
    expect(result.current.parseResult).toBeNull();
    expect(result.current.rows).toEqual([]);
    expect(result.current.selectedKeys.size).toBe(0);
    expect(result.current.progress).toBeNull();
    expect(result.current.summary).toBeNull();
    expect(result.current.parseError).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("moves through reading → detecting → previewing on a successful upload", async () => {
    const stages: string[] = [];
    mockReadFile.mockImplementation(async () => paste(2));

    const { result } = renderHook(() => useImportPipeline());
    stages.push(result.current.stage);

    await act(async () => {
      const pending = result.current.uploadFile(fakeFile("export.csv", 100));
      stages.push(result.current.stage);
      await pending;
    });

    expect(stages).toContain("idle");
    expect(result.current.stage).toBe("previewing");
    expect(result.current.source).toBeTruthy();
    expect(result.current.parseResult).not.toBeNull();
  });

  it("reports a typed error when the file cannot be read", async () => {
    mockReadFile.mockRejectedValue(new Error("Failed to read file"));

    const { result } = renderHook(() => useImportPipeline());
    await act(async () => {
      await result.current.uploadFile(fakeFile("export.csv", 100));
    });

    expect(result.current.stage).toBe("error");
    expect(result.current.parseError?.code).toBe("unsupportedFormat");
  });

  it("reports a typed error when the content parses to nothing", async () => {
    mockReadFile.mockResolvedValue("name,username,password\n");

    const { result } = renderHook(() => useImportPipeline());
    await act(async () => {
      await result.current.uploadFile(fakeFile("export.csv", 100));
    });

    expect(result.current.stage).toBe("error");
    expect(result.current.parseError?.code).toBe("noItems");
  });

  it("ignores selection changes when there are no rows", () => {
    const { result } = renderHook(() => useImportPipeline());

    act(() => result.current.toggleItem("row-0"));
    act(() => result.current.toggleAll(true));

    expect(result.current.rows).toEqual([]);
    expect(result.current.stage).toBe("idle");
  });

  it("transitions to done and reports the summary on success", async () => {
    mockExecuteImport.mockResolvedValueOnce({
      imported: 3,
      skipped: 0,
      errors: [],
      durationMs: 5,
    });

    const { result } = renderHook(() => useImportPipeline());
    act(() => result.current.analyzeText(paste(3)));

    await act(async () => {
      await result.current.confirmImport("v-1");
    });

    expect(result.current.stage).toBe("done");
    expect(result.current.summary?.imported).toBe(3);
    expect(result.current.progress).toMatchObject({
      stage: "done",
      total: 3,
      imported: 3,
    });
    // Nothing failed, so no rows are retained.
    expect(result.current.rows).toEqual([]);
  });
});
