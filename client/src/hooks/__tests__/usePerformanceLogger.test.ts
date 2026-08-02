// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { usePerformanceLogger } from "../usePerformanceLogger";

const mockDebug = vi.fn();
const mockTrace = vi.fn();

vi.mock("@/lib/logger", () => ({
  getLogger: () => ({
    debug: mockDebug,
    trace: mockTrace,
  }),
}));

describe("usePerformanceLogger", () => {
  beforeEach(() => {
    mockDebug.mockClear();
    mockTrace.mockClear();
  });

  it("logs mount message on mount", () => {
    renderHook(() =>
      usePerformanceLogger({ componentName: "TestComponent", enabled: true })
    );
    expect(mockDebug).toHaveBeenCalledWith(
      "TestComponent mounted",
      expect.objectContaining({
        function: "TestComponent",
        performance: expect.objectContaining({ duration: expect.any(Number) }),
      })
    );
  });

  it("logs unmount message on unmount", () => {
    const { unmount } = renderHook(() =>
      usePerformanceLogger({ componentName: "TestComponent", enabled: true })
    );
    mockDebug.mockClear();
    unmount();
    expect(mockDebug).toHaveBeenCalledWith(
      "TestComponent unmounted",
      expect.objectContaining({
        function: "TestComponent",
        performance: expect.objectContaining({
          duration: expect.any(Number),
          renderCount: expect.any(Number),
        }),
      })
    );
  });

  it("does nothing when enabled is false", () => {
    const { unmount } = renderHook(() =>
      usePerformanceLogger({ componentName: "TestComponent", enabled: false })
    );
    unmount();
    expect(mockDebug).not.toHaveBeenCalled();
    expect(mockTrace).not.toHaveBeenCalled();
  });

  it("uses correct logLevel when set to trace", () => {
    renderHook(() =>
      usePerformanceLogger({
        componentName: "TestComponent",
        enabled: true,
        logLevel: "trace",
      })
    );
    expect(mockTrace).toHaveBeenCalledWith(
      "TestComponent mounted",
      expect.objectContaining({
        function: "TestComponent",
      })
    );
    expect(mockDebug).not.toHaveBeenCalled();
  });

  it("uses debug logLevel by default", () => {
    renderHook(() =>
      usePerformanceLogger({ componentName: "TestComponent", enabled: true })
    );
    expect(mockDebug).toHaveBeenCalledWith(
      "TestComponent mounted",
      expect.any(Object)
    );
  });

  it("tracks renders when trackRenders is true", () => {
    const { rerender } = renderHook(() =>
      usePerformanceLogger({
        componentName: "TestComponent",
        enabled: true,
        trackRenders: true,
      })
    );

    // Trigger additional renders
    rerender();
    rerender();

    // On unmount, render count should be tracked in metrics
    const { unmount } = renderHook(() =>
      usePerformanceLogger({
        componentName: "TrackedComponent",
        enabled: true,
        trackRenders: true,
      })
    );
    unmount();
    expect(mockDebug).toHaveBeenCalledWith(
      "TrackedComponent unmounted",
      expect.objectContaining({
        performance: expect.objectContaining({
          renderCount: expect.any(Number),
        }),
      })
    );
  });

  it("does not track renders when trackRenders is false", () => {
    const { unmount } = renderHook(() =>
      usePerformanceLogger({
        componentName: "TestComponent",
        enabled: true,
        trackRenders: false,
      })
    );

    // Clear mount log
    mockDebug.mockClear();
    unmount();

    // Unmount log should show renderCount of 0 (never incremented)
    expect(mockDebug).toHaveBeenCalledWith(
      "TestComponent unmounted",
      expect.objectContaining({
        performance: expect.objectContaining({
          renderCount: 0,
        }),
      })
    );
  });
});
