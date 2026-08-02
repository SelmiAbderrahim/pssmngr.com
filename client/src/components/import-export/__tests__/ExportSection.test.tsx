// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// ── Mocks ──────────────────────────────────────────────────────────

const mockExportEncrypted = vi.fn();
const mockExportPlaintextCsv = vi.fn();
const mockExportPlaintextJson = vi.fn();

vi.mock("@/services/export", () => ({
  exportEncrypted: (...args: unknown[]) => mockExportEncrypted(...args),
  exportPlaintextCsv: (...args: unknown[]) => mockExportPlaintextCsv(...args),
  exportPlaintextJson: (...args: unknown[]) => mockExportPlaintextJson(...args),
}));

const mockTrpcQuery = vi.fn();
const mockTrpcMutation = vi.fn();
vi.mock("@/lib/api/trpc", () => ({
  trpcQuery: (...args: unknown[]) => mockTrpcQuery(...args),
  trpcMutation: (...args: unknown[]) => mockTrpcMutation(...args),
}));

vi.mock("@/lib/api/config", () => ({
  apiConfig: { baseUrl: "http://localhost:39291" },
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

// Track SensitiveActionGate usage so we can assert every export trigger is
// wrapped exactly once with the expected action.
const gateActionsSeen: string[] = [];
vi.mock("@/components/vault/SensitiveActionGate", () => ({
  SensitiveActionGate: ({
    children,
    action,
  }: {
    children: React.ReactNode;
    action: string;
  }) => {
    gateActionsSeen.push(action);
    return (
      <div data-testid="sensitive-action-gate" data-action={action}>
        {children}
      </div>
    );
  },
}));

import { ExportSection } from "../ExportSection";

// ── Tests ──────────────────────────────────────────────────────────

describe("ExportSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    gateActionsSeen.length = 0;
    mockTrpcQuery.mockResolvedValue([]);
  });

  // ── Encrypted vault export ─────────────────────────────────────

  it("renders encrypted vault export card", () => {
    render(<ExportSection vaultId="v1" />);
    expect(
      screen.getByText("importExport.export.encrypted.title"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("importExport.export.encrypted.recommended"),
    ).toBeInTheDocument();
  });

  it("calls exportEncrypted on click", async () => {
    mockExportEncrypted.mockResolvedValue(undefined);
    render(<ExportSection vaultId="v1" />);

    fireEvent.click(
      screen
        .getByText("importExport.export.encrypted.button")
        .closest("button")!,
    );
    await waitFor(() => {
      expect(mockExportEncrypted).toHaveBeenCalledWith("v1");
    });
  });

  it("shows error message on export failure", async () => {
    mockExportEncrypted.mockRejectedValue(new Error("Encryption failed"));
    render(<ExportSection vaultId="v1" />);

    fireEvent.click(
      screen
        .getByText("importExport.export.encrypted.button")
        .closest("button")!,
    );
    await waitFor(() => {
      expect(screen.getByText("Encryption failed")).toBeInTheDocument();
    });
  });


  // ── Plaintext exports ──────────────────────────────────────────

  it("renders plaintext export section with warning and buttons", () => {
    render(<ExportSection vaultId="v1" />);
    expect(
      screen.getByText("importExport.export.plaintext.title"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("importExport.export.plaintext.warning"),
    ).toBeInTheDocument();
  });

  it("renders CSV and JSON export buttons", () => {
    render(<ExportSection vaultId="v1" />);
    expect(
      screen.getByText("importExport.export.plaintext.csv"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("importExport.export.plaintext.json"),
    ).toBeInTheDocument();
  });

  // ── Third option: encrypted account data export ────────────────

  it("renders the encrypted account data export card", () => {
    render(<ExportSection vaultId="v1" />);
    expect(
      screen.getByTestId("export-option-account-data"),
    ).toBeInTheDocument();
    // GDPR sub-tree from settings.namespace
    expect(screen.getByText("dataExport.title")).toBeInTheDocument();
  });

  it("lists past account exports via trpcQuery dataExport.list", async () => {
    mockTrpcQuery.mockResolvedValue([
      {
        id: "req-1",
        status: "SUCCEEDED",
        requestedAt: "2026-01-01T00:00:00Z",
        startedAt: null,
        completedAt: null,
        expiresAt: null,
        bundleSizeBytes: 1024,
        downloadCount: 0,
        requestedFormat: "BOTH",
        errorMessage: "",
      },
    ]);
    render(<ExportSection vaultId="v1" />);
    await waitFor(() => {
      expect(mockTrpcQuery).toHaveBeenCalledWith("dataExport", "list");
    });
    await waitFor(() => {
      expect(
        screen.getByText("dataExport.status.SUCCEEDED"),
      ).toBeInTheDocument();
    });
  });

  it("creates a new account export request via dataExport.create", async () => {
    mockTrpcMutation.mockResolvedValue({ requestId: "req-2" });
    render(<ExportSection vaultId="v1" />);
    await waitFor(() => {
      expect(mockTrpcQuery).toHaveBeenCalledWith("dataExport", "list");
    });

    fireEvent.click(
      screen.getByText("dataExport.requestNew").closest("button")!,
    );

    await waitFor(() => {
      expect(mockTrpcMutation).toHaveBeenCalledWith(
        "dataExport",
        "create",
        { format: "BOTH" },
      );
    });
  });

  // ── SensitiveActionGate wrapping ───────────────────────────────

  it("wraps every export trigger with SensitiveActionGate action='export'", async () => {
    render(<ExportSection vaultId="v1" />);
    await waitFor(() => {
      expect(mockTrpcQuery).toHaveBeenCalled();
    });
    // 2 plaintext buttons + 1 encrypted vault button + 1 account-data button
    const gates = screen.getAllByTestId("sensitive-action-gate");
    expect(gates.length).toBe(4);
    for (const g of gates) {
      expect(g.getAttribute("data-action")).toBe("export");
    }
  });
});
