// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * FamilySettingsPanel Component Tests
 *
 * Covers:
 * - Loading skeleton state
 * - Organizer view: settings form, name validation, save
 * - Member view: leave family card
 * - Save button disabled when no changes
 * - Validation error for empty name
 * - Success message after save
 * - Error handling on save failure
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { FamilySettingsPanel } from "../FamilySettingsPanel";

describe("FamilySettingsPanel", () => {
  const onUpdateName = vi.fn().mockResolvedValue(undefined);
  const onLeaveFamily = vi.fn().mockResolvedValue(undefined);

  const baseProps = {
    familyName: "Test Family",
    isOrganizer: true,
    isLoading: false,
    onUpdateName,
    onLeaveFamily,
  };

  beforeEach(() => vi.clearAllMocks());

  // ── Loading ────────────────────────────────────────────────────────

  it("renders loading skeleton when isLoading", () => {
    render(<FamilySettingsPanel {...baseProps} isLoading />);
    expect(screen.queryByText("family.settings.title")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("family.settings.nameLabel")).not.toBeInTheDocument();
  });

  // ── Organizer view ────────────────────────────────────────────────

  describe("organizer view", () => {
    it("shows settings card with title and description", () => {
      render(<FamilySettingsPanel {...baseProps} />);
      expect(screen.getByText("family.settings.title")).toBeInTheDocument();
      expect(screen.getByText("family.settings.description")).toBeInTheDocument();
    });

    it("pre-fills name input with familyName", () => {
      render(<FamilySettingsPanel {...baseProps} />);
      const input = screen.getByLabelText("family.settings.nameLabel");
      expect(input).toHaveValue("Test Family");
    });

    it("disables save button when no changes", () => {
      render(<FamilySettingsPanel {...baseProps} />);
      const saveBtn = screen.getByText("Save");
      expect(saveBtn).toBeDisabled();
    });

    it("enables save button when name is changed", () => {
      render(<FamilySettingsPanel {...baseProps} />);
      const input = screen.getByLabelText("family.settings.nameLabel");
      fireEvent.change(input, { target: { value: "New Family" } });
      const saveBtn = screen.getByText("Save");
      expect(saveBtn).not.toBeDisabled();
    });

    it("shows validation error for empty name", async () => {
      render(<FamilySettingsPanel {...baseProps} />);
      const input = screen.getByLabelText("family.settings.nameLabel");
      fireEvent.change(input, { target: { value: "   " } });
      fireEvent.submit(input.closest("form")!);
      expect(screen.getByText("family.settings.nameRequired")).toBeInTheDocument();
      expect(onUpdateName).not.toHaveBeenCalled();
    });

    it("calls onUpdateName with trimmed name on save", async () => {
      render(<FamilySettingsPanel {...baseProps} />);
      const input = screen.getByLabelText("family.settings.nameLabel");
      fireEvent.change(input, { target: { value: "  New Family  " } });
      fireEvent.submit(input.closest("form")!);
      await waitFor(() => {
        expect(onUpdateName).toHaveBeenCalledWith("New Family");
      });
    });

    it("shows success message after successful save", async () => {
      render(<FamilySettingsPanel {...baseProps} />);
      const input = screen.getByLabelText("family.settings.nameLabel");
      fireEvent.change(input, { target: { value: "Updated" } });
      fireEvent.submit(input.closest("form")!);
      await waitFor(() => {
        expect(screen.getByText("family.settings.saved")).toBeInTheDocument();
      });
    });

    it("shows error message on save failure", async () => {
      onUpdateName.mockRejectedValueOnce(new Error("Server error"));
      render(<FamilySettingsPanel {...baseProps} />);
      const input = screen.getByLabelText("family.settings.nameLabel");
      fireEvent.change(input, { target: { value: "Failing" } });
      fireEvent.submit(input.closest("form")!);
      await waitFor(() => {
        expect(screen.getByText("Server error")).toBeInTheDocument();
      });
    });

    it("does not show leave family card", () => {
      render(<FamilySettingsPanel {...baseProps} />);
      expect(screen.queryByText("family.settings.leaveTitle")).not.toBeInTheDocument();
    });
  });

  // ── Member view ───────────────────────────────────────────────────

  describe("member view", () => {
    it("shows leave family card", () => {
      render(<FamilySettingsPanel {...baseProps} isOrganizer={false} />);
      expect(screen.getByText("family.settings.leaveTitle")).toBeInTheDocument();
      expect(screen.getByText("family.settings.leaveDescription")).toBeInTheDocument();
    });

    it("does not show settings form", () => {
      render(<FamilySettingsPanel {...baseProps} isOrganizer={false} />);
      expect(screen.queryByText("family.settings.title")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("family.settings.nameLabel")).not.toBeInTheDocument();
    });

    it("shows leave button with correct text", () => {
      render(<FamilySettingsPanel {...baseProps} isOrganizer={false} />);
      expect(screen.getByText("family.settings.leaveAction")).toBeInTheDocument();
    });

    it("opens leave confirmation dialog and calls onLeaveFamily", async () => {
      render(<FamilySettingsPanel {...baseProps} isOrganizer={false} />);

      // Click leave button
      fireEvent.click(screen.getByText("family.settings.leaveAction"));

      // Confirmation dialog should appear
      await waitFor(() => {
        expect(screen.getByText("family.settings.leaveConfirmTitle")).toBeInTheDocument();
        expect(screen.getByText("family.settings.leaveConfirmDescription")).toBeInTheDocument();
      });

      // Confirm leave
      fireEvent.click(screen.getByText("family.settings.confirmLeave"));
      await waitFor(() => {
        expect(onLeaveFamily).toHaveBeenCalledOnce();
      });
    });

    it("can cancel leave confirmation dialog", async () => {
      render(<FamilySettingsPanel {...baseProps} isOrganizer={false} />);

      fireEvent.click(screen.getByText("family.settings.leaveAction"));

      await waitFor(() => {
        expect(screen.getByText("family.settings.leaveConfirmTitle")).toBeInTheDocument();
      });

      // Cancel
      fireEvent.click(screen.getByText("Cancel"));
      await waitFor(() => {
        expect(screen.queryByText("family.settings.leaveConfirmTitle")).not.toBeInTheDocument();
      });
      expect(onLeaveFamily).not.toHaveBeenCalled();
    });
  });
});
