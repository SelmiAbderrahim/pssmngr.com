// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { useMediaQuery } from "../useMediaQuery";

type ChangeListener = (e: MediaQueryListEvent) => void;

function createMockMatchMedia(defaultMatches: boolean) {
  const listeners: ChangeListener[] = [];
  const mql = {
    matches: defaultMatches,
    media: "",
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn((event: string, handler: ChangeListener) => {
      if (event === "change") {
        listeners.push(handler);
      }
    }),
    removeEventListener: vi.fn((event: string, handler: ChangeListener) => {
      if (event === "change") {
        const idx = listeners.indexOf(handler);
        if (idx !== -1) listeners.splice(idx, 1);
      }
    }),
    dispatchEvent: vi.fn(),
  };

  const matchMediaMock = vi.fn((query: string) => {
    mql.media = query;
    return mql;
  });

  return { matchMediaMock, mql, listeners };
}

describe("useMediaQuery", () => {
  let originalMatchMedia: typeof window.matchMedia;

  beforeEach(() => {
    originalMatchMedia = window.matchMedia;
  });

  afterEach(() => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: originalMatchMedia,
    });
  });

  it("returns false for non-matching query", () => {
    const { matchMediaMock } = createMockMatchMedia(false);
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: matchMediaMock,
    });
    const { result } = renderHook(() =>
      useMediaQuery("(min-width: 768px)")
    );
    expect(result.current).toBe(false);
  });

  it("returns true for matching query", () => {
    const { matchMediaMock } = createMockMatchMedia(true);
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: matchMediaMock,
    });
    const { result } = renderHook(() =>
      useMediaQuery("(min-width: 768px)")
    );
    expect(result.current).toBe(true);
  });

  it("updates on change event", () => {
    const { matchMediaMock, mql, listeners } = createMockMatchMedia(false);
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: matchMediaMock,
    });
    const { result } = renderHook(() =>
      useMediaQuery("(min-width: 768px)")
    );
    expect(result.current).toBe(false);

    act(() => {
      mql.matches = true;
      listeners.forEach((handler) =>
        handler({ matches: true } as MediaQueryListEvent)
      );
    });
    expect(result.current).toBe(true);
  });

  it("subscribes to matchMedia change events", () => {
    const { matchMediaMock, mql } = createMockMatchMedia(false);
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: matchMediaMock,
    });
    renderHook(() => useMediaQuery("(min-width: 768px)"));
    expect(mql.addEventListener).toHaveBeenCalledWith(
      "change",
      expect.any(Function)
    );
  });

  it("cleans up listener on unmount", () => {
    const { matchMediaMock, mql } = createMockMatchMedia(false);
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: matchMediaMock,
    });
    const { unmount } = renderHook(() =>
      useMediaQuery("(min-width: 768px)")
    );
    unmount();
    expect(mql.removeEventListener).toHaveBeenCalledWith(
      "change",
      expect.any(Function)
    );
  });

  it("handles query change and resubscribes", () => {
    const { matchMediaMock, mql } = createMockMatchMedia(false);
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: matchMediaMock,
    });
    const { rerender } = renderHook(
      ({ query }: { query: string }) => useMediaQuery(query),
      { initialProps: { query: "(min-width: 768px)" } }
    );

    // Rerender with a new query
    rerender({ query: "(min-width: 1024px)" });

    // Should have removed old listener and added new one
    expect(mql.removeEventListener).toHaveBeenCalledWith(
      "change",
      expect.any(Function)
    );
    // addEventListener called once on mount plus once on rerender
    expect(mql.addEventListener).toHaveBeenCalledTimes(2);
    expect(matchMediaMock).toHaveBeenCalledWith("(min-width: 1024px)");
  });
});
