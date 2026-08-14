// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * ImportWizard (Smart add) tests.
 *
 * The pipeline hook is mocked so each rendered stage can be asserted in
 * isolation. All item data is synthetic; no real credential appears here.
 * The global react-i18next mock returns the raw key for unmapped keys, so
 * assertions target translation keys rather than English strings.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import type { ImportedItem } from "@/types/import";

// ── Mocks ──────────────────────────────────────────────────────────

const PREVIEW_PAGE_SIZE = 50;

function makeRow(index: number) {
  return {
    key: `row-${index}`,
    item: {
      type: "login",
      title: `Synthetic Item ${index}`,
      fields: {
        username: `user${index}@synthetic.invalid`,
        url: `https://site-${index}.synthetic.invalid`,
      },
    } as ImportedItem,
  };
}

function makeRows(count: number) {
  return Array.from({ length: count }, (_, i) => makeRow(i));
}

const defaultPipeline = {
  stage: "idle" as string,
  source: null as string | null,
  parseResult: null,
  rows: [] as ReturnType<typeof makeRows>,
  pageRows: [] as ReturnType<typeof makeRows>,
  page: 0,
  pageCount: 1,
  selectedKeys: new Set<string>(),
  duplicateKeys: new Set<string>(),
  warnings: [] as Array<{ code: string; line: number }>,
  progress: null as Record<string, number | string> | null,
  summary: null as Record<string, unknown> | null,
  parseError: null as { code: string; limit?: number; actual?: number } | null,
  error: null as string | null,
  maxItems: 500,
  fileInputRef: { current: null },
  uploadFile: vi.fn(),
  analyzeText: vi.fn(),
  handleFileSelect: vi.fn(),
  handleFileDrop: vi.fn(),
  toggleItem: vi.fn(),
  toggleAll: vi.fn(),
  editRow: vi.fn(),
  deleteRow: vi.fn(),
  setPage: vi.fn(),
  back: vi.fn(),
  confirmImport: vi.fn(),
  retryFailed: vi.fn(),
  reset: vi.fn(),
};

let mockPipeline = { ...defaultPipeline };

vi.mock("@/hooks/useImportPipeline", async () => {
  const actual = await vi.importActual<
    typeof import("@/hooks/useImportPipeline")
  >("@/hooks/useImportPipeline");
  return {
    ...actual,
    useImportPipeline: () => mockPipeline,
  };
});

import { ImportWizard } from "../ImportWizard";

/** Put the mocked pipeline into a preview state showing one page of `total`. */
function previewing(total: number, page = 0, overrides: object = {}) {
  const rows = makeRows(total);
  const pageCount = Math.max(1, Math.ceil(total / PREVIEW_PAGE_SIZE));
  mockPipeline = {
    ...defaultPipeline,
    ...{
      stage: "previewing",
      source: "Generic CSV",
      rows,
      page,
      pageCount,
      pageRows: rows.slice(
        page * PREVIEW_PAGE_SIZE,
        page * PREVIEW_PAGE_SIZE + PREVIEW_PAGE_SIZE,
      ),
      selectedKeys: new Set(rows.map((row) => row.key)),
    },
    ...overrides,
  };
}

describe("ImportWizard — idle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPipeline = { ...defaultPipeline };
  });

  it("renders the dropzone and the on-device explanation", () => {
    render(<ImportWizard vaultId="v1" />);
    expect(
      screen.getByText("importExport.import.dropzone.title"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("importExport.import.onDevice"),
    ).toBeInTheDocument();
  });

  it("shows supported formats", () => {
    render(<ImportWizard vaultId="v1" />);
    for (const name of ["1Password", "Bitwarden", "Chrome", "LastPass"]) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
  });

  it("accepts csv, json, and txt files", () => {
    render(<ImportWizard vaultId="v1" />);
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    expect(input.accept).toBe(".csv,.json,.txt");
  });

  it("parses pasted text through the local parser", () => {
    render(<ImportWizard vaultId="v1" />);
    const textarea = screen.getByLabelText("importExport.import.paste.label");
    const analyze = screen.getByRole("button", {
      name: "importExport.import.paste.analyze",
    });

    expect(analyze).toBeDisabled();
    fireEvent.change(textarea, {
      target: { value: "Title: Synthetic\nPassword: Synthetic-Pw" },
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: "importExport.import.paste.analyze",
      }),
    );

    expect(mockPipeline.analyzeText).toHaveBeenCalledWith(
      "Title: Synthetic\nPassword: Synthetic-Pw",
    );
    // The pasted plaintext is dropped once the parser has it.
    expect((textarea as HTMLTextAreaElement).value).toBe("");
  });

  it("calls handleFileDrop on drop", () => {
    render(<ImportWizard vaultId="v1" />);
    const dropzone = screen
      .getByText("importExport.import.dropzone.title")
      .closest("div")!;
    fireEvent.drop(dropzone);
    expect(mockPipeline.handleFileDrop).toHaveBeenCalled();
  });
});

describe("ImportWizard — preview scale", () => {
  beforeEach(() => vi.clearAllMocks());

  it("mounts at most 50 editable rows for a 300-item parse", () => {
    previewing(300);
    render(<ImportWizard vaultId="v1" />);

    const rows = screen.getAllByRole("row");
    // 50 body rows plus the header row.
    expect(rows).toHaveLength(PREVIEW_PAGE_SIZE + 1);
    expect(
      screen.getAllByLabelText("importExport.import.preview.editTitle"),
    ).toHaveLength(PREVIEW_PAGE_SIZE);
    expect(
      screen.getByText("importExport.import.preview.pageOf"),
    ).toBeInTheDocument();
  });

  it("reaches the first and last page through accessible controls", () => {
    previewing(300, 3);
    render(<ImportWizard vaultId="v1" />);

    const nav = screen.getByRole("navigation", {
      name: "importExport.import.preview.pagination",
    });
    fireEvent.click(
      within(nav).getByRole("button", {
        name: "importExport.import.preview.lastPage",
      }),
    );
    expect(mockPipeline.setPage).toHaveBeenCalledWith(5);

    fireEvent.click(
      within(nav).getByRole("button", {
        name: "importExport.import.preview.firstPage",
      }),
    );
    expect(mockPipeline.setPage).toHaveBeenCalledWith(0);

    fireEvent.click(
      within(nav).getByRole("button", {
        name: "importExport.import.preview.nextPage",
      }),
    );
    expect(mockPipeline.setPage).toHaveBeenCalledWith(4);

    fireEvent.click(
      within(nav).getByRole("button", {
        name: "importExport.import.preview.prevPage",
      }),
    );
    expect(mockPipeline.setPage).toHaveBeenCalledWith(2);
  });

  it("disables paging past the bounds", () => {
    previewing(300, 0);
    const { unmount } = render(<ImportWizard vaultId="v1" />);
    expect(
      screen.getByRole("button", {
        name: "importExport.import.preview.firstPage",
      }),
    ).toBeDisabled();
    unmount();

    previewing(300, 5);
    render(<ImportWizard vaultId="v1" />);
    expect(
      screen.getByRole("button", {
        name: "importExport.import.preview.lastPage",
      }),
    ).toBeDisabled();
  });

  it("hides pagination when everything fits on one page", () => {
    previewing(10);
    render(<ImportWizard vaultId="v1" />);
    expect(
      screen.queryByRole("navigation", {
        name: "importExport.import.preview.pagination",
      }),
    ).not.toBeInTheDocument();
  });

  it("announces the visible range politely", () => {
    previewing(300, 2);
    render(<ImportWizard vaultId="v1" />);
    const range = screen.getByText("importExport.import.preview.range");
    expect(range).toHaveAttribute("aria-live", "polite");
  });
});

describe("ImportWizard — preview interaction", () => {
  beforeEach(() => vi.clearAllMocks());

  it("edits a row's title, username, and url in memory", () => {
    previewing(2);
    render(<ImportWizard vaultId="v1" />);

    const titles = screen.getAllByLabelText(
      "importExport.import.preview.editTitle",
    );
    fireEvent.change(titles[0]!, { target: { value: "Edited Title" } });
    expect(mockPipeline.editRow).toHaveBeenCalledWith("row-0", {
      title: "Edited Title",
    });

    const usernames = screen.getAllByLabelText(
      "importExport.import.preview.editUsername",
    );
    fireEvent.change(usernames[1]!, { target: { value: "new@synthetic.invalid" } });
    expect(mockPipeline.editRow).toHaveBeenCalledWith("row-1", {
      fields: { username: "new@synthetic.invalid" },
    });

    const urls = screen.getAllByLabelText("importExport.import.preview.editUrl");
    fireEvent.change(urls[0]!, {
      target: { value: "https://edited.synthetic.invalid" },
    });
    expect(mockPipeline.editRow).toHaveBeenCalledWith("row-0", {
      fields: { url: "https://edited.synthetic.invalid" },
    });
  });

  it("removes a row and toggles selection", () => {
    previewing(2);
    render(<ImportWizard vaultId="v1" />);

    fireEvent.click(
      screen.getAllByLabelText("importExport.import.preview.deleteRow")[1]!,
    );
    expect(mockPipeline.deleteRow).toHaveBeenCalledWith("row-1");

    fireEvent.click(
      screen.getAllByLabelText("importExport.import.preview.selectRow")[0]!,
    );
    expect(mockPipeline.toggleItem).toHaveBeenCalledWith("row-0");
  });

  it("confirms with the vault id and goes back without saving", () => {
    previewing(2);
    render(<ImportWizard vaultId="v1" />);

    fireEvent.click(
      screen.getByRole("button", { name: "importExport.import.preview.import" }),
    );
    expect(mockPipeline.confirmImport).toHaveBeenCalledWith("v1");

    fireEvent.click(
      screen.getByRole("button", { name: "importExport.import.preview.back" }),
    );
    expect(mockPipeline.back).toHaveBeenCalled();
  });

  it("disables the confirm button when nothing is selected", () => {
    previewing(2, 0, { selectedKeys: new Set<string>() });
    render(<ImportWizard vaultId="v1" />);
    expect(
      screen.getByRole("button", { name: "importExport.import.preview.import" }),
    ).toBeDisabled();
  });

  it("flags duplicate rows and counts them once", () => {
    previewing(3, 0, { duplicateKeys: new Set(["row-1", "row-2"]) });
    render(<ImportWizard vaultId="v1" />);

    expect(
      screen.getByText("importExport.import.preview.duplicates"),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText("importExport.import.preview.duplicateRow"),
    ).toHaveLength(2);
  });

  it("summarizes warnings by code without echoing row content", () => {
    previewing(3, 0, {
      warnings: [
        { code: "missingTitle", line: 1 },
        { code: "missingTitle", line: 2 },
        { code: "invalidTotp", line: 3 },
      ],
    });
    render(<ImportWizard vaultId="v1" />);

    expect(
      screen.getByText("importExport.import.warning.missingTitle"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("importExport.import.warning.invalidTotp"),
    ).toBeInTheDocument();
  });

  it("keeps every control at least 44px and free of item content", () => {
    previewing(2);
    const { container } = render(<ImportWizard vaultId="v1" />);

    for (const button of container.querySelectorAll("button")) {
      // Action buttons size themselves; checkboxes use a 44x44 hit area.
      expect(button.className).toMatch(/min-h-\[44px\]|before:h-11/);
    }
    // Accessible names identify rows by number, never by item content.
    for (const el of container.querySelectorAll("[aria-label]")) {
      expect(el.getAttribute("aria-label")).not.toContain("Synthetic");
      expect(el.getAttribute("aria-label")).not.toContain("synthetic.invalid");
    }
    // No test id carries item content either.
    for (const el of container.querySelectorAll("[data-testid]")) {
      expect(el.getAttribute("data-testid")).not.toContain("Synthetic");
    }
  });

  it("uses logical inline properties so RTL mirrors correctly", () => {
    previewing(2);
    const { container } = render(<ImportWizard vaultId="v1" />);
    const html = container.innerHTML;
    expect(html).toContain("text-start");
    expect(html).not.toContain("text-left");
    expect(html).not.toContain("ml-3");
    expect(html).not.toContain("mr-3");
  });
});

describe("ImportWizard — save, summary, and errors", () => {
  beforeEach(() => vi.clearAllMocks());

  it("announces encrypted-save progress politely", () => {
    mockPipeline = {
      ...defaultPipeline,
      stage: "importing",
      progress: { stage: "importing", total: 300, imported: 100, skipped: 0, errors: 0 },
    };
    render(<ImportWizard vaultId="v1" />);

    const status = screen.getByText("importExport.import.progress");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveAttribute("role", "status");
  });

  it("offers a retry for retained failed rows", () => {
    mockPipeline = {
      ...defaultPipeline,
      stage: "done",
      rows: makeRows(50),
      summary: { imported: 250, skipped: 50, errors: [], durationMs: 1 },
    };
    render(<ImportWizard vaultId="v1" />);

    expect(
      screen.getByText("importExport.import.summary.retainedRows"),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "importExport.import.summary.retry" }),
    );
    expect(mockPipeline.retryFailed).toHaveBeenCalled();
  });

  it("omits the retry block when nothing failed", () => {
    mockPipeline = {
      ...defaultPipeline,
      stage: "done",
      rows: [],
      summary: { imported: 300, skipped: 0, errors: [], durationMs: 1 },
    };
    render(<ImportWizard vaultId="v1" />);

    expect(
      screen.queryByText("importExport.import.summary.retainedRows"),
    ).not.toBeInTheDocument();
  });

  it("renders a typed parse error without the source text", () => {
    mockPipeline = {
      ...defaultPipeline,
      stage: "error",
      parseError: { code: "tooManyItems", limit: 500, actual: 900 },
    };
    render(<ImportWizard vaultId="v1" />);

    expect(
      screen.getByText("importExport.import.parseError.tooManyItems"),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("routes an encrypted bundle to the Import/Export backup flow", () => {
    mockPipeline = {
      ...defaultPipeline,
      stage: "error",
      parseError: { code: "encryptedBundle" },
    };
    render(<ImportWizard vaultId="v1" />);

    expect(
      screen.getByText("importExport.import.parseError.encryptedBundle"),
    ).toBeInTheDocument();
  });

  it("returns null for an unrecognized state", () => {
    mockPipeline = { ...defaultPipeline, stage: "bogus" };
    const { container } = render(<ImportWizard vaultId="v1" />);
    expect(container.firstChild).toBeNull();
  });

  it("discards in-flight parse state when the step unmounts", () => {
    previewing(2);
    const { unmount } = render(<ImportWizard vaultId="v1" />);
    unmount();
    expect(mockPipeline.reset).toHaveBeenCalled();
  });
});
