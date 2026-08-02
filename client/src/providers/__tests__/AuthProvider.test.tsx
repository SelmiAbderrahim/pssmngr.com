// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * AuthProvider Unit Tests
 *
 * Tests for centralized auth state management, session mapping,
 * session mapping and context hook behavior.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import React from "react";
import { AuthProvider, useAuthState } from "../AuthProvider";

// --- Mocks ---

const mockRefetch = vi.fn();

let mockSessionReturn: {
  data: unknown;
  isPending: boolean;
  error: Error | null;
  refetch: typeof mockRefetch;
};

vi.mock("@/lib/auth", () => ({
  useSession: () => mockSessionReturn,
}));

// --- Helpers ---

function TestConsumer() {
  const state = useAuthState();
  return (
    <div>
      <span data-testid="status">{state.status}</span>
      <span data-testid="is-loading">{state.isLoading.toString()}</span>
      <span data-testid="user-email">{state.user?.email ?? "none"}</span>
      <span data-testid="user-id">{state.user?._id ?? "none"}</span>
      <span data-testid="user-name">{state.user?.name ?? "none"}</span>
      <span data-testid="user-username">{state.user?.username ?? "none"}</span>
      <span data-testid="user-avatar">{state.user?.avatarUrl ?? "none"}</span>
      <span data-testid="user-auth-provider">
        {state.user?.authProvider ?? "none"}
      </span>
      <span data-testid="onboarding-step">
        {state.onboardingStep ?? "null"}
      </span>
      <span data-testid="pending-onboarding">
        {state.isPendingOnboarding.toString()}
      </span>
      <span data-testid="should-redirect-dashboard">
        {state.shouldRedirectToDashboard.toString()}
      </span>
      <span data-testid="should-redirect-onboarding">
        {state.shouldRedirectToOnboarding.toString()}
      </span>
      <button data-testid="refresh" onClick={state.refreshUser}>
        Refresh
      </button>
      <button
        data-testid="set-pending"
        onClick={() => state.setPendingOnboarding(true)}
      >
        Set Pending
      </button>
    </div>
  );
}

const mockUser = {
  id: "user-123",
  email: "test@example.com",
  name: "Test User",
  image: "https://example.com/avatar.png",
  emailVerified: true,
  createdAt: "2025-01-01T00:00:00Z",
  role: "admin",
};

function renderWithProvider() {
  return render(
    <AuthProvider>
      <TestConsumer />
    </AuthProvider>
  );
}

// --- Tests ---

describe("AuthProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSessionReturn = {
      data: null,
      isPending: false,
      error: null,
      refetch: mockRefetch,
    };
  });

  it("should render children", () => {
    render(
      <AuthProvider>
        <span data-testid="child">Hello</span>
      </AuthProvider>
    );
    expect(screen.getByTestId("child")).toHaveTextContent("Hello");
  });

  it("should provide auth context to children", () => {
    renderWithProvider();
    expect(screen.getByTestId("status")).toBeInTheDocument();
    expect(screen.getByTestId("is-loading")).toBeInTheDocument();
  });

  describe("useAuthState", () => {
    it("should return loading state when session is pending", () => {
      mockSessionReturn = {
        data: null,
        isPending: true,
        error: null,
        refetch: mockRefetch,
      };

      renderWithProvider();

      expect(screen.getByTestId("status")).toHaveTextContent("loading");
      expect(screen.getByTestId("is-loading")).toHaveTextContent("true");
      expect(screen.getByTestId("user-email")).toHaveTextContent("none");
    });

    it("should return authenticated user when session exists", () => {
      mockSessionReturn = {
        data: { user: mockUser },
        isPending: false,
        error: null,
        refetch: mockRefetch,
      };

      renderWithProvider();

      expect(screen.getByTestId("status")).toHaveTextContent("authenticated");
      expect(screen.getByTestId("is-loading")).toHaveTextContent("false");
      expect(screen.getByTestId("user-email")).toHaveTextContent(
        "test@example.com"
      );
    });

    it("should return unauthenticated state when no session", () => {
      mockSessionReturn = {
        data: null,
        isPending: false,
        error: null,
        refetch: mockRefetch,
      };

      renderWithProvider();

      expect(screen.getByTestId("status")).toHaveTextContent("unauthenticated");
      expect(screen.getByTestId("user-email")).toHaveTextContent("none");
    });

    it("should return unauthenticated when session has no user", () => {
      mockSessionReturn = {
        data: { user: null },
        isPending: false,
        error: null,
        refetch: mockRefetch,
      };

      renderWithProvider();

      expect(screen.getByTestId("status")).toHaveTextContent("unauthenticated");
    });

    it("should return user object with id, email, name, username, avatar", () => {
      mockSessionReturn = {
        data: { user: mockUser },
        isPending: false,
        error: null,
        refetch: mockRefetch,
      };

      renderWithProvider();

      expect(screen.getByTestId("user-id")).toHaveTextContent("user-123");
      expect(screen.getByTestId("user-email")).toHaveTextContent(
        "test@example.com"
      );
      expect(screen.getByTestId("user-name")).toHaveTextContent("Test User");
      expect(screen.getByTestId("user-username")).toHaveTextContent(
        "Test User"
      );
      expect(screen.getByTestId("user-avatar")).toHaveTextContent(
        "https://example.com/avatar.png"
      );
      expect(screen.getByTestId("user-auth-provider")).toHaveTextContent(
        "password"
      );
    });

    it("should handle user without optional fields", () => {
      mockSessionReturn = {
        data: {
          user: {
            id: "user-456",
            email: "minimal@example.com",
            name: null,
            image: null,
            emailVerified: false,
            createdAt: null,
          },
        },
        isPending: false,
        error: null,
        refetch: mockRefetch,
      };

      renderWithProvider();

      expect(screen.getByTestId("user-id")).toHaveTextContent("user-456");
      expect(screen.getByTestId("user-email")).toHaveTextContent(
        "minimal@example.com"
      );
      expect(screen.getByTestId("user-name")).toHaveTextContent("none");
      expect(screen.getByTestId("user-username")).toHaveTextContent("none");
      expect(screen.getByTestId("user-avatar")).toHaveTextContent("none");
    });

    it("should handle session error state as unauthenticated", () => {
      mockSessionReturn = {
        data: null,
        isPending: false,
        error: new Error("Session expired"),
        refetch: mockRefetch,
      };

      renderWithProvider();

      expect(screen.getByTestId("status")).toHaveTextContent("unauthenticated");
      expect(screen.getByTestId("user-email")).toHaveTextContent("none");
    });
  });

  describe("session management", () => {
    it("should provide refetch function for session refresh", async () => {
      renderWithProvider();

      await act(async () => {
        screen.getByTestId("refresh").click();
      });

      expect(mockRefetch).toHaveBeenCalledTimes(1);
    });

    it("should provide isAuthenticated-equivalent via shouldRedirectToDashboard", () => {
      mockSessionReturn = {
        data: { user: mockUser },
        isPending: false,
        error: null,
        refetch: mockRefetch,
      };

      renderWithProvider();

      expect(
        screen.getByTestId("should-redirect-dashboard")
      ).toHaveTextContent("true");
    });

    it("should not redirect to dashboard when unauthenticated", () => {
      mockSessionReturn = {
        data: null,
        isPending: false,
        error: null,
        refetch: mockRefetch,
      };

      renderWithProvider();

      expect(
        screen.getByTestId("should-redirect-dashboard")
      ).toHaveTextContent("false");
    });

    it("should provide isPending boolean", () => {
      mockSessionReturn = {
        data: null,
        isPending: true,
        error: null,
        refetch: mockRefetch,
      };

      renderWithProvider();

      expect(screen.getByTestId("is-loading")).toHaveTextContent("true");
    });
  });

  describe("onboarding state", () => {
    it("should default onboardingStep to null", () => {
      renderWithProvider();
      expect(screen.getByTestId("onboarding-step")).toHaveTextContent("null");
    });

    it("should default isPendingOnboarding to false", () => {
      renderWithProvider();
      expect(screen.getByTestId("pending-onboarding")).toHaveTextContent(
        "false"
      );
    });

    it("should default shouldRedirectToOnboarding to false", () => {
      renderWithProvider();
      expect(
        screen.getByTestId("should-redirect-onboarding")
      ).toHaveTextContent("false");
    });

    it("should allow setting pending onboarding state", async () => {
      renderWithProvider();

      await act(async () => {
        screen.getByTestId("set-pending").click();
      });

      expect(screen.getByTestId("pending-onboarding")).toHaveTextContent(
        "true"
      );
    });
  });

  it("should throw when useAuthState is used outside provider", () => {
    const consoleSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    expect(() => {
      render(<TestConsumer />);
    }).toThrow("useAuthState must be used within AuthProvider");

    consoleSpy.mockRestore();
  });
});
