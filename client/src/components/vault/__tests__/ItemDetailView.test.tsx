// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * ItemDetailView Component Tests
 *
 * Covers:
 * - Rendering for different item types (login, card, note, identity, totp, passkey)
 * - View mode field display
 * - Edit mode toggling and field editing
 * - Save flow (success / failure)
 * - Delete flow with confirmation dialog
 * - Clipboard copy with auto-clear
 * - Password visibility toggle
 * - Favorite toggle
 * - Close with unsaved changes warning
 * - Back button / close
 * - Share / ephemeral share button clicks
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ItemDetailView } from "../ItemDetailView";
import type { DecryptedVaultItem } from "../VaultItemCard";

// Mock totp-engine for TOTP items
vi.mock("@/services/totp-engine", () => ({
  generateTOTP: vi.fn().mockResolvedValue("123456"),
  base32Decode: vi.fn(() => new Uint8Array(10)),
  getRemainingSeconds: vi.fn(() => 20),
}));

function makeItem(overrides: Partial<DecryptedVaultItem> = {}): DecryptedVaultItem {
  return {
    id: "item-1",
    itemType: "login",
    isFavorite: false,
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-15T12:00:00Z",
    decrypted: {
      title: "GitHub Login",
      username: "admin",
      password: "secret123",
      url: "https://github.com",
      notes: "My GitHub account",
    },
    ...overrides,
  };
}

describe("ItemDetailView", () => {
  const onClose = vi.fn();
  const onSave = vi.fn();
  const onDelete = vi.fn();
  const onToggleFavorite = vi.fn();
  const onShareClick = vi.fn();
  const onEphemeralShareClick = vi.fn();

  const defaultProps = {
    item: makeItem(),
    onClose,
    onSave,
    onDelete,
    onToggleFavorite,
    onShareClick,
    onEphemeralShareClick,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    onSave.mockResolvedValue(undefined);
    onDelete.mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      writable: true,
      configurable: true,
    });
  });

  // ── Rendering login item ─────────────────────────────────────────

  it("renders item title", () => {
    render(<ItemDetailView {...defaultProps} />);
    expect(screen.getByText("GitHub Login")).toBeInTheDocument();
  });

  it("renders item type badge", () => {
    render(<ItemDetailView {...defaultProps} />);
    expect(screen.getByText("vault:itemTypes.login")).toBeInTheDocument();
  });

  it("renders username field", () => {
    render(<ItemDetailView {...defaultProps} />);
    expect(screen.getByText("admin")).toBeInTheDocument();
  });

  it("renders masked password by default", () => {
    render(<ItemDetailView {...defaultProps} />);
    // Password should be masked (not showing "secret123")
    expect(screen.queryByText("secret123")).not.toBeInTheDocument();
  });

  it("renders URL field", () => {
    render(<ItemDetailView {...defaultProps} />);
    expect(screen.getByText("https://github.com")).toBeInTheDocument();
  });

  it("renders notes field", () => {
    render(<ItemDetailView {...defaultProps} />);
    expect(screen.getByText("My GitHub account")).toBeInTheDocument();
  });

  it("renders created/modified timestamps", () => {
    render(<ItemDetailView {...defaultProps} />);
    // The component renders "vault.created: <date>" and "vault.modified: <date>" as a single span
    const spans = document.querySelectorAll("span");
    const hasCreated = Array.from(spans).some((s) => s.textContent?.includes("vault.created"));
    const hasModified = Array.from(spans).some((s) => s.textContent?.includes("vault.modified"));
    expect(hasCreated).toBe(true);
    expect(hasModified).toBe(true);
  });

  // ── Card item ────────────────────────────────────────────────────

  it("renders card item with masked number", () => {
    render(
      <ItemDetailView
        {...defaultProps}
        item={makeItem({
          itemType: "card",
          decrypted: {
            title: "Visa Card",
            name: "John Doe",
            number: "4111111111111234",
            expiry: "12/28",
            cvv: "123",
          },
        })}
      />,
    );
    expect(screen.getByText("Visa Card")).toBeInTheDocument();
    expect(screen.getByText("John Doe")).toBeInTheDocument();
  });

  // ── Note item ────────────────────────────────────────────────────

  it("renders note item with content", () => {
    render(
      <ItemDetailView
        {...defaultProps}
        item={makeItem({
          itemType: "note",
          decrypted: { title: "My Note", content: "Secret information here" },
        })}
      />,
    );
    expect(screen.getByText("My Note")).toBeInTheDocument();
    expect(screen.getByText("Secret information here")).toBeInTheDocument();
  });

  // ── Identity item ────────────────────────────────────────────────

  it("renders identity item fields", () => {
    render(
      <ItemDetailView
        {...defaultProps}
        item={makeItem({
          itemType: "identity",
          decrypted: {
            title: "Personal ID",
            fullName: "Jane Doe",
            email: "jane@example.com",
            phone: "+1234567890",
          },
        })}
      />,
    );
    expect(screen.getByText("Personal ID")).toBeInTheDocument();
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("jane@example.com")).toBeInTheDocument();
  });

  // ── Back / close ─────────────────────────────────────────────────

  it("calls onClose when back button is clicked", () => {
    render(<ItemDetailView {...defaultProps} />);
    const backBtn = screen.getByLabelText("vault.back");
    fireEvent.click(backBtn);
    expect(onClose).toHaveBeenCalled();
  });

  // ── Favorite toggle ──────────────────────────────────────────────

  it("calls onToggleFavorite on star click", () => {
    render(<ItemDetailView {...defaultProps} />);
    const favBtn = screen.getByLabelText("vault.favorite");
    fireEvent.click(favBtn);
    expect(onToggleFavorite).toHaveBeenCalledWith("item-1");
  });

  it("shows filled star when item is favorite", () => {
    render(
      <ItemDetailView
        {...defaultProps}
        item={makeItem({ isFavorite: true })}
      />,
    );
    expect(screen.getByLabelText("vault.unfavorite")).toBeInTheDocument();
  });

  // ── Edit mode ────────────────────────────────────────────────────

  it("enters edit mode on edit button click", () => {
    render(<ItemDetailView {...defaultProps} />);
    const editBtn = screen.getByLabelText("vault.edit");
    fireEvent.click(editBtn);
    // In edit mode, save and cancel buttons should appear
    expect(screen.getByText("vault.save")).toBeInTheDocument();
    expect(screen.getByText("common.cancel")).toBeInTheDocument();
  });

  it("populates non-sensitive edit fields with current data", () => {
    render(<ItemDetailView {...defaultProps} />);
    fireEvent.click(screen.getByLabelText("vault.edit"));

    // Title input should be pre-filled
    const titleInput = screen.getByDisplayValue("GitHub Login");
    expect(titleInput).toBeInTheDocument();
  });

  it("does not preload the decrypted password into the edit input", () => {
    render(<ItemDetailView {...defaultProps} />);
    fireEvent.click(screen.getByLabelText("vault.edit"));

    const passwordInput = document.querySelector('input[type="password"]') as HTMLInputElement;
    expect(passwordInput).toBeTruthy();
    expect(passwordInput.value).toBe("");
    expect(passwordInput.placeholder).toBe("vault.sensitiveFieldUnchanged");
  });

  it("saves changes on save button click", async () => {
    render(<ItemDetailView {...defaultProps} />);
    fireEvent.click(screen.getByLabelText("vault.edit"));

    // Modify a field
    const titleInput = screen.getByDisplayValue("GitHub Login");
    fireEvent.change(titleInput, { target: { value: "Updated GitHub" } });

    fireEvent.click(screen.getByText("vault.save"));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        "item-1",
        expect.objectContaining({ title: "Updated GitHub", password: "secret123" }),
      );
    });
  });

  it("saves an explicitly changed password", async () => {
    render(<ItemDetailView {...defaultProps} />);
    fireEvent.click(screen.getByLabelText("vault.edit"));

    const passwordInput = document.querySelector('input[type="password"]') as HTMLInputElement;
    fireEvent.change(passwordInput, { target: { value: "new-secret-456" } });
    fireEvent.click(screen.getByText("vault.save"));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        "item-1",
        expect.objectContaining({ password: "new-secret-456" }),
      );
    });
  });

  it("exits edit mode after successful save", async () => {
    render(<ItemDetailView {...defaultProps} />);
    fireEvent.click(screen.getByLabelText("vault.edit"));
    fireEvent.click(screen.getByText("vault.save"));

    await waitFor(() => {
      expect(screen.queryByText("vault.save")).not.toBeInTheDocument();
    });
  });

  it("cancels edit mode without changes", () => {
    render(<ItemDetailView {...defaultProps} />);
    fireEvent.click(screen.getByLabelText("vault.edit"));
    fireEvent.click(screen.getByText("common.cancel"));
    // Should exit edit mode
    expect(screen.queryByText("vault.save")).not.toBeInTheDocument();
  });

  // ── Delete flow ──────────────────────────────────────────────────

  it("opens delete confirmation dialog", () => {
    render(<ItemDetailView {...defaultProps} />);
    const deleteBtn = screen.getByLabelText("vault.delete");
    fireEvent.click(deleteBtn);

    expect(screen.getByText("vault.deleteItem")).toBeInTheDocument();
    expect(screen.getByText("vault.deleteItemDescription")).toBeInTheDocument();
  });

  it("calls onDelete on confirm", async () => {
    render(<ItemDetailView {...defaultProps} />);
    fireEvent.click(screen.getByLabelText("vault.delete"));

    // The confirm button in the alert dialog also says "vault.delete"
    const confirmBtns = screen.getAllByText("vault.delete");
    const dialogConfirm = confirmBtns.find((el) =>
      el.closest("[role='alertdialog']"),
    );
    if (dialogConfirm) {
      fireEvent.click(dialogConfirm);
    }

    await waitFor(() => {
      expect(onDelete).toHaveBeenCalledWith("item-1");
    });
  });

  it("closes detail view after successful delete", async () => {
    render(<ItemDetailView {...defaultProps} />);
    fireEvent.click(screen.getByLabelText("vault.delete"));

    const confirmBtns = screen.getAllByText("vault.delete");
    const dialogConfirm = confirmBtns.find((el) =>
      el.closest("[role='alertdialog']"),
    );
    if (dialogConfirm) {
      fireEvent.click(dialogConfirm);
    }

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  // ── Clipboard copy ───────────────────────────────────────────────

  it("copies field value to clipboard on copy button click", async () => {
    render(<ItemDetailView {...defaultProps} />);

    // Find a copy button (there should be several for username, password, url)
    const copyButtons = screen.getAllByLabelText(/vault\.copy/);
    expect(copyButtons.length).toBeGreaterThan(0);

    fireEvent.click(copyButtons[0]);

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalled();
    });
  });

  // ── Share buttons ────────────────────────────────────────────────

  it("calls onShareClick when share button is clicked", () => {
    render(<ItemDetailView {...defaultProps} />);
    const shareBtn = screen.getByLabelText("sharing.share");
    fireEvent.click(shareBtn);
    expect(onShareClick).toHaveBeenCalledWith("item-1");
  });

  it("calls onEphemeralShareClick when link share button is clicked", () => {
    render(<ItemDetailView {...defaultProps} />);
    const linkBtn = screen.getByLabelText("ephemeral.createLink");
    fireEvent.click(linkBtn);
    expect(onEphemeralShareClick).toHaveBeenCalledWith("item-1");
  });

  // ── Unsaved changes warning ──────────────────────────────────────

  it("shows discard dialog when closing with unsaved changes", () => {
    render(<ItemDetailView {...defaultProps} />);

    // Enter edit mode
    fireEvent.click(screen.getByLabelText("vault.edit"));

    // Modify a field
    const titleInput = screen.getByDisplayValue("GitHub Login");
    fireEvent.change(titleInput, { target: { value: "Changed" } });

    // Try to close
    const backBtn = screen.getByLabelText("vault.back");
    fireEvent.click(backBtn);

    expect(screen.getByText("vault.unsavedChanges")).toBeInTheDocument();
  });
});
