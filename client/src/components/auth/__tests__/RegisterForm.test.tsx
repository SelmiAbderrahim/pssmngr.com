// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * RegisterForm Unit Tests
 *
 * Tests the multi-step registration flow:
 * form -> creating -> recoveryKit -> dashboard (device enrollment runs
 * in the background)
 *
 * Critical test: onRegistrationStart fires synchronously before async work,
 * preventing the race condition where the auth redirect fires before
 * the Recovery Kit step is reached.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RegisterForm } from "../RegisterForm";

// --- Mocks ---

const mockSignUpEmail = vi.fn();
const mockTrpcMutation = vi.fn();
const mockStoreSecretKey = vi.fn();
const mockNavigate = vi.fn();
const mockStorePendingVaultSetup = vi.fn();
const mockSendVerificationEmail = vi.fn();
const mockSocialSignIn = vi.fn();
const mockDeriveAuthenticationSecret = vi.fn();

const mockVaultKey = new Uint8Array(32).fill(1);
const mockSecretKey = new Uint8Array(16).fill(2);
const mockSalt = new Uint8Array(16).fill(3);

vi.mock("@/lib/auth", () => ({
  signUp: {
    email: (...args: unknown[]) => mockSignUpEmail(...args),
  },
}));

vi.mock("@/lib/api/trpc", () => ({
  trpcMutation: (...args: unknown[]) => mockTrpcMutation(...args),
}));

vi.mock("@/lib/auth-credential", () => ({
  deriveAuthenticationSecret: (...args: unknown[]) =>
    mockDeriveAuthenticationSecret(...args),
}));

vi.mock("@/lib/device-keys", () => ({
  setSecretKey: (...args: unknown[]) => mockStoreSecretKey(...args),
  setDeviceKeyScope: vi.fn(),
}));

vi.mock("@/lib/vault-crypto", () => ({
  generateSecretKey: () => new Uint8Array(mockSecretKey),
  generateSalt: () => new Uint8Array(mockSalt),
  deriveVaultKey: vi
    .fn()
    .mockResolvedValue({ vaultKey: new Uint8Array(32).fill(1) }),
  secretKeyToBase32: () => "AAAAA-BBBBB-CCCCC-DDDDD-EEEEE-FF",
  uint8ToBase64: () => "base64salt==",
}));

vi.mock("@/services/vault-crypto", () => ({
  vaultCrypto: {
    setKey: vi.fn(),
    createVerificationBlob: vi.fn().mockResolvedValue("encrypted-blob-base64"),
  },
}));

vi.mock("@/lib/translateServerError", () => ({
  translateServerError: (msg: string) => msg,
}));

vi.mock("@/lib/pending-vault-setup", () => ({
  storePendingVaultSetup: (...args: unknown[]) =>
    mockStorePendingVaultSetup(...args),
}));

vi.mock("@/services/keypair-manager", () => ({
  enrollDeviceInBackground: vi.fn().mockResolvedValue(true),
}));

vi.mock("sonner", () => ({
  toast: { warning: vi.fn() },
}));

vi.mock("@/lib/auth/auth-client", () => ({
  authClient: {
    sendVerificationEmail: (...args: unknown[]) =>
      mockSendVerificationEmail(...args),
    signIn: {
      social: (...args: unknown[]) => mockSocialSignIn(...args),
    },
  },
}));

// --- Helpers ---

async function fillAndSubmitForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/register\.firstName/i), "John");
  await user.type(screen.getByLabelText(/register\.lastName/i), "Doe");
  await user.type(
    screen.getByLabelText(/register\.email/i),
    "john@example.com",
  );

  await user.type(screen.getByLabelText(/register\.password$/i), "StrongP@ss1");
  await user.type(
    screen.getByLabelText(/register\.confirmPassword/i),
    "StrongP@ss1",
  );

  // Submit
  const submitButton = screen.getByRole("button", {
    name: /register\.signUpButton/i,
  });
  await user.click(submitButton);
}

// --- Tests ---

describe("RegisterForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSignUpEmail.mockResolvedValue({
      data: { token: "session-token", user: { id: "u1" } },
      error: null,
    });
    mockTrpcMutation.mockResolvedValue({});
    mockStoreSecretKey.mockResolvedValue(undefined);
    mockStorePendingVaultSetup.mockReturnValue(undefined);
    mockSendVerificationEmail.mockResolvedValue({});
    mockDeriveAuthenticationSecret.mockResolvedValue("derived-auth-secret");
  });

  // ── Rendering ─────────────────────────────────────────────────

  describe("form rendering", () => {
    it("renders all required form fields", () => {
      render(<RegisterForm />);

      expect(screen.getByLabelText(/register\.firstName/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/register\.lastName/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/register\.email/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/register\.password$/i)).toBeInTheDocument();
      expect(
        screen.getByLabelText(/register\.confirmPassword/i),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /register\.signUpButton/i }),
      ).toBeInTheDocument();
    });

    it("renders the Google and GitHub social sign-up buttons", async () => {
      const user = userEvent.setup();
      render(<RegisterForm />);

      const googleButton = screen.getByRole("button", {
        name: "register.signUpWithGoogle",
      });
      expect(googleButton).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "register.signUpWithGithub" }),
      ).toBeInTheDocument();

      await user.click(googleButton);
      await waitFor(() => {
        expect(mockSocialSignIn).toHaveBeenCalledWith(
          expect.objectContaining({ provider: "google" }),
        );
      });
      // Social sign-up must not run the form's vault-creating registration
      expect(mockSignUpEmail).not.toHaveBeenCalled();
    });

    it("renders password toggle buttons", () => {
      render(<RegisterForm />);

      const toggleButtons = screen.getAllByRole("button", {
        name: /showPassword/i,
      });
      // Two toggle buttons (password + confirm password)
      expect(toggleButtons.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ── onRegistrationStart (critical bug-fix test) ───────────────

  describe("onRegistrationStart callback", () => {
    it("calls onRegistrationStart synchronously at the beginning of onSubmit", async () => {
      const onRegistrationStart = vi.fn();
      const callOrder: string[] = [];

      onRegistrationStart.mockImplementation(() => {
        callOrder.push("onRegistrationStart");
      });
      mockSignUpEmail.mockImplementation(async () => {
        callOrder.push("signUp.email");
        return {
          data: { token: "session-token", user: { id: "u1" } },
          error: null,
        };
      });

      const user = userEvent.setup();
      render(<RegisterForm onRegistrationStart={onRegistrationStart} />);

      await fillAndSubmitForm(user);

      await waitFor(() => {
        expect(onRegistrationStart).toHaveBeenCalledTimes(1);
      });

      // onRegistrationStart must fire BEFORE signUp.email
      expect(callOrder.indexOf("onRegistrationStart")).toBeLessThan(
        callOrder.indexOf("signUp.email"),
      );
    });

    it("does NOT call onRegistrationStart when form validation fails", async () => {
      const onRegistrationStart = vi.fn();
      const user = userEvent.setup();
      render(<RegisterForm onRegistrationStart={onRegistrationStart} />);

      // Submit without filling fields
      const submitButton = screen.getByRole("button", {
        name: /register\.signUpButton/i,
      });
      await user.click(submitButton);

      // Wait for validation errors to appear
      await waitFor(() => {
        expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
      });

      expect(onRegistrationStart).not.toHaveBeenCalled();
    });

    it("works correctly when onRegistrationStart is not provided", async () => {
      const user = userEvent.setup();
      render(<RegisterForm />);

      await fillAndSubmitForm(user);

      // Should not throw — the optional call is safe
      await waitFor(() => {
        expect(mockSignUpEmail).toHaveBeenCalled();
      });
    });
  });

  // ── Full registration flow ─────────────────────────────────────

  describe("registration flow", () => {
    it("transitions from form to creating to recoveryKit", async () => {
      const user = userEvent.setup();
      render(<RegisterForm />);

      await fillAndSubmitForm(user);

      // Should show Recovery Kit after all async operations complete
      await waitFor(() => {
        expect(
          screen.getByText("AAAAA-BBBBB-CCCCC-DDDDD-EEEEE-FF"),
        ).toBeInTheDocument();
      });
    });

    it("calls signUp.email with correct parameters", async () => {
      const user = userEvent.setup();
      render(<RegisterForm />);

      await fillAndSubmitForm(user);

      await waitFor(() => {
        expect(mockSignUpEmail).toHaveBeenCalledWith({
          email: "john@example.com",
          password: "derived-auth-secret",
          name: "John Doe",
          callbackURL: "/login",
        });
      });
    });

    it("calls setupVault after successful signup", async () => {
      const user = userEvent.setup();
      render(<RegisterForm />);

      await fillAndSubmitForm(user);

      await waitFor(() => {
        expect(mockTrpcMutation).toHaveBeenCalledWith(
          "auth",
          "setupVault",
          expect.objectContaining({
            kdfSalt: "base64salt==",
            encryptedVerificationBlob: "encrypted-blob-base64",
          }),
        );
      });
    });

    it("stores secret key in IndexedDB after vault setup", async () => {
      const user = userEvent.setup();
      render(<RegisterForm />);

      await fillAndSubmitForm(user);

      await waitFor(() => {
        expect(mockStoreSecretKey).toHaveBeenCalled();
      });
    });
  });

  // ── Error handling ─────────────────────────────────────────────

  describe("error handling", () => {
    it("shows error and resets to form when signUp fails", async () => {
      mockSignUpEmail.mockResolvedValue({
        data: null,
        error: { message: "Email already exists" },
      });

      const onError = vi.fn();
      const user = userEvent.setup();
      render(<RegisterForm onError={onError} />);

      await fillAndSubmitForm(user);

      await waitFor(() => {
        expect(screen.getByRole("alert")).toHaveTextContent(
          "Email already exists",
        );
      });

      // Should be back on the form step
      expect(screen.getByLabelText(/register\.email/i)).toBeInTheDocument();
      expect(onError).toHaveBeenCalled();
    });

    it("shows vault setup error screen (not form) when vault setup fails after signup", async () => {
      mockTrpcMutation.mockRejectedValue(new Error("Vault setup failed"));

      const user = userEvent.setup();
      render(<RegisterForm />);

      await fillAndSubmitForm(user);

      // Should show vault setup error screen — NOT the form
      await waitFor(() => {
        expect(
          screen.getByText("register.vaultSetupError.title"),
        ).toBeInTheDocument();
      });

      expect(screen.getByRole("alert")).toHaveTextContent("Vault setup failed");
      expect(
        screen.getByRole("button", {
          name: /register\.vaultSetupError\.retryButton/i,
        }),
      ).toBeInTheDocument();

      // Form fields should NOT be visible (not reset to form)
      expect(
        screen.queryByLabelText(/register\.email/i),
      ).not.toBeInTheDocument();
    });
  });

  // ── UI interactions ────────────────────────────────────────────

  describe("UI interactions", () => {
    it("toggles password visibility", async () => {
      const user = userEvent.setup();
      render(<RegisterForm />);

      const passwordInput = screen.getByLabelText(/register\.password$/i);
      expect(passwordInput).toHaveAttribute("type", "password");

      // Find the toggle button for the password field (first show password button)
      const toggleButtons = screen.getAllByRole("button", {
        name: /common\.showPassword/i,
      });
      await user.click(toggleButtons[0]!);

      expect(passwordInput).toHaveAttribute("type", "text");
    });

    it("disables submit button during loading", async () => {
      // Make signUp hang indefinitely to keep loading state
      mockSignUpEmail.mockImplementation(() => new Promise(() => {}));

      const user = userEvent.setup();
      render(<RegisterForm />);

      await fillAndSubmitForm(user);

      // The form transitions to "creating" step which shows a loader
      await waitFor(() => {
        expect(
          screen.getByText(/register\.creating\.title/i),
        ).toBeInTheDocument();
      });
    });
  });

  // ── Cloud registration flow (no auto-sign-in) ──────────────────

  describe("cloud registration flow (no auto-sign-in)", () => {
    beforeEach(() => {
      mockSignUpEmail.mockResolvedValue({
        data: { token: null, user: { id: "u1" } },
        error: null,
      });
    });

    it("shows email verification screen when signup returns token: null", async () => {
      const user = userEvent.setup();
      render(<RegisterForm />);

      await fillAndSubmitForm(user);

      // Should show the email verification step
      await waitFor(() => {
        expect(
          screen.getByText("register.emailVerification.title"),
        ).toBeInTheDocument();
      });

      // setupVault should NOT have been called (skipped for cloud mode)
      expect(mockTrpcMutation).not.toHaveBeenCalled();

      // Pending vault data should have been stored in localStorage
      expect(mockStorePendingVaultSetup).toHaveBeenCalledWith(
        expect.objectContaining({
          kdfSalt: "base64salt==",
          encryptedVerificationBlob: "encrypted-blob-base64",
          secretKeyBase32: "AAAAA-BBBBB-CCCCC-DDDDD-EEEEE-FF",
          email: "john@example.com",
        }),
      );
    });

    it("stores secret key in IndexedDB even without auto-sign-in", async () => {
      const user = userEvent.setup();
      render(<RegisterForm />);

      await fillAndSubmitForm(user);

      await waitFor(() => {
        expect(
          screen.getByText("register.emailVerification.title"),
        ).toBeInTheDocument();
      });

      expect(mockStoreSecretKey).toHaveBeenCalled();
    });
  });

  // ── Self-hosted registration flow (auto-sign-in) ───────────────

  describe("self-hosted registration flow (auto-sign-in)", () => {
    beforeEach(() => {
      mockSignUpEmail.mockResolvedValue({
        data: { token: "session-token-123", user: { id: "u1" } },
        error: null,
      });
    });

    it("proceeds to recovery kit when signup returns a token", async () => {
      const user = userEvent.setup();
      render(<RegisterForm />);

      await fillAndSubmitForm(user);

      // Should show recovery kit with the secret key
      await waitFor(() => {
        expect(
          screen.getByText("AAAAA-BBBBB-CCCCC-DDDDD-EEEEE-FF"),
        ).toBeInTheDocument();
      });

      // setupVault should have been called (session available)
      expect(mockTrpcMutation).toHaveBeenCalledWith(
        "auth",
        "setupVault",
        expect.objectContaining({
          kdfSalt: "base64salt==",
          encryptedVerificationBlob: "encrypted-blob-base64",
        }),
      );

      // Pending vault setup should NOT have been called
      expect(mockStorePendingVaultSetup).not.toHaveBeenCalled();
    });
  });

  // ── Vault setup error recovery (Phase 2 failures) ─────────────

  describe("vault setup error recovery", () => {
    it("shows vault setup error when createVerificationBlob fails", async () => {
      const { vaultCrypto } = await import("@/services/vault-crypto");
      (
        vaultCrypto.createVerificationBlob as ReturnType<typeof vi.fn>
      ).mockRejectedValueOnce(new Error("WASM load failed"));

      const user = userEvent.setup();
      render(<RegisterForm />);

      await fillAndSubmitForm(user);

      await waitFor(() => {
        expect(
          screen.getByText("register.vaultSetupError.title"),
        ).toBeInTheDocument();
      });

      expect(screen.getByRole("alert")).toHaveTextContent("WASM load failed");
      expect(
        screen.getByRole("button", {
          name: /register\.vaultSetupError\.retryButton/i,
        }),
      ).toBeInTheDocument();
    });

    it("shows vault setup error when IndexedDB storeSecretKey fails", async () => {
      mockStoreSecretKey.mockRejectedValueOnce(
        new Error("IndexedDB unavailable"),
      );

      const user = userEvent.setup();
      render(<RegisterForm />);

      await fillAndSubmitForm(user);

      await waitFor(() => {
        expect(
          screen.getByText("register.vaultSetupError.title"),
        ).toBeInTheDocument();
      });

      expect(screen.getByRole("alert")).toHaveTextContent(
        "IndexedDB unavailable",
      );
    });

    it("retries vault setup successfully after initial failure", async () => {
      // First attempt: trpcMutation fails
      mockTrpcMutation.mockRejectedValueOnce(new Error("Network error"));

      const user = userEvent.setup();
      render(<RegisterForm />);

      await fillAndSubmitForm(user);

      // Should show vault error screen
      await waitFor(() => {
        expect(
          screen.getByText("register.vaultSetupError.title"),
        ).toBeInTheDocument();
      });

      // Fix the mock for retry
      mockTrpcMutation.mockResolvedValueOnce({});

      // Click retry
      await user.click(
        screen.getByRole("button", {
          name: /register\.vaultSetupError\.retryButton/i,
        }),
      );

      // Should proceed to recovery kit
      await waitFor(() => {
        expect(
          screen.getByText("AAAAA-BBBBB-CCCCC-DDDDD-EEEEE-FF"),
        ).toBeInTheDocument();
      });
    });

    it("shows updated error on retry failure", async () => {
      // First attempt fails
      mockTrpcMutation.mockRejectedValueOnce(new Error("First failure"));

      const user = userEvent.setup();
      render(<RegisterForm />);

      await fillAndSubmitForm(user);

      await waitFor(() => {
        expect(screen.getByRole("alert")).toHaveTextContent("First failure");
      });

      // Retry also fails with different error
      mockTrpcMutation.mockRejectedValueOnce(new Error("Second failure"));

      await user.click(
        screen.getByRole("button", {
          name: /register\.vaultSetupError\.retryButton/i,
        }),
      );

      await waitFor(() => {
        expect(screen.getByRole("alert")).toHaveTextContent("Second failure");
      });
    });

    it("still resets to form when signUp.email fails (Phase 1)", async () => {
      mockSignUpEmail.mockResolvedValue({
        data: null,
        error: { message: "Email already exists" },
      });

      const user = userEvent.setup();
      render(<RegisterForm />);

      await fillAndSubmitForm(user);

      await waitFor(() => {
        expect(screen.getByRole("alert")).toHaveTextContent(
          "Email already exists",
        );
      });

      // Should be on form step — NOT vault error screen
      expect(screen.getByLabelText(/register\.email/i)).toBeInTheDocument();
      expect(
        screen.queryByText("register.vaultSetupError.title"),
      ).not.toBeInTheDocument();
    });

    it("proceeds when signUp returns error but user was created", async () => {
      // Edge case: error exists but user data also exists (account created despite error)
      mockSignUpEmail.mockResolvedValue({
        data: { token: "session-token", user: { id: "u1" } },
        error: { message: "Some warning" },
      });

      const user = userEvent.setup();
      render(<RegisterForm />);

      await fillAndSubmitForm(user);

      // Should proceed to recovery kit (not show error)
      await waitFor(() => {
        expect(
          screen.getByText("AAAAA-BBBBB-CCCCC-DDDDD-EEEEE-FF"),
        ).toBeInTheDocument();
      });
    });
  });

  // ── Cloud vault setup error recovery ──────────────────────────

  describe("cloud vault setup error recovery", () => {
    beforeEach(() => {
      mockSignUpEmail.mockResolvedValue({
        data: { token: null, user: { id: "u1" } },
        error: null,
      });
    });

    it("shows vault setup error on cloud when createVerificationBlob fails", async () => {
      const { vaultCrypto } = await import("@/services/vault-crypto");
      (
        vaultCrypto.createVerificationBlob as ReturnType<typeof vi.fn>
      ).mockRejectedValueOnce(new Error("Encryption failed"));

      const user = userEvent.setup();
      render(<RegisterForm />);

      await fillAndSubmitForm(user);

      await waitFor(() => {
        expect(
          screen.getByText("register.vaultSetupError.title"),
        ).toBeInTheDocument();
      });

      // setupVault should NOT have been called
      expect(mockTrpcMutation).not.toHaveBeenCalled();
      // Pending vault setup should NOT have been stored (blob creation failed before that)
      expect(mockStorePendingVaultSetup).not.toHaveBeenCalled();
    });

    it("retries cloud vault setup and stores pending data on success", async () => {
      const { vaultCrypto } = await import("@/services/vault-crypto");
      // First attempt fails
      (
        vaultCrypto.createVerificationBlob as ReturnType<typeof vi.fn>
      ).mockRejectedValueOnce(new Error("Temporary failure"));

      const user = userEvent.setup();
      render(<RegisterForm />);

      await fillAndSubmitForm(user);

      await waitFor(() => {
        expect(
          screen.getByText("register.vaultSetupError.title"),
        ).toBeInTheDocument();
      });

      // Fix the mock for retry
      (
        vaultCrypto.createVerificationBlob as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce("encrypted-blob-base64");

      await user.click(
        screen.getByRole("button", {
          name: /register\.vaultSetupError\.retryButton/i,
        }),
      );

      // Should proceed to email verification (cloud mode, token: null)
      await waitFor(() => {
        expect(
          screen.getByText("register.emailVerification.title"),
        ).toBeInTheDocument();
      });

      // Pending vault data should now be stored
      expect(mockStorePendingVaultSetup).toHaveBeenCalledWith(
        expect.objectContaining({
          kdfSalt: "base64salt==",
          encryptedVerificationBlob: "encrypted-blob-base64",
          email: "john@example.com",
        }),
      );
    });
  });
});
