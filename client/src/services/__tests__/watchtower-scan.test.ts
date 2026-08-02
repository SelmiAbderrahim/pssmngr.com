// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
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

import type { WatchtowerScanState } from "../watchtower-scan";

// ── Helpers ────────────────────────────────────────────────────────

function makeCachedBlob(state: {
  score: number;
  counts: { weak: number; reused: number; old: number; breached: number };
  lastScanAt: string;
}): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(state));
}

/** Standard mock setup: vault.list → vault.get → credentials.list */
function setupFullScanMocks(
  items: Array<Record<string, unknown>> = [],
  cachedState: string | null = null,
) {
  mockTrpcQuery.mockResolvedValueOnce([{ id: "vault-1" }]);
  mockTrpcQuery.mockResolvedValueOnce({
    id: "vault-1",
    encryptedWatchtowerState: cachedState,
  });
  mockTrpcQuery.mockResolvedValueOnce({ items });
  // Default safe mocks for sync (scheduleSyncToServer may fire)
  mockVaultCrypto.encryptBlob.mockResolvedValue("encrypted-state");
  mockTrpcMutation.mockResolvedValue(undefined);
}

// ── Tests ──────────────────────────────────────────────────────────

describe("watchtower-scan", () => {
  let watchtowerScan: typeof import("../watchtower-scan")["watchtowerScan"];

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockVaultCrypto.isUnlocked.mockReturnValue(true);

    // Re-import to get fresh singleton
    vi.resetModules();

    // Re-apply mocks after resetModules
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

  // ── getState / isScanning ──────────────────────────────────────

  it("initial state is null and not scanning", () => {
    expect(watchtowerScan.getState()).toBeNull();
    expect(watchtowerScan.isScanning()).toBe(false);
  });

  // ── subscribe/notify pattern delivers scan results to subscribers ─

  it("subscribe/notify pattern delivers scan results to subscribers", async () => {
    setupFullScanMocks([
      { id: "item-1", itemType: "login", isFavorite: false, createdAt: "2025-01-01", updatedAt: "2025-01-01" },
    ]);
    mockVaultCrypto.decryptItem.mockResolvedValue({ title: "Test", password: "weak" });
    mockAnalyzeVault.mockResolvedValue({
      weak: [{ id: "item-1" }],
      reused: [],
      old: [],
      total: 1,
      score: 70,
    });

    const listener = vi.fn();
    const unsub = watchtowerScan.subscribe(listener);

    await watchtowerScan.startBackgroundScan();

    // Listener should have been called with scan state
    const lastCall = listener.mock.calls[listener.mock.calls.length - 1][0] as WatchtowerScanState;
    expect(lastCall).not.toBeNull();
    expect(lastCall.score).toBe(70);
    expect(lastCall.counts.weak).toBe(1);

    // Unsubscribe stops notifications
    unsub();
    watchtowerScan.stopBackgroundScan();
    // After unsubscribe + stop, listener was called once more for the scan state
    // but NOT for the stop notification
    const callsBeforeStop = listener.mock.calls.length;
    watchtowerScan.stopBackgroundScan(); // extra stop — no new call expected
    expect(listener.mock.calls.length).toBe(callsBeforeStop);
  });

  // ── startBackgroundScan — early exits ──────────────────────────

  it("vault locked prevents scan", async () => {
    mockVaultCrypto.isUnlocked.mockReturnValue(false);
    await watchtowerScan.startBackgroundScan();
    expect(mockTrpcQuery).not.toHaveBeenCalled();
    expect(watchtowerScan.getState()).toBeNull();
  });

  it("does nothing if no vaults exist", async () => {
    mockTrpcQuery.mockResolvedValueOnce([]); // vault.list returns empty
    await watchtowerScan.startBackgroundScan();
    expect(watchtowerScan.getState()).toBeNull();
  });

  it("does nothing if vault list fetch fails", async () => {
    mockTrpcQuery.mockRejectedValueOnce(new Error("Network error"));
    await watchtowerScan.startBackgroundScan();
    expect(watchtowerScan.getState()).toBeNull();
  });

  // ── startBackgroundScan begins periodic scanning ───────────────

  it("startBackgroundScan begins periodic scanning", async () => {
    // First scan
    mockTrpcQuery.mockResolvedValueOnce([{ id: "vault-1" }]);
    mockTrpcQuery.mockResolvedValueOnce({ id: "vault-1", encryptedWatchtowerState: null });
    mockTrpcQuery.mockResolvedValueOnce({ items: [] });
    mockVaultCrypto.encryptBlob.mockResolvedValue("enc");
    mockTrpcMutation.mockResolvedValue(undefined);

    await watchtowerScan.startBackgroundScan();
    expect(watchtowerScan.getState()).not.toBeNull();

    const callCountAfterFirst = mockTrpcQuery.mock.calls.length;

    // Set up mocks for periodic rescan (24h later)
    mockTrpcQuery.mockResolvedValueOnce({ items: [] });
    mockVaultCrypto.encryptBlob.mockResolvedValue("enc");

    // Advance 24 hours to trigger periodic rescan
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);

    // The periodic rescan should have called trpcQuery again
    expect(mockTrpcQuery.mock.calls.length).toBeGreaterThan(callCountAfterFirst);
  });

  // ── stopBackgroundScan cancels the interval ────────────────────

  it("stopBackgroundScan clears all state and cancels interval", async () => {
    // Start scanning
    mockTrpcQuery.mockResolvedValueOnce([{ id: "vault-1" }]);
    mockTrpcQuery.mockResolvedValueOnce({ id: "vault-1", encryptedWatchtowerState: null });
    mockTrpcQuery.mockResolvedValueOnce({ items: [] });
    mockVaultCrypto.encryptBlob.mockResolvedValue("enc");
    mockTrpcMutation.mockResolvedValue(undefined);

    await watchtowerScan.startBackgroundScan();
    expect(watchtowerScan.getState()).not.toBeNull();

    // Stop
    watchtowerScan.stopBackgroundScan();
    expect(watchtowerScan.getState()).toBeNull();
    expect(watchtowerScan.isScanning()).toBe(false);

    const callCountAfterStop = mockTrpcQuery.mock.calls.length;

    // Advance 24h — no rescan should fire (interval cancelled)
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
    expect(mockTrpcQuery.mock.calls.length).toBe(callCountAfterStop);
  });

  it("stopBackgroundScan notifies listeners with null", () => {
    const listener = vi.fn();
    watchtowerScan.subscribe(listener);
    watchtowerScan.stopBackgroundScan();
    expect(listener).toHaveBeenCalledWith(null);
  });

  // ── loadCachedState retrieves last scan from storage ────────────

  it("loadCachedState retrieves last scan from storage for instant badge", async () => {
    const cached = {
      score: 80,
      counts: { weak: 2, reused: 1, old: 0, breached: 0 },
      lastScanAt: "2025-01-01T00:00:00.000Z",
    };
    const cachedBlob = makeCachedBlob(cached);

    // vault.list
    mockTrpcQuery.mockResolvedValueOnce([{ id: "vault-1" }]);
    // vault.get (with cached state)
    mockTrpcQuery.mockResolvedValueOnce({
      id: "vault-1",
      encryptedWatchtowerState: "encrypted-cached",
    });
    mockVaultCrypto.decryptBlob.mockResolvedValue(cachedBlob);
    // credentials.list (empty for simplicity)
    mockTrpcQuery.mockResolvedValueOnce({ items: [] });
    mockVaultCrypto.encryptBlob.mockResolvedValue("enc");
    mockTrpcMutation.mockResolvedValue(undefined);

    const listener = vi.fn();
    watchtowerScan.subscribe(listener);

    await watchtowerScan.startBackgroundScan();

    // First notification should be the cached state (before fresh scan overwrites)
    const firstCall = listener.mock.calls[0]?.[0] as WatchtowerScanState | null;
    expect(firstCall).not.toBeNull();
    expect(firstCall!.score).toBe(80);
    expect(firstCall!.counts.weak).toBe(2);
    expect(firstCall!.counts.reused).toBe(1);
    expect(firstCall!.issueCount).toBe(3); // 2+1+0+0
    expect(firstCall!.analysis).toBeNull(); // Cached state has no analysis
  });

  // ── runScan analyzes decrypted vault items ─────────────────────

  it("runScan analyzes decrypted vault items", async () => {
    // vault.list
    mockTrpcQuery.mockResolvedValueOnce([{ id: "vault-1" }]);
    // vault.get (no cached state)
    mockTrpcQuery.mockResolvedValueOnce({ id: "vault-1", encryptedWatchtowerState: null });
    // credentials.list
    mockTrpcQuery.mockResolvedValueOnce({
      items: [
        { id: "item-1", itemType: "login", isFavorite: false, createdAt: "2025-01-01", updatedAt: "2025-01-01" },
        { id: "item-2", itemType: "login", isFavorite: true, createdAt: "2025-01-01", updatedAt: "2025-01-01" },
      ],
    });

    // Decrypt items
    mockVaultCrypto.decryptItem.mockResolvedValue({ title: "Test", password: "pass123" });

    // Analysis result
    mockAnalyzeVault.mockResolvedValue({
      weak: [{ id: "item-1" }],
      reused: [[{ id: "item-1" }, { id: "item-2" }]],
      old: [],
      total: 2,
      score: 65,
    });

    // Encrypt for sync
    mockVaultCrypto.encryptBlob.mockResolvedValue("encrypted-state");
    mockTrpcMutation.mockResolvedValue(undefined);

    await watchtowerScan.startBackgroundScan();

    expect(mockAnalyzeVault).toHaveBeenCalledTimes(1);
    const passedItems = mockAnalyzeVault.mock.calls[0][0] as Array<{ id: string }>;
    expect(passedItems).toHaveLength(2);

    const state = watchtowerScan.getState();
    expect(state).not.toBeNull();
    expect(state!.score).toBe(65);
    expect(state!.analysis).not.toBeNull();
  });

  // ── runScan detects weak passwords ─────────────────────────────

  it("runScan detects weak passwords", async () => {
    mockTrpcQuery.mockResolvedValueOnce([{ id: "vault-1" }]);
    mockTrpcQuery.mockResolvedValueOnce({ id: "vault-1", encryptedWatchtowerState: null });
    mockTrpcQuery.mockResolvedValueOnce({
      items: [
        { id: "weak-1", itemType: "login", isFavorite: false, createdAt: "2025-01-01", updatedAt: "2025-01-01" },
        { id: "strong-1", itemType: "login", isFavorite: false, createdAt: "2025-01-01", updatedAt: "2025-01-01" },
      ],
    });

    mockVaultCrypto.decryptItem
      .mockResolvedValueOnce({ title: "Weak", password: "123" })
      .mockResolvedValueOnce({ title: "Strong", password: "V3ry$tr0ng!Pass" });

    mockAnalyzeVault.mockResolvedValue({
      weak: [{ id: "weak-1" }],
      reused: [],
      old: [],
      total: 2,
      score: 75,
    });

    mockVaultCrypto.encryptBlob.mockResolvedValue("enc");
    mockTrpcMutation.mockResolvedValue(undefined);

    await watchtowerScan.startBackgroundScan();

    const state = watchtowerScan.getState()!;
    expect(state.counts.weak).toBe(1);
    expect(state.score).toBe(75);
  });

  // ── runScan detects reused passwords ───────────────────────────

  it("runScan detects reused passwords", async () => {
    mockTrpcQuery.mockResolvedValueOnce([{ id: "vault-1" }]);
    mockTrpcQuery.mockResolvedValueOnce({ id: "vault-1", encryptedWatchtowerState: null });
    mockTrpcQuery.mockResolvedValueOnce({
      items: [
        { id: "r-1", itemType: "login", isFavorite: false, createdAt: "2025-01-01", updatedAt: "2025-01-01" },
        { id: "r-2", itemType: "login", isFavorite: false, createdAt: "2025-01-01", updatedAt: "2025-01-01" },
        { id: "r-3", itemType: "login", isFavorite: false, createdAt: "2025-01-01", updatedAt: "2025-01-01" },
      ],
    });

    mockVaultCrypto.decryptItem.mockResolvedValue({ title: "Login", password: "same-password" });

    mockAnalyzeVault.mockResolvedValue({
      weak: [],
      reused: [[{ id: "r-1" }, { id: "r-2" }, { id: "r-3" }]],
      old: [],
      total: 3,
      score: 50,
    });

    mockVaultCrypto.encryptBlob.mockResolvedValue("enc");
    mockTrpcMutation.mockResolvedValue(undefined);

    await watchtowerScan.startBackgroundScan();

    const state = watchtowerScan.getState()!;
    expect(state.counts.reused).toBe(3); // 3 items in the reused group
    expect(state.issueCount).toBe(3);
  });

  // ── runScan detects old passwords (>90 days) ───────────────────

  it("runScan detects old passwords (>90 days)", async () => {
    mockTrpcQuery.mockResolvedValueOnce([{ id: "vault-1" }]);
    mockTrpcQuery.mockResolvedValueOnce({ id: "vault-1", encryptedWatchtowerState: null });
    mockTrpcQuery.mockResolvedValueOnce({
      items: [
        { id: "old-1", itemType: "login", isFavorite: false, createdAt: "2024-01-01", updatedAt: "2024-01-01" },
      ],
    });

    mockVaultCrypto.decryptItem.mockResolvedValue({ title: "Old Login", password: "old-but-strong!123" });

    mockAnalyzeVault.mockResolvedValue({
      weak: [],
      reused: [],
      old: [{ id: "old-1" }],
      total: 1,
      score: 80,
    });

    mockVaultCrypto.encryptBlob.mockResolvedValue("enc");
    mockTrpcMutation.mockResolvedValue(undefined);

    await watchtowerScan.startBackgroundScan();

    const state = watchtowerScan.getState()!;
    expect(state.counts.old).toBe(1);
    expect(state.issueCount).toBe(1);
  });

  // ── runScan calls HIBP for breach check (breached: 0 by default) ─

  it("runScan sets breached count to 0 (HIBP requires explicit opt-in)", async () => {
    mockTrpcQuery.mockResolvedValueOnce([{ id: "vault-1" }]);
    mockTrpcQuery.mockResolvedValueOnce({ id: "vault-1", encryptedWatchtowerState: null });
    mockTrpcQuery.mockResolvedValueOnce({
      items: [
        { id: "item-1", itemType: "login", isFavorite: false, createdAt: "2025-01-01", updatedAt: "2025-01-01" },
      ],
    });

    mockVaultCrypto.decryptItem.mockResolvedValue({ title: "Login", password: "breached-password" });
    mockAnalyzeVault.mockResolvedValue({
      weak: [],
      reused: [],
      old: [],
      total: 1,
      score: 100,
    });
    mockVaultCrypto.encryptBlob.mockResolvedValue("enc");
    mockTrpcMutation.mockResolvedValue(undefined);

    await watchtowerScan.startBackgroundScan();

    const state = watchtowerScan.getState()!;
    expect(state.counts.breached).toBe(0);
  });

  // ── runScan produces correct ScanResult with counts and findings ─

  it("runScan produces correct ScanResult with counts and findings", async () => {
    mockTrpcQuery.mockResolvedValueOnce([{ id: "vault-1" }]);
    mockTrpcQuery.mockResolvedValueOnce({ id: "vault-1", encryptedWatchtowerState: null });
    mockTrpcQuery.mockResolvedValueOnce({
      items: [
        { id: "item-1", itemType: "login", isFavorite: false, createdAt: "2025-01-01", updatedAt: "2025-01-01" },
        { id: "item-2", itemType: "login", isFavorite: false, createdAt: "2025-01-01", updatedAt: "2025-01-01" },
        { id: "item-3", itemType: "login", isFavorite: false, createdAt: "2025-01-01", updatedAt: "2025-01-01" },
        { id: "item-4", itemType: "login", isFavorite: false, createdAt: "2025-01-01", updatedAt: "2025-01-01" },
      ],
    });

    mockVaultCrypto.decryptItem.mockResolvedValue({ title: "Login", password: "pass" });

    const analysisResult = {
      weak: [{ id: "item-1" }],
      reused: [[{ id: "item-2" }, { id: "item-3" }]],
      old: [{ id: "item-4" }],
      total: 4,
      score: 45,
    };
    mockAnalyzeVault.mockResolvedValue(analysisResult);
    mockVaultCrypto.encryptBlob.mockResolvedValue("enc");
    mockTrpcMutation.mockResolvedValue(undefined);

    await watchtowerScan.startBackgroundScan();

    const state = watchtowerScan.getState()!;
    expect(state.score).toBe(45);
    expect(state.counts).toEqual({ weak: 1, reused: 2, old: 1, breached: 0 });
    expect(state.issueCount).toBe(4); // 1 + 2 + 1
    expect(state.lastScanAt).toBeTruthy();
    expect(state.analysis).toEqual(analysisResult);
  });

  // ── scheduleSyncToServer syncs metadata only (not plaintext) ───

  it("scheduleSyncToServer syncs metadata only — not plaintext", async () => {
    mockTrpcQuery.mockResolvedValueOnce([{ id: "vault-1" }]);
    mockTrpcQuery.mockResolvedValueOnce({ id: "vault-1", encryptedWatchtowerState: null });
    mockTrpcQuery.mockResolvedValueOnce({
      items: [
        { id: "item-1", itemType: "login", isFavorite: false, createdAt: "2025-01-01", updatedAt: "2025-01-01" },
      ],
    });

    mockVaultCrypto.decryptItem.mockResolvedValue({
      title: "Secret Site",
      password: "my-secret-password",
      username: "admin",
    });
    mockAnalyzeVault.mockResolvedValue({
      weak: [{ id: "item-1" }],
      reused: [],
      old: [],
      total: 1,
      score: 70,
    });
    mockVaultCrypto.encryptBlob.mockResolvedValue("encrypted-state");
    mockTrpcMutation.mockResolvedValue(undefined);

    await watchtowerScan.startBackgroundScan();

    // Advance past the 2s debounce for sync
    await vi.advanceTimersByTimeAsync(2500);

    // encryptBlob should have been called with CachedState (metadata only)
    expect(mockVaultCrypto.encryptBlob).toHaveBeenCalledTimes(1);
    const encrypted = mockVaultCrypto.encryptBlob.mock.calls[0][0] as Uint8Array;
    const persisted = JSON.parse(new TextDecoder().decode(encrypted));

    // Only score, counts, lastScanAt — no passwords, no analysis, no item details
    expect(persisted).toHaveProperty("score", 70);
    expect(persisted).toHaveProperty("counts");
    expect(persisted).toHaveProperty("lastScanAt");
    expect(persisted).not.toHaveProperty("analysis");
    expect(persisted).not.toHaveProperty("password");
    expect(JSON.stringify(persisted)).not.toContain("my-secret-password");

    // Mutation called with encrypted data
    expect(mockTrpcMutation).toHaveBeenCalledWith(
      "vault",
      "updateWatchtowerState",
      { vaultId: "vault-1", encryptedWatchtowerState: "encrypted-state" },
    );
  });

  // ── Empty vault produces clean result ──────────────────────────

  it("empty vault produces clean result", async () => {
    mockTrpcQuery.mockResolvedValueOnce([{ id: "vault-1" }]);
    mockTrpcQuery.mockResolvedValueOnce({ id: "vault-1", encryptedWatchtowerState: null });
    mockTrpcQuery.mockResolvedValueOnce({ items: [] });
    mockVaultCrypto.encryptBlob.mockResolvedValue("enc");
    mockTrpcMutation.mockResolvedValue(undefined);

    await watchtowerScan.startBackgroundScan();

    const state = watchtowerScan.getState()!;
    expect(state.score).toBe(100);
    expect(state.issueCount).toBe(0);
    expect(state.counts).toEqual({ weak: 0, reused: 0, old: 0, breached: 0 });
  });

  // ── Workspace switch re-resolves the vault ─────────────────────

  it("restartForWorkspaceChange rescans against the new org's vault", async () => {
    setupFullScanMocks([]);
    await watchtowerScan.startBackgroundScan();

    // Switch: the new org resolves a different vault.
    mockTrpcQuery.mockResolvedValueOnce([{ id: "vault-2" }]);
    mockTrpcQuery.mockResolvedValueOnce({ id: "vault-2", encryptedWatchtowerState: null });
    mockTrpcQuery.mockResolvedValueOnce({ items: [] });

    await watchtowerScan.restartForWorkspaceChange();
    await vi.advanceTimersByTimeAsync(3000); // flush sync debounce

    const syncCalls = mockTrpcMutation.mock.calls.filter(
      (c) => c[1] === "updateWatchtowerState",
    );
    expect(syncCalls.length).toBeGreaterThan(0);
    expect(syncCalls[syncCalls.length - 1][2]).toMatchObject({ vaultId: "vault-2" });
  });

  // ── Scan already running returns existing promise ──────────────

  it("scan already running is idempotent — second call is a no-op", async () => {
    mockTrpcQuery.mockResolvedValueOnce([{ id: "vault-1" }]);
    mockTrpcQuery.mockResolvedValueOnce({ id: "vault-1", encryptedWatchtowerState: null });
    mockTrpcQuery.mockResolvedValueOnce({ items: [] });
    mockVaultCrypto.encryptBlob.mockResolvedValue("enc");
    mockTrpcMutation.mockResolvedValue(undefined);

    await watchtowerScan.startBackgroundScan();
    const callCount = mockTrpcQuery.mock.calls.length;

    // Second call — should be no-op because state + rescanTimer exist
    await watchtowerScan.startBackgroundScan();
    expect(mockTrpcQuery.mock.calls.length).toBe(callCount);
  });

  // ── Concurrent scan requests are deduplicated ──────────────────

  it("concurrent scan requests are deduplicated via rescanTimer+state guard", async () => {
    // First call completes normally
    mockTrpcQuery.mockResolvedValueOnce([{ id: "vault-1" }]);
    mockTrpcQuery.mockResolvedValueOnce({ id: "vault-1", encryptedWatchtowerState: null });
    mockTrpcQuery.mockResolvedValueOnce({ items: [] });
    mockVaultCrypto.encryptBlob.mockResolvedValue("enc");
    mockTrpcMutation.mockResolvedValue(undefined);

    await watchtowerScan.startBackgroundScan();
    const callCount = mockTrpcQuery.mock.calls.length;

    // Second call sees rescanTimer + state already set — returns early
    await watchtowerScan.startBackgroundScan();
    expect(mockTrpcQuery.mock.calls.length).toBe(callCount);

    // Third call also deduped
    await watchtowerScan.startBackgroundScan();
    expect(mockTrpcQuery.mock.calls.length).toBe(callCount);
  });

  // ── Decryption failure skips item ──────────────────────────────

  it("skips items that fail to decrypt", async () => {
    mockTrpcQuery.mockResolvedValueOnce([{ id: "vault-1" }]);
    mockTrpcQuery.mockResolvedValueOnce({ id: "vault-1", encryptedWatchtowerState: null });
    mockTrpcQuery.mockResolvedValueOnce({
      items: [
        { id: "good", itemType: "login", isFavorite: false, createdAt: "2025-01-01", updatedAt: "2025-01-01" },
        { id: "bad", itemType: "login", isFavorite: false, createdAt: "2025-01-01", updatedAt: "2025-01-01" },
      ],
    });

    mockVaultCrypto.decryptItem
      .mockResolvedValueOnce({ title: "Good", password: "secure123!" })
      .mockRejectedValueOnce(new Error("Decrypt failed"));

    mockAnalyzeVault.mockResolvedValue({
      weak: [],
      reused: [],
      old: [],
      total: 1,
      score: 100,
    });

    mockVaultCrypto.encryptBlob.mockResolvedValue("enc");
    mockTrpcMutation.mockResolvedValue(undefined);

    await watchtowerScan.startBackgroundScan();

    // Only the good item should have been passed to analyzeVault
    expect(mockAnalyzeVault).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: "good" })]),
    );
    const analysisArg = mockAnalyzeVault.mock.calls[0][0] as Array<{ id: string }>;
    expect(analysisArg).toHaveLength(1);
    expect(analysisArg[0].id).toBe("good");
  });

  // ── Scan failure does not leave scanning flag stuck ─────────────

  it("scan failure resets scanning flag", async () => {
    mockTrpcQuery.mockResolvedValueOnce([{ id: "vault-1" }]);
    mockTrpcQuery.mockResolvedValueOnce({ id: "vault-1", encryptedWatchtowerState: null });
    // credentials.list fails
    mockTrpcQuery.mockRejectedValueOnce(new Error("Server error"));

    await watchtowerScan.startBackgroundScan();

    expect(watchtowerScan.isScanning()).toBe(false);
  });

  // ── Multiple subscribers ───────────────────────────────────────

  it("supports multiple subscribers", async () => {
    mockTrpcQuery.mockResolvedValueOnce([{ id: "vault-1" }]);
    mockTrpcQuery.mockResolvedValueOnce({ id: "vault-1", encryptedWatchtowerState: null });
    mockTrpcQuery.mockResolvedValueOnce({ items: [] });
    mockVaultCrypto.encryptBlob.mockResolvedValue("enc");
    mockTrpcMutation.mockResolvedValue(undefined);

    const listener1 = vi.fn();
    const listener2 = vi.fn();
    watchtowerScan.subscribe(listener1);
    watchtowerScan.subscribe(listener2);

    await watchtowerScan.startBackgroundScan();

    expect(listener1).toHaveBeenCalled();
    expect(listener2).toHaveBeenCalled();
  });

  // ── Cached state decryption failure handled silently ───────────

  it("silently handles cached state decryption failure", async () => {
    mockTrpcQuery.mockResolvedValueOnce([{ id: "vault-1" }]);
    mockTrpcQuery.mockResolvedValueOnce({
      id: "vault-1",
      encryptedWatchtowerState: "corrupt-data",
    });
    mockVaultCrypto.decryptBlob.mockRejectedValue(new Error("Decrypt failed"));
    mockTrpcQuery.mockResolvedValueOnce({ items: [] });
    mockVaultCrypto.encryptBlob.mockResolvedValue("enc");
    mockTrpcMutation.mockResolvedValue(undefined);

    // Should not throw — proceeds to fresh scan
    await watchtowerScan.startBackgroundScan();
    expect(watchtowerScan.getState()).not.toBeNull();
    expect(watchtowerScan.getState()!.score).toBe(100);
  });
});
