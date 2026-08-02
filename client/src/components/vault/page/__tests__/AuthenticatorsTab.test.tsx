// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * AuthenticatorsTab tests.
 *
 * Covers: list-only vs list+detail split, onScanQR forwarding, and the
 * canUsePersonalSharing gate on the share callbacks handed to
 * ItemDetailView.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AuthenticatorsTab } from "../AuthenticatorsTab";
import type { DecryptedVaultItem } from "@/components/vault/VaultItemCard";

vi.mock("@/components/vault/TOTPListView", () => ({
  TOTPListView: ({
    items,
    onScanQR,
  }: {
    items: unknown[];
    onScanQR: () => void;
  }) => (
    <button
      data-testid="totp-list"
      data-count={items.length}
      onClick={onScanQR}
    />
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

function makeItem(
  overrides: Partial<DecryptedVaultItem> = {},
): DecryptedVaultItem {
  return {
    id: "totp-1",
    itemType: "totp",
    isFavorite: false,
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: new Date().toISOString(),
    decrypted: { title: "My Authenticator" },
    ...overrides,
  };
}

type Props = React.ComponentProps<typeof AuthenticatorsTab>;

function makeProps(overrides: Partial<Props> = {}): Props {
  return {
    decryptedItems: [makeItem()],
    selectedItem: null,
    favoriteLoadingId: null,
    canMutateItems: true,
    canUsePersonalSharing: true,
    sharedAccess: false,
    onSelectItem: vi.fn(),
    onCloseDetail: vi.fn(),
    onSaveItem: vi.fn(async () => {}),
    onDeleteItem: vi.fn(async () => {}),
    onToggleFavorite: vi.fn(),
    onShareClick: vi.fn(),
    onScanQR: vi.fn(),
    ...overrides,
  };
}

describe("AuthenticatorsTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the list only (no detail) when nothing is selected", () => {
    const { container } = render(<AuthenticatorsTab {...makeProps()} />);
    expect(screen.getByTestId("totp-list")).toBeInTheDocument();
    expect(screen.queryByTestId("item-detail")).toBeNull();
    expect((container.firstChild as HTMLElement).className).not.toContain(
      "flex gap-4",
    );
  });

  it("forwards onScanQR to the list view", () => {
    const props = makeProps();
    render(<AuthenticatorsTab {...props} />);
    fireEvent.click(screen.getByTestId("totp-list"));
    expect(props.onScanQR).toHaveBeenCalledTimes(1);
  });

  it("renders the split view with detail when an item is selected", () => {
    const item = makeItem();
    const { container } = render(
      <AuthenticatorsTab {...makeProps({ selectedItem: item })} />,
    );
    expect(screen.getByTestId("totp-list")).toBeInTheDocument();
    expect(screen.getByTestId("item-detail")).toBeInTheDocument();
    expect((container.firstChild as HTMLElement).className).toContain(
      "flex gap-4",
    );
  });

  it("passes share callbacks when canUsePersonalSharing is true", () => {
    render(
      <AuthenticatorsTab
        {...makeProps({ selectedItem: makeItem(), canUsePersonalSharing: true })}
      />,
    );
    const detail = screen.getByTestId("item-detail");
    expect(detail).toHaveAttribute("data-share", "yes");
    expect(detail).toHaveAttribute("data-eshare", "yes");
  });

  it("withholds share callbacks when canUsePersonalSharing is false", () => {
    render(
      <AuthenticatorsTab
        {...makeProps({
          selectedItem: makeItem(),
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
});
