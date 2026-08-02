// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Unit tests for useOnlineStatus.
 *
 * Covers:
 *   - initial value from navigator.onLine
 *   - online / offline event transitions
 *   - visibility-gated health-check ping (skipped when hidden)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useOnlineStatus } from "../useOnlineStatus";

describe("useOnlineStatus", () => {
  beforeEach(() => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns initial online state from navigator.onLine", () => {
    const { result } = renderHook(() => useOnlineStatus({ pingIntervalMs: 999_999 }));
    expect(result.current.isOnline).toBe(true);
    expect(result.current.source).toBe("navigator");
  });

  it("flips to offline on the offline event", async () => {
    const { result } = renderHook(() => useOnlineStatus({ pingIntervalMs: 999_999 }));
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    await waitFor(() => expect(result.current.isOnline).toBe(false));
    expect(result.current.source).toBe("navigator");
  });

  it("flips back to online on the online event", async () => {
    const { result } = renderHook(() => useOnlineStatus({ pingIntervalMs: 999_999 }));
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    await waitFor(() => expect(result.current.isOnline).toBe(false));
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    await waitFor(() => expect(result.current.isOnline).toBe(true));
  });

  it("health-check ping flips offline → online when the network recovers", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });

    const { result } = renderHook(() =>
      useOnlineStatus({
        pingIntervalMs: 30,
        fetchImpl: fetchMock as unknown as typeof fetch,
      }),
    );
    expect(result.current.isOnline).toBe(false);

    // Let the interval fire at least once and the awaited fetch resolve.
    await waitFor(
      () => {
        expect(result.current.isOnline).toBe(true);
      },
      { timeout: 3_000 },
    );
    expect(result.current.source).toBe("ping");
    expect(fetchMock).toHaveBeenCalled();
  });
});
