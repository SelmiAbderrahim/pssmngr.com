// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAnalyticsConsent } from "../useAnalyticsConsent";

const STORAGE_KEY = "pssmngr_consent_preferences";

describe("useAnalyticsConsent", () => {
  beforeEach(() => {
    vi.mocked(localStorage.getItem).mockReturnValue(null);
    vi.mocked(localStorage.setItem).mockClear();
  });

  it("starts with privacy-preserving defaults", () => {
    const { result } = renderHook(() => useAnalyticsConsent());
    expect(result.current.preferences).toEqual({
      analytics: false,
      functional: true,
      hasResponded: false,
    });
    expect(result.current.isLoading).toBe(false);
  });

  it("reads an existing decision", () => {
    vi.mocked(localStorage.getItem).mockReturnValue(
      JSON.stringify({
        analytics: true,
        functional: true,
        hasResponded: true,
      }),
    );
    const { result } = renderHook(() => useAnalyticsConsent());
    expect(result.current.preferences.analytics).toBe(true);
  });

  it("persists updates through the canonical consent store", () => {
    const { result } = renderHook(() => useAnalyticsConsent());
    act(() => result.current.updateConsent({ analytics: true }));

    expect(localStorage.setItem).toHaveBeenCalledWith(
      STORAGE_KEY,
      expect.any(String),
    );
    expect(result.current.preferences).toMatchObject({
      analytics: true,
      functional: true,
      hasResponded: true,
    });
  });

  it("synchronizes consent events in the current tab", () => {
    const { result } = renderHook(() => useAnalyticsConsent());
    const detail = {
      analytics: true,
      functional: true,
      hasResponded: true,
    };

    act(() => {
      window.dispatchEvent(new CustomEvent("consent-change", { detail }));
    });
    expect(result.current.preferences).toEqual(detail);
  });

  it("reloads consent after another tab changes storage", () => {
    const { result } = renderHook(() => useAnalyticsConsent());
    vi.mocked(localStorage.getItem).mockReturnValue(
      JSON.stringify({
        analytics: true,
        functional: true,
        hasResponded: true,
      }),
    );

    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: STORAGE_KEY,
          newValue: "updated",
        }),
      );
    });
    expect(result.current.preferences.analytics).toBe(true);
  });
});
