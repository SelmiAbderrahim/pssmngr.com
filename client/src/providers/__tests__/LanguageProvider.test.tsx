// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * LanguageProvider Unit Tests
 *
 * Tests for language state management and synchronization between
 * i18next, localStorage, and database.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LanguageProvider, useLanguage } from "../LanguageProvider";

// Mock dependencies
const mockChangeLanguage = vi.fn();
const mockI18n = {
  language: "en",
  changeLanguage: mockChangeLanguage,
};

const mockMutateAsync = vi.fn();
const mockAuthState = { status: "unauthenticated" as const };

// Mock react-i18next
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: mockI18n,
    t: (key: string, fallback?: string) => fallback || key,
  }),
}));

// Mock auth provider
vi.mock("@/providers/AuthProvider", () => ({
  useAuthState: () => mockAuthState,
}));

// Mock useUserLanguage hook — use vi.fn() so individual tests can override with mockReturnValueOnce
const mockUseUserLanguagePreference = vi.fn(() => ({
  data: null as string | null,
  isLoading: false,
  isFetched: true,
}));

vi.mock("@/hooks/useUserLanguage", () => ({
  useUserLanguagePreference: () => mockUseUserLanguagePreference(),
  useUpdateUserLanguage: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
  }),
}));

// Mock i18n module
vi.mock("@/i18n", () => ({
  languages: {
    ar: { name: "\u{627}\u{644}\u{639}\u{631}\u{628}\u{64A}\u{629}", dir: "rtl", flag: "\u{1F1F8}\u{1F1E6}" },
    en: { name: "English", dir: "ltr", flag: "\u{1F1FA}\u{1F1F8}" },
    fr: { name: "Fran\u{E7}ais", dir: "ltr", flag: "\u{1F1EB}\u{1F1F7}" },
    de: { name: "Deutsch", dir: "ltr", flag: "\u{1F1E9}\u{1F1EA}" },
    es: { name: "Espa\u{F1}ol", dir: "ltr", flag: "\u{1F1EA}\u{1F1F8}" },
  },
  supportedLangs: ["ar", "en", "fr", "de", "es"],
}));

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
  },
}));

// Test component to consume the context
function TestConsumer() {
  const {
    language,
    languageInfo,
    isRTL,
    changeLanguage,
    supportedLanguages,
    isSaving,
    isLoading,
  } = useLanguage();

  return (
    <div>
      <span data-testid="language">{language}</span>
      <span data-testid="language-name">{languageInfo.name}</span>
      <span data-testid="is-rtl">{isRTL.toString()}</span>
      <span data-testid="is-saving">{isSaving.toString()}</span>
      <span data-testid="is-loading">{isLoading.toString()}</span>
      <span data-testid="supported-count">{supportedLanguages.length}</span>
      <button
        data-testid="change-to-fr"
        onClick={() => changeLanguage("fr" as any)}
      >
        Change to French
      </button>
      <button
        data-testid="change-to-ar"
        onClick={() => changeLanguage("ar" as any)}
      >
        Change to Arabic
      </button>
    </div>
  );
}

describe("LanguageProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockI18n.language = "en";
    mockChangeLanguage.mockResolvedValue(undefined);
    mockMutateAsync.mockResolvedValue(undefined);
    mockAuthState.status = "unauthenticated";
    mockUseUserLanguagePreference.mockReset();
    mockUseUserLanguagePreference.mockReturnValue({ data: null, isLoading: false, isFetched: true });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("initial state", () => {
    it("should provide language context to children", () => {
      render(
        <LanguageProvider>
          <TestConsumer />
        </LanguageProvider>
      );

      expect(screen.getByTestId("language")).toHaveTextContent("en");
      expect(screen.getByTestId("language-name")).toHaveTextContent("English");
      expect(screen.getByTestId("is-rtl")).toHaveTextContent("false");
    });

    it("should provide list of supported languages", () => {
      render(
        <LanguageProvider>
          <TestConsumer />
        </LanguageProvider>
      );

      expect(screen.getByTestId("supported-count")).toHaveTextContent("5");
    });

    it("should show loading false for unauthenticated users", () => {
      render(
        <LanguageProvider>
          <TestConsumer />
        </LanguageProvider>
      );

      expect(screen.getByTestId("is-loading")).toHaveTextContent("false");
    });
  });

  describe("changeLanguage", () => {
    it("should update i18next when language is changed", async () => {
      const user = userEvent.setup();
      render(
        <LanguageProvider>
          <TestConsumer />
        </LanguageProvider>
      );

      await user.click(screen.getByTestId("change-to-fr"));

      expect(mockChangeLanguage).toHaveBeenCalledWith("fr");
    });

    it("should NOT save to DB when unauthenticated", async () => {
      mockAuthState.status = "unauthenticated";
      const user = userEvent.setup();

      render(
        <LanguageProvider>
          <TestConsumer />
        </LanguageProvider>
      );

      await user.click(screen.getByTestId("change-to-fr"));

      expect(mockChangeLanguage).toHaveBeenCalledWith("fr");
      expect(mockMutateAsync).not.toHaveBeenCalled();
    });

    it("should save to DB when authenticated", async () => {
      mockAuthState.status = "authenticated";
      const user = userEvent.setup();

      render(
        <LanguageProvider>
          <TestConsumer />
        </LanguageProvider>
      );

      await user.click(screen.getByTestId("change-to-fr"));

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledWith("fr");
      });
    });

    it("should reject unsupported language codes", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      function TestInvalidLanguage() {
        const { changeLanguage } = useLanguage();
        return (
          <button onClick={() => changeLanguage("xyz" as any)}>
            Invalid
          </button>
        );
      }

      const user = userEvent.setup();
      render(
        <LanguageProvider>
          <TestInvalidLanguage />
        </LanguageProvider>
      );

      await user.click(screen.getByText("Invalid"));

      expect(consoleErrorSpy).toHaveBeenCalledWith("Unsupported language: xyz");
      expect(mockChangeLanguage).not.toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe("RTL support", () => {
    it("should detect RTL for Arabic language", () => {
      mockI18n.language = "ar";

      render(
        <LanguageProvider>
          <TestConsumer />
        </LanguageProvider>
      );

      expect(screen.getByTestId("is-rtl")).toHaveTextContent("true");
    });

    it("should detect LTR for English language", () => {
      mockI18n.language = "en";

      render(
        <LanguageProvider>
          <TestConsumer />
        </LanguageProvider>
      );

      expect(screen.getByTestId("is-rtl")).toHaveTextContent("false");
    });
  });

  describe("error handling", () => {
    it("should show toast error if DB save fails", async () => {
      const { toast } = await import("sonner");
      mockAuthState.status = "authenticated";
      mockMutateAsync.mockRejectedValue(new Error("DB error"));

      const user = userEvent.setup();
      render(
        <LanguageProvider>
          <TestConsumer />
        </LanguageProvider>
      );

      await user.click(screen.getByTestId("change-to-fr"));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalled();
      });
    });

    it("should not revert language if DB save fails", async () => {
      mockAuthState.status = "authenticated";
      mockMutateAsync.mockRejectedValue(new Error("DB error"));

      const user = userEvent.setup();
      render(
        <LanguageProvider>
          <TestConsumer />
        </LanguageProvider>
      );

      await user.click(screen.getByTestId("change-to-fr"));

      // Language should still have been changed via i18next
      await waitFor(() => {
        expect(mockChangeLanguage).toHaveBeenCalledWith("fr");
      });
    });
  });

  describe("context error handling", () => {
    it("should throw error when useLanguage is used outside provider", () => {
      // Suppress console.error for this test
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      expect(() => {
        render(<TestConsumer />);
      }).toThrow("useLanguage must be used within LanguageProvider");

      consoleSpy.mockRestore();
    });
  });
});

describe("LanguageProvider - DB synchronization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockI18n.language = "en";
    mockChangeLanguage.mockResolvedValue(undefined);
    mockAuthState.status = "authenticated";
    mockUseUserLanguagePreference.mockReset();
    mockUseUserLanguagePreference.mockReturnValue({ data: null, isLoading: false, isFetched: true });
    // Reset localStorage mock to default (getItem returns null = no stored preference)
    vi.mocked(localStorage.getItem).mockReturnValue(null);
  });

  it("should provide isSaving state from mutation", () => {
    render(
      <LanguageProvider>
        <TestConsumer />
      </LanguageProvider>
    );

    expect(screen.getByTestId("is-saving")).toHaveTextContent("false");
  });

  it("should apply DB language to i18n when localStorage is empty and DB has a value", async () => {
    // Covers lines 91 + 95-99: storedLang is null → apply dbLanguage to i18n and localStorage
    // localStorage is a vi.fn() stub — getItem returns undefined by default (simulates empty)
    vi.mocked(localStorage.getItem).mockReturnValue(null);

    mockUseUserLanguagePreference.mockReturnValue({
      data: "fr",
      isLoading: false,
      isFetched: true,
    });

    render(
      <LanguageProvider>
        <div data-testid="child">child</div>
      </LanguageProvider>
    );

    await waitFor(() => {
      expect(mockChangeLanguage).toHaveBeenCalledWith("fr");
    });

    // Should also have written the DB language back to localStorage (line 97)
    expect(localStorage.setItem).toHaveBeenCalledWith("i18nextLng", "fr");
  });

  it("should NOT apply DB language when localStorage already has a stored value", async () => {
    // Covers line 94: storedLang truthy → !storedLang is false → block skipped
    // localStorage stub returns "en" to simulate an existing user preference
    vi.mocked(localStorage.getItem).mockReturnValue("en");

    mockUseUserLanguagePreference.mockReturnValue({
      data: "de",
      isLoading: false,
      isFetched: true,
    });

    render(
      <LanguageProvider>
        <div data-testid="child">child</div>
      </LanguageProvider>
    );

    await act(async () => {});

    // changeLanguage must NOT be called since storedLang ("en") is already set
    expect(mockChangeLanguage).not.toHaveBeenCalled();
  });

  it("should not apply DB language when dbLanguage is null/undefined", async () => {
    // Covers line 94: dbLanguage is falsy → block not entered
    vi.mocked(localStorage.getItem).mockReturnValue(null);
    mockUseUserLanguagePreference.mockReturnValue({
      data: null,
      isLoading: false,
      isFetched: true,
    });

    render(
      <LanguageProvider>
        <div data-testid="child">child</div>
      </LanguageProvider>
    );

    await act(async () => {});
    expect(mockChangeLanguage).not.toHaveBeenCalled();
  });

  it("should not apply DB language when dbLanguage is an unsupported language code", async () => {
    // Covers line 94: supportedLangs.includes(dbLanguage) is false → block not entered
    vi.mocked(localStorage.getItem).mockReturnValue(null);
    mockUseUserLanguagePreference.mockReturnValue({
      data: "xx", // unsupported language
      isLoading: false,
      isFetched: true,
    });

    render(
      <LanguageProvider>
        <div data-testid="child">child</div>
      </LanguageProvider>
    );

    await act(async () => {});
    expect(mockChangeLanguage).not.toHaveBeenCalled();
  });

  it("should reset hasAppliedDbPreference when user logs out", async () => {
    // Covers line 106-108: !isAuthenticated → setHasAppliedDbPreference(false)
    mockAuthState.status = "authenticated";

    const { rerender } = render(
      <LanguageProvider>
        <TestConsumer />
      </LanguageProvider>
    );

    // Simulate logout
    mockAuthState.status = "unauthenticated";
    rerender(
      <LanguageProvider>
        <TestConsumer />
      </LanguageProvider>
    );

    // isLoading should reflect unauthenticated state (false)
    expect(screen.getByTestId("is-loading")).toHaveTextContent("false");
  });
});

describe("LanguageProvider - cross-tab sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockI18n.language = "en";
    mockUseUserLanguagePreference.mockReset();
    mockUseUserLanguagePreference.mockReturnValue({ data: null, isLoading: false, isFetched: true });
  });

  it("should add storage event listener on mount", () => {
    const addEventListenerSpy = vi.spyOn(window, "addEventListener");

    render(
      <LanguageProvider>
        <TestConsumer />
      </LanguageProvider>
    );

    expect(addEventListenerSpy).toHaveBeenCalledWith(
      "storage",
      expect.any(Function)
    );

    addEventListenerSpy.mockRestore();
  });

  it("should remove storage event listener on unmount", () => {
    const removeEventListenerSpy = vi.spyOn(window, "removeEventListener");

    const { unmount } = render(
      <LanguageProvider>
        <TestConsumer />
      </LanguageProvider>
    );

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      "storage",
      expect.any(Function)
    );

    removeEventListenerSpy.mockRestore();
  });

  it("should sync language when storage event fires with i18nextLng key", async () => {
    render(
      <LanguageProvider>
        <TestConsumer />
      </LanguageProvider>
    );

    // Simulate storage event from another tab
    const storageEvent = new StorageEvent("storage", {
      key: "i18nextLng",
      newValue: "fr",
    });

    await act(async () => {
      window.dispatchEvent(storageEvent);
    });

    await waitFor(() => {
      expect(mockChangeLanguage).toHaveBeenCalledWith("fr");
    });
  });

  it("should ignore storage events for other keys", async () => {
    render(
      <LanguageProvider>
        <TestConsumer />
      </LanguageProvider>
    );

    const storageEvent = new StorageEvent("storage", {
      key: "other-key",
      newValue: "fr",
    });

    await act(async () => {
      window.dispatchEvent(storageEvent);
    });

    expect(mockChangeLanguage).not.toHaveBeenCalled();
  });

  it("should ignore storage events with invalid language codes", async () => {
    render(
      <LanguageProvider>
        <TestConsumer />
      </LanguageProvider>
    );

    const storageEvent = new StorageEvent("storage", {
      key: "i18nextLng",
      newValue: "invalid",
    });

    await act(async () => {
      window.dispatchEvent(storageEvent);
    });

    expect(mockChangeLanguage).not.toHaveBeenCalled();
  });

  it("should ignore storage events when new value is same as current", async () => {
    mockI18n.language = "en";

    render(
      <LanguageProvider>
        <TestConsumer />
      </LanguageProvider>
    );

    const storageEvent = new StorageEvent("storage", {
      key: "i18nextLng",
      newValue: "en",
    });

    await act(async () => {
      window.dispatchEvent(storageEvent);
    });

    expect(mockChangeLanguage).not.toHaveBeenCalled();
  });
});
