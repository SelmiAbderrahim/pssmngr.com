// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * TOTPPreviewDialog Component Tests
 *
 * Covers:
 * - Rendering with parsed TOTP data
 * - Title pre-population from issuer
 * - Live code display
 * - Save flow (confirm / cancel)
 * - Disabled state when title is empty
 * - Returns null when parsed is null
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import { TOTPPreviewDialog } from "../TOTPPreviewDialog";
import type { OTPAuthURI } from "@/services/totp-engine";

vi.mock("@/services/totp-engine", () => ({
  generateTOTP: vi.fn(() => Promise.resolve("654321")),
  base32Decode: vi.fn(() => new Uint8Array(10)),
  getRemainingSeconds: vi.fn(() => 20),
}));

function makeParsed(overrides: Partial<OTPAuthURI> = {}): OTPAuthURI {
  return {
    type: "totp",
    issuer: "GitHub",
    account: "user@github.com",
    secret: "JBSWY3DPEHPK3PXP",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    ...overrides,
  };
}

describe("TOTPPreviewDialog", () => {
  const onOpenChange = vi.fn();
  const onConfirm = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    onConfirm.mockResolvedValue(undefined);
  });

  // ── Rendering ────────────────────────────────────────────────────

  it("renders dialog with title and description", () => {
    render(
      <TOTPPreviewDialog
        open={true}
        onOpenChange={onOpenChange}
        parsed={makeParsed()}
        onConfirm={onConfirm}
      />,
    );
    expect(screen.getByText("totp.previewTitle")).toBeInTheDocument();
    expect(screen.getByText("totp.previewDescription")).toBeInTheDocument();
  });

  it("shows issuer and account from parsed data", () => {
    render(
      <TOTPPreviewDialog
        open={true}
        onOpenChange={onOpenChange}
        parsed={makeParsed()}
        onConfirm={onConfirm}
      />,
    );
    expect(screen.getByText("GitHub")).toBeInTheDocument();
    expect(screen.getByText("user@github.com")).toBeInTheDocument();
  });

  it("pre-fills title input with issuer", async () => {
    render(
      <TOTPPreviewDialog
        open={true}
        onOpenChange={onOpenChange}
        parsed={makeParsed()}
        onConfirm={onConfirm}
      />,
    );
    await waitFor(() => {
      const titleInput = screen.getByLabelText(
        "vault:itemTitle",
      ) as HTMLInputElement;
      expect(titleInput.value).toBe("GitHub");
    });
  });

  it("shows generated code", async () => {
    let resolveGenerate: (v: string) => void;
    const { generateTOTP } = await import("@/services/totp-engine");
    (generateTOTP as ReturnType<typeof vi.fn>).mockImplementation(
      () =>
        new Promise<string>((r) => {
          resolveGenerate = r;
        }),
    );

    render(
      <TOTPPreviewDialog
        open={true}
        onOpenChange={onOpenChange}
        parsed={makeParsed()}
        onConfirm={onConfirm}
      />,
    );

    await act(async () => {
      resolveGenerate!("654321");
    });

    // Code "654321" formatted as "654 321" with thin space
    const codeEl = document.querySelector("[aria-live='polite']");
    expect(codeEl).not.toBeNull();
    expect(codeEl!.textContent).toContain("654");
    expect(codeEl!.textContent).toContain("321");
  });

  it("renders nothing when parsed is null", () => {
    const { container } = render(
      <TOTPPreviewDialog
        open={true}
        onOpenChange={onOpenChange}
        parsed={null}
        onConfirm={onConfirm}
      />,
    );
    expect(container.querySelector("[role='dialog']")).not.toBeInTheDocument();
  });

  // ── Confirm flow ─────────────────────────────────────────────────

  it("calls onConfirm with title and parsed data on save", async () => {
    render(
      <TOTPPreviewDialog
        open={true}
        onOpenChange={onOpenChange}
        parsed={makeParsed()}
        onConfirm={onConfirm}
      />,
    );

    // Wait for useEffect to pre-fill the title before clicking save
    await waitFor(() => {
      const titleInput = screen.getByLabelText(
        "vault:itemTitle",
      ) as HTMLInputElement;
      expect(titleInput.value).toBe("GitHub");
    });

    fireEvent.click(screen.getByText("totp.saveAuthenticator"));

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith(
        "GitHub",
        expect.objectContaining({ secret: "JBSWY3DPEHPK3PXP" }),
      );
    });
  });

  it("closes dialog after successful confirm", async () => {
    render(
      <TOTPPreviewDialog
        open={true}
        onOpenChange={onOpenChange}
        parsed={makeParsed()}
        onConfirm={onConfirm}
      />,
    );

    // Wait for useEffect to pre-fill the title before clicking save
    await waitFor(() => {
      const titleInput = screen.getByLabelText(
        "vault:itemTitle",
      ) as HTMLInputElement;
      expect(titleInput.value).toBe("GitHub");
    });

    fireEvent.click(screen.getByText("totp.saveAuthenticator"));

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it("disables save button when title is empty", () => {
    render(
      <TOTPPreviewDialog
        open={true}
        onOpenChange={onOpenChange}
        parsed={makeParsed({ issuer: "", account: "" })}
        onConfirm={onConfirm}
      />,
    );

    const saveBtn = screen
      .getByText("totp.saveAuthenticator")
      .closest("button")!;
    expect(saveBtn).toBeDisabled();
  });

  // ── Cancel ───────────────────────────────────────────────────────

  it("calls onOpenChange(false) on cancel", () => {
    render(
      <TOTPPreviewDialog
        open={true}
        onOpenChange={onOpenChange}
        parsed={makeParsed()}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByText("common.cancel"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  // ── Enter key shortcut ───────────────────────────────────────────

  it("triggers confirm on Enter in title input", async () => {
    render(
      <TOTPPreviewDialog
        open={true}
        onOpenChange={onOpenChange}
        parsed={makeParsed()}
        onConfirm={onConfirm}
      />,
    );

    // Wait for useEffect to pre-fill the title before triggering Enter
    await waitFor(() => {
      const input = screen.getByLabelText(
        "vault:itemTitle",
      ) as HTMLInputElement;
      expect(input.value).toBe("GitHub");
    });

    const titleInput = screen.getByLabelText("vault:itemTitle");
    fireEvent.keyDown(titleInput, { key: "Enter" });

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalled();
    });
  });
});
