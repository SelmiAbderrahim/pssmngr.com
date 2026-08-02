// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * AddContactDialog Component Tests
 *
 * Covers:
 * - Dialog content rendering when open
 * - Email validation error
 * - Default waiting period (7 days)
 * - Successful add with correct arguments
 * - Error handling from thrown errors
 * - Dialog close after success
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AddContactDialog } from "../AddContactDialog";

describe("AddContactDialog", () => {
  const onOpenChange = vi.fn();
  const onAdd = vi.fn().mockResolvedValue(undefined);

  const baseProps = {
    open: true,
    onOpenChange,
    onAdd,
  };

  beforeEach(() => vi.clearAllMocks());

  it("renders dialog content when open", () => {
    render(<AddContactDialog {...baseProps} />);
    expect(screen.getByText("addContact.title")).toBeInTheDocument();
    expect(screen.getByText("emergency.addContact.description")).toBeInTheDocument();
  });

  it("does not render content when closed", () => {
    render(<AddContactDialog {...baseProps} open={false} />);
    expect(screen.queryByText("addContact.title")).not.toBeInTheDocument();
  });

  it("shows validation error for empty email", () => {
    render(<AddContactDialog {...baseProps} />);
    fireEvent.click(screen.getByText("addContact.submit"));
    expect(screen.getByText("emergency.addContact.invalidEmail")).toBeInTheDocument();
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("shows validation error for invalid email format", () => {
    render(<AddContactDialog {...baseProps} />);
    const input = screen.getByLabelText("addContact.emailLabel");
    fireEvent.change(input, { target: { value: "bad-email" } });
    // Submit form directly to bypass HTML5 type="email" validation in JSDOM
    fireEvent.submit(input.closest("form")!);
    expect(screen.getByText("emergency.addContact.invalidEmail")).toBeInTheDocument();
  });

  it("calls onAdd with trimmed lowercase email and default waiting period", async () => {
    render(<AddContactDialog {...baseProps} />);
    const input = screen.getByLabelText("addContact.emailLabel");
    fireEvent.change(input, { target: { value: "  Contact@Example.COM  " } });
    fireEvent.click(screen.getByText("addContact.submit"));
    await waitFor(() => {
      expect(onAdd).toHaveBeenCalledWith("contact@example.com", 7);
    });
  });

  it("closes dialog after successful add", async () => {
    render(<AddContactDialog {...baseProps} />);
    const input = screen.getByLabelText("addContact.emailLabel");
    fireEvent.change(input, { target: { value: "user@test.com" } });
    fireEvent.click(screen.getByText("addContact.submit"));
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it("shows error message when onAdd throws", async () => {
    onAdd.mockRejectedValueOnce(new Error("Contact exists"));
    render(<AddContactDialog {...baseProps} />);
    const input = screen.getByLabelText("addContact.emailLabel");
    fireEvent.change(input, { target: { value: "user@test.com" } });
    fireEvent.click(screen.getByText("addContact.submit"));
    await waitFor(() => {
      expect(screen.getByText("Contact exists")).toBeInTheDocument();
    });
  });

  it("shows waiting period hint", () => {
    render(<AddContactDialog {...baseProps} />);
    expect(screen.getByText("emergency.addContact.waitingHint")).toBeInTheDocument();
  });

  it("renders cancel button", () => {
    render(<AddContactDialog {...baseProps} />);
    expect(screen.getByText("common:actions.cancel")).toBeInTheDocument();
  });
});
