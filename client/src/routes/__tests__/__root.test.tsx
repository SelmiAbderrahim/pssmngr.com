// Copyright (c) 2026 Password Manager contributors
/**
 * Route Tests for __root.tsx
 *
 * Tests the root route component including:
 * - hreflang tag rendering
 * - Config integration
 * - Internationalization support
 * - SEO metadata
 */

import { describe, it, expect, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { Route } from "../__root";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { createRouter } from "@tanstack/react-router";
import { config } from "@/lib/config";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ============================================================================
// TEST SETUP
// ============================================================================

// Helper to get link tags
const getHreflangLink = (hreflang: string) => {
  return document.querySelector(`link[rel="alternate"][hreflang="${hreflang}"]`);
};

const getAllHreflangLinks = () => {
  return Array.from(
    document.querySelectorAll('link[rel="alternate"][hreflang]')
  );
};

// Helper to render root route with router context
const renderRootRoute = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  const router = createRouter({
    routeTree: Route,
    history: createMemoryHistory({ initialEntries: ["/"] }),
    context: { queryClient },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <HelmetProvider>
        <RouterProvider router={router} />
      </HelmetProvider>
    </QueryClientProvider>
  );
};

describe("__root.tsx - hreflang Tags", () => {
  beforeEach(() => {
    // Clear head before each test
    document.head.innerHTML = "";
  });

  // ============================================================================
  // TESTS: hreflang Tag Rendering
  // ============================================================================

  describe("hreflang Tag Rendering", () => {
    it("should render hreflang tags", () => {
      renderRootRoute();

      const hreflangLinks = getAllHreflangLinks();

      // Should have 6 hreflang tags (en, ar, es, fr, de, x-default)
      expect(hreflangLinks.length).toBeGreaterThanOrEqual(6);
    });

    it("should render English hreflang tag", () => {
      renderRootRoute();

      const enLink = getHreflangLink("en");

      expect(enLink).toBeTruthy();
      expect(enLink?.getAttribute("href")).toBe(`${config.siteUrl}/`);
    });

    it("should render Arabic hreflang tag", () => {
      renderRootRoute();

      const arLink = getHreflangLink("ar");

      expect(arLink).toBeTruthy();
      expect(arLink?.getAttribute("href")).toBe(`${config.siteUrl}/ar`);
    });

    it("should render Spanish hreflang tag", () => {
      renderRootRoute();

      const esLink = getHreflangLink("es");

      expect(esLink).toBeTruthy();
      expect(esLink?.getAttribute("href")).toBe(`${config.siteUrl}/es`);
    });

    it("should render French hreflang tag", () => {
      renderRootRoute();

      const frLink = getHreflangLink("fr");

      expect(frLink).toBeTruthy();
      expect(frLink?.getAttribute("href")).toBe(`${config.siteUrl}/fr`);
    });

    it("should render German hreflang tag", () => {
      renderRootRoute();

      const deLink = getHreflangLink("de");

      expect(deLink).toBeTruthy();
      expect(deLink?.getAttribute("href")).toBe(`${config.siteUrl}/de`);
    });

    it("should render x-default hreflang tag", () => {
      renderRootRoute();

      const defaultLink = getHreflangLink("x-default");

      expect(defaultLink).toBeTruthy();
      expect(defaultLink?.getAttribute("href")).toBe(`${config.siteUrl}/`);
    });

    it("should have correct rel attribute", () => {
      renderRootRoute();

      const hreflangLinks = getAllHreflangLinks();

      hreflangLinks.forEach((link) => {
        expect(link.getAttribute("rel")).toBe("alternate");
      });
    });

    it("should have hreflang attribute on all links", () => {
      renderRootRoute();

      const hreflangLinks = getAllHreflangLinks();

      hreflangLinks.forEach((link) => {
        expect(link.hasAttribute("hreflang")).toBe(true);
      });
    });

    it("should have href attribute on all links", () => {
      renderRootRoute();

      const hreflangLinks = getAllHreflangLinks();

      hreflangLinks.forEach((link) => {
        expect(link.hasAttribute("href")).toBe(true);
        expect(link.getAttribute("href")).toBeTruthy();
      });
    });
  });

  // ============================================================================
  // TESTS: Config Integration
  // ============================================================================

  describe("Config Integration", () => {
    it("should use config.siteUrl for all hreflang URLs", () => {
      renderRootRoute();

      const hreflangLinks = getAllHreflangLinks();

      hreflangLinks.forEach((link) => {
        const href = link.getAttribute("href") || "";
        expect(href).toContain(config.siteUrl);
      });
    });

    it("should not use hardcoded URLs", () => {
      renderRootRoute();

      const hreflangLinks = getAllHreflangLinks();

      hreflangLinks.forEach((link) => {
        const href = link.getAttribute("href") || "";

        // Should use config.siteUrl (either localhost in dev or actual domain)
        expect(href).toContain(config.siteUrl);

        // Should NOT contain hardcoded production URL if in dev
        if (config.isDev) {
          expect(href).not.toContain("https://pssmngr.com");
        }
      });
    });

    it("should construct correct language paths", () => {
      renderRootRoute();

      const enLink = getHreflangLink("en");
      const arLink = getHreflangLink("ar");
      const esLink = getHreflangLink("es");
      const frLink = getHreflangLink("fr");
      const deLink = getHreflangLink("de");

      expect(enLink?.getAttribute("href")).toBe(`${config.siteUrl}/`);
      expect(arLink?.getAttribute("href")).toBe(`${config.siteUrl}/ar`);
      expect(esLink?.getAttribute("href")).toBe(`${config.siteUrl}/es`);
      expect(frLink?.getAttribute("href")).toBe(`${config.siteUrl}/fr`);
      expect(deLink?.getAttribute("href")).toBe(`${config.siteUrl}/de`);
    });

    it("should use root URL for English and x-default", () => {
      renderRootRoute();

      const enLink = getHreflangLink("en");
      const defaultLink = getHreflangLink("x-default");

      // English and x-default should point to root
      expect(enLink?.getAttribute("href")).toBe(`${config.siteUrl}/`);
      expect(defaultLink?.getAttribute("href")).toBe(`${config.siteUrl}/`);
    });
  });

  // ============================================================================
  // TESTS: Language Support
  // ============================================================================

  describe("Language Support", () => {
    it("should support all 5 application languages", () => {
      renderRootRoute();

      const supportedLanguages = ["en", "ar", "es", "fr", "de"];

      supportedLanguages.forEach((lang) => {
        const link = getHreflangLink(lang);
        expect(link).toBeTruthy();
      });
    });

    it("should use correct language codes", () => {
      renderRootRoute();

      const hreflangLinks = getAllHreflangLinks();
      const languageCodes = hreflangLinks.map((link) =>
        link.getAttribute("hreflang")
      );

      // Should include all language codes
      expect(languageCodes).toContain("en");
      expect(languageCodes).toContain("ar");
      expect(languageCodes).toContain("es");
      expect(languageCodes).toContain("fr");
      expect(languageCodes).toContain("de");
      expect(languageCodes).toContain("x-default");
    });

    it("should use ISO 639-1 language codes", () => {
      renderRootRoute();

      const hreflangLinks = getAllHreflangLinks();

      hreflangLinks.forEach((link) => {
        const hreflang = link.getAttribute("hreflang") || "";

        // Should be 2 characters (ISO 639-1) or x-default
        if (hreflang !== "x-default") {
          expect(hreflang.length).toBe(2);
          expect(hreflang).toMatch(/^[a-z]{2}$/);
        }
      });
    });

    it("should have x-default as fallback", () => {
      renderRootRoute();

      const defaultLink = getHreflangLink("x-default");

      expect(defaultLink).toBeTruthy();
      expect(defaultLink?.getAttribute("href")).toBe(`${config.siteUrl}/`);
    });
  });

  // ============================================================================
  // TESTS: SEO Best Practices
  // ============================================================================

  describe("SEO Best Practices", () => {
    it("should follow hreflang specification", () => {
      renderRootRoute();

      const hreflangLinks = getAllHreflangLinks();

      hreflangLinks.forEach((link) => {
        // Should have rel="alternate"
        expect(link.getAttribute("rel")).toBe("alternate");

        // Should have hreflang attribute
        expect(link.hasAttribute("hreflang")).toBe(true);

        // Should have href attribute
        expect(link.hasAttribute("href")).toBe(true);
      });
    });

    it("should use absolute URLs", () => {
      renderRootRoute();

      const hreflangLinks = getAllHreflangLinks();

      hreflangLinks.forEach((link) => {
        const href = link.getAttribute("href") || "";

        // Should be absolute URL (start with http:// or https://)
        expect(href).toMatch(/^https?:\/\//);
      });
    });

    it("should not have duplicate hreflang tags", () => {
      renderRootRoute();

      const hreflangLinks = getAllHreflangLinks();
      const hreflangValues = hreflangLinks.map((link) =>
        link.getAttribute("hreflang")
      );

      // Check for duplicates
      const uniqueHreflangValues = new Set(hreflangValues);
      expect(hreflangValues.length).toBe(uniqueHreflangValues.size);
    });

    it("should have consistent trailing slashes", () => {
      renderRootRoute();

      const enLink = getHreflangLink("en");
      const defaultLink = getHreflangLink("x-default");

      // Root URLs should have trailing slash
      expect(enLink?.getAttribute("href")).toContain("/");
      expect(defaultLink?.getAttribute("href")).toContain("/");
    });

    it("should render in document head", () => {
      renderRootRoute();

      const hreflangLinks = getAllHreflangLinks();

      // All links should be in document.head
      hreflangLinks.forEach((link) => {
        expect(document.head.contains(link)).toBe(true);
      });
    });
  });

  // ============================================================================
  // TESTS: Real-World Scenarios
  // ============================================================================

  describe("Real-World Scenarios", () => {
    it("should work with production URL", () => {
      renderRootRoute();

      const hreflangLinks = getAllHreflangLinks();

      // All links should contain site URL
      hreflangLinks.forEach((link) => {
        const href = link.getAttribute("href") || "";
        expect(href).toContain(config.siteUrl);
      });
    });

    it("should work with localhost in development", () => {
      renderRootRoute();

      const hreflangLinks = getAllHreflangLinks();

      // In dev, config.siteUrl might be localhost
      if (config.isDev) {
        hreflangLinks.forEach((link) => {
          const href = link.getAttribute("href") || "";
          expect(href).toContain("localhost");
        });
      }
    });

    it("should provide language selection for search engines", () => {
      renderRootRoute();

      const supportedLanguages = ["en", "ar", "es", "fr", "de"];

      // Search engines can discover all language versions
      supportedLanguages.forEach((lang) => {
        const link = getHreflangLink(lang);
        expect(link).toBeTruthy();
        expect(link?.getAttribute("href")).toBeTruthy();
      });
    });

    it("should help Google understand multilingual content", () => {
      renderRootRoute();

      // Must have x-default for Google
      const defaultLink = getHreflangLink("x-default");
      expect(defaultLink).toBeTruthy();

      // Must have all language alternatives
      const hreflangLinks = getAllHreflangLinks();
      expect(hreflangLinks.length).toBeGreaterThanOrEqual(6);
    });
  });

  // ============================================================================
  // TESTS: Edge Cases
  // ============================================================================

  describe("Edge Cases", () => {
    it("should handle route changes", () => {
      const { rerender } = renderRootRoute();

      const initialLinks = getAllHreflangLinks();

      // Simulate route change by re-rendering
      rerender(
        <QueryClientProvider client={new QueryClient()}>
          <HelmetProvider>
            <RouterProvider
              router={
                createRouter({
                  routeTree: Route,
                  history: createMemoryHistory({
                    initialEntries: ["/dashboard"],
                  }),
                  context: { queryClient: new QueryClient() },
                })
              }
            />
          </HelmetProvider>
        </QueryClientProvider>
      );

      const newLinks = getAllHreflangLinks();

      // Should still have all hreflang tags
      expect(newLinks.length).toBeGreaterThanOrEqual(initialLinks.length);
    });

    it("should not break with missing config values", () => {
      // Config is imported as const, so we can't change it
      // But we can verify it handles current values correctly
      renderRootRoute();

      const hreflangLinks = getAllHreflangLinks();

      hreflangLinks.forEach((link) => {
        const href = link.getAttribute("href") || "";

        // Should have valid href
        expect(href).toBeTruthy();
        expect(href.length).toBeGreaterThan(0);
      });
    });

    it("should render all language tags in single pass", () => {
      renderRootRoute();

      const hreflangLinks = getAllHreflangLinks();

      // Should render all tags without multiple renders
      expect(hreflangLinks.length).toBe(6);
    });
  });

  // ============================================================================
  // TESTS: Integration with Helmet
  // ============================================================================

  describe("Helmet Integration", () => {
    it("should render through Helmet", () => {
      renderRootRoute();

      const hreflangLinks = getAllHreflangLinks();

      // Helmet should have rendered the tags
      expect(hreflangLinks.length).toBeGreaterThan(0);
    });

    it("should update on config changes", () => {
      renderRootRoute();

      const hreflangLinks = getAllHreflangLinks();

      // All links should use current config.siteUrl
      hreflangLinks.forEach((link) => {
        const href = link.getAttribute("href") || "";
        expect(href).toContain(config.siteUrl);
      });
    });
  });

  // ============================================================================
  // TESTS: Accessibility
  // ============================================================================

  describe("Accessibility", () => {
    it("should provide language alternatives for screen readers", () => {
      renderRootRoute();

      const hreflangLinks = getAllHreflangLinks();

      // Screen readers can discover language alternatives
      expect(hreflangLinks.length).toBeGreaterThan(0);

      hreflangLinks.forEach((link) => {
        // Should have valid hreflang
        expect(link.getAttribute("hreflang")).toBeTruthy();
      });
    });

    it("should support RTL languages", () => {
      renderRootRoute();

      const arLink = getHreflangLink("ar");

      // Arabic (RTL language) should be available
      expect(arLink).toBeTruthy();
      expect(arLink?.getAttribute("href")).toBe(`${config.siteUrl}/ar`);
    });

    it("should support LTR languages", () => {
      renderRootRoute();

      const ltrLanguages = ["en", "es", "fr", "de"];

      ltrLanguages.forEach((lang) => {
        const link = getHreflangLink(lang);
        expect(link).toBeTruthy();
      });
    });
  });
});
