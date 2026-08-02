// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * UserAuthGuard i18n Tests
 *
 * Verifies that UserAuthGuard uses translation keys instead of hardcoded English.
 * Tests the loading and unauthenticated states which previously had hardcoded text.
 */

import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

// Mock the AuthProvider to control auth state
vi.mock("@/providers/AuthProvider", () => ({
  useAuthState: vi.fn(),
}));

import { useAuthState } from "@/providers/AuthProvider";
import { UserAuthGuard } from "../UserAuthGuard";

const mockUseAuthState = vi.mocked(useAuthState);

describe("UserAuthGuard i18n", () => {
  it("renders loading state with i18n key, not hardcoded English", () => {
    mockUseAuthState.mockReturnValue({
      user: null,
      isLoading: true,
      status: "loading",
    } as any);

    const { container } = render(
      <UserAuthGuard>
        <div>Protected Content</div>
      </UserAuthGuard>
    );

    const allText = container.textContent || "";
    // The old hardcoded "Verifying your access..." should NOT appear
    expect(allText).not.toContain("Verifying your access...");
    // Instead, the i18n key should be rendered (mock returns key as-is)
    expect(allText).toContain("guard.verifying");
  });

  it("renders unauthenticated state with i18n keys, not hardcoded English", () => {
    mockUseAuthState.mockReturnValue({
      user: null,
      isLoading: false,
      status: "unauthenticated",
    } as any);

    const { container } = render(
      <UserAuthGuard>
        <div>Protected Content</div>
      </UserAuthGuard>
    );

    const allText = container.textContent || "";
    // Old hardcoded strings should NOT appear
    expect(allText).not.toContain("Authentication Required");
    expect(allText).not.toContain("Please log in to access this page");
    expect(allText).not.toContain("Log In Now");

    // i18n keys should be rendered instead
    expect(allText).toContain("guard.authRequired");
    expect(allText).toContain("guard.loginPrompt");
    expect(allText).toContain("guard.loginButton");
  });

  it("renders children when authenticated", () => {
    mockUseAuthState.mockReturnValue({
      user: { id: "1", email: "test@test.com" },
      isLoading: false,
      status: "authenticated",
    } as any);

    const { container } = render(
      <UserAuthGuard>
        <div>Protected Content</div>
      </UserAuthGuard>
    );

    expect(container.textContent).toContain("Protected Content");
  });
});
