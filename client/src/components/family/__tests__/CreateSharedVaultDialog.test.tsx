// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * CreateSharedVaultDialog Component Tests
 *
 * Covers:
 * - Dialog content rendering when open
 * - Empty name validation
 * - Name too long validation (>64 chars)
 * - Successful creation with trimmed name
 * - Error handling from thrown errors
 * - Dialog close after success
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CreateSharedVaultDialog } from "../CreateSharedVaultDialog";

describe("CreateSharedVaultDialog", () => {
  const onOpenChange = vi.fn();
  const onCreate = vi.fn().mockResolvedValue(undefined);

  const baseProps = {
    open: true,
    onOpenChange,
    onCreate,
  };

  beforeEach(() => vi.clearAllMocks());

  it("renders dialog content when open", () => {
    render(<CreateSharedVaultDialog {...baseProps} />);
    expect(screen.getByText("family.sharedVaults.createTitle")).toBeInTheDocument();
    expect(screen.getByText("family.sharedVaults.createDescription")).toBeInTheDocument();
  });

  it("does not render content when closed", () => {
    render(<CreateSharedVaultDialog {...baseProps} open={false} />);
    expect(screen.queryByText("family.sharedVaults.createTitle")).not.toBeInTheDocument();
  });

  it("shows error for empty name", () => {
    render(<CreateSharedVaultDialog {...baseProps} />);
    fireEvent.click(screen.getByText("family.sharedVaults.createAction"));
    expect(screen.getByText("family.sharedVaults.nameRequired")).toBeInTheDocument();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("shows error for whitespace-only name", () => {
    render(<CreateSharedVaultDialog {...baseProps} />);
    const input = screen.getByLabelText("family.sharedVaults.nameLabel");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.click(screen.getByText("family.sharedVaults.createAction"));
    expect(screen.getByText("family.sharedVaults.nameRequired")).toBeInTheDocument();
  });

  it("shows error for name longer than 64 characters", () => {
    render(<CreateSharedVaultDialog {...baseProps} />);
    const input = screen.getByLabelText("family.sharedVaults.nameLabel");
    fireEvent.change(input, { target: { value: "A".repeat(65) } });
    fireEvent.click(screen.getByText("family.sharedVaults.createAction"));
    expect(screen.getByText("family.sharedVaults.nameTooLong")).toBeInTheDocument();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("calls onCreate with trimmed name on valid submit", async () => {
    render(<CreateSharedVaultDialog {...baseProps} />);
    const input = screen.getByLabelText("family.sharedVaults.nameLabel");
    fireEvent.change(input, { target: { value: "  Streaming Services  " } });
    fireEvent.click(screen.getByText("family.sharedVaults.createAction"));
    await waitFor(() => {
      expect(onCreate).toHaveBeenCalledWith("Streaming Services");
    });
  });

  it("closes dialog after successful creation", async () => {
    render(<CreateSharedVaultDialog {...baseProps} />);
    const input = screen.getByLabelText("family.sharedVaults.nameLabel");
    fireEvent.change(input, { target: { value: "New Vault" } });
    fireEvent.click(screen.getByText("family.sharedVaults.createAction"));
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it("shows error message when onCreate throws", async () => {
    onCreate.mockRejectedValueOnce(new Error("Limit reached"));
    render(<CreateSharedVaultDialog {...baseProps} />);
    const input = screen.getByLabelText("family.sharedVaults.nameLabel");
    fireEvent.change(input, { target: { value: "Vault" } });
    fireEvent.click(screen.getByText("family.sharedVaults.createAction"));
    await waitFor(() => {
      expect(screen.getByText("Limit reached")).toBeInTheDocument();
    });
  });

  it("renders cancel button", () => {
    render(<CreateSharedVaultDialog {...baseProps} />);
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });
});
