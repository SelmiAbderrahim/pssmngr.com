// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearConsentPreferences,
  getAnalyticsConsent,
  isAnalyticsAllowed,
  setAnalyticsConsent,
  subscribeToConsentChanges,
  updateAnalyticsOptOut,
  withAnalyticsConsent,
  type ConsentPreferences,
} from "@/lib/consent";

const STORAGE_KEY = "pssmngr_consent_preferences";
const DEFAULT_PREFERENCES: ConsentPreferences = {
  analytics: false,
  functional: true,
  hasResponded: false,
};

describe("analytics consent", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(localStorage.getItem).mockReturnValue(null);
    vi.mocked(localStorage.setItem).mockImplementation(() => undefined);
    vi.mocked(localStorage.removeItem).mockImplementation(() => undefined);
  });

  it("defaults to essential storage only", () => {
    expect(getAnalyticsConsent()).toEqual(DEFAULT_PREFERENCES);
    expect(localStorage.getItem).toHaveBeenCalledWith(STORAGE_KEY);
    expect(isAnalyticsAllowed()).toBe(false);
  });

  it("loads a valid stored decision and always keeps functional storage enabled", () => {
    vi.mocked(localStorage.getItem).mockReturnValue(
      JSON.stringify({
        analytics: true,
        functional: false,
        hasResponded: true,
        timestamp: 123,
      }),
    );

    expect(getAnalyticsConsent()).toEqual({
      analytics: true,
      functional: true,
      hasResponded: true,
      timestamp: 123,
    });
    expect(isAnalyticsAllowed()).toBe(true);
  });

  it("rejects invalid or malformed stored preferences", () => {
    vi.mocked(localStorage.getItem).mockReturnValue("not-json");
    expect(getAnalyticsConsent()).toEqual(DEFAULT_PREFERENCES);

    vi.mocked(localStorage.getItem).mockReturnValue(
      JSON.stringify({ analytics: "yes" }),
    );
    expect(getAnalyticsConsent()).toEqual(DEFAULT_PREFERENCES);
  });

  it("stores a completed decision and publishes a change event", () => {
    const listener = vi.fn();
    window.addEventListener("consent-change", listener);

    setAnalyticsConsent({
      analytics: true,
      functional: false,
      hasResponded: false,
    });

    expect(localStorage.setItem).toHaveBeenCalledOnce();
    const [key, raw] = vi.mocked(localStorage.setItem).mock.calls[0]!;
    const stored = JSON.parse(raw) as ConsentPreferences;
    expect(key).toBe(STORAGE_KEY);
    expect(stored).toMatchObject({
      analytics: true,
      functional: true,
      hasResponded: true,
    });
    expect(stored.timestamp).toEqual(expect.any(Number));
    expect(listener).toHaveBeenCalledOnce();

    window.removeEventListener("consent-change", listener);
  });

  it("does not throw or publish when storage is unavailable", () => {
    const listener = vi.fn();
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    window.addEventListener("consent-change", listener);
    vi.mocked(localStorage.setItem).mockImplementation(() => {
      throw new Error("storage unavailable");
    });

    expect(() =>
      setAnalyticsConsent({ analytics: true, functional: true }),
    ).not.toThrow();
    expect(listener).not.toHaveBeenCalled();

    window.removeEventListener("consent-change", listener);
    consoleSpy.mockRestore();
  });

  it("clears the stored decision", () => {
    clearConsentPreferences();
    expect(localStorage.removeItem).toHaveBeenCalledWith(STORAGE_KEY);
  });

  it("updates the analytics opt-out state", () => {
    vi.mocked(localStorage.getItem).mockReturnValue(
      JSON.stringify({
        analytics: true,
        functional: true,
        hasResponded: true,
      }),
    );

    updateAnalyticsOptOut(true);
    const stored = JSON.parse(
      vi.mocked(localStorage.setItem).mock.calls[0]![1],
    ) as ConsentPreferences;
    expect(stored.analytics).toBe(false);
  });

  it("runs consent-aware callbacks only after analytics approval", () => {
    const callback = vi.fn();
    const run = withAnalyticsConsent();
    run(callback);
    expect(callback).not.toHaveBeenCalled();

    vi.mocked(localStorage.getItem).mockReturnValue(
      JSON.stringify({
        analytics: true,
        functional: true,
        hasResponded: true,
      }),
    );
    run(callback);
    expect(callback).toHaveBeenCalledOnce();
  });

  it("subscribes and unsubscribes from consent changes", () => {
    const callback = vi.fn();
    const unsubscribe = subscribeToConsentChanges(callback);
    const detail: ConsentPreferences = {
      analytics: true,
      functional: true,
      hasResponded: true,
    };

    window.dispatchEvent(new CustomEvent("consent-change", { detail }));
    expect(callback).toHaveBeenCalledWith(detail);

    unsubscribe();
    window.dispatchEvent(new CustomEvent("consent-change", { detail }));
    expect(callback).toHaveBeenCalledOnce();
  });
});
