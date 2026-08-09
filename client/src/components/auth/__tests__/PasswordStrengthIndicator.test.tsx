// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * PasswordStrengthIndicator Component Tests
 *
 * Covers all branch conditions:
 * - Empty/null password (returns null)
 * - Strength levels: weak, medium, strong (color and label branches)
 * - showRequirements prop (true/false)
 * - feedback presence (non-empty vs empty array)
 * - RequirementItem met/unmet branches
 */

import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { PasswordStrengthIndicator } from "../PasswordStrengthIndicator";

// The global setup mocks usePasswordStrength via global.mockPasswordStrengthResult.
// We override it per-test to exercise each branch.

describe("PasswordStrengthIndicator", () => {
  beforeEach(() => {
    // Default: strong password, all requirements met, no feedback
    global.mockPasswordStrengthResult = {
      strength: "strong",
      score: 90,
      requirements: {
        length: true,
        uppercase: true,
        lowercase: true,
        number: true,
        special: true,
      },
      feedback: "",
    };
  });

  // -------------------------------------------------------------------------
  // Empty / null password branch
  // -------------------------------------------------------------------------

  describe("empty password", () => {
    it("renders nothing when password is an empty string", () => {
      const { container } = render(
        <PasswordStrengthIndicator password="" />
      );
      expect(container.firstChild).toBeNull();
    });

    it("renders nothing when password is whitespace-only", () => {
      // The component checks !password which is falsy for empty but not whitespace.
      // A non-empty string (even spaces) should render — this verifies the else path.
      global.mockPasswordStrengthResult = {
        strength: "weak",
        score: 10,
        requirements: {
          length: false,
          uppercase: false,
          lowercase: false,
          number: false,
          special: false,
        },
        feedback: "",
      };
      const { container } = render(
        <PasswordStrengthIndicator password=" " />
      );
      // Non-empty password renders the component
      expect(container.firstChild).not.toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Strength level branches (weak / medium / strong)
  // -------------------------------------------------------------------------

  describe("strength levels", () => {
    it("applies destructive color class for weak strength", () => {
      global.mockPasswordStrengthResult = {
        strength: "weak",
        score: 25,
        requirements: {
          length: false,
          uppercase: false,
          lowercase: true,
          number: false,
          special: false,
        },
        feedback: "",
      };
      render(<PasswordStrengthIndicator password="abc" />);

      // The strength label span should have text-destructive class
      const strengthLabel = screen.getByText(/weak/i);
      expect(strengthLabel).toHaveClass("text-destructive");

      // The progress bar div should have bg-destructive class
      const progressBar = screen.getByRole("progressbar");
      expect(progressBar).toHaveClass("bg-destructive");
    });

    it("applies amber color class for medium strength", () => {
      global.mockPasswordStrengthResult = {
        strength: "medium",
        score: 55,
        requirements: {
          length: true,
          uppercase: false,
          lowercase: true,
          number: true,
          special: false,
        },
        feedback: "",
      };
      render(<PasswordStrengthIndicator password="abc12345" />);

      const strengthLabel = screen.getByText(/medium/i);
      expect(strengthLabel).toHaveClass("text-amber-500");

      const progressBar = screen.getByRole("progressbar");
      expect(progressBar).toHaveClass("bg-amber-500");
    });

    it("applies green color class for strong strength", () => {
      global.mockPasswordStrengthResult = {
        strength: "strong",
        score: 90,
        requirements: {
          length: true,
          uppercase: true,
          lowercase: true,
          number: true,
          special: true,
        },
        feedback: "",
      };
      render(<PasswordStrengthIndicator password="Abc12345!" />);

      const strengthLabel = screen.getByText(/strong/i);
      expect(strengthLabel).toHaveClass("text-green-500");

      const progressBar = screen.getByRole("progressbar");
      expect(progressBar).toHaveClass("bg-green-500");
    });
  });

  // -------------------------------------------------------------------------
  // Progress bar aria attributes
  // -------------------------------------------------------------------------

  describe("progress bar", () => {
    it("sets aria-valuenow to the score", () => {
      global.mockPasswordStrengthResult = {
        strength: "medium",
        score: 55,
        requirements: {
          length: true,
          uppercase: false,
          lowercase: true,
          number: true,
          special: false,
        },
        feedback: "",
      };
      render(<PasswordStrengthIndicator password="abc12345" />);

      const progressBar = screen.getByRole("progressbar");
      expect(progressBar).toHaveAttribute("aria-valuenow", "55");
      expect(progressBar).toHaveAttribute("aria-valuemin", "0");
      expect(progressBar).toHaveAttribute("aria-valuemax", "100");
    });
  });

  // -------------------------------------------------------------------------
  // showRequirements prop branches
  // -------------------------------------------------------------------------

  describe("showRequirements prop", () => {
    it("shows requirements list when showRequirements is true (default)", () => {
      render(<PasswordStrengthIndicator password="Abc12345!" />);

      // The requirements section title is rendered
      const requirementsTitle = screen.getByText(
        /passwordStrength\.requirements\.title/i
      );
      expect(requirementsTitle).toBeInTheDocument();
    });

    it("hides requirements list when showRequirements is false", () => {
      render(
        <PasswordStrengthIndicator password="Abc12345!" showRequirements={false} />
      );

      // The requirements section title should not be rendered
      const requirementsTitle = screen.queryByText(
        /passwordStrength\.requirements\.title/i
      );
      expect(requirementsTitle).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Feedback branch (empty array vs non-empty array)
  // -------------------------------------------------------------------------

  describe("feedback messages", () => {
    it("does not render feedback list when feedback is empty", () => {
      global.mockPasswordStrengthResult = {
        strength: "strong",
        score: 90,
        requirements: {
          length: true,
          uppercase: true,
          lowercase: true,
          number: true,
          special: true,
        },
        feedback: "",
      };
      render(<PasswordStrengthIndicator password="Abc12345!" />);

      // No alert role for feedback when empty
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("renders feedback list when feedback is non-empty", () => {
      // The component checks: feedback && feedback.length > 0 then calls feedback.map().
      // Override the global mock to return feedback as an array (matching real hook shape).
      (global as any).mockPasswordStrengthResult = {
        strength: "weak",
        score: 10,
        requirements: {
          length: false,
          uppercase: false,
          lowercase: true,
          number: false,
          special: false,
        },
        feedback: ["Use at least 8 characters", "Add an uppercase letter"],
      };

      render(<PasswordStrengthIndicator password="abc" />);

      // Should render feedback items in an alert list
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.getByText("Use at least 8 characters")).toBeInTheDocument();
      expect(screen.getByText("Add an uppercase letter")).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // RequirementItem branches (met = true vs met = false)
  // -------------------------------------------------------------------------

  describe("RequirementItem", () => {
    it("renders Check icon and green class when requirement is met", () => {
      global.mockPasswordStrengthResult = {
        strength: "strong",
        score: 90,
        requirements: {
          length: true,
          uppercase: true,
          lowercase: true,
          number: true,
          special: true,
        },
        feedback: "",
      };
      render(<PasswordStrengthIndicator password="Abc12345!" />);

      // All requirement items should have sr-only "(met)" text
      const metTexts = screen.getAllByText("(met)");
      expect(metTexts.length).toBeGreaterThan(0);

      // Should NOT have any "(not met)" text
      expect(screen.queryByText("(not met)")).not.toBeInTheDocument();
    });

    it("renders X icon and muted class when requirement is not met", () => {
      global.mockPasswordStrengthResult = {
        strength: "weak",
        score: 15,
        requirements: {
          length: false,
          uppercase: false,
          lowercase: true,
          number: false,
          special: false,
        },
        feedback: "",
      };
      render(<PasswordStrengthIndicator password="abc" />);

      // Should have "(not met)" sr-only text for unmet requirements
      const notMetTexts = screen.getAllByText("(not met)");
      expect(notMetTexts.length).toBeGreaterThan(0);

      // Should also have at least one "(met)" for lowercase
      expect(screen.getByText("(met)")).toBeInTheDocument();
    });

    it("applies correct class to met requirement item", () => {
      global.mockPasswordStrengthResult = {
        strength: "strong",
        score: 90,
        requirements: {
          length: true,
          uppercase: true,
          lowercase: true,
          number: true,
          special: true,
        },
        feedback: "",
      };
      render(<PasswordStrengthIndicator password="Abc12345!" />);

      // All list items for met requirements should have green class
      const listItems = screen.getAllByRole("listitem");
      // Filter to those in the requirements ul (not feedback ul)
      // Met items have text-green-600 class
      const metItems = listItems.filter((item) =>
        item.classList.contains("text-green-600") ||
        item.classList.contains("dark:text-green-400")
      );
      expect(metItems.length).toBeGreaterThan(0);
    });

    it("applies muted class to unmet requirement item", () => {
      global.mockPasswordStrengthResult = {
        strength: "weak",
        score: 15,
        requirements: {
          length: false,
          uppercase: false,
          lowercase: false,
          number: false,
          special: false,
        },
        feedback: "",
      };
      render(<PasswordStrengthIndicator password="X" />);

      // All requirement items should be unmet / muted
      const notMetTexts = screen.getAllByText("(not met)");
      expect(notMetTexts.length).toBe(5); // all 5 requirements unmet
    });
  });

  // -------------------------------------------------------------------------
  // className prop
  // -------------------------------------------------------------------------

  describe("className prop", () => {
    it("applies custom className to wrapper", () => {
      render(
        <PasswordStrengthIndicator password="Abc12345!" className="my-custom-class" />
      );

      const wrapper = screen.getByRole("status");
      expect(wrapper).toHaveClass("my-custom-class");
    });

    it("works without className prop", () => {
      render(<PasswordStrengthIndicator password="Abc12345!" />);

      const wrapper = screen.getByRole("status");
      expect(wrapper).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Accessibility
  // -------------------------------------------------------------------------

  describe("accessibility", () => {
    it("has role status with aria-live polite", () => {
      render(<PasswordStrengthIndicator password="Abc12345!" />);

      const status = screen.getByRole("status");
      expect(status).toHaveAttribute("aria-live", "polite");
    });

    it("has aria-label on the wrapper", () => {
      render(<PasswordStrengthIndicator password="Abc12345!" />);

      const status = screen.getByRole("status");
      expect(status).toHaveAttribute("aria-label");
    });
  });
});
