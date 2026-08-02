// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { useLocalStorage } from "../useLocalStorage";

describe("useLocalStorage", () => {
  beforeEach(() => {
    vi.mocked(localStorage.getItem).mockReturnValue(null);
    vi.mocked(localStorage.setItem).mockClear();
    vi.mocked(localStorage.getItem).mockClear();
  });

  it("returns initialValue when nothing stored", () => {
    const { result } = renderHook(() => useLocalStorage("test-key", "default"));
    expect(result.current[0]).toBe("default");
  });

  it("reads existing value from localStorage", () => {
    vi.mocked(localStorage.getItem).mockReturnValue(JSON.stringify("stored"));
    const { result } = renderHook(() =>
      useLocalStorage("test-key", "default")
    );
    expect(result.current[0]).toBe("stored");
  });

  it("reads existing object from localStorage", () => {
    vi.mocked(localStorage.getItem).mockReturnValue(
      JSON.stringify({ name: "test", count: 42 })
    );
    const { result } = renderHook(() =>
      useLocalStorage("test-key", { name: "", count: 0 })
    );
    expect(result.current[0]).toEqual({ name: "test", count: 42 });
  });

  it("setValue updates state and writes to localStorage", () => {
    const { result } = renderHook(() => useLocalStorage("test-key", "default"));
    act(() => {
      result.current[1]("updated");
    });
    expect(result.current[0]).toBe("updated");
    expect(localStorage.setItem).toHaveBeenCalledWith(
      "test-key",
      JSON.stringify("updated")
    );
  });

  it("setValue with function updater", () => {
    vi.mocked(localStorage.getItem).mockReturnValue(JSON.stringify(10));
    const { result } = renderHook(() => useLocalStorage("test-key", 0));
    act(() => {
      result.current[1]((prev) => prev + 5);
    });
    expect(result.current[0]).toBe(15);
    expect(localStorage.setItem).toHaveBeenCalledWith(
      "test-key",
      JSON.stringify(15)
    );
  });

  it("handles localStorage read error and returns initialValue", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(localStorage.getItem).mockImplementation(() => {
      throw new Error("Storage access denied");
    });
    const { result } = renderHook(() => useLocalStorage("test-key", "fallback"));
    expect(result.current[0]).toBe("fallback");
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Error reading localStorage key "test-key"'),
      expect.any(Error)
    );
    warnSpy.mockRestore();
  });

  it("handles localStorage write error by throwing from state updater", () => {
    // Suppress React error boundary / console.error noise
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { result } = renderHook(() => useLocalStorage("test-key", "default"));

    // Mock setItem to throw after initial render
    vi.mocked(localStorage.setItem).mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });

    // The error thrown inside React's state updater propagates out of act()
    expect(() => {
      act(() => {
        result.current[1]("new-value");
      });
    }).toThrow("QuotaExceededError");

    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("syncs across tabs via storage event", () => {
    const { result } = renderHook(() => useLocalStorage("test-key", "default"));
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "test-key",
          newValue: JSON.stringify("from-other-tab"),
        })
      );
    });
    expect(result.current[0]).toBe("from-other-tab");
  });

  it("ignores storage events for different keys", () => {
    const { result } = renderHook(() => useLocalStorage("test-key", "default"));
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "other-key",
          newValue: JSON.stringify("other-value"),
        })
      );
    });
    expect(result.current[0]).toBe("default");
  });

  it("ignores storage events with null newValue", () => {
    vi.mocked(localStorage.getItem).mockReturnValue(
      JSON.stringify("existing")
    );
    const { result } = renderHook(() => useLocalStorage("test-key", "default"));
    expect(result.current[0]).toBe("existing");
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "test-key",
          newValue: null,
        })
      );
    });
    // Value should remain unchanged since the hook ignores null newValue
    expect(result.current[0]).toBe("existing");
  });

  it("handles invalid JSON in storage event", () => {
    const { result } = renderHook(() => useLocalStorage("test-key", "default"));
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "test-key",
          newValue: "not-valid-json{{{",
        })
      );
    });
    // Should remain at initial value since parse fails silently
    expect(result.current[0]).toBe("default");
  });
});
