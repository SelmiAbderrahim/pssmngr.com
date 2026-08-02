// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PlaintextWarningDialog } from "../PlaintextWarningDialog";

describe("PlaintextWarningDialog", () => {
  const onConfirm = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    onConfirm.mockResolvedValue(undefined);
  });

  it("renders trigger button", () => {
    render(
      <PlaintextWarningDialog
        format="csv"
        trigger={<button>Export CSV</button>}
        onConfirm={onConfirm}
      />,
    );
    expect(screen.getByRole("button", { name: "Export CSV" })).toBeInTheDocument();
  });

  it("opens dialog on trigger click and shows warning title", async () => {
    render(
      <PlaintextWarningDialog
        format="csv"
        trigger={<button>Export CSV</button>}
        onConfirm={onConfirm}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    await waitFor(() => {
      // Translation key returned by mock
      expect(screen.getByText("importExport.export.warning.title")).toBeInTheDocument();
    });
  });

  it("displays caution text in dialog", async () => {
    render(
      <PlaintextWarningDialog
        format="json"
        trigger={<button>Export JSON</button>}
        onConfirm={onConfirm}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Export JSON" }));
    await waitFor(() => {
      expect(screen.getByText("importExport.export.warning.caution")).toBeInTheDocument();
    });
  });

  it("calls onConfirm on confirm click", async () => {
    render(
      <PlaintextWarningDialog
        format="csv"
        trigger={<button>Export CSV</button>}
        onConfirm={onConfirm}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    await waitFor(() => {
      expect(screen.getByText("importExport.export.warning.title")).toBeInTheDocument();
    });

    // The confirm button text is the translation key
    const confirmBtn = screen.getByText("importExport.export.warning.confirm");
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledTimes(1);
    });
  });

  it("shows cancel button in dialog", async () => {
    render(
      <PlaintextWarningDialog
        format="csv"
        trigger={<button>Export CSV</button>}
        onConfirm={onConfirm}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    await waitFor(() => {
      expect(screen.getByText("importExport.export.warning.cancel")).toBeInTheDocument();
    });
  });

  it("does not call onConfirm on cancel", async () => {
    render(
      <PlaintextWarningDialog
        format="csv"
        trigger={<button>Export CSV</button>}
        onConfirm={onConfirm}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    await waitFor(() => {
      expect(screen.getByText("importExport.export.warning.title")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("importExport.export.warning.cancel"));
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
