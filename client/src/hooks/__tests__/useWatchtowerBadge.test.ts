// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { useWatchtowerBadge } from "../useWatchtowerBadge";

const mockWatchtowerSubscribe = vi.fn();
const mockGetState = vi.fn();
const mockStartBackgroundScan = vi.fn();
const mockStopBackgroundScan = vi.fn();

vi.mock("@/services/watchtower-scan", () => ({
  watchtowerScan: {
    subscribe: (...args: unknown[]) => mockWatchtowerSubscribe(...args),
    getState: () => mockGetState(),
    startBackgroundScan: () => mockStartBackgroundScan(),
    stopBackgroundScan: () => mockStopBackgroundScan(),
  },
}));

const mockVaultSubscribe = vi.fn();
const mockVaultIsUnlocked = vi.fn();

vi.mock("@/services/vault-crypto", () => ({
  vaultCrypto: {
    subscribe: (...args: unknown[]) => mockVaultSubscribe(...args),
    isUnlocked: () => mockVaultIsUnlocked(),
  },
}));

describe("useWatchtowerBadge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetState.mockReturnValue(null);
    mockVaultIsUnlocked.mockReturnValue(false);
    mockWatchtowerSubscribe.mockReturnValue(vi.fn());
    mockVaultSubscribe.mockReturnValue(vi.fn());
  });

  it("returns default values when state is null", () => {
    const { result } = renderHook(() => useWatchtowerBadge());
    expect(result.current.issueCount).toBe(0);
    expect(result.current.score).toBeNull();
    expect(result.current.lastScanAt).toBeNull();
  });

  it("returns state values when available", () => {
    mockGetState.mockReturnValue({
      issueCount: 5,
      score: 72,
      lastScanAt: "2024-06-15T10:00:00Z",
      counts: { weak: 2, reused: 1, old: 2, breached: 0 },
      analysis: null,
    });

    const { result } = renderHook(() => useWatchtowerBadge());
    expect(result.current.issueCount).toBe(5);
    expect(result.current.score).toBe(72);
    expect(result.current.lastScanAt).toBe("2024-06-15T10:00:00Z");
  });

  it("subscribes to watchtowerScan on mount", () => {
    renderHook(() => useWatchtowerBadge());
    expect(mockWatchtowerSubscribe).toHaveBeenCalledTimes(1);
    expect(mockWatchtowerSubscribe).toHaveBeenCalledWith(expect.any(Function));
  });

  it("subscribes to vaultCrypto on mount", () => {
    renderHook(() => useWatchtowerBadge());
    expect(mockVaultSubscribe).toHaveBeenCalledTimes(1);
    expect(mockVaultSubscribe).toHaveBeenCalledWith(expect.any(Function));
  });

  it("unsubscribes from both on unmount", () => {
    const unsubWatch = vi.fn();
    const unsubVault = vi.fn();
    mockWatchtowerSubscribe.mockReturnValue(unsubWatch);
    mockVaultSubscribe.mockReturnValue(unsubVault);

    const { unmount } = renderHook(() => useWatchtowerBadge());
    unmount();

    expect(unsubWatch).toHaveBeenCalledTimes(1);
    expect(unsubVault).toHaveBeenCalledTimes(1);
  });

  it("starts background scan if vault already unlocked on mount", () => {
    mockVaultIsUnlocked.mockReturnValue(true);
    renderHook(() => useWatchtowerBadge());
    expect(mockStartBackgroundScan).toHaveBeenCalledTimes(1);
  });

  it("does not start background scan if vault is locked on mount", () => {
    mockVaultIsUnlocked.mockReturnValue(false);
    renderHook(() => useWatchtowerBadge());
    expect(mockStartBackgroundScan).not.toHaveBeenCalled();
  });

  it("starts scan when vault becomes unlocked via subscription", () => {
    let vaultListener: (isUnlocked: boolean) => void = () => {};
    mockVaultSubscribe.mockImplementation((cb: (v: boolean) => void) => {
      vaultListener = cb;
      return vi.fn();
    });

    renderHook(() => useWatchtowerBadge());

    act(() => {
      vaultListener(true);
    });

    expect(mockStartBackgroundScan).toHaveBeenCalledTimes(1);
  });

  it("stops scan when vault becomes locked via subscription", () => {
    mockVaultIsUnlocked.mockReturnValue(true);
    let vaultListener: (isUnlocked: boolean) => void = () => {};
    mockVaultSubscribe.mockImplementation((cb: (v: boolean) => void) => {
      vaultListener = cb;
      return vi.fn();
    });

    renderHook(() => useWatchtowerBadge());

    act(() => {
      vaultListener(false);
    });

    expect(mockStopBackgroundScan).toHaveBeenCalledTimes(1);
  });

  it("updates state when watchtower subscription fires", () => {
    let watchListener: (state: unknown) => void = () => {};
    mockWatchtowerSubscribe.mockImplementation((cb: (s: unknown) => void) => {
      watchListener = cb;
      return vi.fn();
    });

    const { result } = renderHook(() => useWatchtowerBadge());
    expect(result.current.issueCount).toBe(0);

    act(() => {
      watchListener({
        issueCount: 3,
        score: 85,
        lastScanAt: "2024-07-01T12:00:00Z",
        counts: { weak: 1, reused: 1, old: 1, breached: 0 },
        analysis: null,
      });
    });

    expect(result.current.issueCount).toBe(3);
    expect(result.current.score).toBe(85);
    expect(result.current.lastScanAt).toBe("2024-07-01T12:00:00Z");
  });
});
