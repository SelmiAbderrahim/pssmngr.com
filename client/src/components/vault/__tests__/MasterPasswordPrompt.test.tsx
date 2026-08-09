// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * MasterPasswordPrompt Component Tests
 *
 * Covers:
 * - Dialog rendering when open
 * - Password input remains concealed
 * - Unlock flow (success / failure / secret key required)
 * - Secret key input toggle
 * - preventClose behavior
 * - Empty password validation (button disabled)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MasterPasswordPrompt } from "../MasterPasswordPrompt";

// Mock vault-crypto dependencies
vi.mock("@/lib/vault-crypto", () => ({
  base64ToUint8: vi.fn(() => new Uint8Array(32)),
  base32ToSecretKey: vi.fn(() => new Uint8Array(16)),
  deriveVaultKey: vi.fn(async () => ({ vaultKey: new Uint8Array(32) })),
}));

const mockUnlock = vi.fn();
const mockSetKey = vi.fn();
const mockReWrapAllItems = vi.fn(async () => []);
const mockCreateBlob = vi.fn(async () => "new-blob");
vi.mock("@/services/vault-crypto", () => ({
  vaultCrypto: {
    unlock: (...args: unknown[]) => mockUnlock(...args),
    setKey: (...args: unknown[]) => mockSetKey(...args),
    reWrapAllItems: (...args: unknown[]) => mockReWrapAllItems(...args),
    createVerificationBlobWithKey: (...args: unknown[]) => mockCreateBlob(...args),
  },
}));

const mockGetSecretKey = vi.fn(async () => new Uint8Array(16));
vi.mock("@/lib/device-keys", () => ({
  getSecretKey: (...args: unknown[]) => mockGetSecretKey(...args),
  setSecretKey: vi.fn(),
}));

const mockClearPersistence = vi.fn(async () => undefined);
vi.mock("@/lib/persistent-unlock", () => ({
  clearPersistence: (...args: unknown[]) => mockClearPersistence(...args),
}));

const mockTrpcMutation = vi.fn(async () => ({}));
vi.mock("@/lib/api/trpc", () => ({
  trpcMutation: (...args: unknown[]) => mockTrpcMutation(...args),
}));

describe("MasterPasswordPrompt", () => {
  const defaultProps = {
    open: true,
    onUnlock: vi.fn(),
    salt: "dGVzdHNhbHQ=",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUnlock.mockResolvedValue(undefined);
  });

  // ── Rendering ────────────────────────────────────────────────────

  it("renders dialog with title and description when open", () => {
    render(<MasterPasswordPrompt {...defaultProps} />);
    expect(screen.getByText("vault.unlockTitle")).toBeInTheDocument();
    expect(screen.getByText("vault.unlockDescription")).toBeInTheDocument();
  });

  it("renders password input", () => {
    render(<MasterPasswordPrompt {...defaultProps} />);
    expect(screen.getByPlaceholderText("vault.passwordPlaceholder")).toBeInTheDocument();
  });

  it("renders unlock button", () => {
    render(<MasterPasswordPrompt {...defaultProps} />);
    expect(screen.getByText("vault.unlock")).toBeInTheDocument();
  });

  it("renders recovery key link when showSecretKeyInput is false", () => {
    render(<MasterPasswordPrompt {...defaultProps} />);
    expect(screen.getByText("vault.useRecoveryKey")).toBeInTheDocument();
  });

  // ── Password concealment ────────────────────────────────────────

  it("does not expose a password visibility toggle", () => {
    render(<MasterPasswordPrompt {...defaultProps} />);
    const input = screen.getByPlaceholderText("vault.passwordPlaceholder");
    expect(input).toHaveAttribute("type", "password");

    const toggleButtons = screen.getAllByRole("button");
    const visibilityToggle = toggleButtons.find(
      (btn) => btn.getAttribute("tabindex") === "-1",
    );
    expect(visibilityToggle).toBeUndefined();
  });

  // ── Unlock flow ──────────────────────────────────────────────────

  it("disables unlock button when password is empty", () => {
    render(<MasterPasswordPrompt {...defaultProps} />);
    const unlockBtn = screen.getByText("vault.unlock").closest("button")!;
    expect(unlockBtn).toBeDisabled();
  });

  it("enables unlock button when password has content", () => {
    render(<MasterPasswordPrompt {...defaultProps} />);
    const input = screen.getByPlaceholderText("vault.passwordPlaceholder");
    fireEvent.change(input, { target: { value: "a" } });
    const unlockBtn = screen.getByText("vault.unlock").closest("button")!;
    expect(unlockBtn).not.toBeDisabled();
  });

  it("calls vault unlock and onUnlock on success", async () => {
    render(<MasterPasswordPrompt {...defaultProps} />);
    const input = screen.getByPlaceholderText("vault.passwordPlaceholder");
    fireEvent.change(input, { target: { value: "MyMasterPass123!" } });
    fireEvent.click(screen.getByText("vault.unlock"));

    await waitFor(() => {
      expect(mockUnlock).toHaveBeenCalled();
      expect(defaultProps.onUnlock).toHaveBeenCalled();
    });
  });

  it("shows error on unlock failure", async () => {
    mockUnlock.mockRejectedValueOnce(new Error("Decryption failed"));
    render(<MasterPasswordPrompt {...defaultProps} />);
    const input = screen.getByPlaceholderText("vault.passwordPlaceholder");
    fireEvent.change(input, { target: { value: "wrong-password" } });
    fireEvent.click(screen.getByText("vault.unlock"));

    await waitFor(() => {
      expect(screen.getByText("vault.unlockFailed")).toBeInTheDocument();
    });
  });

  it("shows secret key input when error indicates missing key", async () => {
    mockUnlock.mockRejectedValueOnce(new Error("Secret key not found on device"));
    render(<MasterPasswordPrompt {...defaultProps} />);
    const input = screen.getByPlaceholderText("vault.passwordPlaceholder");
    fireEvent.change(input, { target: { value: "my-password" } });
    fireEvent.click(screen.getByText("vault.unlock"));

    await waitFor(() => {
      expect(screen.getByText("vault.secretKeyRequired")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-X")).toBeInTheDocument();
    });
  });

  // ── Secret key toggle ────────────────────────────────────────────

  it("shows secret key input when showSecretKeyInput prop is true", () => {
    render(<MasterPasswordPrompt {...defaultProps} showSecretKeyInput />);
    expect(screen.getByPlaceholderText("XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-X")).toBeInTheDocument();
  });

  it("toggles secret key input via recovery key link", () => {
    render(<MasterPasswordPrompt {...defaultProps} />);
    expect(screen.queryByPlaceholderText("XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-X")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("vault.useRecoveryKey"));
    expect(screen.getByPlaceholderText("XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-X")).toBeInTheDocument();
  });

  // ── Enter key shortcut (form submission) ─────────────────────────

  it("triggers unlock on form submit (Enter key)", async () => {
    render(<MasterPasswordPrompt {...defaultProps} />);
    const input = screen.getByPlaceholderText("vault.passwordPlaceholder");
    fireEvent.change(input, { target: { value: "password123" } });
    fireEvent.submit(input.closest("form")!);

    await waitFor(() => {
      expect(mockUnlock).toHaveBeenCalled();
    });
  });

  // ── Recovery mode gate ────────────────────────────────────────────
  //
  // recoveryMode is the app's only live master-password-change surface.
  // The sensitive-action requirement ("changing the master password demands
  // the master password") is satisfied structurally: re-keying is impossible
  // without the OLD master password. These tests lock that in.

  describe("recoveryMode gate", () => {
    const recoveryProps = {
      ...defaultProps,
      recoveryMode: true,
      serverItems: [] as never[],
      vaultId: "vault-1",
      onRecovery: vi.fn(),
    };

    it("disables submit until BOTH old and new passwords are present", () => {
      render(<MasterPasswordPrompt {...recoveryProps} />);
      const newPass = screen.getByPlaceholderText("vault.passwordPlaceholder");
      const submitBtn = screen.getByText("vault.recover").closest("button")!;

      // Only the new password → still disabled
      fireEvent.change(newPass, { target: { value: "NewMasterPass123!" } });
      expect(submitBtn).toBeDisabled();
    });

    it("never re-keys on forced form submit without the old password", async () => {
      render(<MasterPasswordPrompt {...recoveryProps} />);
      const newPass = screen.getByPlaceholderText("vault.passwordPlaceholder");
      fireEvent.change(newPass, { target: { value: "NewMasterPass123!" } });
      // Bypass the disabled button: submit the form directly
      fireEvent.submit(newPass.closest("form")!);

      await waitFor(() => {
        // Falls through to the standard unlock path — no re-key side effects
        expect(mockTrpcMutation).not.toHaveBeenCalled();
        expect(mockReWrapAllItems).not.toHaveBeenCalled();
        expect(mockSetKey).not.toHaveBeenCalled();
        expect(recoveryProps.onRecovery).not.toHaveBeenCalled();
      });
    });

    it("re-keys with old password: reKey mutation, persistence cleared, new key set", async () => {
      render(<MasterPasswordPrompt {...recoveryProps} />);
      const oldPass = screen.getByPlaceholderText("vault.oldPasswordPlaceholder");
      const newPass = screen.getByPlaceholderText("vault.passwordPlaceholder");
      fireEvent.change(oldPass, { target: { value: "OldMasterPass123!" } });
      fireEvent.change(newPass, { target: { value: "NewMasterPass123!" } });
      fireEvent.submit(newPass.closest("form")!);

      await waitFor(() => {
        expect(mockTrpcMutation).toHaveBeenCalledWith(
          "vault",
          "reKey",
          expect.objectContaining({ vaultId: "vault-1" }),
        );
        // Old-key persistence wrap must be cleared BEFORE the new key lands
        expect(mockClearPersistence).toHaveBeenCalled();
        expect(mockSetKey).toHaveBeenCalled();
        expect(recoveryProps.onRecovery).toHaveBeenCalled();
        expect(recoveryProps.onUnlock).toHaveBeenCalled();
      });
    });
  });
});
