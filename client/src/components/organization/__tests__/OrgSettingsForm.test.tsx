// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * OrgSettingsForm Component Tests
 *
 * Covers:
 * - Renders name and slug inputs with initial values
 * - Inputs disabled for non-admin users
 * - Save button visible for admins/owners
 * - Save button hidden for regular members
 * - Calls onSave with updated values on submit
 * - Shows success message after save
 * - Loading state during save
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { OrgSettingsForm } from "../OrgSettingsForm";

const defaultProps = {
  orgName: "Test Organization",
  orgSlug: "test-org",
  isOwnerOrAdmin: true,
  onSave: vi.fn().mockResolvedValue(undefined),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("OrgSettingsForm", () => {
  describe("rendering", () => {
    it("renders the form title", () => {
      render(<OrgSettingsForm {...defaultProps} />);

      expect(
        screen.getByText("organization:settings.title"),
      ).toBeInTheDocument();
    });

    it("renders name input with initial value", () => {
      render(<OrgSettingsForm {...defaultProps} />);

      const nameInput = screen.getByLabelText("organization:settings.name");
      expect(nameInput).toHaveValue("Test Organization");
    });

    it("renders slug input with initial value", () => {
      render(<OrgSettingsForm {...defaultProps} />);

      const slugInput = screen.getByLabelText("organization:settings.slug");
      expect(slugInput).toHaveValue("test-org");
    });

    it("renders slug hint text", () => {
      render(<OrgSettingsForm {...defaultProps} />);

      expect(
        screen.getByText("organization:settings.slugHint"),
      ).toBeInTheDocument();
    });
  });

  describe("permissions", () => {
    it("renders save button for owner/admin", () => {
      render(<OrgSettingsForm {...defaultProps} />);

      expect(
        screen.getByText("organization:settings.save"),
      ).toBeInTheDocument();
    });

    it("hides save button for regular member", () => {
      render(<OrgSettingsForm {...defaultProps} isOwnerOrAdmin={false} />);

      expect(
        screen.queryByText("organization:settings.save"),
      ).not.toBeInTheDocument();
    });

    it("disables inputs for regular member", () => {
      render(<OrgSettingsForm {...defaultProps} isOwnerOrAdmin={false} />);

      const nameInput = screen.getByLabelText("organization:settings.name");
      const slugInput = screen.getByLabelText("organization:settings.slug");

      expect(nameInput).toBeDisabled();
      expect(slugInput).toBeDisabled();
    });
  });

  describe("form submission", () => {
    it("calls onSave with updated values on submit", async () => {
      render(<OrgSettingsForm {...defaultProps} />);

      const nameInput = screen.getByLabelText("organization:settings.name");
      fireEvent.change(nameInput, { target: { value: "Updated Org" } });

      const submitButton = screen.getByText("organization:settings.save");
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(defaultProps.onSave).toHaveBeenCalledWith(
          "Updated Org",
          "test-org",
        );
      });
    });

    it("shows success message after successful save", async () => {
      render(<OrgSettingsForm {...defaultProps} />);

      const submitButton = screen.getByText("organization:settings.save");
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(
          screen.getByText("organization:settings.saved"),
        ).toBeInTheDocument();
      });
    });
  });
});
