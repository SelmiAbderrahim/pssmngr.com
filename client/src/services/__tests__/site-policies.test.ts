// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { describe, it, expect } from "vitest";
import {
  SITE_POLICIES,
  matchPolicyForUrl,
  getPolicyById,
  policyToConfig,
  validateAgainstPolicy,
  generatePasswordForPolicy,
  type SitePolicy,
} from "../site-policies";

describe("site-policies", () => {
  // ── SITE_POLICIES ─────────────────────────────────────────────────

  describe("SITE_POLICIES", () => {
    it("has all expected built-in presets", () => {
      const ids = SITE_POLICIES.map((p) => p.id);
      expect(ids).toContain("general");
      expect(ids).toContain("banking");
      expect(ids).toContain("social");
      expect(ids).toContain("government");
      expect(ids).toContain("email");
      expect(ids).toContain("wifi");
    });

    it("each preset has a name and id", () => {
      for (const policy of SITE_POLICIES) {
        expect(policy.id).toBeTruthy();
        expect(policy.name).toBeTruthy();
      }
    });

    it("each preset has valid minLength", () => {
      for (const policy of SITE_POLICIES) {
        if (policy.minLength !== undefined) {
          expect(policy.minLength).toBeGreaterThanOrEqual(8);
          expect(policy.minLength).toBeLessThanOrEqual(128);
        }
      }
    });
  });

  // ── getPolicyById ─────────────────────────────────────────────────

  describe("getPolicyById", () => {
    it("returns policy for valid id", () => {
      const banking = getPolicyById("banking");
      expect(banking).toBeDefined();
      expect(banking!.name).toBe("Banking");
    });

    it("returns undefined for unknown id", () => {
      expect(getPolicyById("nonexistent")).toBeUndefined();
    });
  });

  // ── matchPolicyForUrl ─────────────────────────────────────────────

  describe("matchPolicyForUrl", () => {
    it("matches banking domains", () => {
      expect(matchPolicyForUrl("https://chase.com/login")?.id).toBe("banking");
      expect(matchPolicyForUrl("https://www.paypal.com")?.id).toBe("banking");
      expect(matchPolicyForUrl("bankofamerica.com")?.id).toBe("banking");
    });

    it("matches social media domains", () => {
      expect(matchPolicyForUrl("https://facebook.com")?.id).toBe("social");
      expect(matchPolicyForUrl("https://www.reddit.com")?.id).toBe("social");
      expect(matchPolicyForUrl("x.com")?.id).toBe("social");
    });

    it("matches government domains", () => {
      expect(matchPolicyForUrl("https://login.gov")?.id).toBe("government");
      expect(matchPolicyForUrl("https://www.irs.gov")?.id).toBe("government");
      expect(matchPolicyForUrl("https://agency.mil")?.id).toBe("government");
    });

    it("matches email provider domains", () => {
      expect(matchPolicyForUrl("https://gmail.com")?.id).toBe("email");
      expect(matchPolicyForUrl("https://proton.me")?.id).toBe("email");
    });

    it("returns undefined for unknown domains", () => {
      expect(matchPolicyForUrl("https://example.com")).toBeUndefined();
      expect(matchPolicyForUrl("https://mysite.org")).toBeUndefined();
    });

    it("handles URLs without protocol", () => {
      expect(matchPolicyForUrl("chase.com")?.id).toBe("banking");
      expect(matchPolicyForUrl("www.facebook.com")?.id).toBe("social");
    });

    it("returns undefined for empty/invalid URLs", () => {
      expect(matchPolicyForUrl("")).toBeUndefined();
      expect(matchPolicyForUrl("not a url at all!!!")).toBeUndefined();
    });

    it("matches subdomains", () => {
      expect(matchPolicyForUrl("https://secure.chase.com")?.id).toBe("banking");
      expect(matchPolicyForUrl("https://m.facebook.com")?.id).toBe("social");
    });
  });

  // ── policyToConfig ────────────────────────────────────────────────

  describe("policyToConfig", () => {
    it("converts general policy to config", () => {
      const policy = getPolicyById("general")!;
      const config = policyToConfig(policy);
      expect(config.length).toBe(16);
      expect(config.uppercase).toBe(true);
      expect(config.lowercase).toBe(true);
      expect(config.digits).toBe(true);
      expect(config.symbols).toBe(true);
    });

    it("converts banking policy with allowed symbols", () => {
      const policy = getPolicyById("banking")!;
      const config = policyToConfig(policy);
      expect(config.length).toBe(12);
      expect(config.symbols).toBe(true);
      // Should exclude symbols not in allowedSymbols
      expect(config.excludeChars).toBeDefined();
      expect(config.excludeChars).not.toContain("!");
      expect(config.excludeChars).not.toContain("@");
    });

    it("converts social policy without required symbols", () => {
      const policy = getPolicyById("social")!;
      const config = policyToConfig(policy);
      expect(config.length).toBe(8);
      expect(config.symbols).toBe(false);
    });

    it("clamps length to valid range", () => {
      const tooShort: SitePolicy = {
        id: "test",
        name: "Test",
        minLength: 3,
      };
      expect(policyToConfig(tooShort).length).toBe(8);

      const tooLong: SitePolicy = {
        id: "test",
        name: "Test",
        minLength: 200,
      };
      expect(policyToConfig(tooLong).length).toBe(128);
    });

    it("defaults to length 16 when minLength not set", () => {
      const noMin: SitePolicy = { id: "test", name: "Test" };
      expect(policyToConfig(noMin).length).toBe(16);
    });
  });

  // ── validateAgainstPolicy ─────────────────────────────────────────

  describe("validateAgainstPolicy", () => {
    const bankingPolicy = getPolicyById("banking")!;

    it("accepts valid passwords", () => {
      expect(validateAgainstPolicy("Abcdef1!ghij", bankingPolicy)).toBe(true);
    });

    it("rejects too-short passwords", () => {
      expect(validateAgainstPolicy("Ab1!", bankingPolicy)).toBe(false);
    });

    it("rejects too-long passwords", () => {
      expect(
        validateAgainstPolicy("A".repeat(17) + "b1!", bankingPolicy),
      ).toBe(false);
    });

    it("rejects passwords missing required uppercase", () => {
      expect(validateAgainstPolicy("abcdef1!ghij", bankingPolicy)).toBe(false);
    });

    it("rejects passwords missing required lowercase", () => {
      expect(validateAgainstPolicy("ABCDEF1!GHIJ", bankingPolicy)).toBe(false);
    });

    it("rejects passwords missing required digits", () => {
      expect(validateAgainstPolicy("Abcdef!ghijk", bankingPolicy)).toBe(false);
    });

    it("rejects passwords missing required symbols", () => {
      expect(validateAgainstPolicy("Abcdef1ghijk", bankingPolicy)).toBe(false);
    });

    it("rejects forbidden characters", () => {
      const govPolicy = getPolicyById("government")!;
      expect(validateAgainstPolicy("Abcdef1!ghijkl", govPolicy)).toBe(true);
      expect(validateAgainstPolicy("Abcdef1<ghijkl", govPolicy)).toBe(false);
    });

    it("rejects disallowed symbols when allowedSymbols is set", () => {
      // Banking only allows !@#$%^&*
      expect(validateAgainstPolicy("Abcdef1[ghij", bankingPolicy)).toBe(false);
      expect(validateAgainstPolicy("Abcdef1!ghij", bankingPolicy)).toBe(true);
    });
  });

  // ── Integration: policy generates valid passwords ─────────────────

  describe("integration", () => {
    it("generatePasswordForPolicy always satisfies each policy", () => {
      for (const policy of SITE_POLICIES) {
        // Generate 5 passwords per policy to check consistency
        for (let i = 0; i < 5; i++) {
          const pw = generatePasswordForPolicy(policy);
          expect(
            validateAgainstPolicy(pw, policy),
            `Policy "${policy.name}" failed for password "${pw}"`,
          ).toBe(true);
        }
      }
    });
  });
});
