// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Tests for ProfileForm component.
 *
 * Covers:
 * - Renders all inputs with initial profile values
 * - Email field is always read-only/disabled
 * - Email verified badge vs unverified badge
 * - Send verification button visibility and callback
 * - Submit button disabled when form is pristine
 * - Submit calls onUpdate with correct data
 * - Submit button shows loading state while saving
 * - Cancel (reset) restores original values
 * - Loader shown when externalLoading=true (form hidden)
 * - Remove photo button appears when image is set
 * - toast.success called on successful update
 * - toast.error called when onUpdate rejects
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProfileForm } from "../ProfileForm";
import type { UserProfileData } from "../ProfileForm";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const baseProfile: UserProfileData = {
  email: "jane@example.com",
  firstName: "Jane",
  lastName: "Doe",
  image: "",
  emailVerified: true,
};

function renderForm(
  overrides: Partial<{
    profile: UserProfileData;
    onUpdate: (data: Partial<UserProfileData>) => Promise<void>;
    onSendVerification: () => Promise<void>;
    isLoading: boolean;
    className: string;
  }> = {}
) {
  const props = {
    profile: baseProfile,
    onUpdate: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return render(<ProfileForm {...props} />);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ProfileForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------
  describe("rendering", () => {
    it("renders the card title", () => {
      renderForm();
      // t mock returns the bare key when no translation is found: "profile.title"
      // getByText with a regex matches against the element's text content
      expect(
        screen.getByText(/profile\.title|^Profile$/i)
      ).toBeInTheDocument();
    });

    it("renders the first name input with profile value", () => {
      renderForm();
      const input = screen.getByLabelText(/profile\.firstName|First Name/i);
      expect(input).toBeInTheDocument();
      expect(input).toHaveValue("Jane");
    });

    it("renders the last name input with profile value", () => {
      renderForm();
      const input = screen.getByLabelText(/profile\.lastName|Last Name/i);
      expect(input).toBeInTheDocument();
      expect(input).toHaveValue("Doe");
    });

    it("renders the email input with profile email value", () => {
      renderForm();
      const input = screen.getByLabelText(/profile\.email|Email/i);
      expect(input).toBeInTheDocument();
      expect(input).toHaveValue("jane@example.com");
    });

    it("email input is always disabled (read-only)", () => {
      renderForm();
      expect(screen.getByLabelText(/profile\.email|Email/i)).toBeDisabled();
    });

    it("renders profile picture section", () => {
      renderForm();
      expect(
        screen.getByText(/profile\.profilePicture|Profile Picture/i)
      ).toBeInTheDocument();
    });

    it("renders the upload photo button when no image is set", () => {
      renderForm({ profile: { ...baseProfile, image: "" } });
      expect(
        screen.getByRole("button", {
          name: /profile\.uploadPhoto|Upload Photo/i,
        })
      ).toBeInTheDocument();
    });

    it("renders the change photo button when an image is already set", () => {
      renderForm({ profile: { ...baseProfile, image: "data:image/png;base64,abc" } });
      expect(
        screen.getByRole("button", {
          name: /profile\.changePhoto|Change Photo/i,
        })
      ).toBeInTheDocument();
    });

    it("renders a remove photo button when an image is already set", () => {
      renderForm({ profile: { ...baseProfile, image: "data:image/png;base64,abc" } });
      expect(
        screen.getByRole("button", {
          name: /profile\.removePhoto|Remove Photo/i,
        })
      ).toBeInTheDocument();
    });

    it("does not render remove photo button when no image is set", () => {
      renderForm({ profile: { ...baseProfile, image: "" } });
      expect(
        screen.queryByRole("button", {
          name: /profile\.removePhoto|Remove Photo/i,
        })
      ).not.toBeInTheDocument();
    });

    it("renders the save changes button", () => {
      renderForm();
      expect(
        screen.getByRole("button", { name: /common\.save|Save Changes/i })
      ).toBeInTheDocument();
    });

    it("applies className prop to the card", () => {
      const { container } = renderForm({ className: "custom-form-class" });
      expect(container.querySelector(".custom-form-class")).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Email verification badge
  // -------------------------------------------------------------------------
  describe("email verification badge", () => {
    it("shows 'Verified' badge when email is verified", () => {
      renderForm({ profile: { ...baseProfile, emailVerified: true } });
      expect(
        screen.getByText(/profile\.emailVerified|Verified/i)
      ).toBeInTheDocument();
    });

    it("shows 'Unverified' badge when email is not verified", () => {
      renderForm({ profile: { ...baseProfile, emailVerified: false } });
      expect(
        screen.getByText(/profile\.emailUnverified|Unverified/i)
      ).toBeInTheDocument();
    });

    it("does not show unverified badge when email is verified", () => {
      renderForm({ profile: { ...baseProfile, emailVerified: true } });
      expect(
        screen.queryByText(/profile\.emailUnverified|Unverified/i)
      ).not.toBeInTheDocument();
    });

    it("does not show verified badge when email is not verified", () => {
      renderForm({ profile: { ...baseProfile, emailVerified: false } });
      // Use a pattern that matches "Verified" as a whole word to avoid matching
      // "Unverified" which contains "Verified" as a substring
      expect(
        screen.queryByText(/profile\.emailVerified|\bVerified\b/i)
      ).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Send verification button
  // -------------------------------------------------------------------------
  describe("send verification button", () => {
    it("renders send verification button when email is unverified and handler provided", () => {
      renderForm({
        profile: { ...baseProfile, emailVerified: false },
        onSendVerification: vi.fn().mockResolvedValue(undefined),
      });
      expect(
        screen.getByRole("button", {
          name: /profile\.sendVerification|Send Verification/i,
        })
      ).toBeInTheDocument();
    });

    it("does not render send verification button when email is verified", () => {
      renderForm({
        profile: { ...baseProfile, emailVerified: true },
        onSendVerification: vi.fn().mockResolvedValue(undefined),
      });
      expect(
        screen.queryByRole("button", {
          name: /profile\.sendVerification|Send Verification/i,
        })
      ).not.toBeInTheDocument();
    });

    it("does not render send verification button when handler is not provided", () => {
      renderForm({
        profile: { ...baseProfile, emailVerified: false },
        // no onSendVerification
      });
      expect(
        screen.queryByRole("button", {
          name: /profile\.sendVerification|Send Verification/i,
        })
      ).not.toBeInTheDocument();
    });

    it("calls onSendVerification when send verification button is clicked", async () => {
      const onSendVerification = vi.fn().mockResolvedValue(undefined);
      renderForm({
        profile: { ...baseProfile, emailVerified: false },
        onSendVerification,
      });
      const btn = screen.getByRole("button", {
        name: /profile\.sendVerification|Send Verification/i,
      });
      fireEvent.click(btn);
      await waitFor(() => {
        expect(onSendVerification).toHaveBeenCalledOnce();
      });
    });

    it("shows toast.success after successful verification send", async () => {
      const onSendVerification = vi.fn().mockResolvedValue(undefined);
      renderForm({
        profile: { ...baseProfile, emailVerified: false },
        onSendVerification,
      });
      const btn = screen.getByRole("button", {
        name: /profile\.sendVerification|Send Verification/i,
      });
      fireEvent.click(btn);
      await waitFor(() => {
        expect(toast.success).toHaveBeenCalled();
      });
    });

    it("shows toast.error when onSendVerification rejects", async () => {
      const onSendVerification = vi
        .fn()
        .mockRejectedValue(new Error("Network error"));
      renderForm({
        profile: { ...baseProfile, emailVerified: false },
        onSendVerification,
      });
      const btn = screen.getByRole("button", {
        name: /profile\.sendVerification|Send Verification/i,
      });
      fireEvent.click(btn);
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith("Network error");
      });
    });
  });

  // -------------------------------------------------------------------------
  // Submit button state
  // -------------------------------------------------------------------------
  describe("submit button state", () => {
    it("save button is disabled when form is pristine (no changes)", () => {
      renderForm();
      const saveBtn = screen.getByRole("button", {
        name: /common\.save|Save Changes/i,
      });
      expect(saveBtn).toBeDisabled();
    });

    it("save button becomes enabled after editing a field", async () => {
      const user = userEvent.setup();
      renderForm();
      const firstNameInput = screen.getByLabelText(
        /profile\.firstName|First Name/i
      );
      await user.clear(firstNameInput);
      await user.type(firstNameInput, "John");
      const saveBtn = screen.getByRole("button", {
        name: /common\.save|Save Changes/i,
      });
      expect(saveBtn).not.toBeDisabled();
    });

    it("save button is disabled when externalLoading=true", () => {
      renderForm({ isLoading: true });
      // When externally loading, the form is replaced by a spinner, so no submit button
      expect(
        screen.queryByRole("button", { name: /common\.save|Save Changes/i })
      ).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // External loading state
  // -------------------------------------------------------------------------
  describe("external loading state", () => {
    it("shows a loading spinner instead of the form when isLoading=true", () => {
      renderForm({ isLoading: true });
      // The component renders a Loader2 inside a div when externalLoading=true
      // Form is hidden, save button not present
      expect(
        screen.queryByRole("button", { name: /common\.save|Save Changes/i })
      ).not.toBeInTheDocument();
    });

    it("shows the form when isLoading=false", () => {
      renderForm({ isLoading: false });
      expect(
        screen.getByRole("button", { name: /common\.save|Save Changes/i })
      ).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Form submission
  // -------------------------------------------------------------------------
  describe("form submission", () => {
    it("calls onUpdate with firstName, lastName and image on submit", async () => {
      const onUpdate = vi.fn().mockResolvedValue(undefined);
      const user = userEvent.setup();
      renderForm({ onUpdate });

      const firstNameInput = screen.getByLabelText(
        /profile\.firstName|First Name/i
      );
      await user.clear(firstNameInput);
      await user.type(firstNameInput, "John");

      const saveBtn = screen.getByRole("button", {
        name: /common\.save|Save Changes/i,
      });
      await user.click(saveBtn);

      await waitFor(() => {
        expect(onUpdate).toHaveBeenCalledOnce();
        expect(onUpdate).toHaveBeenCalledWith(
          expect.objectContaining({ firstName: "John", lastName: "Doe" })
        );
      });
    });

    it("does not include email in onUpdate payload", async () => {
      const onUpdate = vi.fn().mockResolvedValue(undefined);
      const user = userEvent.setup();
      renderForm({ onUpdate });

      const firstNameInput = screen.getByLabelText(
        /profile\.firstName|First Name/i
      );
      await user.clear(firstNameInput);
      await user.type(firstNameInput, "Updated");

      const saveBtn = screen.getByRole("button", {
        name: /common\.save|Save Changes/i,
      });
      await user.click(saveBtn);

      await waitFor(() => {
        expect(onUpdate).toHaveBeenCalledOnce();
        const callArg = onUpdate.mock.calls[0][0] as Record<string, unknown>;
        expect(callArg).not.toHaveProperty("email");
      });
    });

    it("shows toast.success after successful update", async () => {
      const onUpdate = vi.fn().mockResolvedValue(undefined);
      const user = userEvent.setup();
      renderForm({ onUpdate });

      const firstNameInput = screen.getByLabelText(
        /profile\.firstName|First Name/i
      );
      await user.clear(firstNameInput);
      await user.type(firstNameInput, "John");

      const saveBtn = screen.getByRole("button", {
        name: /common\.save|Save Changes/i,
      });
      await user.click(saveBtn);

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalled();
      });
    });

    it("shows toast.error when onUpdate rejects with an Error", async () => {
      const onUpdate = vi
        .fn()
        .mockRejectedValue(new Error("Server unavailable"));
      const user = userEvent.setup();
      renderForm({ onUpdate });

      const firstNameInput = screen.getByLabelText(
        /profile\.firstName|First Name/i
      );
      await user.clear(firstNameInput);
      await user.type(firstNameInput, "John");

      const saveBtn = screen.getByRole("button", {
        name: /common\.save|Save Changes/i,
      });
      await user.click(saveBtn);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith("Server unavailable");
      });
    });

    it("shows toast.error with fallback message when onUpdate rejects with non-Error", async () => {
      const onUpdate = vi.fn().mockRejectedValue("unknown error");
      const user = userEvent.setup();
      renderForm({ onUpdate });

      const firstNameInput = screen.getByLabelText(
        /profile\.firstName|First Name/i
      );
      await user.clear(firstNameInput);
      await user.type(firstNameInput, "John");

      const saveBtn = screen.getByRole("button", {
        name: /common\.save|Save Changes/i,
      });
      await user.click(saveBtn);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalled();
      });
    });

    it("does not call onUpdate when onUpdate prop is not provided", async () => {
      const user = userEvent.setup();
      // Render without onUpdate — the component returns early
      render(
        <ProfileForm
          profile={baseProfile}
          // no onUpdate
        />
      );

      const firstNameInput = screen.getByLabelText(
        /profile\.firstName|First Name/i
      );
      await user.clear(firstNameInput);
      await user.type(firstNameInput, "John");

      const saveBtn = screen.getByRole("button", {
        name: /common\.save|Save Changes/i,
      });
      // Should be enabled (form is dirty) but clicking should not throw
      await user.click(saveBtn);
      // No assertion on a mock — just verifying no error is thrown
    });
  });

  // -------------------------------------------------------------------------
  // Loading state during save
  // -------------------------------------------------------------------------
  describe("loading state during save", () => {
    it("inputs are disabled while saving", async () => {
      // Create a never-resolving promise to hold isUpdating=true
      let resolveUpdate!: () => void;
      const onUpdate = vi.fn(
        () =>
          new Promise<void>((res) => {
            resolveUpdate = res;
          })
      );
      const user = userEvent.setup();
      renderForm({ onUpdate });

      const firstNameInput = screen.getByLabelText(
        /profile\.firstName|First Name/i
      );
      await user.clear(firstNameInput);
      await user.type(firstNameInput, "John");

      const saveBtn = screen.getByRole("button", {
        name: /common\.save|Save Changes/i,
      });
      await user.click(saveBtn);

      await waitFor(() => {
        expect(
          screen.getByLabelText(/profile\.firstName|First Name/i)
        ).toBeDisabled();
      });

      // Resolve to avoid hanging
      resolveUpdate();
    });

    it("shows saving text while update is in progress", async () => {
      let resolveUpdate!: () => void;
      const onUpdate = vi.fn(
        () =>
          new Promise<void>((res) => {
            resolveUpdate = res;
          })
      );
      const user = userEvent.setup();
      renderForm({ onUpdate });

      const firstNameInput = screen.getByLabelText(
        /profile\.firstName|First Name/i
      );
      await user.clear(firstNameInput);
      await user.type(firstNameInput, "John");

      const saveBtn = screen.getByRole("button", {
        name: /common\.save|Save Changes/i,
      });
      await user.click(saveBtn);

      await waitFor(() => {
        expect(
          screen.getByText(/common\.saving|Saving/i)
        ).toBeInTheDocument();
      });

      resolveUpdate();
    });
  });

  // -------------------------------------------------------------------------
  // Form reset / cancel
  // -------------------------------------------------------------------------
  describe("form reset behaviour", () => {
    it("resetting the form (via profile prop change) restores original values", async () => {
      const { rerender } = renderForm();

      const firstNameInput = screen.getByLabelText(
        /profile\.firstName|First Name/i
      );
      // Change the value in the input
      fireEvent.change(firstNameInput, { target: { value: "Temporary" } });
      expect(firstNameInput).toHaveValue("Temporary");

      // Pass a new object reference with the same values to trigger the useEffect
      // (same reference as baseProfile would not trigger the effect)
      rerender(
        <ProfileForm
          profile={{ ...baseProfile }}
          onUpdate={vi.fn().mockResolvedValue(undefined)}
        />
      );

      expect(
        screen.getByLabelText(/profile\.firstName|First Name/i)
      ).toHaveValue("Jane");
    });

    it("form updates when a new profile object is passed via props", () => {
      const { rerender } = renderForm();

      rerender(
        <ProfileForm
          profile={{ ...baseProfile, firstName: "Alice", lastName: "Smith" }}
          onUpdate={vi.fn().mockResolvedValue(undefined)}
        />
      );

      expect(
        screen.getByLabelText(/profile\.firstName|First Name/i)
      ).toHaveValue("Alice");
      expect(
        screen.getByLabelText(/profile\.lastName|Last Name/i)
      ).toHaveValue("Smith");
    });
  });

  // -------------------------------------------------------------------------
  // Remove photo
  // -------------------------------------------------------------------------
  describe("remove photo button", () => {
    it("removes the image and hides the remove button after clicking remove photo", async () => {
      const user = userEvent.setup();
      renderForm({ profile: { ...baseProfile, image: "data:image/png;base64,abc" } });

      const removeBtn = screen.getByRole("button", {
        name: /profile\.removePhoto|Remove Photo/i,
      });
      await user.click(removeBtn);

      // After removing, remove button should disappear
      expect(
        screen.queryByRole("button", {
          name: /profile\.removePhoto|Remove Photo/i,
        })
      ).not.toBeInTheDocument();
    });

    it("shows upload photo button again after removing the image", async () => {
      const user = userEvent.setup();
      renderForm({ profile: { ...baseProfile, image: "data:image/png;base64,abc" } });

      const removeBtn = screen.getByRole("button", {
        name: /profile\.removePhoto|Remove Photo/i,
      });
      await user.click(removeBtn);

      expect(
        screen.getByRole("button", {
          name: /profile\.uploadPhoto|Upload Photo/i,
        })
      ).toBeInTheDocument();
    });

    it("marks form as dirty after removing image, enabling save", async () => {
      const user = userEvent.setup();
      renderForm({ profile: { ...baseProfile, image: "data:image/png;base64,abc" } });

      const removeBtn = screen.getByRole("button", {
        name: /profile\.removePhoto|Remove Photo/i,
      });
      await user.click(removeBtn);

      const saveBtn = screen.getByRole("button", {
        name: /common\.save|Save Changes/i,
      });
      expect(saveBtn).not.toBeDisabled();
    });
  });

  // -------------------------------------------------------------------------
  // Edge cases / empty profile
  // -------------------------------------------------------------------------
  describe("empty profile values", () => {
    it("renders empty first name input when profile has no firstName", () => {
      renderForm({
        profile: { email: "user@example.com", emailVerified: true },
      });
      const input = screen.getByLabelText(/profile\.firstName|First Name/i);
      expect(input).toHaveValue("");
    });

    it("renders empty last name input when profile has no lastName", () => {
      renderForm({
        profile: { email: "user@example.com", emailVerified: true },
      });
      const input = screen.getByLabelText(/profile\.lastName|Last Name/i);
      expect(input).toHaveValue("");
    });
  });
});
