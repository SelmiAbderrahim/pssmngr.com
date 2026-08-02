// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * AlertBlock Component Tests
 *
 * Covers:
 * - All four type variants: info, success, warning, error
 * - Default type (info) when no type prop provided
 * - Children content rendering
 * - Custom icon overrides the default icon
 * - role="alert" accessibility attribute
 * - className and data-testid passthrough via ...divProps
 * - Correct colour classes applied per variant
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { AlertBlock } from "../AlertBlock";

describe("AlertBlock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Accessibility ──────────────────────────────────────────────────

  it('has role="alert" for screen-reader announcements', () => {
    render(<AlertBlock type="info">Informational message</AlertBlock>);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  // ── Children content ───────────────────────────────────────────────

  it("renders children text content", () => {
    render(<AlertBlock type="info">Hello world</AlertBlock>);
    expect(screen.getByText("Hello world")).toBeInTheDocument();
  });

  it("renders complex children (JSX node)", () => {
    render(
      <AlertBlock type="success">
        <strong>Bold message</strong> with extra text
      </AlertBlock>
    );
    expect(screen.getByText("Bold message")).toBeInTheDocument();
  });

  // ── Info variant ───────────────────────────────────────────────────

  it("renders info variant with blue colour classes", () => {
    render(<AlertBlock type="info">Info text</AlertBlock>);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveClass("bg-blue-50");
    expect(alert).toHaveClass("text-blue-600");
  });

  it("defaults to info type when no type prop is provided", () => {
    render(<AlertBlock>Default type message</AlertBlock>);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveClass("bg-blue-50");
  });

  it("renders an svg icon for info variant", () => {
    const { container } = render(
      <AlertBlock type="info">Info text</AlertBlock>
    );
    const svgs = container.querySelectorAll("svg");
    expect(svgs.length).toBeGreaterThan(0);
  });

  // ── Success variant ────────────────────────────────────────────────

  it("renders success variant with green colour classes", () => {
    render(<AlertBlock type="success">Success text</AlertBlock>);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveClass("bg-green-50");
    expect(alert).toHaveClass("text-green-600");
  });

  it("renders an svg icon for success variant", () => {
    const { container } = render(
      <AlertBlock type="success">Success text</AlertBlock>
    );
    const svgs = container.querySelectorAll("svg");
    expect(svgs.length).toBeGreaterThan(0);
  });

  // ── Warning variant ────────────────────────────────────────────────

  it("renders warning variant with orange colour classes", () => {
    render(<AlertBlock type="warning">Warning text</AlertBlock>);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveClass("bg-orange-50");
    expect(alert).toHaveClass("text-orange-600");
  });

  it("renders an svg icon for warning variant", () => {
    const { container } = render(
      <AlertBlock type="warning">Warning text</AlertBlock>
    );
    const svgs = container.querySelectorAll("svg");
    expect(svgs.length).toBeGreaterThan(0);
  });

  // ── Error variant ──────────────────────────────────────────────────

  it("renders error variant with red colour classes", () => {
    render(<AlertBlock type="error">Error text</AlertBlock>);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveClass("bg-red-50");
    expect(alert).toHaveClass("text-red-600");
  });

  it("renders an svg icon for error variant", () => {
    const { container } = render(
      <AlertBlock type="error">Error text</AlertBlock>
    );
    const svgs = container.querySelectorAll("svg");
    expect(svgs.length).toBeGreaterThan(0);
  });

  // ── Custom icon ────────────────────────────────────────────────────

  it("renders a custom icon when the icon prop is provided", () => {
    render(
      <AlertBlock
        type="info"
        icon={<span data-testid="custom-icon">!</span>}
      >
        Message with custom icon
      </AlertBlock>
    );
    expect(screen.getByTestId("custom-icon")).toBeInTheDocument();
  });

  it("does not render the default svg icon when a custom icon is provided", () => {
    const { container } = render(
      <AlertBlock
        type="error"
        icon={<span data-testid="my-icon">X</span>}
      >
        Message
      </AlertBlock>
    );
    // Custom icon replaces the svg — no lucide svg should be present inside the icon slot
    const iconSlot = container.querySelector(".flex-shrink-0");
    expect(iconSlot?.querySelector("svg")).not.toBeInTheDocument();
    expect(screen.getByTestId("my-icon")).toBeInTheDocument();
  });

  // ── divProps passthrough ───────────────────────────────────────────

  it("forwards className to the root div", () => {
    render(
      <AlertBlock type="info" className="my-alert-class">
        Message
      </AlertBlock>
    );
    expect(screen.getByRole("alert")).toHaveClass("my-alert-class");
  });

  it("forwards data-testid to the root div", () => {
    render(
      <AlertBlock type="success" data-testid="my-alert-block">
        Success message
      </AlertBlock>
    );
    expect(screen.getByTestId("my-alert-block")).toBeInTheDocument();
  });

  it("forwards arbitrary HTML attributes to the root div", () => {
    render(
      <AlertBlock type="warning" id="alert-001" aria-label="Custom label">
        Warning message
      </AlertBlock>
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveAttribute("id", "alert-001");
    expect(alert).toHaveAttribute("aria-label", "Custom label");
  });

  // ── Layout structure ───────────────────────────────────────────────

  it("renders the children inside the flex-1 content wrapper", () => {
    const { container } = render(
      <AlertBlock type="info">Content here</AlertBlock>
    );
    const contentWrapper = container.querySelector(".flex-1");
    expect(contentWrapper).toBeInTheDocument();
    expect(contentWrapper?.textContent).toContain("Content here");
  });

  it("contains a flex-shrink-0 icon wrapper alongside the content", () => {
    const { container } = render(
      <AlertBlock type="info">Content here</AlertBlock>
    );
    expect(container.querySelector(".flex-shrink-0")).toBeInTheDocument();
  });
});
