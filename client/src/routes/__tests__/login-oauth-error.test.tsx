// Copyright (c) 2026 Password Manager contributors
/**
 * Login Route — OAuth error banner tests
 *
 * A failed social sign-in redirects back to /login?error=<code>
 * (better-auth errorCallbackURL). The route must show a destructive
 * alert when the param is present and nothing otherwise.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// Controls what the (mocked) router passes to validateSearch
let mockRawSearch: Record<string, unknown> = {};

const mockAuthState = {
  status: "unauthenticated" as const,
  isLoading: false,
};

vi.mock("@/providers/AuthProvider", () => ({
  useAuthState: () => mockAuthState,
}));

vi.mock("@/lib/auth/auth-client", () => ({
  getSession: () => Promise.resolve({ data: null }),
}));

vi.mock("@/components/auth/LoginForm", () => ({
  LoginForm: () => <div data-testid="login-form">LoginForm</div>,
}));

let Login: React.FC;

vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual("@tanstack/react-router");
  return {
    ...actual,
    createFileRoute:
      () =>
      (opts: {
        component: React.FC;
        validateSearch?: (s: Record<string, unknown>) => unknown;
      }) => {
        Login = opts.component;
        return {
          component: opts.component,
          useSearch: () =>
            opts.validateSearch ? opts.validateSearch(mockRawSearch) : {},
        };
      },
    Link: ({ to, children, ...props }: any) => {
      const React = require("react");
      return React.createElement("a", { href: to, ...props }, children);
    },
    useNavigate: () => vi.fn(),
  };
});

beforeEach(async () => {
  vi.clearAllMocks();
  mockRawSearch = {};
  await import("../_app/login/_layout.index");
});

describe("Login Route — OAuth error banner", () => {
  it("shows the social sign-in error alert when ?error= is present", () => {
    mockRawSearch = { error: "access_denied" };

    render(<Login />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "login.error.socialFailed",
    );
    expect(screen.getByTestId("login-form")).toBeInTheDocument();
  });

  it("shows no alert without the error param", () => {
    render(<Login />);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByTestId("login-form")).toBeInTheDocument();
  });

  it("ignores a non-string error param", () => {
    mockRawSearch = { error: ["weird"] };

    render(<Login />);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
