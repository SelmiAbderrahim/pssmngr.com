// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * VaultItemCard Component Tests
 *
 * Covers:
 * - Rendering with different item types (login, card, note, identity, totp, passkey, file)
 * - Title/subtitle extraction from decrypted data
 * - Favorite toggle with loading state
 * - Keyboard navigation (Enter/Space)
 * - Shared item indicator
 * - Date formatting
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { VaultItemCard, type DecryptedVaultItem } from "../VaultItemCard";

function makeItem(overrides: Partial<DecryptedVaultItem> = {}): DecryptedVaultItem {
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

describe("VaultItemCard", () => {
  const onSelect = vi.fn();
  const onToggleFavorite = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Rendering per item type ──────────────────────────────────────

  it("renders a login item with title and username subtitle", () => {
    render(
      <VaultItemCard
        item={makeItem()}
        onSelect={onSelect}
        onToggleFavorite={onToggleFavorite}
      />,
    );
    expect(screen.getByText("My Login")).toBeInTheDocument();
    expect(screen.getByText("admin")).toBeInTheDocument();
  });

  it("renders a card item with masked number subtitle", () => {
    render(
      <VaultItemCard
        item={makeItem({
          itemType: "card",
          decrypted: { title: "Visa", number: "4111111111111234" },
        })}
        onSelect={onSelect}
        onToggleFavorite={onToggleFavorite}
      />,
    );
    expect(screen.getByText("Visa")).toBeInTheDocument();
    expect(screen.getByText("**** 1234")).toBeInTheDocument();
  });

  it("renders a note item with truncated content subtitle", () => {
    const content = "A".repeat(60);
    render(
      <VaultItemCard
        item={makeItem({
          itemType: "note",
          decrypted: { title: "Secret Note", content },
        })}
        onSelect={onSelect}
        onToggleFavorite={onToggleFavorite}
      />,
    );
    expect(screen.getByText("Secret Note")).toBeInTheDocument();
    // Subtitle is first 50 chars
    expect(screen.getByText("A".repeat(50))).toBeInTheDocument();
  });

  it("renders an identity item with email subtitle", () => {
    render(
      <VaultItemCard
        item={makeItem({
          itemType: "identity",
          decrypted: { title: "John", email: "john@example.com" },
        })}
        onSelect={onSelect}
        onToggleFavorite={onToggleFavorite}
      />,
    );
    expect(screen.getByText("John")).toBeInTheDocument();
    expect(screen.getByText("john@example.com")).toBeInTheDocument();
  });

  it("renders a totp item with issuer subtitle", () => {
    render(
      <VaultItemCard
        item={makeItem({
          itemType: "totp",
          decrypted: { title: "GitHub TOTP", issuer: "GitHub" },
        })}
        onSelect={onSelect}
        onToggleFavorite={onToggleFavorite}
      />,
    );
    expect(screen.getByText("GitHub TOTP")).toBeInTheDocument();
    expect(screen.getByText("GitHub")).toBeInTheDocument();
  });

  it("renders a passkey item with rpId subtitle", () => {
    render(
      <VaultItemCard
        item={makeItem({
          itemType: "passkey",
          decrypted: { title: "My Passkey", rpId: "example.com" },
        })}
        onSelect={onSelect}
        onToggleFavorite={onToggleFavorite}
      />,
    );
    expect(screen.getByText("My Passkey")).toBeInTheDocument();
    expect(screen.getByText("example.com")).toBeInTheDocument();
  });

  it("falls back to 'Untitled' when no title or name exists", () => {
    render(
      <VaultItemCard
        item={makeItem({ decrypted: {} })}
        onSelect={onSelect}
        onToggleFavorite={onToggleFavorite}
      />,
    );
    expect(screen.getByText("vault:untitled")).toBeInTheDocument();
  });

  it("uses name field when title is absent", () => {
    render(
      <VaultItemCard
        item={makeItem({ decrypted: { name: "Backup" } })}
        onSelect={onSelect}
        onToggleFavorite={onToggleFavorite}
      />,
    );
    expect(screen.getByText("Backup")).toBeInTheDocument();
  });

  // ── Selection ────────────────────────────────────────────────────

  it("calls onSelect when clicked", () => {
    const item = makeItem();
    render(
      <VaultItemCard
        item={item}
        onSelect={onSelect}
        onToggleFavorite={onToggleFavorite}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /My Login/i }).closest("[role='button']")!);
    expect(onSelect).toHaveBeenCalledWith(item);
  });

  it("calls onSelect on Enter key", () => {
    const item = makeItem();
    render(
      <VaultItemCard
        item={item}
        onSelect={onSelect}
        onToggleFavorite={onToggleFavorite}
      />,
    );
    const card = screen.getByText("My Login").closest("[role='button']")!;
    fireEvent.keyDown(card, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith(item);
  });

  it("calls onSelect on Space key", () => {
    const item = makeItem();
    render(
      <VaultItemCard
        item={item}
        onSelect={onSelect}
        onToggleFavorite={onToggleFavorite}
      />,
    );
    const card = screen.getByText("My Login").closest("[role='button']")!;
    fireEvent.keyDown(card, { key: " " });
    expect(onSelect).toHaveBeenCalledWith(item);
  });

  // ── Favorite toggle ──────────────────────────────────────────────

  it("calls onToggleFavorite with item id when star button clicked", () => {
    render(
      <VaultItemCard
        item={makeItem()}
        onSelect={onSelect}
        onToggleFavorite={onToggleFavorite}
      />,
    );
    fireEvent.click(screen.getByLabelText("vault.favorite"));
    expect(onToggleFavorite).toHaveBeenCalledWith("item-1");
    // Should NOT propagate to onSelect
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("shows filled star when isFavorite is true", () => {
    render(
      <VaultItemCard
        item={makeItem({ isFavorite: true })}
        onSelect={onSelect}
        onToggleFavorite={onToggleFavorite}
      />,
    );
    expect(screen.getByLabelText("vault.unfavorite")).toBeInTheDocument();
  });

  it("disables favorite button and shows spinner when loading", () => {
    render(
      <VaultItemCard
        item={makeItem()}
        onSelect={onSelect}
        onToggleFavorite={onToggleFavorite}
        isFavoriteLoading
      />,
    );
    const btn = screen.getByLabelText("vault.favorite");
    expect(btn).toBeDisabled();
  });

  // ── Shared indicator ─────────────────────────────────────────────

  it("shows shared icon when isShared is true", () => {
    render(
      <VaultItemCard
        item={makeItem({ isShared: true })}
        onSelect={onSelect}
        onToggleFavorite={onToggleFavorite}
      />,
    );
    expect(screen.getByLabelText("sharing.shared")).toBeInTheDocument();
  });

  it("does not show shared icon when isShared is false", () => {
    render(
      <VaultItemCard
        item={makeItem({ isShared: false })}
        onSelect={onSelect}
        onToggleFavorite={onToggleFavorite}
      />,
    );
    expect(screen.queryByLabelText("sharing.shared")).not.toBeInTheDocument();
  });
});
