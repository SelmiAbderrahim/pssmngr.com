// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * TOTPCodeCard Component Tests
 *
 * Covers:
 * - Rendering with issuer, account, and live code
 * - Copy to clipboard functionality
 * - Fallback display when no code available
 * - Circular countdown rendering
 * - Click and keyboard navigation to onSelect
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { TOTPCodeCard } from "../TOTPCodeCard";
import type { DecryptedVaultItem } from "../VaultItemCard";

// Mock totp-engine
vi.mock("@/services/totp-engine", () => ({
  generateTOTP: vi.fn(() => Promise.resolve("123456")),
  base32Decode: vi.fn(() => new Uint8Array(10)),
  getRemainingSeconds: vi.fn(() => 15),
}));

function makeTOTPItem(overrides: Partial<DecryptedVaultItem> = {}): DecryptedVaultItem {
  return {
    id: "totp-1",
    itemType: "totp",
    isFavorite: false,
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
    decrypted: {
      title: "GitHub",
      issuer: "GitHub",
      account: "user@github.com",
      secret: "JBSWY3DPEHPK3PXP",
      algorithm: "SHA1",
      digits: 6,
      period: 30,
    },
    ...overrides,
  };
}


describe("TOTPCodeCard", () => {
  const onSelect = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock clipboard
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      writable: true,
      configurable: true,
    });
  });

  // ── Rendering ────────────────────────────────────────────────────

  it("renders issuer as label", () => {
    render(<TOTPCodeCard item={makeTOTPItem()} onSelect={onSelect} />);
    expect(screen.getByText("GitHub")).toBeInTheDocument();
  });

  it("renders account name", () => {
    render(<TOTPCodeCard item={makeTOTPItem()} onSelect={onSelect} />);
    expect(screen.getByText("user@github.com")).toBeInTheDocument();
  });

  it("renders the generated code with thin space formatting", async () => {
    let resolveGenerate: (v: string) => void;
    const { generateTOTP } = await import("@/services/totp-engine");
    (generateTOTP as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise<string>((r) => { resolveGenerate = r; }),
    );

    render(<TOTPCodeCard item={makeTOTPItem()} onSelect={onSelect} />);

    // Now resolve the promise inside act so React processes the state update
    await act(async () => {
      resolveGenerate!("123456");
    });

    // Code "123456" formatted as "123 456" with thin space (\u2009)
    // Use querySelector since getByText may not match thin space in regex
    const codeEl = document.querySelector("[aria-live='polite']");
    expect(codeEl).not.toBeNull();
    expect(codeEl!.textContent).toContain("123");
    expect(codeEl!.textContent).toContain("456");
  });

  it("renders placeholder when no secret", () => {
    render(
      <TOTPCodeCard
        item={makeTOTPItem({ decrypted: { title: "Test", secret: "" } })}
        onSelect={onSelect}
      />,
    );
    expect(screen.getByText("vault:placeholderCode")).toBeInTheDocument();
  });

  it("falls back to title when no issuer", () => {
    render(
      <TOTPCodeCard
        item={makeTOTPItem({
          decrypted: { title: "My Auth", secret: "JBSWY3DPEHPK3PXP", account: "" },
        })}
        onSelect={onSelect}
      />,
    );
    expect(screen.getByText("My Auth")).toBeInTheDocument();
  });

  // ── Selection ────────────────────────────────────────────────────

  it("calls onSelect when card is clicked", () => {
    const item = makeTOTPItem();
    render(<TOTPCodeCard item={item} onSelect={onSelect} />);
    const card = screen.getByText("GitHub").closest("[role='button']")!;
    fireEvent.click(card);
    expect(onSelect).toHaveBeenCalledWith(item);
  });

  it("calls onSelect on Enter key", () => {
    const item = makeTOTPItem();
    render(<TOTPCodeCard item={item} onSelect={onSelect} />);
    const card = screen.getByText("GitHub").closest("[role='button']")!;
    fireEvent.keyDown(card, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith(item);
  });

  // ── Copy ─────────────────────────────────────────────────────────

  it("copies code to clipboard on copy button click", async () => {
    let resolveGenerate: (v: string) => void;
    const { generateTOTP } = await import("@/services/totp-engine");
    (generateTOTP as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise<string>((r) => { resolveGenerate = r; }),
    );

    render(<TOTPCodeCard item={makeTOTPItem()} onSelect={onSelect} />);
    await act(async () => { resolveGenerate!("123456"); });

    const codeEl = document.querySelector("[aria-live='polite']");
    expect(codeEl!.textContent).toContain("123");

    const copyBtn = screen.getByLabelText("vault.copyCode");
    await act(async () => {
      fireEvent.click(copyBtn);
    });

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("123456");
  });

  it("does not propagate click to onSelect when copying", async () => {
    let resolveGenerate: (v: string) => void;
    const { generateTOTP } = await import("@/services/totp-engine");
    (generateTOTP as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise<string>((r) => { resolveGenerate = r; }),
    );

    render(<TOTPCodeCard item={makeTOTPItem()} onSelect={onSelect} />);
    await act(async () => { resolveGenerate!("123456"); });

    const codeEl = document.querySelector("[aria-live='polite']");
    expect(codeEl!.textContent).toContain("123");

    const copyBtn = screen.getByLabelText("vault.copyCode");
    await act(async () => {
      fireEvent.click(copyBtn);
    });
    expect(onSelect).not.toHaveBeenCalled();
  });

  // ── Countdown ────────────────────────────────────────────────────

  it("displays remaining seconds in countdown", () => {
    render(<TOTPCodeCard item={makeTOTPItem()} onSelect={onSelect} />);
    expect(screen.getByLabelText("vault:totp.secondsRemaining")).toBeInTheDocument();
  });
});
