// Copyright (c) 2026 Password Manager contributors
/**
 * Watchtower Page — Empty State Tests
 *
 * Verifies that when credentials.list returns empty items,
 * the watchtower shows all-clear state (score 100, no findings),
 * not an error page.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

// ── Mocks (before imports) ────────────────────────────────────────

const mockTrpcQuery = vi.fn();
vi.mock("@/lib/api/trpc", () => ({
  trpcQuery: (...args: unknown[]) => mockTrpcQuery(...args),
  trpcMutation: vi.fn(),
}));

vi.mock("@/hooks/useVaultCrypto", () => ({
  useVaultCrypto: () => ({
    isUnlocked: true,
  }),
}));

vi.mock("@/services/vault-crypto", () => ({
  vaultCrypto: {
    decryptItem: vi.fn(),
    decryptServerItem: vi.fn(),
  },
}));

vi.mock("@/services/watchtower-analyzer", () => ({
  analyzeVault: vi.fn(),
}));

vi.mock("@/services/hibp-client", () => ({
  checkPasswordsBatch: vi.fn(),
}));

vi.mock("@/services/watchtower-scan", () => ({
  watchtowerScan: {
    subscribe: vi.fn(() => vi.fn()),
    getState: vi.fn(() => null),
    isScanning: vi.fn(() => false),
    startBackgroundScan: vi.fn(),
    stopBackgroundScan: vi.fn(),
  },
}));

vi.mock("@/components/vault/MasterPasswordPrompt", () => ({
  MasterPasswordPrompt: () => null,
}));

// Override router mock to capture route component
vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual("@tanstack/react-router");
  return {
    ...actual,
    createFileRoute: (_path: string) => (options: Record<string, unknown>) => ({
      ...options,
      useSearch: () => ({ tab: "weak" }),
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

// Import after mocks
import { Route } from "../_app/_auth/dashboard/watchtower";

// ── Tests ─────────────────────────────────────────────────────────

describe("Watchtower page — empty state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders all-clear state when no credentials exist", async () => {
    mockTrpcQuery.mockImplementation((router: string, procedure: string) => {
      if (router === "vault" && procedure === "list") {
        return Promise.resolve([{ id: "v1", name: "Vault", kdfSalt: "salt", encryptedVerificationBlob: null }]);
      }
      if (router === "credentials" && procedure === "list") {
        return Promise.resolve({ items: [], nextCursor: undefined });
      }
      return Promise.resolve([]);
    });

    const WatchtowerPage = (Route as Record<string, unknown>).component as React.ComponentType;
    render(<WatchtowerPage />);

    // With empty items, analysis sets score=100 and all counts=0
    // Each tab shows its "no X found" empty state
    // The global i18n mock returns unresolved Watchtower keys.
    await waitFor(() => {
      expect(screen.getByText("watchtower.noWeak")).toBeInTheDocument();
    });

    // Should NOT show error messages
    expect(screen.queryByText(/failed/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/error/i)).not.toBeInTheDocument();
  });

  it("renders all-clear when credentials.list returns 404 treated as empty", async () => {
    mockTrpcQuery.mockImplementation((router: string, procedure: string) => {
      if (router === "vault" && procedure === "list") {
        return Promise.resolve([{ id: "v1", name: "Vault", kdfSalt: "salt", encryptedVerificationBlob: null }]);
      }
      if (router === "credentials" && procedure === "list") {
        return Promise.reject(new Error("NOT_FOUND"));
      }
      return Promise.resolve([]);
    });

    const WatchtowerPage = (Route as Record<string, unknown>).component as React.ComponentType;
    render(<WatchtowerPage />);

    // 404 is treated as empty analysis, not error
    await waitFor(() => {
      expect(screen.getByText("watchtower.noWeak")).toBeInTheDocument();
    });

    expect(screen.queryByText(/failed/i)).not.toBeInTheDocument();
  });

  it("uses credentials.list not vault.listItems", async () => {
    mockTrpcQuery.mockImplementation((router: string, procedure: string) => {
      if (router === "vault" && procedure === "list") {
        return Promise.resolve([{ id: "v1", name: "Vault", kdfSalt: "salt", encryptedVerificationBlob: null }]);
      }
      if (router === "credentials" && procedure === "list") {
        return Promise.resolve({ items: [], nextCursor: undefined });
      }
      return Promise.resolve([]);
    });

    const WatchtowerPage = (Route as Record<string, unknown>).component as React.ComponentType;
    render(<WatchtowerPage />);

    await waitFor(() => {
      expect(mockTrpcQuery).toHaveBeenCalledWith("credentials", "list", expect.anything());
    });

    // Should NOT call the old vault.listItems endpoint
    expect(mockTrpcQuery).not.toHaveBeenCalledWith("vault", "listItems", expect.anything());
  });
});
