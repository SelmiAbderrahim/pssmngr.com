// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * VaultItemListView Unit Tests
 *
 * Verifies the same items render in the presentation chosen by viewMode
 * (grid / table / list) and that the detail-pane `narrow` flag forces stacked
 * cards.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VaultItemListView } from "../VaultItemListView";
import type { DecryptedVaultItem } from "../vaultItemDisplay";

const items: DecryptedVaultItem[] = [
  {
    id: "1",
    itemType: "login",
    isFavorite: false,
    isShared: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    decrypted: { title: "GitHub", username: "octocat" },
  },
  {
    id: "2",
    itemType: "card",
    isFavorite: true,
    isShared: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    decrypted: { title: "Visa", number: "4111111111111111" },
  },
];

function renderView(viewMode: "grid" | "table" | "list", narrow = false) {
  const onSelect = vi.fn();
  const onToggleFavorite = vi.fn();
  render(
    <VaultItemListView
      items={items}
      viewMode={viewMode}
      narrow={narrow}
      onSelect={onSelect}
      onToggleFavorite={onToggleFavorite}
    />
  );
  return { onSelect, onToggleFavorite };
}

describe("VaultItemListView", () => {
  it("renders all items in grid mode", () => {
    renderView("grid");
    expect(screen.getByText("GitHub")).toBeInTheDocument();
    expect(screen.getByText("Visa")).toBeInTheDocument();
    expect(document.querySelector("table")).toBeNull();
  });

  it("renders a table in table mode", () => {
    renderView("table");
    const table = document.querySelector("table");
    expect(table).not.toBeNull();
    expect(within(table as HTMLElement).getByText("GitHub")).toBeInTheDocument();
  });

  it("renders rows (no table) in list mode", () => {
    renderView("list");
    expect(document.querySelector("table")).toBeNull();
    expect(screen.getByText("GitHub")).toBeInTheDocument();
    expect(screen.getByText("Visa")).toBeInTheDocument();
  });

  it("forces stacked cards (no table) when narrow even if viewMode=table", () => {
    renderView("table", true);
    expect(document.querySelector("table")).toBeNull();
    expect(screen.getByText("GitHub")).toBeInTheDocument();
  });

  it("calls onSelect when a row is clicked", async () => {
    const user = userEvent.setup();
    const { onSelect } = renderView("table");
    await user.click(screen.getByText("GitHub"));
    expect(onSelect).toHaveBeenCalledWith(items[0]);
  });
});
