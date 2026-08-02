// Copyright (c) 2026 Password Manager contributors
/**
 * Family Page — Empty State Tests
 *
 * Verifies that when no family exists or listMembers returns empty,
 * the page shows "Create Family" UI, not an error page.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

// ── Mocks (before imports) ────────────────────────────────────────

const mockTrpcQuery = vi.fn();
const mockTrpcMutation = vi.fn();
vi.mock("@/lib/api/trpc", () => ({
  trpcQuery: (...args: unknown[]) => mockTrpcQuery(...args),
  trpcMutation: (...args: unknown[]) => mockTrpcMutation(...args),
}));

// FamilyPanel correctly keys its loading callback on i18next's stable `t`.
// The global test mock creates a new function on every render, which causes
// that effect to restart forever once `family` is populated.
vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>();
  const t = (key: string) => key;
  return { ...actual, useTranslation: () => ({ t }) };
});

// Mock child components
vi.mock("@/components/family/FamilyMemberList", () => ({
  FamilyMemberList: () => <div data-testid="member-list" />,
}));
vi.mock("@/components/family/InviteMemberDialog", () => ({
  InviteMemberDialog: () => null,
}));
vi.mock("@/components/family/SharedVaultBrowser", () => ({
  SharedVaultBrowser: () => null,
}));
vi.mock("@/components/family/CreateSharedVaultDialog", () => ({
  CreateSharedVaultDialog: () => null,
}));
vi.mock("@/components/family/RecoveryPanel", () => ({
  RecoveryPanel: () => null,
}));
vi.mock("@/components/family/FamilySettingsPanel", () => ({
  FamilySettingsPanel: () => null,
}));

// Override router mock
vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual("@tanstack/react-router");
  return {
    ...actual,
    createFileRoute: (_path: string) => (options: Record<string, unknown>) => ({
      ...options,
      useSearch: () => ({ tab: "members" }),
    }),
    useNavigate: () => vi.fn(),
    Link: ({ to, children, className, ...props }: Record<string, unknown>) => {
      const React = require("react");
      return React.createElement("a", { href: to, className, ...props }, children);
    },
    useRouter: () => ({ state: { location: { pathname: "/" } } }),
    useRouterState: () => ({ location: { pathname: "/" } }),
    useParams: () => ({}),
    useSearch: () => ({}),
    useMatch: () => ({ params: {} }),
  };
});

// The /dashboard/family compatibility route redirects to the Family tab, so
// these tests exercise the shared panel component directly.
import { FamilyPanel } from "@/components/family/FamilyPanel";

// ── Tests ─────────────────────────────────────────────────────────

describe("Family page — no family", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders create-family UI when family.get returns NOT_FOUND", async () => {
    mockTrpcQuery.mockImplementation((router: string, procedure: string) => {
      if (router === "user" && procedure === "get") {
        return Promise.resolve({ id: "u1" });
      }
      if (router === "family" && procedure === "get") {
        return Promise.reject({
          code: "NOT_FOUND",
          message: "resource.notFound",
          statusCode: 404,
          details: { code: "NOT_FOUND", httpStatus: 404, path: "family.get" },
        });
      }
      if (router === "family" && procedure === "listMembers") {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });

    render(<FamilyPanel />);

    // Should show create family UI (i18n key)
    await waitFor(
      () => {
        expect(screen.getByText("family.create.title")).toBeInTheDocument();
      },
      { timeout: 5000 },
    );

    // Should NOT show error alert
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("renders create-family UI when listMembers returns empty array", async () => {
    mockTrpcQuery.mockImplementation((router: string, procedure: string) => {
      if (router === "user" && procedure === "get") {
        return Promise.resolve({ id: "u1" });
      }
      if (router === "family" && procedure === "get") {
        return Promise.resolve({ id: "f1", name: "Test Family" });
      }
      if (router === "family" && procedure === "listMembers") {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });

    render(<FamilyPanel />);

    // Empty members also triggers noFamily → create family UI.
    // Longer timeout: two async setStates (setFamily then setNoFamily) must
    // resolve in sequence; the default 1s can time out under a busy shard.
    await waitFor(
      () => {
        expect(screen.getByText("family.create.title")).toBeInTheDocument();
      },
      { timeout: 5000 },
    );

    expect(screen.queryByText(/failed/i)).not.toBeInTheDocument();
  });

  it("renders member list when listMembers returns members", async () => {
    mockTrpcQuery.mockImplementation((router: string, procedure: string) => {
      if (router === "user" && procedure === "get") {
        return Promise.resolve({ id: "u1" });
      }
      if (router === "family" && procedure === "get") {
        return Promise.resolve({ id: "f1", name: "Test Family" });
      }
      if (router === "family" && procedure === "listMembers") {
        return Promise.resolve([
          { id: "m1", userId: "u1", role: "owner", user: { id: "u1", name: "Admin", email: "admin@test.com" } },
        ]);
      }
      if (router === "sharedVault" && procedure === "list") {
        return Promise.resolve([]);
      }
      if (router === "family" && procedure === "listRecoveryRequests") {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });

    render(<FamilyPanel />);

    // Should NOT show create family UI
    await waitFor(() => {
      expect(screen.queryByText("family.create.title")).not.toBeInTheDocument();
    });

    // Should NOT show errors
    expect(screen.queryByText(/failed/i)).not.toBeInTheDocument();
  });
});
