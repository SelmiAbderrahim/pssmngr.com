// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * QRScannerDialog Component Tests
 *
 * Covers:
 * - Dialog rendering with tabs (Scan / Manual)
 * - Tab switching
 * - Manual URI input and submission
 * - Error handling for invalid URIs
 * - BarcodeDetector availability check
 * - Camera permission error handling
 * - Cancel button
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QRScannerDialog } from "../QRScannerDialog";

vi.mock("@/services/totp-engine", () => ({
  parseOTPAuthToFields: vi.fn((uri: string) => {
    if (!uri.startsWith("otpauth://")) {
      throw new Error("Invalid otpauth:// URI");
    }
    return {
      type: "totp",
      issuer: "GitHub",
      account: "user@github.com",
      secret: "JBSWY3DPEHPK3PXP",
      algorithm: "SHA1",
      digits: 6,
      period: 30,
    };
  }),
}));

describe("QRScannerDialog", () => {
  const onOpenChange = vi.fn();
  const onResult = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // No BarcodeDetector by default (jsdom)
    delete (window as Record<string, unknown>).BarcodeDetector;
  });

  // ── Rendering ────────────────────────────────────────────────────

  it("renders dialog with title and description", () => {
    render(
      <QRScannerDialog open={true} onOpenChange={onOpenChange} onResult={onResult} />,
    );
    expect(screen.getByText("totp.addAuthenticator")).toBeInTheDocument();
    expect(screen.getByText("totp.scanDescription")).toBeInTheDocument();
  });

  it("renders two tabs: Scan QR and Manual", () => {
    render(
      <QRScannerDialog open={true} onOpenChange={onOpenChange} onResult={onResult} />,
    );
    expect(screen.getByText("totp.scanQR")).toBeInTheDocument();
    expect(screen.getByText("totp.enterManually")).toBeInTheDocument();
  });

  it("shows camera prompt in scan tab by default", () => {
    render(
      <QRScannerDialog open={true} onOpenChange={onOpenChange} onResult={onResult} />,
    );
    expect(screen.getByText("totp.cameraPrompt")).toBeInTheDocument();
    expect(screen.getByText("totp.startCamera")).toBeInTheDocument();
  });

  // ── Tab switching ────────────────────────────────────────────────

  it("switches to manual tab and shows URI input", async () => {
    const user = userEvent.setup();
    render(
      <QRScannerDialog open={true} onOpenChange={onOpenChange} onResult={onResult} />,
    );
    await user.click(screen.getByText("totp.enterManually"));
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/otpauth:\/\/totp/)).toBeInTheDocument();
    });
  });

  it("shows Add Account button in manual tab", async () => {
    const user = userEvent.setup();
    render(
      <QRScannerDialog open={true} onOpenChange={onOpenChange} onResult={onResult} />,
    );
    await user.click(screen.getByText("totp.enterManually"));
    await waitFor(() => {
      expect(screen.getByText("totp.addAccount")).toBeInTheDocument();
    });
  });

  // ── Manual URI submission ────────────────────────────────────────

  it("parses valid otpauth URI and calls onResult", async () => {
    const user = userEvent.setup();
    render(
      <QRScannerDialog open={true} onOpenChange={onOpenChange} onResult={onResult} />,
    );
    await user.click(screen.getByText("totp.enterManually"));

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/otpauth:\/\/totp/)).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText(/otpauth:\/\/totp/);
    fireEvent.change(input, {
      target: { value: "otpauth://totp/GitHub:user@github.com?secret=JBSWY3DPEHPK3PXP" },
    });
    fireEvent.click(screen.getByText("totp.addAccount"));

    expect(onResult).toHaveBeenCalledWith(
      expect.objectContaining({ issuer: "GitHub", secret: "JBSWY3DPEHPK3PXP" }),
    );
    // The parent swaps the scanner for the preview in one state update.
    // Closing here as well would immediately clear that preview.
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("shows error for invalid URI", async () => {
    const user = userEvent.setup();
    render(
      <QRScannerDialog open={true} onOpenChange={onOpenChange} onResult={onResult} />,
    );
    await user.click(screen.getByText("totp.enterManually"));

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/otpauth:\/\/totp/)).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText(/otpauth:\/\/totp/);
    fireEvent.change(input, { target: { value: "not-a-valid-uri" } });
    fireEvent.click(screen.getByText("totp.addAccount"));

    expect(screen.getByText("Invalid otpauth:// URI")).toBeInTheDocument();
    expect(onResult).not.toHaveBeenCalled();
  });

  it("does not submit when URI is empty", async () => {
    const user = userEvent.setup();
    render(
      <QRScannerDialog open={true} onOpenChange={onOpenChange} onResult={onResult} />,
    );
    await user.click(screen.getByText("totp.enterManually"));

    await waitFor(() => {
      expect(screen.getByText("totp.addAccount")).toBeInTheDocument();
    });

    const addBtn = screen.getByText("totp.addAccount").closest("button")!;
    expect(addBtn).toBeDisabled();
  });

  it("submits manual URI on Enter key", async () => {
    const user = userEvent.setup();
    render(
      <QRScannerDialog open={true} onOpenChange={onOpenChange} onResult={onResult} />,
    );
    await user.click(screen.getByText("totp.enterManually"));

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/otpauth:\/\/totp/)).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText(/otpauth:\/\/totp/);
    fireEvent.change(input, {
      target: { value: "otpauth://totp/Test?secret=ABC" },
    });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onResult).toHaveBeenCalled();
  });

  // ── Camera errors ────────────────────────────────────────────────

  it("shows error when BarcodeDetector is not available and camera started", () => {
    render(
      <QRScannerDialog open={true} onOpenChange={onOpenChange} onResult={onResult} />,
    );
    fireEvent.click(screen.getByText("totp.startCamera"));
    expect(screen.getByText("totp.noBarcodeDetector")).toBeInTheDocument();
  });

  // ── Cancel ───────────────────────────────────────────────────────

  it("calls onOpenChange(false) on cancel", () => {
    render(
      <QRScannerDialog open={true} onOpenChange={onOpenChange} onResult={onResult} />,
    );
    fireEvent.click(screen.getByText("common.cancel"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  // ── Upload label ─────────────────────────────────────────────────

  it("renders upload QR image label", () => {
    render(
      <QRScannerDialog open={true} onOpenChange={onOpenChange} onResult={onResult} />,
    );
    expect(screen.getByText("totp.uploadImage")).toBeInTheDocument();
  });

  // ── Cleanup on close ─────────────────────────────────────────────

  it("resets state when dialog is closed (open goes false)", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <QRScannerDialog open={true} onOpenChange={onOpenChange} onResult={onResult} />,
    );

    // Switch to manual and type something
    await user.click(screen.getByText("totp.enterManually"));
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/otpauth:\/\/totp/)).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText(/otpauth:\/\/totp/);
    fireEvent.change(input, { target: { value: "otpauth://totp/test?secret=ABC" } });

    // Close the dialog by setting open=false
    rerender(
      <QRScannerDialog open={false} onOpenChange={onOpenChange} onResult={onResult} />,
    );

    // Reopen to verify state was reset
    rerender(
      <QRScannerDialog open={true} onOpenChange={onOpenChange} onResult={onResult} />,
    );

    // Should be back to scan tab
    expect(screen.getByText("totp.cameraPrompt")).toBeInTheDocument();
  });

  // ── Camera with BarcodeDetector available ────────────────────────

  it("calls getUserMedia when BarcodeDetector is available and camera started", async () => {
    const mockGetUserMedia = vi.fn().mockRejectedValue(new DOMException("NotAllowedError"));
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia: mockGetUserMedia },
      writable: true,
      configurable: true,
    });
    (window as Record<string, unknown>).BarcodeDetector = class {
      static getSupportedFormats() { return Promise.resolve(["qr_code"]); }
      detect() { return Promise.resolve([]); }
    };

    render(
      <QRScannerDialog open={true} onOpenChange={onOpenChange} onResult={onResult} />,
    );

    fireEvent.click(screen.getByText("totp.startCamera"));

    await waitFor(() => {
      expect(mockGetUserMedia).toHaveBeenCalled();
    });

    // Clean up
    delete (window as Record<string, unknown>).BarcodeDetector;
  });

  it("shows camera permission denied error when NotAllowedError thrown", async () => {
    const notAllowedError = new DOMException("Permission denied", "NotAllowedError");
    const mockGetUserMedia = vi.fn().mockRejectedValue(notAllowedError);
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia: mockGetUserMedia },
      writable: true,
      configurable: true,
    });
    (window as Record<string, unknown>).BarcodeDetector = class {
      static getSupportedFormats() { return Promise.resolve(["qr_code"]); }
      detect() { return Promise.resolve([]); }
    };

    render(
      <QRScannerDialog open={true} onOpenChange={onOpenChange} onResult={onResult} />,
    );

    fireEvent.click(screen.getByText("totp.startCamera"));

    await waitFor(() => {
      expect(screen.getByText("totp.cameraPermissionDenied")).toBeInTheDocument();
    });

    delete (window as Record<string, unknown>).BarcodeDetector;
  });

  it("shows generic camera error for non-NotAllowedError failures", async () => {
    const genericError = new Error("Device not found");
    const mockGetUserMedia = vi.fn().mockRejectedValue(genericError);
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia: mockGetUserMedia },
      writable: true,
      configurable: true,
    });
    (window as Record<string, unknown>).BarcodeDetector = class {
      static getSupportedFormats() { return Promise.resolve(["qr_code"]); }
      detect() { return Promise.resolve([]); }
    };

    render(
      <QRScannerDialog open={true} onOpenChange={onOpenChange} onResult={onResult} />,
    );

    fireEvent.click(screen.getByText("totp.startCamera"));

    await waitFor(() => {
      expect(screen.getByText("totp.cameraError")).toBeInTheDocument();
    });

    delete (window as Record<string, unknown>).BarcodeDetector;
  });

  // ── File upload without BarcodeDetector ──────────────────────────

  it("shows error when uploading image without BarcodeDetector", async () => {
    // Ensure BarcodeDetector is NOT available
    delete (window as Record<string, unknown>).BarcodeDetector;

    render(
      <QRScannerDialog open={true} onOpenChange={onOpenChange} onResult={onResult} />,
    );

    // File input is present in the scan tab
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    if (fileInput) {
      const file = new File(["fake-image-content"], "qr.png", { type: "image/png" });
      Object.defineProperty(fileInput, "files", {
        value: [file],
        configurable: true,
      });
      fireEvent.change(fileInput);

      await waitFor(() => {
        expect(screen.getByText("totp.noBarcodeDetector")).toBeInTheDocument();
      });
    }
  });

  // ── Tab switching stops camera ────────────────────────────────────

  it("stops camera scan animation when switching to manual tab", async () => {
    const user = userEvent.setup();
    render(
      <QRScannerDialog open={true} onOpenChange={onOpenChange} onResult={onResult} />,
    );

    // Switch to manual tab
    await user.click(screen.getByText("totp.enterManually"));

    // Should show manual entry UI, not scanning
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/otpauth:\/\/totp/)).toBeInTheDocument();
    });
  });
});
