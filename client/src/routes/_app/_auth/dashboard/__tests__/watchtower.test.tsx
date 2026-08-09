// Copyright (c) 2026 Password Manager contributors
/**
 * Watchtower Dashboard — Comprehensive Component Tests
 *
 * Verifies:
 *  - Security score rendering
 *  - All four tabs: Weak | Reused | Old | Breached
 *  - Finding rows with severity and details
 *  - Opt-in breach checking flow
 *  - Locked/loading/error states
 *  - Tab navigation with URL sync
 *  - Empty states per tab
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

// ── Mocks (before imports) ───��──────────────────────────────────────

const mockTrpcQuery = vi.fn();
const mockTrpcMutation = vi.fn();
vi.mock("@/lib/api/trpc", () => ({
  trpcQuery: (...args: unknown[]) => mockTrpcQuery(...args),
  trpcMutation: (...args: unknown[]) => mockTrpcMutation(...args),
}));

let mockIsUnlocked = true;
vi.mock("@/hooks/useVaultCrypto", () => ({
  useVaultCrypto: () => ({ isUnlocked: mockIsUnlocked }),
}));

const mockDecryptItem = vi.fn();
vi.mock("@/services/vault-crypto", () => ({
  vaultCrypto: {
    decryptItem: (...args: unknown[]) => mockDecryptItem(...args),
    isUnlocked: () => true,
  },
}));

const mockAnalyzeVault = vi.fn();
vi.mock("@/services/watchtower-analyzer", () => ({
  analyzeVault: (...args: unknown[]) => mockAnalyzeVault(...args),
}));

const mockCheckPasswordsBatch = vi.fn();
vi.mock("@/services/hibp-client", () => ({
  checkPasswordsBatch: (...args: unknown[]) =>
    mockCheckPasswordsBatch(...args),
}));

const mockGetState = vi.fn(() => null);
vi.mock("@/services/watchtower-scan", () => ({
  watchtowerScan: {
    subscribe: vi.fn(() => vi.fn()),
    getState: () => mockGetState(),
    isScanning: vi.fn(() => false),
    startBackgroundScan: vi.fn(),
    stopBackgroundScan: vi.fn(),
  },
}));

vi.mock("@/components/vault/MasterPasswordPrompt", () => ({
  MasterPasswordPrompt: () => null,
}));

let mockSearchTab = "weak";
const mockNavigate = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: (_path: string) => (options: Record<string, unknown>) => ({
    ...options,
    useSearch: () => ({ tab: mockSearchTab }),
  }),
  useNavigate: () => mockNavigate,
  Link: ({
    to,
    children,
    className,
    ...rest
  }: {
    to: string;
    children: React.ReactNode;
    className?: string;
    [key: string]: unknown;
  }) =>
    React.createElement("a", { href: to, className, ...rest }, children),
  useRouter: () => ({ state: { location: { pathname: "/" } } }),
  useRouterState: () => ({ location: { pathname: "/" } }),
}));

// Import after mocks
import { Route } from "../watchtower";

const WatchtowerPage = (
  Route as unknown as { component: React.ComponentType }
).component;

// ── Helpers ��─────────────────────────────────────────────────────────

function makeVaultItem(
  id: string,
  password: string,
  overrides: Partial<{
    title: string;
    username: string;
    updatedAt: string;
  }> = {},
) {
  const now = new Date().toISOString();
  return {
    id,
    itemType: "login" as const,
    isFavorite: false,
    createdAt: now,
    updatedAt: overrides.updatedAt ?? now,
    decrypted: {
      title: overrides.title ?? `Item ${id}`,
      username: overrides.username ?? "user@example.com",
      password,
    },
  };
}

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

const VAULT_RECORD = {
  id: "v1",
  name: "Vault",
  kdfSalt: "salt",
  encryptedVerificationBlob: null,
};

/** Setup mocks for a successful analysis with findings. */
function setupAnalysisMocks(analysis: {
  weak: ReturnType<typeof makeVaultItem>[];
  reused: ReturnType<typeof makeVaultItem>[][];
  old: ReturnType<typeof makeVaultItem>[];
  total: number;
  score: number;
  missing2fa?: ReturnType<typeof makeVaultItem>[];
  breakdown?: {
    score: number;
    categories: Array<{
      category: string;
      count: number;
      considered: number;
      weight: number;
      penalty: number;
      severity: string;
    }>;
    total: number;
    totalPenalty: number;
  };
}) {
  // Provide sensible defaults so analyzer-shape consumers don't crash.
  if (!analysis.missing2fa) analysis.missing2fa = [];
  if (!analysis.breakdown) {
    analysis.breakdown = {
      score: analysis.score,
      categories: [],
      total: analysis.total,
      totalPenalty: 100 - analysis.score,
    };
  }
  mockTrpcQuery.mockImplementation((router: string, procedure: string) => {
    if (router === "vault" && procedure === "list") {
      return Promise.resolve([VAULT_RECORD]);
    }
    if (router === "credentials" && procedure === "list") {
      return Promise.resolve({
        items: Array.from({ length: analysis.total }, (_, i) => ({
          id: `item-${i}`,
          itemType: "login",
          isFavorite: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          encryptedData: "enc",
        })),
        nextCursor: undefined,
      });
    }
    return Promise.resolve([]);
  });

  mockDecryptItem.mockResolvedValue({
    title: "Test",
    password: "pw",
  });
  mockAnalyzeVault.mockResolvedValue(analysis);
}

// ── Tests ───────────────────────────────────────��────────────────────

describe("Watchtower Dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsUnlocked = true;
    mockSearchTab = "weak";
    mockGetState.mockReturnValue(null);
  });

  // ── Locked State ──────────────────────────────────────────────────

  describe("locked state", () => {
    it("renders unlock prompt when vault is locked", () => {
      mockIsUnlocked = false;
      mockTrpcQuery.mockResolvedValue([]);

      render(<WatchtowerPage />);

      expect(
        screen.getByText("watchtower.unlockRequired"),
      ).toBeInTheDocument();
      expect(screen.getByText("watchtower.unlock")).toBeInTheDocument();
    });

    it("shows page title even when locked", () => {
      mockIsUnlocked = false;
      mockTrpcQuery.mockResolvedValue([]);

      render(<WatchtowerPage />);

      // Header copy comes from common:pages.security.*.
      expect(screen.getByText("pages.security.title")).toBeInTheDocument();
      expect(
        screen.getByText("pages.security.description"),
      ).toBeInTheDocument();
    });
  });

  // ── Error State ─────────��─────────────────────────────────────────

  describe("error state", () => {
    it("renders error alert when analysis fails", async () => {
      mockTrpcQuery.mockImplementation(
        (router: string, procedure: string) => {
          if (router === "vault" && procedure === "list") {
            return Promise.resolve([VAULT_RECORD]);
          }
          if (router === "credentials" && procedure === "list") {
            return Promise.reject(new Error("Server exploded"));
          }
          return Promise.resolve([]);
        },
      );

      render(<WatchtowerPage />);

      await waitFor(() => {
        expect(screen.getByText("Server exploded")).toBeInTheDocument();
      });
    });

    it("renders retry button on error", async () => {
      mockTrpcQuery.mockImplementation(
        (router: string, procedure: string) => {
          if (router === "vault" && procedure === "list") {
            return Promise.resolve([VAULT_RECORD]);
          }
          if (router === "credentials" && procedure === "list") {
            return Promise.reject(new Error("fail"));
          }
          return Promise.resolve([]);
        },
      );

      render(<WatchtowerPage />);

      await waitFor(() => {
        expect(screen.getByText("watchtower.retry")).toBeInTheDocument();
      });
    });

    it("shows no-vault error when vault list is empty", async () => {
      mockTrpcQuery.mockImplementation(
        (router: string, procedure: string) => {
          if (router === "vault" && procedure === "list") {
            return Promise.resolve([]);
          }
          return Promise.resolve([]);
        },
      );

      render(<WatchtowerPage />);

      await waitFor(() => {
        expect(
          screen.getByText("watchtower.noVault"),
        ).toBeInTheDocument();
      });
    });
  });

  // ── Dashboard Rendering ────────��──────────────────────────────────

  describe("dashboard with findings", () => {
    const weakItem = makeVaultItem("w1", "weak", { title: "Weak Login" });
    const reusedA = makeVaultItem("r1", "Same!Pass42", { title: "Site A" });
    const reusedB = makeVaultItem("r2", "Same!Pass42", { title: "Site B" });
    const oldItem = makeVaultItem("o1", "xK9#mP2$vL7@nQ5", {
      title: "Old Login",
      updatedAt: daysAgo(120),
    });

    const analysisResult = {
      weak: [weakItem],
      reused: [[reusedA, reusedB]],
      old: [oldItem],
      total: 4,
      score: 55,
    };

    beforeEach(() => {
      setupAnalysisMocks(analysisResult);
    });

    it("renders security score", async () => {
      render(<WatchtowerPage />);

      await waitFor(() => {
        expect(screen.getByText("55")).toBeInTheDocument();
      });
      expect(screen.getByText("/ 100")).toBeInTheDocument();
    });

    it("renders score label based on score value", async () => {
      render(<WatchtowerPage />);

      await waitFor(() => {
        // score 55 → getScoreLabelKey returns "score.fair"
        // t("score.fair") has no fallback → returns key "score.fair"
        expect(screen.getByText("score.fair")).toBeInTheDocument();
      });
    });

    it("renders all four tab triggers", async () => {
      render(<WatchtowerPage />);

      await waitFor(() => {
        expect(screen.getByText("55")).toBeInTheDocument();
      });

      // Tab triggers appear as role="tab" — use role selector to avoid
      // collision with the summary cards that also contain these labels.
      const tabs = screen.getAllByRole("tab");
      const tabNames = tabs.map((t) => t.textContent);
      expect(tabNames.some((n) => n?.includes("watchtower.weak"))).toBe(true);
      expect(tabNames.some((n) => n?.includes("watchtower.reused"))).toBe(true);
      expect(tabNames.some((n) => n?.includes("watchtower.old"))).toBe(true);
      expect(tabNames.some((n) => n?.includes("watchtower.breached"))).toBe(true);
    });

    it("renders summary cards with category descriptions", async () => {
      render(<WatchtowerPage />);

      await waitFor(() => {
        expect(screen.getByText("55")).toBeInTheDocument();
      });

      expect(
        screen.getByText("watchtower.weakDesc"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("watchtower.reusedDesc"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("watchtower.oldDesc"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("watchtower.breachedDesc"),
      ).toBeInTheDocument();
    });

    it("renders rescan button", async () => {
      render(<WatchtowerPage />);

      await waitFor(() => {
        expect(screen.getByText("watchtower.rescan")).toBeInTheDocument();
      });
    });
  });

  // ── Weak Tab ──────────────────────────────────────────────────────

  describe("weak tab", () => {
    it("displays weak password findings", async () => {
      const weakItem = makeVaultItem("w1", "weak", { title: "Bad Login" });
      setupAnalysisMocks({
        weak: [weakItem],
        reused: [],
        old: [],
        total: 2,
        score: 85,
      });
      mockSearchTab = "weak";

      render(<WatchtowerPage />);

      await waitFor(() => {
        expect(screen.getByText("watchtower.weakPasswords")).toBeInTheDocument();
      });
      expect(
        screen.getByText("watchtower.weakDetail"),
      ).toBeInTheDocument();
    });

    it("shows empty state when no weak passwords", async () => {
      setupAnalysisMocks({
        weak: [],
        reused: [],
        old: [],
        total: 2,
        score: 100,
      });
      mockSearchTab = "weak";

      render(<WatchtowerPage />);

      await waitFor(() => {
        expect(
          screen.getByText("watchtower.noWeak"),
        ).toBeInTheDocument();
      });
    });
  });

  // ─��� Reused Tab ────────────��─────────────────────────���─────────────

  describe("reused tab", () => {
    it("displays reused password groups", async () => {
      const itemA = makeVaultItem("r1", "Same!Pass42", { title: "Site A" });
      const itemB = makeVaultItem("r2", "Same!Pass42", { title: "Site B" });
      setupAnalysisMocks({
        weak: [],
        reused: [[itemA, itemB]],
        old: [],
        total: 3,
        score: 70,
      });
      mockSearchTab = "reused";

      render(<WatchtowerPage />);

      await waitFor(() => {
        expect(screen.getByText("watchtower.reusedPasswords")).toBeInTheDocument();
      });
      // ReusedGroup renders FindingRow with the reusedDetail translation key
      const details = screen.getAllByText("watchtower.reusedDetail");
      expect(details.length).toBeGreaterThanOrEqual(1);
    });

    it("shows empty state when no reused passwords", async () => {
      setupAnalysisMocks({
        weak: [],
        reused: [],
        old: [],
        total: 2,
        score: 100,
      });
      mockSearchTab = "reused";

      render(<WatchtowerPage />);

      await waitFor(() => {
        expect(
          screen.getByText("watchtower.noReused"),
        ).toBeInTheDocument();
      });
    });
  });

  // ── Old Tab ──────��─────────────────────────────��──────────────────

  describe("old tab", () => {
    it("displays old password findings", async () => {
      const oldItem = makeVaultItem("o1", "xK9#mP2$vL7@nQ5", {
        title: "Old Site",
        updatedAt: daysAgo(120),
      });
      setupAnalysisMocks({
        weak: [],
        reused: [],
        old: [oldItem],
        total: 2,
        score: 85,
      });
      mockSearchTab = "old";

      render(<WatchtowerPage />);

      await waitFor(() => {
        expect(screen.getByText("watchtower.oldPasswords")).toBeInTheDocument();
      });
    });

    it("shows empty state when no old passwords", async () => {
      setupAnalysisMocks({
        weak: [],
        reused: [],
        old: [],
        total: 2,
        score: 100,
      });
      mockSearchTab = "old";

      render(<WatchtowerPage />);

      await waitFor(() => {
        expect(
          screen.getByText("watchtower.noOld"),
        ).toBeInTheDocument();
      });
    });
  });

  // ── Breached Tab ────────��─────────────────────────────────────────

  describe("breached tab", () => {
    it("shows opt-in prompt before breach check", async () => {
      setupAnalysisMocks({
        weak: [],
        reused: [],
        old: [],
        total: 2,
        score: 100,
      });
      mockSearchTab = "breached";

      render(<WatchtowerPage />);

      await waitFor(() => {
        expect(
          screen.getByText("watchtower.breachedPasswords"),
        ).toBeInTheDocument();
      });
      expect(
        screen.getByText("watchtower.breachNotChecked"),
      ).toBeInTheDocument();
    });

    it("shows breach check button in breached tab", async () => {
      const weakItem = makeVaultItem("w1", "weak", { title: "Login" });
      setupAnalysisMocks({
        weak: [weakItem],
        reused: [],
        old: [],
        total: 1,
        score: 70,
      });
      mockSearchTab = "breached";

      render(<WatchtowerPage />);

      await waitFor(() => {
        const buttons = screen.getAllByText("watchtower.checkBreaches");
        expect(buttons.length).toBeGreaterThanOrEqual(1);
      });
    });

    it("shows no-breached empty state after clean check", async () => {
      const weakItem = makeVaultItem("w1", "test123", { title: "Login" });
      setupAnalysisMocks({
        weak: [weakItem],
        reused: [],
        old: [],
        total: 1,
        score: 70,
      });

      mockCheckPasswordsBatch.mockResolvedValue({
        results: new Map([
          ["test123", { breached: false, count: 0 }],
        ]),
        breachedCount: 0,
      });

      mockSearchTab = "breached";

      const user = userEvent.setup();
      render(<WatchtowerPage />);

      await waitFor(() => {
        const buttons = screen.getAllByText("watchtower.checkBreaches");
        expect(buttons.length).toBeGreaterThanOrEqual(1);
      });

      // Click the check breaches button in the breached tab content
      const buttons = screen.getAllByText("watchtower.checkBreaches");
      await user.click(buttons[buttons.length - 1]);

      await waitFor(() => {
        expect(
          screen.getByText("watchtower.noBreached"),
        ).toBeInTheDocument();
      });
    });
  });

  // ── Breach Check Card ─────────────────────────────────────────────

  describe("breach check card", () => {
    it("renders breach check opt-in card with privacy description", async () => {
      setupAnalysisMocks({
        weak: [makeVaultItem("w1", "weak")],
        reused: [],
        old: [],
        total: 1,
        score: 70,
      });

      render(<WatchtowerPage />);

      await waitFor(() => {
        expect(
          screen.getByText("watchtower.breachCheckTitle"),
        ).toBeInTheDocument();
      });
      expect(
        screen.getByText("watchtower.breachCheckDesc"),
      ).toBeInTheDocument();
    });
  });

  // ── Tab Navigation ────────────────────────────────────────────────

  describe("tab navigation", () => {
    it("uses URL tab parameter for initial tab", async () => {
      mockSearchTab = "old";
      setupAnalysisMocks({
        weak: [],
        reused: [],
        old: [],
        total: 2,
        score: 100,
      });

      render(<WatchtowerPage />);

      await waitFor(() => {
        expect(screen.getByText("watchtower.oldPasswords")).toBeInTheDocument();
      });
    });

    it("calls navigate with replace on tab change", async () => {
      setupAnalysisMocks({
        weak: [],
        reused: [],
        old: [],
        total: 2,
        score: 100,
      });

      const user = userEvent.setup();
      render(<WatchtowerPage />);

      await waitFor(() => {
        expect(screen.getByText("100")).toBeInTheDocument();
      });

      // Click the "Reused" tab trigger (use role to avoid duplicate text)
      const reusedTab = screen
        .getAllByRole("tab")
        .find((t) => t.textContent?.includes("watchtower.reused"));
      expect(reusedTab).toBeDefined();
      await user.click(reusedTab!);

      expect(mockNavigate).toHaveBeenCalledWith(
        expect.objectContaining({
          search: { tab: "reused" },
          replace: true,
        }),
      );
    });
  });

  // ── Background Scan Integration ───────────────────────────────────

  describe("background scan integration", () => {
    it("uses pre-loaded background scan results when available", async () => {
      const preloaded = {
        score: 80,
        issueCount: 3,
        counts: { weak: 1, reused: 1, old: 1, breached: 0 },
        lastScanAt: new Date().toISOString(),
        analysis: {
          weak: [makeVaultItem("w1", "weak")],
          reused: [
            [makeVaultItem("r1", "same"), makeVaultItem("r2", "same")],
          ],
          old: [
            makeVaultItem("o1", "old-pw", { updatedAt: daysAgo(100) }),
          ],
          total: 4,
          score: 80,
        },
      };
      mockGetState.mockReturnValue(preloaded);

      // vault.list still needed for pre-fetch
      mockTrpcQuery.mockResolvedValue([VAULT_RECORD]);

      render(<WatchtowerPage />);

      await waitFor(() => {
        expect(screen.getByText("80")).toBeInTheDocument();
      });

      // Should NOT have called analyzeVault since cached state was used
      expect(mockAnalyzeVault).not.toHaveBeenCalled();
    });
  });

  // ── Clean Vault ─────���──────────────────────────────���──────────────

  describe("clean vault", () => {
    it("renders score 100 and good label for healthy vault", async () => {
      setupAnalysisMocks({
        weak: [],
        reused: [],
        old: [],
        total: 5,
        score: 100,
      });

      render(<WatchtowerPage />);

      await waitFor(() => {
        expect(screen.getByText("100")).toBeInTheDocument();
      });
      expect(screen.getByText("score.good")).toBeInTheDocument();
    });

    it("renders empty vault with score 100", async () => {
      mockTrpcQuery.mockImplementation(
        (router: string, procedure: string) => {
          if (router === "vault" && procedure === "list") {
            return Promise.resolve([VAULT_RECORD]);
          }
          if (router === "credentials" && procedure === "list") {
            return Promise.resolve({ items: [], nextCursor: undefined });
          }
          return Promise.resolve([]);
        },
      );

      render(<WatchtowerPage />);

      await waitFor(() => {
        expect(screen.getByText("100")).toBeInTheDocument();
      });
    });
  });

  // ── Fix Button ─────────────────────────────────────���──────────────

  describe("fix navigation", () => {
    it("renders fix buttons on finding rows", async () => {
      setupAnalysisMocks({
        weak: [makeVaultItem("w1", "weak", { title: "Bad Login" })],
        reused: [],
        old: [],
        total: 2,
        score: 85,
      });
      mockSearchTab = "weak";

      render(<WatchtowerPage />);

      await waitFor(() => {
        expect(screen.getByText("watchtower.fix")).toBeInTheDocument();
      });
    });

    it("navigates to vault on fix click", async () => {
      setupAnalysisMocks({
        weak: [makeVaultItem("w1", "weak", { title: "Bad Login" })],
        reused: [],
        old: [],
        total: 2,
        score: 85,
      });
      mockSearchTab = "weak";

      const user = userEvent.setup();
      render(<WatchtowerPage />);

      await waitFor(() => {
        expect(screen.getByText("watchtower.fix")).toBeInTheDocument();
      });

      await user.click(screen.getByText("watchtower.fix"));

      expect(mockNavigate).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "/dashboard/vault",
        }),
      );
    });
  });
});
