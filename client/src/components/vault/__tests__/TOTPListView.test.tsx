// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * TOTPListView Component Tests
 *
 * Covers:
 * - Empty state rendering
 * - Filtering items to TOTP type only
 * - Rendering TOTP cards for each TOTP item
 * - Scan QR button in empty state
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TOTPListView } from "../TOTPListView";
import type { DecryptedVaultItem } from "../VaultItemCard";

// Mock TOTPCodeCard to avoid TOTP engine dependency
vi.mock("../TOTPCodeCard", () => ({
  TOTPCodeCard: ({ item, onSelect }: { item: DecryptedVaultItem; onSelect: (item: DecryptedVaultItem) => void }) => (
    <div data-testid={`totp-card-${item.id}`} onClick={() => onSelect(item)}>
      {(item.decrypted.issuer as string) || "TOTP"}
    </div>
  ),
}));

function makeItem(overrides: Partial<DecryptedVaultItem> = {}): DecryptedVaultItem {
  return {
    id: "item-1",
    itemType: "totp",
    isFavorite: false,
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
    decrypted: { title: "GitHub", issuer: "GitHub", account: "user@github.com", secret: "JBSWY3DPEHPK3PXP" },
    ...overrides,
  };
}

describe("TOTPListView", () => {
  const onSelect = vi.fn();
  const onScanQR = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Empty state ──────────────────────────────────────────────────

  it("renders empty state when no items", () => {
    render(<TOTPListView items={[]} onSelect={onSelect} onScanQR={onScanQR} />);
    expect(screen.getByText("totp.noAuthenticators")).toBeInTheDocument();
    expect(screen.getByText("totp.noAuthenticatorsDescription")).toBeInTheDocument();
  });

  it("renders empty state when items contain no TOTP type", () => {
    const loginItem: DecryptedVaultItem = {
      id: "login-1",
      itemType: "login",
      isFavorite: false,
      createdAt: "2025-01-01T00:00:00Z",
      updatedAt: "2025-01-01T00:00:00Z",
      decrypted: { title: "Login" },
    };
    render(<TOTPListView items={[loginItem]} onSelect={onSelect} onScanQR={onScanQR} />);
    expect(screen.getByText("totp.noAuthenticators")).toBeInTheDocument();
  });

  it("calls onScanQR when Scan QR button is clicked in empty state", () => {
    render(<TOTPListView items={[]} onSelect={onSelect} onScanQR={onScanQR} />);
    fireEvent.click(screen.getByText("totp.scanQRCode"));
    expect(onScanQR).toHaveBeenCalled();
  });

  // ── TOTP items ───────────────────────────────────────────────────

  it("renders TOTPCodeCard for each TOTP item", () => {
    const items = [
      makeItem({ id: "t1", decrypted: { issuer: "GitHub", secret: "AAA" } }),
      makeItem({ id: "t2", decrypted: { issuer: "Google", secret: "BBB" } }),
    ];
    render(<TOTPListView items={items} onSelect={onSelect} onScanQR={onScanQR} />);
    expect(screen.getByTestId("totp-card-t1")).toBeInTheDocument();
    expect(screen.getByTestId("totp-card-t2")).toBeInTheDocument();
  });

  it("filters out non-TOTP items", () => {
    const items: DecryptedVaultItem[] = [
      makeItem({ id: "t1" }),
      {
        id: "login-1",
        itemType: "login",
        isFavorite: false,
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
        decrypted: { title: "Login" },
      },
    ];
    render(<TOTPListView items={items} onSelect={onSelect} onScanQR={onScanQR} />);
    expect(screen.getByTestId("totp-card-t1")).toBeInTheDocument();
    expect(screen.queryByTestId("totp-card-login-1")).not.toBeInTheDocument();
  });

  it("passes onSelect to TOTPCodeCard", () => {
    const item = makeItem();
    render(<TOTPListView items={[item]} onSelect={onSelect} onScanQR={onScanQR} />);
    fireEvent.click(screen.getByTestId("totp-card-item-1"));
    expect(onSelect).toHaveBeenCalledWith(item);
  });
});
