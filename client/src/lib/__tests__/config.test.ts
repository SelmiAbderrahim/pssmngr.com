// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Unit Tests for config Module
 *
 * Tests environment variable loading and fallback behavior.
 * Configuration tests for the pssmngr API client.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("config module", () => {
  beforeEach(() => {
    // Reset modules before each test
    vi.resetModules();
  });

  afterEach(() => {
    // Clean up all stubbed environment variables (restores import.meta.env)
    vi.unstubAllEnvs();
    // Reset modules to clear cached config with wrong env values
    vi.resetModules();
  });

  // ============================================================================
  // TESTS: Site URL Configuration
  // ============================================================================

  describe("siteUrl", () => {
    it("should use VITE_SITE_URL when set", async () => {
      vi.stubEnv("VITE_SITE_URL", "https://custom-domain.com");

      const { config } = await import("../config");

      expect(config.siteUrl).toBe("https://custom-domain.com");
    });

    it("should use localhost in development when VITE_SITE_URL not set", async () => {
      vi.stubEnv("VITE_SITE_URL", "");
      vi.stubEnv("DEV", true);

      const { config } = await import("../config");

      expect(config.siteUrl).toBe("http://localhost:5173");
    });

    it("should use pssmngr.com in production when VITE_SITE_URL not set", async () => {
      vi.stubEnv("VITE_SITE_URL", "");
      vi.stubEnv("DEV", false);
      vi.stubEnv("PROD", true);

      const { config } = await import("../config");

      expect(config.siteUrl).toBe("https://pssmngr.com");
    });

    it("should handle trailing slash in VITE_SITE_URL", async () => {
      vi.stubEnv("VITE_SITE_URL", "https://example.com/");

      const { config } = await import("../config");

      // Config should use the value as-is (trailing slash handling in usage)
      expect(config.siteUrl).toBe("https://example.com/");
    });

    it("should handle different protocols", async () => {
      vi.stubEnv("VITE_SITE_URL", "http://staging.example.com");

      const { config } = await import("../config");

      expect(config.siteUrl).toBe("http://staging.example.com");
    });
  });

  // ============================================================================
  // API configuration
  // ============================================================================

  describe("api", () => {
    it("should use VITE_API_URL when set", async () => {
      vi.stubEnv("VITE_API_URL", "https://api.example.com:48080");

      const { config } = await import("../config");

      expect(config.api.apiUrl).toBe("https://api.example.com:48080");
    });

    it("should fallback to window.location.origin when VITE_API_URL not set", async () => {
      vi.stubEnv("VITE_API_URL", "");

      const { config } = await import("../config");

      // Falls back to same-origin (nginx proxies /api/ to backend)
      expect(config.api.apiUrl).toBe(window.location.origin);
    });

    it("should have default timeout of 30000ms", async () => {
      const { config } = await import("../config");

      expect(config.api.timeout).toBe(30000);
    });

    it("should indicate configured status based on VITE_API_URL", async () => {
      vi.stubEnv("VITE_API_URL", "https://api.example.com");

      const { config } = await import("../config");

      expect(config.api.isConfigured).toBe(true);
    });

    it("should indicate not configured when VITE_API_URL is empty", async () => {
      vi.stubEnv("VITE_API_URL", "");

      const { config } = await import("../config");

      expect(config.api.isConfigured).toBe(false);
    });
  });

  // ============================================================================
  // TESTS: Environment Mode
  // ============================================================================

  describe("environment mode", () => {
    it("should set isDev to true in development", async () => {
      vi.stubEnv("DEV", true);
      vi.stubEnv("PROD", false);

      const { config } = await import("../config");

      expect(config.isDev).toBe(true);
      expect(config.isProd).toBe(false);
    });

    it("should set isProd to true in production", async () => {
      vi.stubEnv("DEV", false);
      vi.stubEnv("PROD", true);

      const { config } = await import("../config");

      expect(config.isDev).toBe(false);
      expect(config.isProd).toBe(true);
    });

    it("should expose mode string", async () => {
      vi.stubEnv("MODE", "production");

      const { config } = await import("../config");

      expect(config.mode).toBe("production");
    });
  });

  // ============================================================================
  // TESTS: Type Safety
  // ============================================================================

  describe("type safety", () => {
    it("should be read-only (as const)", async () => {
      const { config } = await import("../config");

      // TypeScript should enforce this at compile time
      // This is a runtime check that the object exists
      expect(config).toBeDefined();
      expect(typeof config.siteUrl).toBe("string");
      expect(typeof config.api.apiUrl).toBe("string");
      expect(typeof config.isDev).toBe("boolean");
      expect(typeof config.isProd).toBe("boolean");
      expect(typeof config.mode).toBe("string");
    });

    it("should export Config type", async () => {
      const module = await import("../config");

      expect(module.config).toBeDefined();
      // Config type should be available for import
      expect(typeof module.config).toBe("object");
    });
  });

  // ============================================================================
  // TESTS: Edge Cases
  // ============================================================================

  describe("edge cases", () => {
    it("should handle empty string for VITE_SITE_URL", async () => {
      vi.stubEnv("VITE_SITE_URL", "");
      vi.stubEnv("DEV", true);

      const { config } = await import("../config");

      expect(config.siteUrl).toBe("http://localhost:5173");
    });

    it("should handle undefined environment variables", async () => {
      vi.stubEnv("VITE_SITE_URL", undefined);
      vi.stubEnv("DEV", false);

      const { config } = await import("../config");

      expect(config.siteUrl).toBe("https://pssmngr.com");
    });

    it("should handle whitespace in environment variables", async () => {
      vi.stubEnv("VITE_SITE_URL", "  https://example.com  ");

      const { config } = await import("../config");

      // Should use trimmed value or as-is (depending on implementation)
      expect(config.siteUrl).toContain("https://example.com");
    });

    it("should work with all environment variables undefined", async () => {
      vi.stubEnv("VITE_SITE_URL", undefined);
      vi.stubEnv("VITE_API_URL", undefined);
      vi.stubEnv("DEV", false);
      vi.stubEnv("PROD", false);

      const { config } = await import("../config");

      expect(config.siteUrl).toBeDefined();
      expect(config.api.apiUrl).toBeDefined();
      expect(typeof config.isDev).toBe("boolean");
      expect(typeof config.isProd).toBe("boolean");
    });
  });

  // ============================================================================
  // TESTS: Real-World Scenarios
  // ============================================================================

  describe("real-world scenarios", () => {
    it("should work with production deployment", async () => {
      vi.stubEnv("VITE_SITE_URL", "https://pssmngr.com");
      vi.stubEnv("VITE_API_URL", "https://pssmngr.com/api:48080");
      vi.stubEnv("DEV", false);
      vi.stubEnv("PROD", true);
      vi.stubEnv("MODE", "production");

      const { config } = await import("../config");

      expect(config.siteUrl).toBe("https://pssmngr.com");
      expect(config.api.apiUrl).toBe("https://pssmngr.com/api:48080");
      expect(config.isDev).toBe(false);
      expect(config.isProd).toBe(true);
      expect(config.mode).toBe("production");
    });

    it("should work with staging deployment", async () => {
      vi.stubEnv("VITE_SITE_URL", "https://staging.pssmngr.com");
      vi.stubEnv("VITE_API_URL", "https://staging-pssmngr.com/api");
      vi.stubEnv("DEV", false);
      vi.stubEnv("PROD", true);
      vi.stubEnv("MODE", "staging");

      const { config } = await import("../config");

      expect(config.siteUrl).toBe("https://staging.pssmngr.com");
      expect(config.api.apiUrl).toBe("https://staging-pssmngr.com/api");
      expect(config.mode).toBe("staging");
    });

    it("should work with local development", async () => {
      vi.stubEnv("VITE_SITE_URL", "");
      vi.stubEnv("VITE_API_URL", "http://localhost:39291");
      vi.stubEnv("DEV", true);
      vi.stubEnv("PROD", false);
      vi.stubEnv("MODE", "development");

      const { config } = await import("../config");

      expect(config.siteUrl).toBe("http://localhost:5173");
      expect(config.api.apiUrl).toBe("http://localhost:39291");
      expect(config.isDev).toBe(true);
      expect(config.isProd).toBe(false);
      expect(config.mode).toBe("development");
    });

  });

});
