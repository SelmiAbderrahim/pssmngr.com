// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { useLoginState } from "../useLoginState";

vi.mock("@/lib/logger", () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  }),
}));

const LOGIN_STATE_KEY = "pssmngr_login_state";
const STATE_EXPIRY_MINUTES = 20;

describe("useLoginState", () => {
  beforeEach(() => {
    vi.mocked(localStorage.getItem).mockReturnValue(null);
    vi.mocked(localStorage.setItem).mockClear();
    vi.mocked(localStorage.removeItem).mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns initial step as signIn when no stored value", () => {
    const { result } = renderHook(() => useLoginState());
    expect(result.current.step).toBe("signIn");
  });

  it("hydrates valid stored state", () => {
    const stored = JSON.stringify({
      step: "verify",
      email: "user@example.com",
      timestamp: Date.now() - 5 * 60 * 1000, // 5 minutes ago
    });
    vi.mocked(localStorage.getItem).mockReturnValue(stored);

    const { result } = renderHook(() => useLoginState());
    expect(result.current.step).toEqual({ email: "user@example.com" });
  });

  it("ignores expired stored state", () => {
    const stored = JSON.stringify({
      step: "verify",
      email: "user@example.com",
      timestamp: Date.now() - (STATE_EXPIRY_MINUTES + 1) * 60 * 1000,
    });
    vi.mocked(localStorage.getItem).mockReturnValue(stored);

    const { result } = renderHook(() => useLoginState());
    expect(result.current.step).toBe("signIn");
    expect(localStorage.removeItem).toHaveBeenCalledWith(LOGIN_STATE_KEY);
  });

  it("handles invalid JSON in storage", () => {
    vi.mocked(localStorage.getItem).mockReturnValue("{invalid json");

    const { result } = renderHook(() => useLoginState());
    expect(result.current.step).toBe("signIn");
    expect(localStorage.removeItem).toHaveBeenCalledWith(LOGIN_STATE_KEY);
  });

  it("ignores stored state without verify step", () => {
    const stored = JSON.stringify({
      step: "signIn",
      timestamp: Date.now(),
    });
    vi.mocked(localStorage.getItem).mockReturnValue(stored);

    const { result } = renderHook(() => useLoginState());
    expect(result.current.step).toBe("signIn");
    expect(localStorage.removeItem).toHaveBeenCalledWith(LOGIN_STATE_KEY);
  });

  it("setStep with email saves to localStorage", () => {
    const { result } = renderHook(() => useLoginState());

    act(() => {
      result.current.setStep({ email: "alice@example.com" });
    });

    expect(result.current.step).toEqual({ email: "alice@example.com" });
    expect(localStorage.setItem).toHaveBeenCalledWith(
      LOGIN_STATE_KEY,
      expect.stringContaining('"email":"alice@example.com"')
    );
    expect(localStorage.setItem).toHaveBeenCalledWith(
      LOGIN_STATE_KEY,
      expect.stringContaining('"step":"verify"')
    );
  });

  it("setStep with signIn removes from localStorage", () => {
    const { result } = renderHook(() => useLoginState());

    act(() => {
      result.current.setStep({ email: "alice@example.com" });
    });
    act(() => {
      result.current.setStep("signIn");
    });

    expect(result.current.step).toBe("signIn");
    expect(localStorage.removeItem).toHaveBeenCalledWith(LOGIN_STATE_KEY);
  });

  it("clearState resets to signIn and removes from localStorage", () => {
    const stored = JSON.stringify({
      step: "verify",
      email: "user@example.com",
      timestamp: Date.now(),
    });
    vi.mocked(localStorage.getItem).mockReturnValue(stored);

    const { result } = renderHook(() => useLoginState());
    expect(result.current.step).toEqual({ email: "user@example.com" });

    act(() => {
      result.current.clearState();
    });

    expect(result.current.step).toBe("signIn");
    expect(localStorage.removeItem).toHaveBeenCalledWith(LOGIN_STATE_KEY);
  });

  it("syncs state on storage event from another tab", () => {
    const { result } = renderHook(() => useLoginState());

    const newState = JSON.stringify({
      step: "verify",
      email: "bob@example.com",
      timestamp: Date.now(),
    });

    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: LOGIN_STATE_KEY,
          newValue: newState,
        })
      );
    });

    expect(result.current.step).toEqual({ email: "bob@example.com" });
  });

  it("resets to signIn on storage event with null value", () => {
    const stored = JSON.stringify({
      step: "verify",
      email: "user@example.com",
      timestamp: Date.now(),
    });
    vi.mocked(localStorage.getItem).mockReturnValue(stored);

    const { result } = renderHook(() => useLoginState());
    expect(result.current.step).toEqual({ email: "user@example.com" });

    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: LOGIN_STATE_KEY,
          newValue: null,
        })
      );
    });

    expect(result.current.step).toBe("signIn");
  });

  it("ignores storage events for other keys", () => {
    const { result } = renderHook(() => useLoginState());

    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "other_key",
          newValue: JSON.stringify({
            step: "verify",
            email: "hacker@evil.com",
            timestamp: Date.now(),
          }),
        })
      );
    });

    expect(result.current.step).toBe("signIn");
  });

  it("ignores expired state from storage event", () => {
    const { result } = renderHook(() => useLoginState());

    const expiredState = JSON.stringify({
      step: "verify",
      email: "old@example.com",
      timestamp: Date.now() - (STATE_EXPIRY_MINUTES + 1) * 60 * 1000,
    });

    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: LOGIN_STATE_KEY,
          newValue: expiredState,
        })
      );
    });

    expect(result.current.step).toBe("signIn");
  });

  it("periodic expiration check clears expired state", () => {
    vi.useFakeTimers();

    const freshState = JSON.stringify({
      step: "verify",
      email: "user@example.com",
      timestamp: Date.now() - 5 * 60 * 1000, // 5 minutes ago
    });
    vi.mocked(localStorage.getItem).mockReturnValue(freshState);

    const { result } = renderHook(() => useLoginState());
    expect(result.current.step).toEqual({ email: "user@example.com" });

    // Advance time so the state is now expired
    const expiredState = JSON.stringify({
      step: "verify",
      email: "user@example.com",
      timestamp: Date.now() - (STATE_EXPIRY_MINUTES + 1) * 60 * 1000,
    });
    vi.mocked(localStorage.getItem).mockReturnValue(expiredState);

    // Advance the interval timer (60 seconds)
    act(() => {
      vi.advanceTimersByTime(60000);
    });

    expect(result.current.step).toBe("signIn");
    expect(localStorage.removeItem).toHaveBeenCalledWith(LOGIN_STATE_KEY);
  });

  it("cleans up interval on unmount", () => {
    vi.useFakeTimers();
    const clearIntervalSpy = vi.spyOn(global, "clearInterval");

    const { unmount } = renderHook(() => useLoginState());
    unmount();

    expect(clearIntervalSpy).toHaveBeenCalled();
    clearIntervalSpy.mockRestore();
  });
});
