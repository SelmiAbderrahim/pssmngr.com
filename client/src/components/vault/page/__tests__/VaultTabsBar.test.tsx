// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * VaultTabsBar tests — trash badge visibility and onTabChange wiring.
 * Radix tab triggers activate on mousedown, so tests fire mouseDown.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { VaultTabsBar } from "../VaultTabsBar";

describe("VaultTabsBar", () => {
  const onTabChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders all four tab triggers", () => {
    render(
      <VaultTabsBar tab="items" trashCount={0} onTabChange={onTabChange} />,
    );
    expect(screen.getByText("vault.items")).toBeInTheDocument();
    expect(screen.getByText("vault.authenticators")).toBeInTheDocument();
    expect(screen.getByText("vault.sharing")).toBeInTheDocument();
    expect(screen.getByText("vault.trash")).toBeInTheDocument();
  });

  it("shows the trash count badge when trashCount > 0", () => {
    render(
      <VaultTabsBar tab="items" trashCount={3} onTabChange={onTabChange} />,
    );
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("hides the trash count badge when trashCount is 0", () => {
    render(
      <VaultTabsBar tab="items" trashCount={0} onTabChange={onTabChange} />,
    );
    expect(screen.queryByText("0")).toBeNull();
  });

  it("marks the active tab from the tab prop", () => {
    render(
      <VaultTabsBar tab="sharing" trashCount={0} onTabChange={onTabChange} />,
    );
    expect(
      screen.getByRole("tab", { name: /vault\.sharing/ }),
    ).toHaveAttribute("data-state", "active");
    expect(
      screen.getByRole("tab", { name: /vault\.items/ }),
    ).toHaveAttribute("data-state", "inactive");
  });

  it("fires onTabChange with the clicked tab value", () => {
    render(
      <VaultTabsBar tab="items" trashCount={0} onTabChange={onTabChange} />,
    );
    fireEvent.mouseDown(
      screen.getByRole("tab", { name: /vault\.trash/ }),
      { button: 0 },
    );
    expect(onTabChange).toHaveBeenCalledWith("trash");
  });
});
