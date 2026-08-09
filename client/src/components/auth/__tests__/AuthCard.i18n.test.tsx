// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * AuthCard i18n Tests
 *
 * Verifies that AuthCard uses translation keys instead of hardcoded English strings.
 * The global react-i18next mock returns keys as-is when no translation is found,
 * so we assert on key presence (not hardcoded text).
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AuthCard } from "../AuthCard";

describe("AuthCard i18n", () => {
  it("renders social login buttons with i18n keys, not hardcoded English", () => {
    render(
      <AuthCard
        title="Test Title"
        showSocialLogin
        onGitHubLogin={() => {}}
        onGoogleLogin={() => {}}
      >
        <div>form content</div>
      </AuthCard>
    );

    // The mock t() returns keys when no translation map entry exists.
    // After the fix, buttons use t("login.signInWithGithub") etc.
    // The old hardcoded "Continue with GitHub" should NOT appear.
    const allText = document.body.textContent || "";
    expect(allText).not.toContain("Continue with GitHub");
    expect(allText).not.toContain("Continue with Google");
  });

  it("renders the 'or continue with' separator with i18n key", () => {
    render(
      <AuthCard
        title="Test Title"
        showSocialLogin
        onGitHubLogin={() => {}}
        onGoogleLogin={() => {}}
      >
        <div>form content</div>
      </AuthCard>
    );

    // The old hardcoded "Or continue with" should not be present as-is
    // The mock returns the key "login.orContinueWith" which is the expected output
    const separators = document.querySelectorAll(".text-muted-foreground");
    const separatorTexts = Array.from(separators).map((el) => el.textContent);
    // At least one separator should contain the i18n key (not hardcoded English)
    expect(separatorTexts.some((t) => t?.includes("login.orContinueWith"))).toBe(
      true
    );
  });

  it("renders title and description from props", () => {
    render(
      <AuthCard title="Sign In" description="Welcome back">
        <div>form</div>
      </AuthCard>
    );

    expect(screen.getByText("Sign In")).toBeInTheDocument();
    expect(screen.getByText("Welcome back")).toBeInTheDocument();
  });

  it("does not show social login when showSocialLogin is false", () => {
    render(
      <AuthCard title="Test" showSocialLogin={false}>
        <div>form</div>
      </AuthCard>
    );

    const allText = document.body.textContent || "";
    expect(allText).not.toContain("login.signInWithGithub");
    expect(allText).not.toContain("login.signInWithGoogle");
    expect(allText).not.toContain("login.orContinueWith");
  });
});
