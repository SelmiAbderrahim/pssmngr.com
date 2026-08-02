// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * SocialLoginButtons Unit Tests
 *
 * Covers the OAuth entry buttons (Google + GitHub):
 * - per-mode labels (login vs register)
 * - authClient.signIn.social payload (provider + callback URLs)
 * - pending state disables both buttons
 * - error handling ({error} result and thrown error) re-enables the buttons
 * - external `disabled` prop
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SocialLoginButtons } from "../SocialLoginButtons";

const mockSocialSignIn = vi.fn();

vi.mock("@/lib/auth/auth-client", () => ({
  authClient: {
    signIn: {
      social: (...args: unknown[]) => mockSocialSignIn(...args),
    },
  },
}));

describe("SocialLoginButtons", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSocialSignIn.mockResolvedValue({ data: null, error: null });
  });

  // ── Rendering ─────────────────────────────────────────────────

  it("renders sign-in labels in login mode", () => {
    render(<SocialLoginButtons mode="login" />);

    expect(
      screen.getByRole("button", { name: "login.signInWithGoogle" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "login.signInWithGithub" }),
    ).toBeInTheDocument();
  });

  it("renders sign-up labels in register mode", () => {
    render(<SocialLoginButtons mode="register" />);

    expect(
      screen.getByRole("button", { name: "register.signUpWithGoogle" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "register.signUpWithGithub" }),
    ).toBeInTheDocument();
  });

  // ── OAuth flow start ──────────────────────────────────────────

  it("starts the Google OAuth flow with the correct callback URLs", async () => {
    const user = userEvent.setup();
    render(<SocialLoginButtons mode="login" />);

    await user.click(
      screen.getByRole("button", { name: "login.signInWithGoogle" }),
    );

    await waitFor(() => {
      expect(mockSocialSignIn).toHaveBeenCalledTimes(1);
    });
    expect(mockSocialSignIn).toHaveBeenCalledWith({
      provider: "google",
      callbackURL: `${window.location.origin}/dashboard`,
      errorCallbackURL: `${window.location.origin}/login`,
    });
  });

  it("starts the GitHub OAuth flow with the correct callback URLs", async () => {
    const user = userEvent.setup();
    render(<SocialLoginButtons mode="register" />);

    await user.click(
      screen.getByRole("button", { name: "register.signUpWithGithub" }),
    );

    await waitFor(() => {
      expect(mockSocialSignIn).toHaveBeenCalledTimes(1);
    });
    expect(mockSocialSignIn).toHaveBeenCalledWith({
      provider: "github",
      callbackURL: `${window.location.origin}/dashboard`,
      errorCallbackURL: `${window.location.origin}/login`,
    });
  });

  // ── Pending state ─────────────────────────────────────────────

  it("disables both buttons while an OAuth flow is pending", async () => {
    // Never resolves — the browser would navigate away on success
    mockSocialSignIn.mockImplementation(() => new Promise(() => {}));

    const user = userEvent.setup();
    render(<SocialLoginButtons mode="login" />);

    const googleButton = screen.getByRole("button", {
      name: "login.signInWithGoogle",
    });
    const githubButton = screen.getByRole("button", {
      name: "login.signInWithGithub",
    });

    await user.click(googleButton);

    await waitFor(() => {
      expect(googleButton).toBeDisabled();
    });
    expect(githubButton).toBeDisabled();

    // Only one flow was started
    expect(mockSocialSignIn).toHaveBeenCalledTimes(1);
  });

  // ── Error handling ────────────────────────────────────────────

  it("shows the server error and re-enables buttons when the result contains an error", async () => {
    mockSocialSignIn.mockResolvedValue({
      data: null,
      error: { message: "OAuth provider unavailable" },
    });

    const user = userEvent.setup();
    render(<SocialLoginButtons mode="login" />);

    await user.click(
      screen.getByRole("button", { name: "login.signInWithGoogle" }),
    );

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "OAuth provider unavailable",
      );
    });
    expect(
      screen.getByRole("button", { name: "login.signInWithGoogle" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "login.signInWithGithub" }),
    ).toBeEnabled();
  });

  it("shows the generic error and re-enables buttons when the call throws", async () => {
    mockSocialSignIn.mockRejectedValue(new Error("network down"));

    const user = userEvent.setup();
    render(<SocialLoginButtons mode="login" />);

    await user.click(
      screen.getByRole("button", { name: "login.signInWithGithub" }),
    );

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "login.error.socialFailed",
      );
    });
    expect(
      screen.getByRole("button", { name: "login.signInWithGoogle" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "login.signInWithGithub" }),
    ).toBeEnabled();
  });

  it("clears a previous error when a new attempt starts", async () => {
    mockSocialSignIn.mockResolvedValueOnce({
      data: null,
      error: { message: "first failure" },
    });

    const user = userEvent.setup();
    render(<SocialLoginButtons mode="login" />);

    await user.click(
      screen.getByRole("button", { name: "login.signInWithGoogle" }),
    );
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("first failure");
    });

    // Second attempt succeeds ({ data, error: null } → redirect pending)
    await user.click(
      screen.getByRole("button", { name: "login.signInWithGoogle" }),
    );

    await waitFor(() => {
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });

  // ── Disabled prop ─────────────────────────────────────────────

  it("respects the disabled prop and does not start a flow", async () => {
    const user = userEvent.setup();
    render(<SocialLoginButtons mode="login" disabled />);

    const googleButton = screen.getByRole("button", {
      name: "login.signInWithGoogle",
    });
    const githubButton = screen.getByRole("button", {
      name: "login.signInWithGithub",
    });

    expect(googleButton).toBeDisabled();
    expect(githubButton).toBeDisabled();

    await user.click(googleButton);
    expect(mockSocialSignIn).not.toHaveBeenCalled();
  });
});
