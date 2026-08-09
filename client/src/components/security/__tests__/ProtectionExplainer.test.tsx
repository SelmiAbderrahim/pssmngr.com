// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProtectionExplainer } from "../ProtectionExplainer";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    search,
    hash,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    to: string;
    search?: { tab?: string };
    hash?: string;
  }) => (
    <a href={to} data-search-tab={search?.tab} data-hash={hash} {...props}>
      {children}
    </a>
  ),
}));

describe("ProtectionExplainer", () => {
  describe("variant: full", () => {
    it("renders all three protection points", () => {
      render(<ProtectionExplainer variant="full" />);
      expect(
        screen.getByTestId("protection-explainer-full"),
      ).toBeInTheDocument();
      // Global i18n mock returns the KEY, so we assert on the key strings.
      expect(screen.getByText("explainer.title")).toBeInTheDocument();
      expect(
        screen.getByText("explainer.encryptedOnDevice.title"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("explainer.encryptedOnDevice.body"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("explainer.twoSecretsNeverSent.title"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("explainer.twoSecretsNeverSent.body"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("explainer.youControlThisDevice.title"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("explainer.youControlThisDevice.body"),
      ).toBeInTheDocument();
    });

    it("renders an ordered list numbered 1..3", () => {
      const { container } = render(<ProtectionExplainer variant="full" />);
      const list = container.querySelector("ol");
      expect(list).not.toBeNull();
      expect(list?.querySelectorAll("li")).toHaveLength(3);
    });

    it("links the unlock setting to the Security section on Settings", () => {
      render(<ProtectionExplainer variant="full" />);
      const link = screen.getByTestId("protection-explainer-unlock-link");
      expect(link).toHaveAttribute("href", "/dashboard/settings");
      expect(link).toHaveAttribute("data-search-tab", "security");
      expect(link).toHaveAttribute("data-hash", "section-security");
    });

    it("accepts an extra className", () => {
      const { container } = render(
        <ProtectionExplainer variant="full" className="mt-8" />,
      );
      expect(container.querySelector("section")).toHaveClass("mt-8");
    });
  });

  describe("variant: compact", () => {
    it("renders the same three points with a compact test id", () => {
      render(<ProtectionExplainer variant="compact" />);
      expect(
        screen.getByTestId("protection-explainer-compact"),
      ).toBeInTheDocument();
      expect(screen.getByText("explainer.title")).toBeInTheDocument();
      expect(
        screen.getByText("explainer.encryptedOnDevice.title"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("explainer.twoSecretsNeverSent.title"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("explainer.youControlThisDevice.title"),
      ).toBeInTheDocument();
    });

    it("still exposes the unlock settings link", () => {
      render(<ProtectionExplainer variant="compact" />);
      expect(
        screen.getByTestId("protection-explainer-unlock-link"),
      ).toBeInTheDocument();
    });
  });
});
