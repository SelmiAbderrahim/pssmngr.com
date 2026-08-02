// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * ItemsTab tests.
 *
 * Covers: empty state, no-results state, loading skeletons, load-more
 * button, detail-panel split, canMutateItems / canUsePersonalSharing
 * gating, and the data-tour anchors (vault-share, vault-search,
 * vault-add-item).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ItemsTab } from "../ItemsTab";
import type { DecryptedVaultItem } from "@/components/vault/VaultItemCard";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    children,
    ...props
  }: {
    to?: string;
    children?: React.ReactNode;
  }) => (
    <a href={typeof to === "string" ? to : "#"} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/vault/VaultItemListView", () => ({
  VaultItemListView: ({ items }: { items: unknown[] }) => (
    <div data-testid="item-list" data-count={items.length} />
  ),
}));

vi.mock("@/components/vault/ItemDetailView", () => ({
  ItemDetailView: ({
    onShareClick,
    onEphemeralShareClick,
    canEdit,
    canDelete,
  }: {
    onShareClick?: (id: string) => void;
    onEphemeralShareClick?: (id: string) => void;
    canEdit?: boolean;
    canDelete?: boolean;
  }) => (
    <div
      data-testid="item-detail"
      data-share={onShareClick ? "yes" : "no"}
      data-eshare={onEphemeralShareClick ? "yes" : "no"}
      data-canedit={String(canEdit)}
      data-candelete={String(canDelete)}
    />
  ),
}));

vi.mock("@/components/security/ProtectionExplainer", () => ({
  ProtectionExplainer: () => <div data-testid="protection-explainer" />,
}));

function makeItem(
  overrides: Partial<DecryptedVaultItem> = {},
): DecryptedVaultItem {
  return {
    id: "item-1",
    itemType: "login",
    isFavorite: false,
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: new Date().toISOString(),
    decrypted: { title: "My Login", username: "admin" },
    ...overrides,
  };
}

type Props = React.ComponentProps<typeof ItemsTab>;

function makeProps(overrides: Partial<Props> = {}): Props {
  return {
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
    ...overrides,
  };
}

describe("ItemsTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Empty state ──────────────────────────────────────────────────

  it("renders the empty state with tour anchors and add button", () => {
    const props = makeProps();
    const { container } = render(<ItemsTab {...props} />);

    expect(screen.getByTestId("vault-empty-state")).toBeInTheDocument();
    expect(screen.getByText("vault.empty")).toBeInTheDocument();
    expect(screen.getByTestId("protection-explainer")).toBeInTheDocument();

    // Tour anchors present even when empty
    expect(
      container.querySelector('[data-tour="vault-share"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-tour="vault-search"]'),
    ).toBeInTheDocument();
    const addBtn = container.querySelector('[data-tour="vault-add-item"]');
    expect(addBtn).toBeInTheDocument();

    fireEvent.click(addBtn as HTMLElement);
    expect(props.onAddClick).toHaveBeenCalledTimes(1);
  });

  it("hides the add button and import link when canMutateItems is false", () => {
    const { container } = render(
      <ItemsTab {...makeProps({ canMutateItems: false })} />,
    );
    expect(screen.getByTestId("vault-empty-state")).toBeInTheDocument();
    expect(
      container.querySelector('[data-tour="vault-add-item"]'),
    ).toBeNull();
    expect(screen.queryByText("vault.addFirstItem")).toBeNull();
  });

  it("does not render the empty state while the org grant is pending", () => {
    render(<ItemsTab {...makeProps({ isOrgPending: true })} />);
    expect(screen.queryByTestId("vault-empty-state")).toBeNull();
  });

  // ── No-results state ─────────────────────────────────────────────

  it("renders the no-results card when items exist but none match", () => {
    render(
      <ItemsTab
        {...makeProps({ hasItems: true, hasFilteredItems: false })}
      />,
    );
    expect(screen.getByText("vault.noResults")).toBeInTheDocument();
    expect(screen.queryByTestId("vault-empty-state")).toBeNull();
    expect(screen.queryByTestId("item-list")).toBeNull();
  });

  // ── Loading skeletons ────────────────────────────────────────────

  it("renders 6 loading skeletons while items load and nothing is cached", () => {
    const { container } = render(
      <ItemsTab
        {...makeProps({ isLoading: true, itemsLoading: true, hasItems: false })}
      />,
    );
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(6);
    expect(screen.queryByTestId("vault-empty-state")).toBeNull();
  });

  it("skips skeletons when items are already cached", () => {
    const { container } = render(
      <ItemsTab
        {...makeProps({
          itemsLoading: true,
          hasItems: true,
          hasFilteredItems: true,
          filteredItems: [makeItem()],
        })}
      />,
    );
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(0);
    expect(screen.getByTestId("item-list")).toBeInTheDocument();
  });

  // ── Populated list ───────────────────────────────────────────────

  it("renders the list with tour anchors when items match", () => {
    const { container } = render(
      <ItemsTab
        {...makeProps({
          hasItems: true,
          hasFilteredItems: true,
          filteredItems: [makeItem(), makeItem({ id: "item-2" })],
        })}
      />,
    );
    expect(screen.getByTestId("item-list")).toHaveAttribute("data-count", "2");
    expect(
      container.querySelector('[data-tour="vault-share"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-tour="vault-search"]'),
    ).toBeInTheDocument();
    // No load-more without a cursor
    expect(screen.queryByText("vault.loadMore")).toBeNull();
  });

  // ── Load more ────────────────────────────────────────────────────

  it("shows the load-more button when nextCursor is set and wires onLoadMore", () => {
    const props = makeProps({
      hasItems: true,
      hasFilteredItems: true,
      filteredItems: [makeItem()],
      nextCursor: "cursor-2",
    });
    render(<ItemsTab {...props} />);
    const btn = screen.getByText("vault.loadMore");
    fireEvent.click(btn);
    expect(props.onLoadMore).toHaveBeenCalledTimes(1);
  });

  it("disables the load-more button and shows a spinner label while loading more", () => {
    render(
      <ItemsTab
        {...makeProps({
          hasItems: true,
          hasFilteredItems: true,
          filteredItems: [makeItem()],
          nextCursor: "cursor-2",
          loadingMore: true,
        })}
      />,
    );
    const btn = screen.getByRole("button", { name: /vault\.loading/ });
    expect(btn).toBeDisabled();
    expect(screen.queryByText("vault.loadMore")).toBeNull();
  });

  // ── Detail-panel split ───────────────────────────────────────────

  it("renders the detail panel split when an item is selected", () => {
    const item = makeItem();
    const { container } = render(
      <ItemsTab
        {...makeProps({
          hasItems: true,
          hasFilteredItems: true,
          filteredItems: [item],
          selectedItem: item,
        })}
      />,
    );
    expect(screen.getByTestId("item-detail")).toBeInTheDocument();
    expect((container.firstChild as HTMLElement).className).toContain(
      "flex gap-4",
    );
    // Filter/sort selects hidden in split view
    expect(screen.queryAllByRole("combobox")).toHaveLength(0);
  });

  it("passes share callbacks to the detail view when personal sharing is allowed", () => {
    const item = makeItem();
    render(
      <ItemsTab
        {...makeProps({
          hasItems: true,
          hasFilteredItems: true,
          filteredItems: [item],
          selectedItem: item,
          canUsePersonalSharing: true,
          canMutateItems: true,
        })}
      />,
    );
    const detail = screen.getByTestId("item-detail");
    expect(detail).toHaveAttribute("data-share", "yes");
    expect(detail).toHaveAttribute("data-eshare", "yes");
    expect(detail).toHaveAttribute("data-canedit", "true");
    expect(detail).toHaveAttribute("data-candelete", "true");
  });

  it("withholds share callbacks and edit rights when gates are off", () => {
    const item = makeItem();
    render(
      <ItemsTab
        {...makeProps({
          hasItems: true,
          hasFilteredItems: true,
          filteredItems: [item],
          selectedItem: item,
          canUsePersonalSharing: false,
          canMutateItems: false,
        })}
      />,
    );
    const detail = screen.getByTestId("item-detail");
    expect(detail).toHaveAttribute("data-share", "no");
    expect(detail).toHaveAttribute("data-eshare", "no");
    expect(detail).toHaveAttribute("data-canedit", "false");
    expect(detail).toHaveAttribute("data-candelete", "false");
  });

  // ── Search ───────────────────────────────────────────────────────

  it("forwards search input changes", () => {
    const props = makeProps();
    const { container } = render(<ItemsTab {...props} />);
    const input = container.querySelector(
      '[data-tour="vault-search"]',
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "bank" } });
    expect(props.onSearchInputChange).toHaveBeenCalledWith("bank");
  });
});
