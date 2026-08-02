// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { useDebouncedCallback } from "../useDebouncedCallback";

describe("useDebouncedCallback", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("debouncedCallback delays execution", () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(callback, 300));

    act(() => {
      result.current.debouncedCallback("test");
    });
    expect(callback).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith("test");
  });

  it("rapid calls only execute last one after delay", () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(callback, 200));

    act(() => {
      result.current.debouncedCallback("first");
      result.current.debouncedCallback("second");
      result.current.debouncedCallback("third");
    });

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith("third");
  });

  it("cancel prevents pending execution", () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(callback, 300));

    act(() => {
      result.current.debouncedCallback("test");
    });
    expect(result.current.isPending()).toBe(true);

    act(() => {
      result.current.cancel();
    });
    expect(result.current.isPending()).toBe(false);

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(callback).not.toHaveBeenCalled();
  });

  it("flush executes immediately", () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(callback, 500));

    act(() => {
      result.current.debouncedCallback("flushed");
    });
    expect(callback).not.toHaveBeenCalled();

    act(() => {
      result.current.flush();
    });
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith("flushed");
  });

  it("flush does nothing when no pending callback", () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(callback, 300));

    act(() => {
      result.current.flush();
    });
    expect(callback).not.toHaveBeenCalled();
  });

  it("isPending returns correct state", () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(callback, 300));

    expect(result.current.isPending()).toBe(false);

    act(() => {
      result.current.debouncedCallback("test");
    });
    expect(result.current.isPending()).toBe(true);

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current.isPending()).toBe(false);
  });

  it("cleanup on unmount clears pending timeout", () => {
    const callback = vi.fn();
    const { result, unmount } = renderHook(() =>
      useDebouncedCallback(callback, 300)
    );

    act(() => {
      result.current.debouncedCallback("test");
    });

    unmount();

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(callback).not.toHaveBeenCalled();
  });

  it("callback ref stays current when callback changes between calls", () => {
    const firstCallback = vi.fn();
    const secondCallback = vi.fn();

    const { result, rerender } = renderHook(
      ({ cb }: { cb: (...args: string[]) => void }) =>
        useDebouncedCallback(cb, 300),
      { initialProps: { cb: firstCallback } }
    );

    act(() => {
      result.current.debouncedCallback("value");
    });

    // Update callback before timer fires
    rerender({ cb: secondCallback });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    // Should call the updated callback, not the original
    expect(firstCallback).not.toHaveBeenCalled();
    expect(secondCallback).toHaveBeenCalledTimes(1);
    expect(secondCallback).toHaveBeenCalledWith("value");
  });

  it("works with different delay values", () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(callback, 100));

    act(() => {
      result.current.debouncedCallback("fast");
    });

    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(callback).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith("fast");
  });
});
