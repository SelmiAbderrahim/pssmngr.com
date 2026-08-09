// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Watchtower Scan Service — Empty Results Tests
 *
 * Verifies the watchtower-scan service handles empty vaults correctly:
 * - Uses credentials.list (not vault.listItems)
 * - Returns empty scan results for empty vaults
 * - Persists valid state even with zero items
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────

const mockVaultCrypto = {
  isUnlocked: vi.fn(() => true),
  decryptBlob: vi.fn(),
  encryptBlob: vi.fn(),
  decryptItem: vi.fn(),
};
vi.mock("@/services/vault-crypto", () => ({
  vaultCrypto: mockVaultCrypto,
}));

const mockAnalyzeVault = vi.fn();
vi.mock("@/services/watchtower-analyzer", () => ({
  analyzeVault: (...args: unknown[]) => mockAnalyzeVault(...args),
}));

const mockTrpcQuery = vi.fn();
const mockTrpcMutation = vi.fn();
vi.mock("@/lib/api/trpc", () => ({
  trpcQuery: (...args: unknown[]) => mockTrpcQuery(...args),
  trpcMutation: (...args: unknown[]) => mockTrpcMutation(...args),
}));

// ── Helpers ────────────────────────────────────────────────────────

function setupEmptyVaultMocks() {
  // vault.list → one vault
  mockTrpcQuery.mockResolvedValueOnce([{ id: "vault-1" }]);
  // vault.get → vault with no cached state
  mockTrpcQuery.mockResolvedValueOnce({
    id: "vault-1",
    encryptedWatchtowerState: null,
  });
  // credentials.list → empty
  mockTrpcQuery.mockResolvedValueOnce({ items: [], nextCursor: undefined });
  // Sync mocks
  mockVaultCrypto.encryptBlob.mockResolvedValue("encrypted-state");
  mockTrpcMutation.mockResolvedValue(undefined);
}

// ── Tests ──────────────────────────────────────────────────────────

describe("watchtower-scan — empty vault", () => {
  let watchtowerScan: typeof import("../watchtower-scan")["watchtowerScan"];

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockVaultCrypto.isUnlocked.mockReturnValue(true);

    // Re-import to get fresh singleton
    vi.resetModules();

    vi.doMock("@/services/vault-crypto", () => ({
      vaultCrypto: mockVaultCrypto,
    }));
    vi.doMock("@/services/watchtower-analyzer", () => ({
      analyzeVault: (...args: unknown[]) => mockAnalyzeVault(...args),
    }));
    vi.doMock("@/lib/api/trpc", () => ({
      trpcQuery: (...args: unknown[]) => mockTrpcQuery(...args),
      trpcMutation: (...args: unknown[]) => mockTrpcMutation(...args),
    }));

    const mod = await import("../watchtower-scan");
    watchtowerScan = mod.watchtowerScan;
  });

  afterEach(() => {
    watchtowerScan.stopBackgroundScan();
    vi.useRealTimers();
  });

  it("calls credentials.list not vault.listItems", async () => {
    setupEmptyVaultMocks();
    mockAnalyzeVault.mockResolvedValue({
      weak: [],
      reused: [],
      old: [],
      total: 0,
      score: 100,
    });

    await watchtowerScan.startBackgroundScan();

    // Should call credentials.list
    const credentialsListCall = mockTrpcQuery.mock.calls.find(
      (call: unknown[]) => call[0] === "credentials" && call[1] === "list",
    );
    expect(credentialsListCall).toBeDefined();

    // Should NOT call vault.listItems
    const vaultListItemsCall = mockTrpcQuery.mock.calls.find(
      (call: unknown[]) => call[0] === "vault" && call[1] === "listItems",
    );
    expect(vaultListItemsCall).toBeUndefined();
  });

  it("returns empty scan results when no items exist", async () => {
    setupEmptyVaultMocks();
    mockAnalyzeVault.mockResolvedValue({
      weak: [],
      reused: [],
      old: [],
      total: 0,
      score: 100,
    });

    const listener = vi.fn();
    watchtowerScan.subscribe(listener);

    await watchtowerScan.startBackgroundScan();

    const state = watchtowerScan.getState();
    expect(state).not.toBeNull();
    expect(state!.score).toBe(100);
    expect(state!.counts.weak).toBe(0);
    expect(state!.counts.reused).toBe(0);
    expect(state!.counts.old).toBe(0);
    expect(state!.issueCount).toBe(0);
  });

  it("persists state to server even with empty results", async () => {
    setupEmptyVaultMocks();
    mockAnalyzeVault.mockResolvedValue({
      weak: [],
      reused: [],
      old: [],
      total: 0,
      score: 100,
    });

    await watchtowerScan.startBackgroundScan();

    // Advance past sync debounce (2 seconds)
    await vi.advanceTimersByTimeAsync(3_000);

    // Should have called encryptBlob to persist state
    expect(mockVaultCrypto.encryptBlob).toHaveBeenCalled();
  });

  it("notifies subscribers with empty scan state", async () => {
    setupEmptyVaultMocks();
    mockAnalyzeVault.mockResolvedValue({
      weak: [],
      reused: [],
      old: [],
      total: 0,
      score: 100,
    });

    const listener = vi.fn();
    watchtowerScan.subscribe(listener);

    await watchtowerScan.startBackgroundScan();

    // Listener should have been called
    expect(listener).toHaveBeenCalled();
    const lastState = listener.mock.calls[listener.mock.calls.length - 1][0];
    expect(lastState).not.toBeNull();
    expect(lastState.score).toBe(100);
    expect(lastState.issueCount).toBe(0);
  });
});
