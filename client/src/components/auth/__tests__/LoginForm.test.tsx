import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoginForm } from "../LoginForm";

const mockNavigate = vi.fn();
const mockSignInEmail = vi.fn();
const mockPasskeySignIn = vi.fn();
const mockSocialSignIn = vi.fn();
const mockVerifyTotp = vi.fn();
const mockTrpcQuery = vi.fn();
const mockGetSecretKey = vi.fn();
const mockSetSecretKey = vi.fn();
const mockEnrollDeviceInBackground = vi.fn();
const mockToastWarning = vi.fn();
const mockClearDeviceKeys = vi.fn();
const mockDeriveVaultKey = vi.fn();
const mockBase32ToSecretKey = vi.fn();
const mockBase64ToUint8 = vi.fn();
const mockVaultCryptoSetKey = vi.fn();
const mockVerifyVaultKeyWithKey = vi.fn();
const mockDeriveAuthenticationSecret = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock("@/lib/auth", () => ({
  signIn: {
    email: (...args: unknown[]) => mockSignInEmail(...args),
  },
}));

vi.mock("@/lib/auth/auth-client", () => ({
  authClient: {
    signIn: {
      passkey: (...args: unknown[]) => mockPasskeySignIn(...args),
      social: (...args: unknown[]) => mockSocialSignIn(...args),
    },
    twoFactor: {
      verifyTotp: (...args: unknown[]) => mockVerifyTotp(...args),
    },
  },
}));

vi.mock("@/lib/api/trpc", () => ({
  trpcQuery: (...args: unknown[]) => mockTrpcQuery(...args),
}));

vi.mock("@/lib/device-keys", () => ({
  getSecretKey: (...args: unknown[]) => mockGetSecretKey(...args),
  setSecretKey: (...args: unknown[]) => mockSetSecretKey(...args),
  clearDeviceKeys: (...args: unknown[]) => mockClearDeviceKeys(...args),
  setDeviceKeyScope: vi.fn(),
}));

vi.mock("@/services/keypair-manager", () => ({
  enrollDeviceInBackground: (...args: unknown[]) =>
    mockEnrollDeviceInBackground(...args),
}));

vi.mock("sonner", () => ({
  toast: {
    warning: (...args: unknown[]) => mockToastWarning(...args),
  },
}));

vi.mock("@/lib/vault-crypto", () => ({
  deriveVaultKey: (...args: unknown[]) => mockDeriveVaultKey(...args),
  base32ToSecretKey: (...args: unknown[]) => mockBase32ToSecretKey(...args),
  base64ToUint8: (...args: unknown[]) => mockBase64ToUint8(...args),
}));

vi.mock("@/services/vault-crypto", () => ({
  vaultCrypto: {
    setKey: (...args: unknown[]) => mockVaultCryptoSetKey(...args),
    verifyVaultKeyWithKey: (...args: unknown[]) =>
      mockVerifyVaultKeyWithKey(...args),
  },
}));

vi.mock("@/lib/translateServerError", () => ({
  translateServerError: (message: string) => message,
}));

vi.mock("@/lib/auth-credential", () => ({
  deriveAuthenticationSecret: (...args: unknown[]) =>
    mockDeriveAuthenticationSecret(...args),
}));

async function submitLogin() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("login.email"), "invitee@example.com");
  await user.type(screen.getByLabelText("login.password"), "TempPassw0rd!");
  await user.click(screen.getByRole("button", { name: "login.signInButton" }));
}

describe("LoginForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockResolvedValue(undefined);
    mockSignInEmail.mockResolvedValue({
      data: { user: { id: "u1" } },
      error: null,
    });
    mockPasskeySignIn.mockResolvedValue({ data: null, error: null });
    mockVerifyTotp.mockResolvedValue({ data: {}, error: null });
    mockTrpcQuery.mockResolvedValue({
      salt: "base64-salt-value-123456",
      encryptedVerificationBlob: "verification-blob",
    });
    mockGetSecretKey.mockResolvedValue(null);
    mockSetSecretKey.mockResolvedValue(undefined);
    mockEnrollDeviceInBackground.mockResolvedValue(true);
    mockClearDeviceKeys.mockResolvedValue(undefined);
    mockDeriveVaultKey.mockResolvedValue({
      vaultKey: new Uint8Array(32).fill(1),
    });
    mockBase32ToSecretKey.mockReturnValue(new Uint8Array(16).fill(2));
    mockBase64ToUint8.mockReturnValue(new Uint8Array(16).fill(3));
    mockVerifyVaultKeyWithKey.mockResolvedValue(true);
    mockDeriveAuthenticationSecret.mockResolvedValue("derived-auth-secret");
  });

  it("fails closed when vault setup is incomplete", async () => {
    mockTrpcQuery.mockResolvedValueOnce({
      salt: "dummy-salt-value-123456",
      encryptedVerificationBlob: null,
    });

    render(<LoginForm />);

    await submitLogin();

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(mockSignInEmail).not.toHaveBeenCalled();
    expect(mockGetSecretKey).not.toHaveBeenCalled();
    expect(mockDeriveVaultKey).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "login.error.vaultSetupIncomplete",
    );
  });

  it("still asks for a Secret Key when an existing vault has no stored key", async () => {
    render(<LoginForm />);

    await submitLogin();

    await waitFor(() => {
      expect(screen.getByText("login.secretKey.title")).toBeInTheDocument();
    });
    expect(mockGetSecretKey).toHaveBeenCalledTimes(1);
    expect(mockSignInEmail).not.toHaveBeenCalled();
  });

  it("uses the stored Secret Key for existing vault users", async () => {
    const storedSecretKey = new Uint8Array(16).fill(9);
    mockGetSecretKey.mockResolvedValueOnce(storedSecretKey);

    render(<LoginForm />);

    await submitLogin();

    await waitFor(() => {
      expect(mockDeriveVaultKey).toHaveBeenCalledWith({
        masterPassword: "TempPassw0rd!",
        secretKey: storedSecretKey,
        salt: expect.any(Uint8Array),
      });
    });
    expect(mockTrpcQuery).toHaveBeenCalledTimes(1);
    expect(mockVerifyVaultKeyWithKey).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      "verification-blob",
    );
    expect(mockVaultCryptoSetKey).toHaveBeenCalledWith(expect.any(Uint8Array));
    expect(mockDeriveAuthenticationSecret).toHaveBeenCalledWith(
      new Uint8Array(32).fill(1),
    );
    expect(mockSetSecretKey).toHaveBeenCalledWith(storedSecretKey);
    expect(mockSignInEmail).toHaveBeenCalledWith({
      email: "invitee@example.com",
      password: "derived-auth-secret",
      rememberMe: false,
    });
    expect(mockSignInEmail).not.toHaveBeenCalledWith(
      expect.objectContaining({ password: "TempPassw0rd!" }),
    );
  });

  it("renders the Google and GitHub social sign-in buttons", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);

    const googleButton = screen.getByRole("button", {
      name: "login.signInWithGoogle",
    });
    expect(googleButton).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "login.signInWithGithub" }),
    ).toBeInTheDocument();

    await user.click(googleButton);
    await waitFor(() => {
      expect(mockSocialSignIn).toHaveBeenCalledWith(
        expect.objectContaining({ provider: "google" }),
      );
    });
    expect(mockSignInEmail).not.toHaveBeenCalled();
  });

  it("kicks off background device enrollment after login (never renders a device step)", async () => {
    const storedSecretKey = new Uint8Array(16).fill(9);
    mockGetSecretKey.mockResolvedValueOnce(storedSecretKey);

    render(<LoginForm />);
    await submitLogin();

    await waitFor(() => {
      expect(mockEnrollDeviceInBackground).toHaveBeenCalledTimes(1);
    });
    // No "Register Device" / "Name This Device" screen is rendered
    expect(screen.queryByText("login.device.title")).not.toBeInTheDocument();
    expect(screen.queryByText("login.device.register")).not.toBeInTheDocument();
  });

  it("does not render a separate 'deriving' step during vault key derivation", async () => {
    const storedSecretKey = new Uint8Array(16).fill(9);
    mockGetSecretKey.mockResolvedValueOnce(storedSecretKey);

    render(<LoginForm />);
    await submitLogin();

    await waitFor(() => expect(mockSignInEmail).toHaveBeenCalled());
    // The dedicated "Unlocking Vault" screen is gone (deriving now folds
    // into the submit button's pending state).
    expect(screen.queryByText("login.deriving.title")).not.toBeInTheDocument();
  });

  it("shows a deferred toast when background enrollment fails after login", async () => {
    // Fire the failure branch synchronously by invoking onFailure
    mockEnrollDeviceInBackground.mockImplementationOnce(
      async (opts?: { onFailure?: () => void }) => {
        opts?.onFailure?.();
        return false;
      },
    );
    const storedSecretKey = new Uint8Array(16).fill(9);
    mockGetSecretKey.mockResolvedValueOnce(storedSecretKey);

    render(<LoginForm />);
    await submitLogin();

    await waitFor(() => {
      expect(mockToastWarning).toHaveBeenCalledTimes(1);
    });
  });
});
