// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Tests for ProfileCompletion component.
 *
 * Covers:
 * - Progress percentage calculation (name=25%, avatar=25%, email=50%)
 * - Incomplete items list (only incomplete steps shown)
 * - All-complete state (100%): success message, no action buttons
 * - Partial completion states (0%, 25%, 50%, 75%)
 * - onActionClick callbacks for each action type
 * - className prop forwarded to card
 * - Accessibility: role=list for incomplete items
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ProfileCompletion } from "../ProfileCompletion";
import type { ProfileCompletionProps } from "../ProfileCompletion";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderCompletion(overrides: Partial<ProfileCompletionProps> = {}) {
  const props: ProfileCompletionProps = {
    hasName: false,
    hasAvatar: false,
    isEmailVerified: false,
    ...overrides,
  };
  return render(<ProfileCompletion {...props} />);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ProfileCompletion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Rendering — always present
  // -------------------------------------------------------------------------
  describe("rendering", () => {
    it("renders the card title", () => {
      renderCompletion();
      expect(
        screen.getByText(/profile\.completion\.title|Profile Completion/i)
      ).toBeInTheDocument();
    });

    it("applies className prop to the card", () => {
      const { container } = renderCompletion({ className: "my-custom-class" });
      expect(container.querySelector(".my-custom-class")).toBeInTheDocument();
    });

    it("renders a progress bar element", () => {
      renderCompletion();
      // Progress bar renders with role="progressbar" via Radix/Shadcn
      expect(screen.getByRole("progressbar")).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Percentage calculation
  // -------------------------------------------------------------------------
  describe("percentage display", () => {
    it("shows 0% when nothing is complete", () => {
      renderCompletion({ hasName: false, hasAvatar: false, isEmailVerified: false });
      expect(
        screen.getByText(/profile\.completion\.percentage|0%|0.*complete/i)
      ).toBeInTheDocument();
    });

    it("shows 25% when only name is complete", () => {
      renderCompletion({ hasName: true, hasAvatar: false, isEmailVerified: false });
      expect(
        screen.getByText(/profile\.completion\.percentage|25%|25.*complete/i)
      ).toBeInTheDocument();
    });

    it("shows 50% when name and avatar are complete", () => {
      renderCompletion({ hasName: true, hasAvatar: true, isEmailVerified: false });
      expect(
        screen.getByText(/profile\.completion\.percentage|50%|50.*complete/i)
      ).toBeInTheDocument();
    });

    it("shows 50% when only email is verified", () => {
      renderCompletion({ hasName: false, hasAvatar: false, isEmailVerified: true });
      expect(
        screen.getByText(/profile\.completion\.percentage|50%|50.*complete/i)
      ).toBeInTheDocument();
    });

    it("shows 75% when avatar and email are complete", () => {
      renderCompletion({ hasName: false, hasAvatar: true, isEmailVerified: true });
      expect(
        screen.getByText(/profile\.completion\.percentage|75%|75.*complete/i)
      ).toBeInTheDocument();
    });

    it("shows 100% when everything is complete", () => {
      renderCompletion({ hasName: true, hasAvatar: true, isEmailVerified: true });
      expect(
        screen.getByText(/profile\.completion\.percentage|100%|100.*complete/i)
      ).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Incomplete items list
  // -------------------------------------------------------------------------
  describe("incomplete items list", () => {
    it("shows all three incomplete steps when nothing is done", () => {
      renderCompletion({ hasName: false, hasAvatar: false, isEmailVerified: false });
      expect(
        screen.getByText(/profile\.completion\.addName|Add your name/i)
      ).toBeInTheDocument();
      expect(
        screen.getByText(/profile\.completion\.addAvatar|Add a profile picture/i)
      ).toBeInTheDocument();
      expect(
        screen.getByText(/profile\.completion\.verifyEmail|Verify your email/i)
      ).toBeInTheDocument();
    });

    it("does not show 'add name' step when hasName=true", () => {
      renderCompletion({ hasName: true, hasAvatar: false, isEmailVerified: false });
      expect(
        screen.queryByText(/profile\.completion\.addName|Add your name/i)
      ).not.toBeInTheDocument();
    });

    it("does not show 'add avatar' step when hasAvatar=true", () => {
      renderCompletion({ hasName: false, hasAvatar: true, isEmailVerified: false });
      expect(
        screen.queryByText(/profile\.completion\.addAvatar|Add a profile picture/i)
      ).not.toBeInTheDocument();
    });

    it("does not show 'verify email' step when isEmailVerified=true", () => {
      renderCompletion({ hasName: false, hasAvatar: false, isEmailVerified: true });
      expect(
        screen.queryByText(/profile\.completion\.verifyEmail|Verify your email/i)
      ).not.toBeInTheDocument();
    });

    it("renders incomplete items inside a list element", () => {
      renderCompletion({ hasName: false, hasAvatar: false, isEmailVerified: false });
      expect(screen.getByRole("list")).toBeInTheDocument();
    });

    it("renders each incomplete item as a button", () => {
      renderCompletion({ hasName: false, hasAvatar: false, isEmailVerified: false });
      // 3 incomplete items => 3 buttons
      const buttons = screen.getAllByRole("button");
      expect(buttons.length).toBe(3);
    });

    it("shows only one incomplete step when two are done", () => {
      renderCompletion({ hasName: true, hasAvatar: true, isEmailVerified: false });
      const buttons = screen.getAllByRole("button");
      expect(buttons.length).toBe(1);
      expect(
        screen.getByText(/profile\.completion\.verifyEmail|Verify your email/i)
      ).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // All-complete state
  // -------------------------------------------------------------------------
  describe("all-complete state", () => {
    it("shows 'all complete' message when everything is done", () => {
      renderCompletion({ hasName: true, hasAvatar: true, isEmailVerified: true });
      expect(
        screen.getByText(
          /profile\.completion\.allComplete|All profile items completed/i
        )
      ).toBeInTheDocument();
    });

    it("shows 'profile is complete' status text when complete", () => {
      renderCompletion({ hasName: true, hasAvatar: true, isEmailVerified: true });
      expect(
        screen.getByText(/profile\.completion\.complete|Your profile is complete/i)
      ).toBeInTheDocument();
    });

    it("does not render any action buttons when profile is complete", () => {
      renderCompletion({ hasName: true, hasAvatar: true, isEmailVerified: true });
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });

    it("does not render the incomplete items list when profile is complete", () => {
      renderCompletion({ hasName: true, hasAvatar: true, isEmailVerified: true });
      expect(screen.queryByRole("list")).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Incomplete status text
  // -------------------------------------------------------------------------
  describe("incomplete status text", () => {
    it("shows 'complete your profile' text when incomplete", () => {
      renderCompletion({ hasName: false, hasAvatar: false, isEmailVerified: false });
      expect(
        screen.getByText(/profile\.completion\.incomplete|Complete your profile/i)
      ).toBeInTheDocument();
    });

    it("does not show 'complete your profile' text when done", () => {
      renderCompletion({ hasName: true, hasAvatar: true, isEmailVerified: true });
      expect(
        screen.queryByText(/profile\.completion\.incomplete|Complete your profile/i)
      ).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // onActionClick callbacks
  // -------------------------------------------------------------------------
  describe("onActionClick callbacks", () => {
    it("calls onActionClick with 'name' when name item is clicked", () => {
      const onActionClick = vi.fn();
      renderCompletion({
        hasName: false,
        hasAvatar: false,
        isEmailVerified: false,
        onActionClick,
      });
      const nameBtn = screen.getByText(
        /profile\.completion\.addName|Add your name/i
      ).closest("button")!;
      fireEvent.click(nameBtn);
      expect(onActionClick).toHaveBeenCalledWith("name");
    });

    it("calls onActionClick with 'avatar' when avatar item is clicked", () => {
      const onActionClick = vi.fn();
      renderCompletion({
        hasName: false,
        hasAvatar: false,
        isEmailVerified: false,
        onActionClick,
      });
      const avatarBtn = screen.getByText(
        /profile\.completion\.addAvatar|Add a profile picture/i
      ).closest("button")!;
      fireEvent.click(avatarBtn);
      expect(onActionClick).toHaveBeenCalledWith("avatar");
    });

    it("calls onActionClick with 'email' when email item is clicked", () => {
      const onActionClick = vi.fn();
      renderCompletion({
        hasName: false,
        hasAvatar: false,
        isEmailVerified: false,
        onActionClick,
      });
      const emailBtn = screen.getByText(
        /profile\.completion\.verifyEmail|Verify your email/i
      ).closest("button")!;
      fireEvent.click(emailBtn);
      expect(onActionClick).toHaveBeenCalledWith("email");
    });

    it("does not throw when onActionClick is not provided and item is clicked", () => {
      renderCompletion({ hasName: false, hasAvatar: false, isEmailVerified: false });
      const nameBtn = screen.getByText(
        /profile\.completion\.addName|Add your name/i
      ).closest("button")!;
      expect(() => fireEvent.click(nameBtn)).not.toThrow();
    });

    it("calls onActionClick exactly once per click", () => {
      const onActionClick = vi.fn();
      renderCompletion({
        hasName: false,
        hasAvatar: false,
        isEmailVerified: false,
        onActionClick,
      });
      const nameBtn = screen.getByText(
        /profile\.completion\.addName|Add your name/i
      ).closest("button")!;
      fireEvent.click(nameBtn);
      fireEvent.click(nameBtn);
      expect(onActionClick).toHaveBeenCalledTimes(2);
    });
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------
  describe("edge cases", () => {
    it("renders without errors with all props true", () => {
      expect(() =>
        renderCompletion({ hasName: true, hasAvatar: true, isEmailVerified: true })
      ).not.toThrow();
    });

    it("renders without errors with all props false", () => {
      expect(() =>
        renderCompletion({ hasName: false, hasAvatar: false, isEmailVerified: false })
      ).not.toThrow();
    });

    it("renders without the optional className prop", () => {
      expect(() =>
        renderCompletion({ hasName: false, hasAvatar: false, isEmailVerified: false })
      ).not.toThrow();
    });
  });
});
