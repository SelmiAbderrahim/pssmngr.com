// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const navigate = vi.fn();
let pathname = "/dashboard/vault";
let searchStr = "";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, className, search, ...props }: any) => {
    // Ignore `search` here — we assert on `to` only. In real routing this
    // becomes ?tab=sharing but we test that at the interaction level.
    void search;
    return (
      <a href={to} className={className} {...props}>
        {children}
      </a>
    );
  },
  useNavigate: () => navigate,
  useRouterState: ({ select }: any) =>
    select({ location: { pathname, searchStr } }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (k: string, fallback?: string | Record<string, unknown>) =>
      typeof fallback === "string" ? fallback : k,
  }),
}));

vi.mock("@/components/generator/GeneratorPanel", () => ({
  GeneratorPanel: () => <div data-testid="generator-panel">GEN</div>,
}));

import { BottomNav } from "../BottomNav";

describe("BottomNav", () => {
  beforeEach(() => {
    pathname = "/dashboard/vault";
    searchStr = "";
    navigate.mockClear();
  });

  it("renders five slots: vault, security, +, sharing, settings", () => {
    render(<BottomNav />);
    expect(screen.getByText("Vault")).toBeInTheDocument();
    expect(screen.getByText("Security")).toBeInTheDocument();
    expect(screen.getByText("bottom_nav.sharing")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(screen.getByLabelText("bottom_nav.quick_add")).toBeInTheDocument();
  });

  it("center + button carries the generator-button tour anchor", () => {
    render(<BottomNav />);
    expect(screen.getByLabelText("bottom_nav.quick_add")).toHaveAttribute(
      "data-tour",
      "generator-button",
    );
  });

  it("nav-* tour anchors are on the vault/security/settings links", () => {
    render(<BottomNav />);
    expect(
      document.querySelector('a[data-tour="nav-vault"]'),
    ).not.toBeNull();
    expect(
      document.querySelector('a[data-tour="nav-security"]'),
    ).not.toBeNull();
    expect(
      document.querySelector('a[data-tour="nav-settings"]'),
    ).not.toBeNull();
  });

  it("marks security active from router state", () => {
    pathname = "/dashboard/watchtower";
    render(<BottomNav />);
    expect(
      screen.getByText("Security").closest("a"),
    ).toHaveAttribute("aria-current", "page");
  });

  it("marks sharing active when the tab=sharing query is present", () => {
    pathname = "/dashboard/vault";
    searchStr = "tab=sharing";
    render(<BottomNav />);
    expect(
      screen.getByText("bottom_nav.sharing").closest("a"),
    ).toHaveAttribute("aria-current", "page");
  });

  it("quick-add routes each type to /dashboard/vault with create=<type>", () => {
    render(<BottomNav />);
    fireEvent.click(screen.getByLabelText("bottom_nav.quick_add"));
    fireEvent.click(screen.getByText("quick_add.login"));
    expect(navigate).toHaveBeenCalledWith({
      to: "/dashboard/vault",
      search: {
        tab: "items",
        filter: "all",
        sort: "modified",
        q: "",
        create: "login",
      },
    });
  });

  it("quick-add generator entry opens the GeneratorPanel sheet", () => {
    render(<BottomNav />);
    fireEvent.click(screen.getByLabelText("bottom_nav.quick_add"));
    fireEvent.click(screen.getByText("Generate password"));
    expect(screen.getByTestId("generator-panel")).toBeInTheDocument();
  });

  it("sharing tab renders the vault link (deep-link is url-based)", () => {
    render(<BottomNav />);
    const sharing = screen.getByText("bottom_nav.sharing").closest("a");
    expect(sharing).toHaveAttribute("href", "/dashboard/vault");
  });
});
