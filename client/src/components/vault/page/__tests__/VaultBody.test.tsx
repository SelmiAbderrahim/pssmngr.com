// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * VaultBody tests — the 4-way tab switch renders exactly the child for
 * the active tab. Children are mocked to stubs.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { VaultBody } from "../VaultBody";
import type { TabState } from "../utils";

vi.mock("../ItemsTab", () => ({
  ItemsTab: () => <div data-testid="tab-items" />,
}));
vi.mock("../AuthenticatorsTab", () => ({
  AuthenticatorsTab: () => <div data-testid="tab-authenticators" />,
}));
vi.mock("../SharingTab", () => ({
  SharingTab: ({ onShareAccepted }: { onShareAccepted?: () => void }) => (
    <div
      data-testid="tab-sharing"
      data-has-callback={onShareAccepted ? "yes" : "no"}
    />
  ),
}));
vi.mock("../TrashTab", () => ({
  TrashTab: ({ vaultId }: { vaultId: string }) => (
    <div data-testid="tab-trash" data-vault-id={vaultId} />
  ),
}));

type Props = React.ComponentProps<typeof VaultBody>;

function makeProps(tab: TabState): Props {
  return {
    tab,
    vault: { id: "vault-1" } as never,
    filteredItems: [],
    decryptedItems: [],
    selectedItem: null,
    viewMode: "grid" as never,
    searchInput: "",
    onSearchInputChange: vi.fn(),
    filter: "all" as never,
    sort: "modified" as never,
    onFilterChange: vi.fn(),
    onSortChange: vi.fn(),
    isLoading: false,
    itemsLoading: false,
    decrypting: false,
    hasItems: false,
    hasFilteredItems: false,
    isOrgPending: false,
    canMutateItems: true,
    canUsePersonalSharing: true,
    sharedAccess: false,
    nextCursor: undefined,
    loadingMore: false,
    favoriteLoadingId: null,
    onLoadMore: vi.fn(),
    onSelectItem: vi.fn(),
    onCloseDetail: vi.fn(),
    onToggleFavorite: vi.fn(),
    onSaveItem: vi.fn(async () => {}),
    onDeleteItem: vi.fn(async () => {}),
    onShareClick: vi.fn(),
    onAddClick: vi.fn(),
    onScanQR: vi.fn(),
    onRestoreItem: vi.fn(),
    onShareAccepted: vi.fn(),
  };
}

const ALL_STUBS = [
  "tab-items",
  "tab-authenticators",
  "tab-sharing",
  "tab-trash",
] as const;

describe("VaultBody (tab switch)", () => {
  const cases: Array<[TabState, (typeof ALL_STUBS)[number]]> = [
    ["items", "tab-items"],
    ["authenticators", "tab-authenticators"],
    ["sharing", "tab-sharing"],
    ["trash", "tab-trash"],
  ];

  for (const [tab, expected] of cases) {
    it(`tab=${tab}: renders exactly its child`, () => {
      render(<VaultBody {...makeProps(tab)} />);
      for (const id of ALL_STUBS) {
        if (id === expected) {
          expect(screen.getByTestId(id)).toBeInTheDocument();
        } else {
          expect(screen.queryByTestId(id)).toBeNull();
        }
      }
    });
  }

  it("forwards onShareAccepted to SharingTab", () => {
    render(<VaultBody {...makeProps("sharing")} />);
    expect(screen.getByTestId("tab-sharing")).toHaveAttribute(
      "data-has-callback",
      "yes",
    );
  });

  it("forwards the vault id to TrashTab", () => {
    render(<VaultBody {...makeProps("trash")} />);
    expect(screen.getByTestId("tab-trash")).toHaveAttribute(
      "data-vault-id",
      "vault-1",
    );
  });
});
