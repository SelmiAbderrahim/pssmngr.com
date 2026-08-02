// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// ── Mocks ──────────────────────────────────────────────────────────

const defaultPipeline = {
  stage: "idle" as const,
  source: null,
  parseResult: null,
  selectedItems: [],
  progress: null,
  summary: null,
  error: null,
  fileInputRef: { current: null },
  handleFileSelect: vi.fn(),
  handleFileDrop: vi.fn(),
  toggleItem: vi.fn(),
  toggleAll: vi.fn(),
  confirmImport: vi.fn(),
  reset: vi.fn(),
};

let mockPipeline = { ...defaultPipeline };

vi.mock("@/hooks/useImportPipeline", () => ({
  useImportPipeline: () => mockPipeline,
}));

import { ImportWizard } from "../ImportWizard";

// ── Tests ──────────────────────────────────────────────────────────

describe("ImportWizard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPipeline = { ...defaultPipeline };
  });

  // ── Idle state ─────────────────────────────────────────────────

  it("renders dropzone in idle state", () => {
    render(<ImportWizard vaultId="v1" />);
    // Translation mock returns raw keys
    expect(screen.getByText("importExport.import.dropzone.title")).toBeInTheDocument();
    expect(screen.getByText("importExport.import.dropzone.browse")).toBeInTheDocument();
  });

  it("shows supported formats", () => {
    render(<ImportWizard vaultId="v1" />);
    expect(screen.getByText("1Password")).toBeInTheDocument();
    expect(screen.getByText("Bitwarden")).toBeInTheDocument();
    expect(screen.getByText("Chrome")).toBeInTheDocument();
    expect(screen.getByText("LastPass")).toBeInTheDocument();
  });

  it("renders hidden file input with correct accept types", () => {
    render(<ImportWizard vaultId="v1" />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.accept).toBe(".csv,.json");
    expect(input.className).toContain("hidden");
  });

  it("calls handleFileDrop on drop event", () => {
    render(<ImportWizard vaultId="v1" />);
    const dropzone = screen.getByText("importExport.import.dropzone.title").closest("div")!;
    fireEvent.drop(dropzone);
    expect(mockPipeline.handleFileDrop).toHaveBeenCalled();
  });

  // ── Reading / Detecting state ──────────────────────────────────

  it("shows reading spinner when stage is 'reading'", () => {
    mockPipeline = { ...defaultPipeline, stage: "reading" };
    render(<ImportWizard vaultId="v1" />);
    expect(screen.getByText("importExport.import.reading")).toBeInTheDocument();
  });

  it("shows detecting spinner when stage is 'detecting'", () => {
    mockPipeline = { ...defaultPipeline, stage: "detecting" };
    render(<ImportWizard vaultId="v1" />);
    expect(screen.getByText("importExport.import.detecting")).toBeInTheDocument();
  });

  // ── Preview state ──────────────────────────────────────────────

  it("renders preview table with items", () => {
    const items = [
      { type: "login" as const, title: "Gmail", fields: { username: "user@gmail.com", url: "https://gmail.com" } },
      { type: "note" as const, title: "Secret Note", fields: {} },
    ];
    mockPipeline = {
      ...defaultPipeline,
      stage: "previewing",
      source: "Chrome",
      parseResult: { items, errors: [], duplicates: [], stats: { total: 2, parsed: 2, skipped: 0, duplicateCount: 0 } },
      selectedItems: items,
    };

    render(<ImportWizard vaultId="v1" />);
    expect(screen.getByText("Gmail")).toBeInTheDocument();
    expect(screen.getByText("Secret Note")).toBeInTheDocument();
    expect(screen.getByText("user@gmail.com")).toBeInTheDocument();
  });

  it("shows parse errors warning", () => {
    mockPipeline = {
      ...defaultPipeline,
      stage: "previewing",
      parseResult: {
        items: [{ type: "login" as const, title: "Item", fields: {} }],
        errors: [{ line: 1, message: "bad row" }],
        duplicates: [],
        stats: { total: 1, parsed: 1, skipped: 0, duplicateCount: 0 },
      },
      selectedItems: [{ type: "login" as const, title: "Item", fields: {} }],
    };

    render(<ImportWizard vaultId="v1" />);
    expect(screen.getByText("importExport.import.preview.parseErrors")).toBeInTheDocument();
  });

  it("shows duplicates warning", () => {
    const items = [{ type: "login" as const, title: "Item", fields: {} }];
    mockPipeline = {
      ...defaultPipeline,
      stage: "previewing",
      parseResult: {
        items,
        errors: [],
        duplicates: [{ key: "dup", items: [{ index: 0, item: items[0] }] }],
        stats: { total: 1, parsed: 1, skipped: 0, duplicateCount: 1 },
      },
      selectedItems: items,
    };

    render(<ImportWizard vaultId="v1" />);
    expect(screen.getByText("importExport.import.preview.duplicates")).toBeInTheDocument();
  });

  it("calls confirmImport with vaultId on import click", () => {
    const items = [{ type: "login" as const, title: "Item", fields: {} }];
    mockPipeline = {
      ...defaultPipeline,
      stage: "previewing",
      parseResult: {
        items,
        errors: [],
        duplicates: [],
        stats: { total: 1, parsed: 1, skipped: 0, duplicateCount: 0 },
      },
      selectedItems: items,
    };

    render(<ImportWizard vaultId="v1" />);
    // The import button text is a translation key with interpolation
    const buttons = screen.getAllByRole("button");
    const importBtn = buttons.find((b) => b.textContent?.includes("importExport.import.preview.import"));
    expect(importBtn).toBeTruthy();
    fireEvent.click(importBtn!);
    expect(mockPipeline.confirmImport).toHaveBeenCalledWith("v1");
  });

  it("calls reset on cancel click", () => {
    const items = [{ type: "login" as const, title: "Item", fields: {} }];
    mockPipeline = {
      ...defaultPipeline,
      stage: "previewing",
      parseResult: {
        items,
        errors: [],
        duplicates: [],
        stats: { total: 1, parsed: 1, skipped: 0, duplicateCount: 0 },
      },
      selectedItems: items,
    };

    render(<ImportWizard vaultId="v1" />);
    const cancelBtn = screen.getByText("importExport.import.preview.cancel");
    fireEvent.click(cancelBtn);
    expect(mockPipeline.reset).toHaveBeenCalled();
  });

  // ── Importing state ────────────────────────────────────────────

  it("shows progress bar during import", () => {
    mockPipeline = {
      ...defaultPipeline,
      stage: "importing",
      progress: { stage: "importing", total: 10, imported: 5, skipped: 0, errors: 0 },
    };

    render(<ImportWizard vaultId="v1" />);
    expect(screen.getByText("importExport.import.progress")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  // ── Done state ─────────────────────────────────────────────────

  it("shows summary when import is done", () => {
    mockPipeline = {
      ...defaultPipeline,
      stage: "done",
      summary: { imported: 8, skipped: 1, errors: [], durationMs: 2500 },
    };

    render(<ImportWizard vaultId="v1" />);
    expect(screen.getByText("importExport.import.summary.title")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("shows error details in summary", () => {
    mockPipeline = {
      ...defaultPipeline,
      stage: "done",
      summary: {
        imported: 5,
        skipped: 0,
        errors: [{ index: 0, title: "Bad Item", message: "Encryption failed" }],
        durationMs: 1000,
      },
    };

    render(<ImportWizard vaultId="v1" />);
    expect(screen.getByText("Bad Item: Encryption failed")).toBeInTheDocument();
  });

  it("shows Import More button in done state", () => {
    mockPipeline = {
      ...defaultPipeline,
      stage: "done",
      summary: { imported: 5, skipped: 0, errors: [], durationMs: 1000 },
    };

    render(<ImportWizard vaultId="v1" />);
    const importMoreBtn = screen.getByText("importExport.import.summary.importMore");
    fireEvent.click(importMoreBtn);
    expect(mockPipeline.reset).toHaveBeenCalled();
  });

  // ── Error state ────────────────────────────────────────────────

  it("shows error message with retry button", () => {
    mockPipeline = {
      ...defaultPipeline,
      stage: "error",
      error: "File format not recognized",
    };

    render(<ImportWizard vaultId="v1" />);
    expect(screen.getByText("importExport.import.error.title")).toBeInTheDocument();
    expect(screen.getByText("File format not recognized")).toBeInTheDocument();

    const retryBtn = screen.getByText("importExport.import.error.retry");
    fireEvent.click(retryBtn);
    expect(mockPipeline.reset).toHaveBeenCalled();
  });

  // ── returns null for unknown stage ─────────────────────────────

  it("returns null for unrecognized state", () => {
    mockPipeline = {
      ...defaultPipeline,
      stage: "previewing",
      parseResult: null, // previewing but no parseResult
    };

    const { container } = render(<ImportWizard vaultId="v1" />);
    expect(container.innerHTML).toBe("");
  });
});
