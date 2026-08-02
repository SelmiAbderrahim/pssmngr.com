// Copyright (c) 2026 Password Manager contributors
/**
 * Register Route Unit Tests
 *
 * Tests the auth redirect behavior on the registration page.
 * Critical test: the redirect is suppressed during active registration
 * (when onRegistrationStart has been called), preventing the race condition
 * where better-auth's session update causes a premature redirect to /dashboard.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";

// --- Controllable auth state mock ---

let mockAuthState = {
  status: "unauthenticated" as "loading" | "authenticated" | "unauthenticated",
  isLoading: false,
  user: null as null | { _id: string; email: string },
  onboardingStep: null,
  isPendingOnboarding: false,
  shouldRedirectToOnboarding: false,
  shouldRedirectToDashboard: false,
  setPendingOnboarding: vi.fn(),
  refreshUser: vi.fn(),
  _mutationTimestamp: null,
  _setMutationTimestamp: vi.fn(),
};

vi.mock("@/providers/AuthProvider", () => ({
  useAuthState: () => mockAuthState,
}));

// --- Capture RegisterForm props ---

let capturedProps: Record<string, unknown> = {};

vi.mock("@/components/auth/RegisterForm", () => ({
  RegisterForm: (props: Record<string, unknown>) => {
    capturedProps = props;
    return <div data-testid="register-form">RegisterForm</div>;
  },
}));

// --- Capture navigate calls ---

const mockNavigate = vi.fn();

vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual("@tanstack/react-router");
  return {
    ...actual,
    createFileRoute: () => (opts: { validateSearch?: (s: Record<string, unknown>) => unknown }) => ({
      component: undefined,
      useSearch: () => (opts.validateSearch ? opts.validateSearch({}) : {}),
    }),
    Link: ({ to, children, ...props }: any) => {
      const React = require("react");
      return React.createElement("a", { href: to, ...props }, children);
    },
    useNavigate: () => mockNavigate,
  };
});

vi.mock("@/ui/logo", () => ({
  Logo: () => <span data-testid="logo">Logo</span>,
}));

vi.mock("@/ui/language-switcher", () => ({
  LanguageSwitcher: () => <span data-testid="lang-switcher">LanguageSwitcher</span>,
}));

// --- Import the component under test AFTER mocks ---

// We need to import the actual Register function directly since createFileRoute is mocked.
// The module exports the Route object, but we need to test the component function.
// We'll import the module and extract the component from it.

let Register: React.FC;

beforeEach(async () => {
  vi.clearAllMocks();
  capturedProps = {};
  mockAuthState = {
    status: "unauthenticated",
    isLoading: false,
    user: null,
    onboardingStep: null,
    isPendingOnboarding: false,
    shouldRedirectToOnboarding: false,
    shouldRedirectToDashboard: false,
    setPendingOnboarding: vi.fn(),
    refreshUser: vi.fn(),
    _mutationTimestamp: null,
    _setMutationTimestamp: vi.fn(),
  };

  // Dynamic import to get the module after mocks are set up.
  // createFileRoute is mocked, so we need to extract the Register function.
  // The module calls createFileRoute("/_app/register")({ component: Register })
  // but our mock returns () => ({ component: undefined }).
  // We need a different approach: mock createFileRoute to capture the component.
  vi.doMock("@tanstack/react-router", async () => {
    const actual = await vi.importActual("@tanstack/react-router");
    return {
      ...actual,
      createFileRoute: () => (opts: {
        component: React.FC;
        validateSearch?: (s: Record<string, unknown>) => unknown;
      }) => {
        Register = opts.component;
        return {
          component: opts.component,
          useSearch: () => (opts.validateSearch ? opts.validateSearch({}) : {}),
        };
      },
      Link: ({ to, children, ...props }: any) => {
        const React = require("react");
        return React.createElement("a", { href: to, ...props }, children);
      },
      useNavigate: () => mockNavigate,
    };
  });

  // Force re-import to capture the component
  const mod = await import("../../routes/_app/register");
  // The Register function should be captured by our mock
});

// --- Tests ---

describe("Register Route", () => {
  it("renders RegisterForm when unauthenticated", async () => {
    render(<Register />);

    expect(screen.getByTestId("register-form")).toBeInTheDocument();
  });

  it("redirects to /dashboard when already authenticated and not registering", async () => {
    mockAuthState = {
      ...mockAuthState,
      status: "authenticated",
      isLoading: false,
      user: { _id: "u1", email: "test@example.com" },
      shouldRedirectToDashboard: true,
    };

    render(<Register />);

    expect(mockNavigate).toHaveBeenCalledWith({ to: "/dashboard" });
  });

  it("shows loading spinner while auth is loading", async () => {
    mockAuthState = {
      ...mockAuthState,
      status: "loading",
      isLoading: true,
    };

    render(<Register />);

    // Should show a spinner, not the form
    expect(screen.queryByTestId("register-form")).not.toBeInTheDocument();
  });

  it("does NOT redirect when onRegistrationStart was called before status becomes authenticated", async () => {
    // Start unauthenticated
    const { rerender } = render(<Register />);

    expect(mockNavigate).not.toHaveBeenCalled();
    expect(screen.getByTestId("register-form")).toBeInTheDocument();

    // Simulate registration starting (RegisterForm calls onRegistrationStart)
    act(() => {
      const onRegistrationStart = capturedProps.onRegistrationStart as (() => void) | undefined;
      onRegistrationStart?.();
    });

    // Now simulate auth status changing to authenticated (better-auth session update)
    mockAuthState = {
      ...mockAuthState,
      status: "authenticated",
      isLoading: false,
      user: { _id: "u1", email: "test@example.com" },
      shouldRedirectToDashboard: true,
    };

    // Re-render the SAME instance (rerender, not render) to preserve the ref
    await act(async () => {
      rerender(<Register />);
    });

    // The redirect should NOT have been called because isRegistering ref is true
    expect(mockNavigate).not.toHaveBeenCalledWith({ to: "/dashboard" });
  });

  it("passes onRegistrationStart prop to RegisterForm", async () => {
    render(<Register />);

    expect(capturedProps).toHaveProperty("onRegistrationStart");
    expect(typeof capturedProps.onRegistrationStart).toBe("function");
  });

  it("passes onSuccess prop to RegisterForm", async () => {
    render(<Register />);

    expect(capturedProps).toHaveProperty("onSuccess");
    expect(typeof capturedProps.onSuccess).toBe("function");
  });

  it("does NOT unmount RegisterForm when auth isLoading flickers during active registration", async () => {
    // Start unauthenticated — RegisterForm renders
    const { rerender } = render(<Register />);
    expect(screen.getByTestId("register-form")).toBeInTheDocument();

    // Simulate registration starting (RegisterForm calls onRegistrationStart)
    act(() => {
      const onRegistrationStart = capturedProps.onRegistrationStart as (() => void) | undefined;
      onRegistrationStart?.();
    });

    // Now simulate auth isLoading flickering to true (better-auth session refetch)
    await act(async () => {
      mockAuthState = {
        ...mockAuthState,
        status: "loading",
        isLoading: true,
      };
    });

    rerender(<Register />);

    // RegisterForm must STILL be visible — NOT replaced by loading spinner
    expect(screen.getByTestId("register-form")).toBeInTheDocument();
  });

  it("still shows loading spinner when isLoading is true and NOT registering", async () => {
    // Auth is loading before any registration attempt
    mockAuthState = {
      ...mockAuthState,
      status: "loading",
      isLoading: true,
    };

    render(<Register />);

    // Should show spinner, not the form (no registration in progress)
    expect(screen.queryByTestId("register-form")).not.toBeInTheDocument();
  });
});
