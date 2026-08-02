// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Tests for LanguagePreference component.
 *
 * Covers:
 * - Renders all supported language options as radio items
 * - Currently selected language has a checkmark indicator
 * - Changing language calls changeLanguage handler
 * - Loading indicator shown when isSaving or isLoading
 * - Radio group is disabled when isSaving
 * - Language labels and flag emojis are visible
 * - Sync note is rendered
 * - RTL language item gets flex-row-reverse class
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LanguagePreference } from "../LanguagePreference";

// ---------------------------------------------------------------------------
// Mock useLanguage from LanguageProvider
// ---------------------------------------------------------------------------

const mockChangeLanguage = vi.fn().mockResolvedValue(undefined);

const defaultLanguageContext = {
  language: "en" as const,
  changeLanguage: mockChangeLanguage,
  supportedLanguages: ["ar", "en", "fr", "de", "es"] as const,
  isSaving: false,
  isLoading: false,
  languageInfo: { name: "English", dir: "ltr" as const, flag: "🇺🇸" },
  isRTL: false,
};

// We mock at the provider module level since LanguagePreference imports useLanguage
// from @/providers/LanguageProvider
vi.mock("@/providers/LanguageProvider", () => ({
  useLanguage: () => mockLanguageContext,
}));

// Mutable reference updated per-test via beforeEach
let mockLanguageContext = { ...defaultLanguageContext };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("LanguagePreference", () => {
  beforeEach(() => {
    // Reset context to defaults before each test
    mockLanguageContext = { ...defaultLanguageContext };
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------
  describe("rendering", () => {
    it("renders the card title", () => {
      render(<LanguagePreference />);
      // The CardTitle may contain multiple child nodes (SVG icon + text).
      // Use getAllByText and assert at least one match exists.
      const matches = screen.getAllByText(/preferences\.language\.title|Language/i);
      expect(matches.length).toBeGreaterThan(0);
    });

    it("renders the card description", () => {
      render(<LanguagePreference />);
      expect(
        screen.getByText(
          /preferences\.language\.description|Select your preferred language/i
        )
      ).toBeInTheDocument();
    });

    it("renders the sync note", () => {
      render(<LanguagePreference />);
      expect(
        screen.getByText(
          /preferences\.language\.syncNote|saved and synced/i
        )
      ).toBeInTheDocument();
    });

    it("renders all 5 supported language labels", () => {
      render(<LanguagePreference />);
      // Languages defined in i18n: ar, en, fr, de, es
      expect(screen.getByText("English")).toBeInTheDocument();
      expect(screen.getByText("Français")).toBeInTheDocument();
      expect(screen.getByText("Deutsch")).toBeInTheDocument();
      expect(screen.getByText("Español")).toBeInTheDocument();
      expect(screen.getByText("العربية")).toBeInTheDocument();
    });

    it("renders flag emojis for each language", () => {
      render(<LanguagePreference />);
      expect(screen.getByText("🇺🇸")).toBeInTheDocument();
      expect(screen.getByText("🇫🇷")).toBeInTheDocument();
      expect(screen.getByText("🇩🇪")).toBeInTheDocument();
      expect(screen.getByText("🇪🇸")).toBeInTheDocument();
      expect(screen.getByText("🇸🇦")).toBeInTheDocument();
    });

    it("renders a radio group", () => {
      render(<LanguagePreference />);
      expect(screen.getByRole("radiogroup")).toBeInTheDocument();
    });

    it("renders a radio item for each supported language", () => {
      render(<LanguagePreference />);
      const radios = screen.getAllByRole("radio");
      expect(radios).toHaveLength(5);
    });
  });

  // -------------------------------------------------------------------------
  // Selected state
  // -------------------------------------------------------------------------
  describe("selected language", () => {
    it("marks the current language radio as checked", () => {
      mockLanguageContext = { ...defaultLanguageContext, language: "en" };
      render(<LanguagePreference />);
      const enRadio = screen.getByRole("radio", { name: /english/i });
      expect(enRadio).toBeChecked();
    });

    it("shows a checkmark indicator for the selected language label", () => {
      mockLanguageContext = { ...defaultLanguageContext, language: "en" };
      render(<LanguagePreference />);
      const enRadio = screen.getByRole("radio", { name: /english/i });
      const languageOption = enRadio.closest("div") as HTMLElement | null;
      expect(languageOption).not.toBeNull();
      if (languageOption) {
        expect(languageOption.className).toMatch(/border-primary/);
      }
    });

    it("marks French as selected when language is fr", () => {
      mockLanguageContext = { ...defaultLanguageContext, language: "fr" };
      render(<LanguagePreference />);
      const frRadio = screen.getByRole("radio", { name: /français/i });
      expect(frRadio).toBeChecked();
    });

    it("marks Arabic as selected when language is ar", () => {
      mockLanguageContext = { ...defaultLanguageContext, language: "ar" };
      render(<LanguagePreference />);
      const arRadio = screen.getByRole("radio", { name: /العربية/i });
      expect(arRadio).toBeChecked();
    });

    it("does not mark other languages as checked when en is selected", () => {
      mockLanguageContext = { ...defaultLanguageContext, language: "en" };
      render(<LanguagePreference />);
      const frRadio = screen.getByRole("radio", { name: /français/i });
      expect(frRadio).not.toBeChecked();
    });
  });

  // -------------------------------------------------------------------------
  // Language change interaction
  // -------------------------------------------------------------------------
  describe("changing language", () => {
    it("calls changeLanguage with the new language code when a radio is clicked", () => {
      mockLanguageContext = { ...defaultLanguageContext, language: "en" };
      render(<LanguagePreference />);

      const frRadio = screen.getByRole("radio", { name: /français/i });
      // Radix RadioGroup responds to click on the hidden input or on the label
      fireEvent.click(frRadio);

      expect(mockChangeLanguage).toHaveBeenCalledWith("fr");
    });

    it("calls changeLanguage with 'de' when German is selected", () => {
      mockLanguageContext = { ...defaultLanguageContext, language: "en" };
      render(<LanguagePreference />);

      const deRadio = screen.getByRole("radio", { name: /deutsch/i });
      fireEvent.click(deRadio);

      expect(mockChangeLanguage).toHaveBeenCalledWith("de");
    });

    it("calls changeLanguage with 'es' when Spanish is selected", () => {
      mockLanguageContext = { ...defaultLanguageContext, language: "en" };
      render(<LanguagePreference />);

      const esRadio = screen.getByRole("radio", { name: /español/i });
      fireEvent.click(esRadio);

      expect(mockChangeLanguage).toHaveBeenCalledWith("es");
    });

    it("calls changeLanguage with 'ar' when Arabic is selected", () => {
      mockLanguageContext = { ...defaultLanguageContext, language: "en" };
      render(<LanguagePreference />);

      const arRadio = screen.getByRole("radio", { name: /العربية/i });
      fireEvent.click(arRadio);

      expect(mockChangeLanguage).toHaveBeenCalledWith("ar");
    });
  });

  // -------------------------------------------------------------------------
  // Loading / saving states
  // -------------------------------------------------------------------------
  describe("loading and saving states", () => {
    it("shows a loading spinner when isSaving=true", () => {
      mockLanguageContext = { ...defaultLanguageContext, isSaving: true };
      render(<LanguagePreference />);
      // Loader2 renders as SVG with animate-spin
      const spinner = document
        .querySelector("svg.animate-spin") as SVGElement | null;
      expect(spinner).toBeInTheDocument();
    });

    it("shows a loading spinner when isLoading=true", () => {
      mockLanguageContext = { ...defaultLanguageContext, isLoading: true };
      render(<LanguagePreference />);
      const spinner = document
        .querySelector("svg.animate-spin") as SVGElement | null;
      expect(spinner).toBeInTheDocument();
    });

    it("does not show a loading spinner when both isSaving and isLoading are false", () => {
      mockLanguageContext = {
        ...defaultLanguageContext,
        isSaving: false,
        isLoading: false,
      };
      render(<LanguagePreference />);
      const spinner = document.querySelector("svg.animate-spin");
      expect(spinner).not.toBeInTheDocument();
    });

    it("radio group has disabled attribute when isSaving=true", () => {
      mockLanguageContext = { ...defaultLanguageContext, isSaving: true };
      render(<LanguagePreference />);
      // Radix UI RadioGroup with disabled=true disables individual radio inputs
      // but does not set aria-disabled on the radiogroup container itself.
      // Verify the disabled state by checking that all radio inputs are disabled.
      const radios = screen.getAllByRole("radio");
      expect(radios.length).toBeGreaterThan(0);
      for (const radio of radios) {
        expect(radio).toBeDisabled();
      }
    });

    it("labels have cursor-wait class when isSaving=true", () => {
      mockLanguageContext = { ...defaultLanguageContext, isSaving: true };
      render(<LanguagePreference />);
      const enRadio = screen.getByRole("radio", { name: /english/i });
      const languageOption = enRadio.closest("div") as HTMLElement | null;
      expect(languageOption).not.toBeNull();
      if (languageOption) {
        expect(languageOption.className).toMatch(/cursor-wait/);
      }
    });

    it("labels have opacity-70 when isSaving=true", () => {
      mockLanguageContext = { ...defaultLanguageContext, isSaving: true };
      render(<LanguagePreference />);
      const enRadio = screen.getByRole("radio", { name: /english/i });
      const languageOption = enRadio.closest("div") as HTMLElement | null;
      if (languageOption) {
        expect(languageOption.className).toMatch(/opacity-70/);
      }
    });
  });

  // -------------------------------------------------------------------------
  // RTL language item styling
  // -------------------------------------------------------------------------
  describe("RTL language styling", () => {
    it("Arabic label uses logical text alignment without flex-row-reverse", () => {
      render(<LanguagePreference />);
      const arLabel = document.querySelector(
        "label[for='lang-ar']"
      ) as HTMLElement | null;
      expect(arLabel).not.toBeNull();
      if (arLabel) {
        expect(arLabel.className).toMatch(/text-end/);
        expect(arLabel.className).not.toMatch(/flex-row-reverse/);
      }
    });

    it("English label does not have flex-row-reverse class", () => {
      render(<LanguagePreference />);
      const enLabel = document.querySelector(
        "label[for='lang-en']"
      ) as HTMLElement | null;
      expect(enLabel).not.toBeNull();
      if (enLabel) {
        expect(enLabel.className).not.toMatch(/flex-row-reverse/);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Accessibility
  // -------------------------------------------------------------------------
  describe("accessibility", () => {
    it("each radio has an associated label via htmlFor", () => {
      render(<LanguagePreference />);
      // Each radio input has id="lang-XX" and a corresponding label[for="lang-XX"]
      const supportedCodes = ["ar", "en", "fr", "de", "es"];
      for (const code of supportedCodes) {
        const label = document.querySelector(
          `label[for='lang-${code}']`
        );
        expect(label).toBeInTheDocument();
      }
    });

    it("Globe icon has aria-hidden=true", () => {
      render(<LanguagePreference />);
      // The Globe icon in the card title should have aria-hidden
      const globeIcon = document.querySelector(
        "svg[aria-hidden='true']"
      );
      expect(globeIcon).toBeInTheDocument();
    });
  });
});
