// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * CreateVaultGate Unit Tests
 *
 * The gate that funnels an authenticated user without a vault (invited org
 * member — or a first-time Google/GitHub social sign-in) into master-password
 * vault setup. Covers: happy path (derive → setupVault → Recovery Kit →
 * Device Enrollment → onComplete) and the retry-after-failure path.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CreateVaultGate } from "../CreateVaultGate";

const mockTrpcMutation = vi.fn();
const mockDeriveVaultKey = vi.fn();
const mockGenerateSecretKey = vi.fn();
const mockGenerateSalt = vi.fn();
const mockSecretKeyToBase32 = vi.fn();
const mockUint8ToBase64 = vi.fn();
const mockStoreSecretKey = vi.fn();
const mockSetDeviceKeyScope = vi.fn();
const mockVaultCryptoSetKey = vi.fn();
const mockCreateVerificationBlob = vi.fn();

vi.mock("@/lib/api/trpc", () => ({
  trpcMutation: (...args: unknown[]) => mockTrpcMutation(...args),
}));

vi.mock("@/lib/vault-crypto", () => ({
  generateSecretKey: (...args: unknown[]) => mockGenerateSecretKey(...args),
  generateSalt: (...args: unknown[]) => mockGenerateSalt(...args),
  deriveVaultKey: (...args: unknown[]) => mockDeriveVaultKey(...args),
  secretKeyToBase32: (...args: unknown[]) => mockSecretKeyToBase32(...args),
  uint8ToBase64: (...args: unknown[]) => mockUint8ToBase64(...args),
}));

vi.mock("@/lib/device-keys", () => ({
  setDeviceKeyScope: (...args: unknown[]) => mockSetDeviceKeyScope(...args),
  setSecretKey: (...args: unknown[]) => mockStoreSecretKey(...args),
}));

vi.mock("@/services/vault-crypto", () => ({
  vaultCrypto: {
    setKey: (...args: unknown[]) => mockVaultCryptoSetKey(...args),
    createVerificationBlob: (...args: unknown[]) =>
      mockCreateVerificationBlob(...args),
  },
}));

vi.mock("../RecoveryKit", () => ({
  RecoveryKit: ({
    secretKeyBase32,
    onConfirm,
  }: {
    secretKeyBase32: string;
    onConfirm: () => void;
  }) => (
    <div data-testid="recovery-kit" data-secret={secretKeyBase32}>
      <button type="button" onClick={onConfirm}>
        confirm-recovery-kit
      </button>
    </div>
  ),
}));

const mockEnrollDeviceInBackground = vi.fn();
vi.mock("@/services/keypair-manager", () => ({
  enrollDeviceInBackground: (...args: unknown[]) =>
    mockEnrollDeviceInBackground(...args),
}));

vi.mock("sonner", () => ({
  toast: { warning: vi.fn() },
}));

vi.mock("../PasswordStrengthIndicator", () => ({
  PasswordStrengthIndicator: () => <div data-testid="strength" />,
}));

const STRONG_PASSWORD = "Sup3r-Str0ng!Master";

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>) {
  await user.type(
    screen.getByLabelText("createVault.masterPassword"),
    STRONG_PASSWORD,
  );
  await user.type(
    screen.getByLabelText("createVault.confirmMasterPassword"),
    STRONG_PASSWORD,
  );
  await user.click(
    screen.getByRole("button", { name: "createVault.submit" }),
  );
}

describe("CreateVaultGate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateSecretKey.mockReturnValue(new Uint8Array(16).fill(7));
    mockGenerateSalt.mockReturnValue(new Uint8Array(16).fill(5));
    mockDeriveVaultKey.mockResolvedValue({
      vaultKey: new Uint8Array(32).fill(1),
    });
    mockSecretKeyToBase32.mockReturnValue("A2-SECRET-KEY-BASE32");
    mockUint8ToBase64.mockReturnValue("c2FsdA==");
    mockCreateVerificationBlob.mockResolvedValue("verification-blob");
    mockTrpcMutation.mockResolvedValue({});
    mockStoreSecretKey.mockResolvedValue(undefined);
  });

  it("renders the master password form", () => {
    render(<CreateVaultGate email="user@example.com" onComplete={vi.fn()} />);

    expect(
      screen.getByLabelText("createVault.masterPassword"),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("createVault.confirmMasterPassword"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "createVault.submit" }),
    ).toBeInTheDocument();
  });

  it("derives the vault key, calls setupVault and shows the Recovery Kit", async () => {
    const user = userEvent.setup();
    render(<CreateVaultGate email="user@example.com" onComplete={vi.fn()} />);

    await fillAndSubmit(user);

    await waitFor(() => {
      expect(screen.getByTestId("recovery-kit")).toBeInTheDocument();
    });

    expect(mockDeriveVaultKey).toHaveBeenCalledWith({
      masterPassword: STRONG_PASSWORD,
      secretKey: expect.any(Uint8Array),
      salt: expect.any(Uint8Array),
    });
    expect(mockTrpcMutation).toHaveBeenCalledWith("auth", "setupVault", {
      kdfSalt: "c2FsdA==",
      encryptedVerificationBlob: "verification-blob",
    });
    expect(mockVaultCryptoSetKey).toHaveBeenCalledWith(expect.any(Uint8Array));
    expect(mockStoreSecretKey).toHaveBeenCalled();
    expect(screen.getByTestId("recovery-kit")).toHaveAttribute(
      "data-secret",
      "A2-SECRET-KEY-BASE32",
    );
  });

  it("advances Recovery Kit → onComplete, backgrounding device enrollment", async () => {
    mockEnrollDeviceInBackground.mockResolvedValue(true);
    const onComplete = vi.fn();
    const user = userEvent.setup();
    render(<CreateVaultGate email="user@example.com" onComplete={onComplete} />);

    await fillAndSubmit(user);

    await user.click(
      await screen.findByRole("button", { name: "confirm-recovery-kit" }),
    );

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(mockEnrollDeviceInBackground).toHaveBeenCalledTimes(1);
  });

  it("shows the error step with retry when setupVault fails, then succeeds on retry", async () => {
    mockTrpcMutation.mockRejectedValueOnce(new Error("server unavailable"));

    const user = userEvent.setup();
    render(<CreateVaultGate email="user@example.com" onComplete={vi.fn()} />);

    await fillAndSubmit(user);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("server unavailable");
    });

    // Retry reuses the already-derived key material — no second derivation
    await user.click(
      screen.getByRole("button", { name: /createVault\.error\.retryButton/ }),
    );

    await waitFor(() => {
      expect(screen.getByTestId("recovery-kit")).toBeInTheDocument();
    });
    expect(mockDeriveVaultKey).toHaveBeenCalledTimes(1);
    expect(mockTrpcMutation).toHaveBeenCalledTimes(2);
  });

  it("does not submit when the passwords do not match", async () => {
    const user = userEvent.setup();
    render(<CreateVaultGate email="user@example.com" onComplete={vi.fn()} />);

    await user.type(
      screen.getByLabelText("createVault.masterPassword"),
      STRONG_PASSWORD,
    );
    await user.type(
      screen.getByLabelText("createVault.confirmMasterPassword"),
      "Different-Passw0rd!",
    );
    await user.click(
      screen.getByRole("button", { name: "createVault.submit" }),
    );

    await waitFor(() => {
      expect(screen.getAllByRole("alert").length).toBeGreaterThanOrEqual(1);
    });
    expect(mockDeriveVaultKey).not.toHaveBeenCalled();
    expect(mockTrpcMutation).not.toHaveBeenCalled();
  });
});
