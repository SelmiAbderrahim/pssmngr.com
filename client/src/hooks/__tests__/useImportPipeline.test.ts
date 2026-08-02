// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { useImportPipeline } from "../useImportPipeline";

const mockReadFile = vi.fn();
const mockParseFileContent = vi.fn();
const mockExecuteImport = vi.fn();

vi.mock("@/services/import/pipeline", () => ({
  readFile: (...args: unknown[]) => mockReadFile(...args),
  parseFileContent: (...args: unknown[]) => mockParseFileContent(...args),
  executeImport: (...args: unknown[]) => mockExecuteImport(...args),
}));

const mockItems = [
  { type: "login" as const, title: "Site A", fields: { username: "user1", password: "pass1" } },
  { type: "login" as const, title: "Site B", fields: { username: "user2", password: "pass2" } },
  { type: "note" as const, title: "Note C", fields: { content: "secret" } },
];

const mockParseResult = {
  items: mockItems,
  errors: [],
  duplicates: [],
  stats: { total: 3, parsed: 3, skipped: 0, duplicateCount: 0 },
};

function createMockFile(name = "export.csv") {
  return new File(["csv,content"], name, { type: "text/csv" });
}

describe("useImportPipeline", () => {
  beforeEach(() => {
    mockReadFile.mockReset();
    mockParseFileContent.mockReset();
    mockExecuteImport.mockReset();
  });

  it("returns initial state with stage idle", () => {
    const { result } = renderHook(() => useImportPipeline());
    expect(result.current.stage).toBe("idle");
    expect(result.current.source).toBeNull();
    expect(result.current.parseResult).toBeNull();
    expect(result.current.selectedItems).toEqual([]);
    expect(result.current.progress).toBeNull();
    expect(result.current.summary).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("uploadFile transitions through reading → detecting → previewing on success", async () => {
    mockReadFile.mockResolvedValue("csv,content");
    mockParseFileContent.mockReturnValue({
      result: mockParseResult,
      source: "Chrome CSV",
    });

    const { result } = renderHook(() => useImportPipeline());

    await act(async () => {
      await result.current.uploadFile(createMockFile());
    });

    expect(result.current.stage).toBe("previewing");
    expect(result.current.source).toBe("Chrome CSV");
    expect(result.current.parseResult).toEqual(mockParseResult);
    expect(result.current.selectedItems).toEqual(mockItems);
    expect(result.current.error).toBeNull();
  });

  it("uploadFile sets error stage when readFile rejects", async () => {
    mockReadFile.mockRejectedValue(new Error("Failed to read file"));

    const { result } = renderHook(() => useImportPipeline());

    await act(async () => {
      await result.current.uploadFile(createMockFile());
    });

    expect(result.current.stage).toBe("error");
    expect(result.current.error).toBe("Failed to read file");
  });

  it("uploadFile sets error stage when parseFileContent throws", async () => {
    mockReadFile.mockResolvedValue("bad content");
    mockParseFileContent.mockImplementation(() => {
      throw new Error("Unsupported format");
    });

    const { result } = renderHook(() => useImportPipeline());

    await act(async () => {
      await result.current.uploadFile(createMockFile());
    });

    expect(result.current.stage).toBe("error");
    expect(result.current.error).toBe("Unsupported format");
  });

  it("uploadFile sets fallback error message for non-Error throws", async () => {
    mockReadFile.mockRejectedValue("string error");

    const { result } = renderHook(() => useImportPipeline());

    await act(async () => {
      await result.current.uploadFile(createMockFile());
    });

    expect(result.current.stage).toBe("error");
    expect(result.current.error).toBe("Failed to parse file");
  });

  it("toggleItem toggles a single item selection", async () => {
    mockReadFile.mockResolvedValue("csv");
    mockParseFileContent.mockReturnValue({
      result: mockParseResult,
      source: "CSV",
    });

    const { result } = renderHook(() => useImportPipeline());

    await act(async () => {
      await result.current.uploadFile(createMockFile());
    });

    expect(result.current.selectedItems).toHaveLength(3);

    // Deselect item at index 1
    act(() => {
      result.current.toggleItem(1);
    });
    expect(result.current.selectedItems).toHaveLength(2);
    expect(result.current.selectedItems).not.toContain(mockItems[1]);

    // Re-select item at index 1
    act(() => {
      result.current.toggleItem(1);
    });
    expect(result.current.selectedItems).toHaveLength(3);
    expect(result.current.selectedItems).toContain(mockItems[1]);
  });

  it("toggleItem does nothing when parseResult is null", () => {
    const { result } = renderHook(() => useImportPipeline());

    act(() => {
      result.current.toggleItem(0);
    });

    expect(result.current.selectedItems).toEqual([]);
  });

  it("toggleAll selects all items when true", async () => {
    mockReadFile.mockResolvedValue("csv");
    mockParseFileContent.mockReturnValue({
      result: mockParseResult,
      source: "CSV",
    });

    const { result } = renderHook(() => useImportPipeline());

    await act(async () => {
      await result.current.uploadFile(createMockFile());
    });

    // Deselect all
    act(() => {
      result.current.toggleAll(false);
    });
    expect(result.current.selectedItems).toEqual([]);

    // Select all
    act(() => {
      result.current.toggleAll(true);
    });
    expect(result.current.selectedItems).toEqual(mockItems);
  });

  it("toggleAll deselects all items when false", async () => {
    mockReadFile.mockResolvedValue("csv");
    mockParseFileContent.mockReturnValue({
      result: mockParseResult,
      source: "CSV",
    });

    const { result } = renderHook(() => useImportPipeline());

    await act(async () => {
      await result.current.uploadFile(createMockFile());
    });

    act(() => {
      result.current.toggleAll(false);
    });
    expect(result.current.selectedItems).toEqual([]);
  });

  it("toggleAll does nothing when parseResult is null", () => {
    const { result } = renderHook(() => useImportPipeline());

    act(() => {
      result.current.toggleAll(true);
    });
    expect(result.current.selectedItems).toEqual([]);
  });

  it("confirmImport transitions to done on success", async () => {
    const mockSummary = {
      imported: 3,
      skipped: 0,
      errors: [],
      durationMs: 120,
    };
    mockReadFile.mockResolvedValue("csv");
    mockParseFileContent.mockReturnValue({
      result: mockParseResult,
      source: "CSV",
    });
    mockExecuteImport.mockResolvedValue(mockSummary);

    const { result } = renderHook(() => useImportPipeline());

    await act(async () => {
      await result.current.uploadFile(createMockFile());
    });

    await act(async () => {
      await result.current.confirmImport("vault-123");
    });

    expect(result.current.stage).toBe("done");
    expect(result.current.summary).toEqual(mockSummary);
    expect(mockExecuteImport).toHaveBeenCalledWith(
      mockItems,
      "vault-123",
      expect.any(Function),
    );
  });

  it("confirmImport sets error stage on failure", async () => {
    mockReadFile.mockResolvedValue("csv");
    mockParseFileContent.mockReturnValue({
      result: mockParseResult,
      source: "CSV",
    });
    mockExecuteImport.mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useImportPipeline());

    await act(async () => {
      await result.current.uploadFile(createMockFile());
    });

    await act(async () => {
      await result.current.confirmImport("vault-123");
    });

    expect(result.current.stage).toBe("error");
    expect(result.current.error).toBe("Network error");
  });

  it("confirmImport does nothing when selectedItems is empty", async () => {
    mockReadFile.mockResolvedValue("csv");
    mockParseFileContent.mockReturnValue({
      result: mockParseResult,
      source: "CSV",
    });

    const { result } = renderHook(() => useImportPipeline());

    await act(async () => {
      await result.current.uploadFile(createMockFile());
    });

    // Deselect all items
    act(() => {
      result.current.toggleAll(false);
    });

    await act(async () => {
      await result.current.confirmImport("vault-123");
    });

    expect(result.current.stage).toBe("previewing");
    expect(mockExecuteImport).not.toHaveBeenCalled();
  });

  it("reset returns to initial state", async () => {
    mockReadFile.mockResolvedValue("csv");
    mockParseFileContent.mockReturnValue({
      result: mockParseResult,
      source: "CSV",
    });

    const { result } = renderHook(() => useImportPipeline());

    await act(async () => {
      await result.current.uploadFile(createMockFile());
    });

    expect(result.current.stage).toBe("previewing");

    act(() => {
      result.current.reset();
    });

    expect(result.current.stage).toBe("idle");
    expect(result.current.source).toBeNull();
    expect(result.current.parseResult).toBeNull();
    expect(result.current.selectedItems).toEqual([]);
    expect(result.current.progress).toBeNull();
    expect(result.current.summary).toBeNull();
    expect(result.current.error).toBeNull();
  });
});
