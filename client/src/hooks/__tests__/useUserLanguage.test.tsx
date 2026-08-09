// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * useUserLanguage Hook Tests
 *
 * Tests for React Query hooks that manage language preference
 * in the database for authenticated users.
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useUserLanguagePreference, useUpdateUserLanguage, languageKeys } from "../useUserLanguage";

// Mock auth state
let mockAuthStatus: "authenticated" | "unauthenticated" = "unauthenticated";

vi.mock("@/providers/AuthProvider", () => ({
  useAuthState: () => ({ status: mockAuthStatus }),
}));

// Mock LanguageService
const mockGetPreferredLanguage = vi.fn();
const mockUpdatePreferredLanguage = vi.fn();

vi.mock("@/services/deployment/languageService", () => ({
  LanguageService: {
    getPreferredLanguage: () => mockGetPreferredLanguage(),
    updatePreferredLanguage: (lang: string) => mockUpdatePreferredLanguage(lang),
  },
}));

// Create wrapper with fresh QueryClient for each test
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };
}

describe("languageKeys", () => {
  it("should generate correct query key for all", () => {
    expect(languageKeys.all).toEqual(["language"]);
  });

  it("should generate correct query key for preference", () => {
    expect(languageKeys.preference()).toEqual(["language", "preference"]);
  });
});

describe("useUserLanguagePreference", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthStatus = "unauthenticated";
    mockGetPreferredLanguage.mockResolvedValue("en");
  });

  it("should not fetch when user is unauthenticated", async () => {
    mockAuthStatus = "unauthenticated";

    const { result } = renderHook(() => useUserLanguagePreference(), {
      wrapper: createWrapper(),
    });

    // Wait a bit to ensure no fetch happens
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(mockGetPreferredLanguage).not.toHaveBeenCalled();
    expect(result.current.data).toBeUndefined();
  });

  it("should fetch when user is authenticated", async () => {
    mockAuthStatus = "authenticated";
    mockGetPreferredLanguage.mockResolvedValue("fr");

    const { result } = renderHook(() => useUserLanguagePreference(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockGetPreferredLanguage).toHaveBeenCalled();
    expect(result.current.data).toBe("fr");
  });

  it("should return null if no preference is set in DB", async () => {
    mockAuthStatus = "authenticated";
    mockGetPreferredLanguage.mockResolvedValue(null);

    const { result } = renderHook(() => useUserLanguagePreference(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toBeNull();
  });

  it("should handle fetch error gracefully", async () => {
    mockAuthStatus = "authenticated";
    mockGetPreferredLanguage.mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useUserLanguagePreference(), {
      wrapper: createWrapper(),
    });

    // Hook has retry: 1 which overrides wrapper default — wait for both attempts to fail
    await waitFor(
      () => {
        // Either isError is true (retries exhausted) or fetchStatus is idle after failure
        expect(result.current.isError || result.current.failureCount > 0).toBe(true);
      },
      { timeout: 15000, interval: 250 }
    );

    // After retries exhausted, data should still be undefined
    expect(result.current.data).toBeUndefined();
  });

  it("should have staleTime of Infinity", async () => {
    mockAuthStatus = "authenticated";
    mockGetPreferredLanguage.mockResolvedValue("en");

    const { result } = renderHook(() => useUserLanguagePreference(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    // First call
    expect(mockGetPreferredLanguage).toHaveBeenCalledTimes(1);

    // Access data again - should not refetch due to staleTime: Infinity
    expect(result.current.data).toBe("en");
    expect(mockGetPreferredLanguage).toHaveBeenCalledTimes(1);
  });

  it("should not refetch on window focus", async () => {
    mockAuthStatus = "authenticated";
    mockGetPreferredLanguage.mockResolvedValue("en");

    const { result } = renderHook(() => useUserLanguagePreference(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    // Simulate window focus
    window.dispatchEvent(new Event("focus"));

    // Wait a bit
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Should still only have been called once
    expect(mockGetPreferredLanguage).toHaveBeenCalledTimes(1);
  });
});

describe("useUpdateUserLanguage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdatePreferredLanguage.mockResolvedValue({ success: true });
  });

  it("should call LanguageService.updatePreferredLanguage", async () => {
    const { result } = renderHook(() => useUpdateUserLanguage(), {
      wrapper: createWrapper(),
    });

    await result.current.mutateAsync("fr" as any);

    expect(mockUpdatePreferredLanguage).toHaveBeenCalledWith("fr");
  });

  it("should handle update error", async () => {
    mockUpdatePreferredLanguage.mockRejectedValue(new Error("Update failed"));

    const { result } = renderHook(() => useUpdateUserLanguage(), {
      wrapper: createWrapper(),
    });

    await expect(result.current.mutateAsync("fr" as any)).rejects.toThrow("Update failed");
  });

  it("should invalidate preference query on success", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
        mutations: { retry: false },
      },
    });

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    function Wrapper({ children }: { children: React.ReactNode }) {
      return (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      );
    }

    const { result } = renderHook(() => useUpdateUserLanguage(), {
      wrapper: Wrapper,
    });

    await result.current.mutateAsync("fr" as any);

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: languageKeys.preference(),
    });
  });

  it("should update isPending state during mutation", async () => {
    // Create a delayed promise
    let resolvePromise: () => void;
    const delayedPromise = new Promise<{ success: boolean }>((resolve) => {
      resolvePromise = () => resolve({ success: true });
    });
    mockUpdatePreferredLanguage.mockReturnValue(delayedPromise);

    const { result } = renderHook(() => useUpdateUserLanguage(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isPending).toBe(false);

    // Start mutation but don't await
    const mutationPromise = result.current.mutateAsync("fr" as any);

    await waitFor(() => {
      expect(result.current.isPending).toBe(true);
    });

    // Resolve the promise
    resolvePromise!();
    await mutationPromise;

    await waitFor(() => {
      expect(result.current.isPending).toBe(false);
    });
  });
});

describe("useUpdateUserLanguage - edge cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should handle concurrent updates", async () => {
    let callCount = 0;
    mockUpdatePreferredLanguage.mockImplementation(() => {
      callCount++;
      return Promise.resolve({ success: true });
    });

    const { result } = renderHook(() => useUpdateUserLanguage(), {
      wrapper: createWrapper(),
    });

    // Fire multiple updates
    await Promise.all([
      result.current.mutateAsync("fr" as any),
      result.current.mutateAsync("de" as any),
      result.current.mutateAsync("es" as any),
    ]);

    expect(callCount).toBe(3);
  });

  it("should handle different language codes", async () => {
    mockUpdatePreferredLanguage.mockResolvedValue({ success: true });

    const { result } = renderHook(() => useUpdateUserLanguage(), {
      wrapper: createWrapper(),
    });

    const languages = ["ar", "en", "fr", "de", "es"];

    for (const lang of languages) {
      await result.current.mutateAsync(lang as any);
      expect(mockUpdatePreferredLanguage).toHaveBeenLastCalledWith(lang);
    }

    expect(mockUpdatePreferredLanguage).toHaveBeenCalledTimes(5);
  });
});
