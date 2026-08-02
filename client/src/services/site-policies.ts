// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Site Password Policy Presets
 *
 * Defines password requirements for common site categories.
 * Used by the generator to produce compliant passwords and
 * by the vault to suggest policies when adding login items.
 */

import { generatePassword, type GeneratorConfig } from "./password-generator";

// ── Types ───────────────────────────────────────────────────────────

export interface SitePolicy {
  /** Display name for the preset */
  name: string;
  /** Unique identifier */
  id: string;
  /** Minimum password length */
  minLength?: number;
  /** Maximum password length */
  maxLength?: number;
  /** Require uppercase letters */
  requireUppercase?: boolean;
  /** Require lowercase letters */
  requireLowercase?: boolean;
  /** Require digits */
  requireDigits?: boolean;
  /** Require symbols */
  requireSymbols?: boolean;
  /** Only these symbols are allowed (if set) */
  allowedSymbols?: string;
  /** These characters are forbidden */
  forbiddenChars?: string;
}

// ── Built-in Presets ────────────────────────────────────────────────

export const SITE_POLICIES: SitePolicy[] = [
  {
    id: "general",
    name: "General (Recommended)",
    minLength: 16,
    maxLength: 128,
    requireUppercase: true,
    requireLowercase: true,
    requireDigits: true,
    requireSymbols: true,
  },
  {
    id: "banking",
    name: "Banking",
    minLength: 12,
    maxLength: 16,
    requireUppercase: true,
    requireLowercase: true,
    requireDigits: true,
    requireSymbols: true,
    allowedSymbols: "!@#$%^&*",
  },
  {
    id: "social",
    name: "Social Media",
    minLength: 8,
    maxLength: 64,
    requireUppercase: true,
    requireLowercase: true,
    requireDigits: true,
    requireSymbols: false,
  },
  {
    id: "government",
    name: "Government",
    minLength: 14,
    maxLength: 64,
    requireUppercase: true,
    requireLowercase: true,
    requireDigits: true,
    requireSymbols: true,
    allowedSymbols: "!@#$%&*_-.",
    forbiddenChars: "<>\"'`\\;:(){}[]|/",
  },
  {
    id: "email",
    name: "Email Provider",
    minLength: 12,
    maxLength: 100,
    requireUppercase: true,
    requireLowercase: true,
    requireDigits: true,
    requireSymbols: false,
  },
  {
    id: "wifi",
    name: "Wi-Fi / Network",
    minLength: 16,
    maxLength: 63,
    requireUppercase: true,
    requireLowercase: true,
    requireDigits: true,
    requireSymbols: false,
  },
];

// ── URL → Policy Matching ───────────────────────────────────────────

interface DomainMatch {
  patterns: string[];
  policyId: string;
}

const DOMAIN_MATCHES: DomainMatch[] = [
  {
    patterns: [
      "chase.com", "bankofamerica.com", "wellsfargo.com",
      "citibank.com", "usbank.com", "capitalone.com",
      "hsbc.com", "barclays.com", "paypal.com",
      "venmo.com", "wise.com", "revolut.com",
    ],
    policyId: "banking",
  },
  {
    patterns: [
      "facebook.com", "instagram.com", "twitter.com", "x.com",
      "tiktok.com", "snapchat.com", "reddit.com",
      "linkedin.com", "pinterest.com", "tumblr.com",
    ],
    policyId: "social",
  },
  {
    patterns: [
      "irs.gov", "ssa.gov", "login.gov", "id.me",
      ".gov", ".mil", ".gov.uk",
    ],
    policyId: "government",
  },
  {
    patterns: [
      "gmail.com", "outlook.com", "yahoo.com",
      "protonmail.com", "proton.me", "icloud.com",
      "fastmail.com", "tutanota.com", "zoho.com",
    ],
    policyId: "email",
  },
];

/**
 * Extract hostname from a URL string.
 * Returns null for invalid URLs.
 */
function extractHostname(rawUrl: string): string | null {
  try {
    let urlString = rawUrl.trim();
    if (!urlString) return null;
    // Add protocol if missing so URL constructor can parse it
    if (!/^https?:\/\//i.test(urlString)) {
      urlString = "https://" + urlString;
    }
    return new URL(urlString).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Find a matching policy for a given URL.
 * Returns the matching policy or undefined if no match found.
 */
export function matchPolicyForUrl(url: string): SitePolicy | undefined {
  const hostname = extractHostname(url);
  if (!hostname) return undefined;

  for (const match of DOMAIN_MATCHES) {
    for (const pattern of match.patterns) {
      // Exact match, subdomain match, or TLD-suffix match (e.g. ".gov")
      if (
        hostname === pattern ||
        hostname.endsWith("." + pattern) ||
        (pattern.startsWith(".") && hostname.endsWith(pattern))
      ) {
        return SITE_POLICIES.find((p) => p.id === match.policyId);
      }
    }
  }

  return undefined;
}

/**
 * Find a policy by its id.
 */
export function getPolicyById(id: string): SitePolicy | undefined {
  return SITE_POLICIES.find((p) => p.id === id);
}

// ── Policy → GeneratorConfig ────────────────────────────────────────

/**
 * Convert a SitePolicy to a GeneratorConfig.
 * Uses the policy's minLength (clamped to 8–128) and required character sets.
 * If allowedSymbols or forbiddenChars are set, they map to excludeChars.
 */
export function policyToConfig(policy: SitePolicy): GeneratorConfig {
  const FULL_SYMBOLS = "!@#$%^&*()-_=+[]{}|;:',.<>?/";

  // Choose a length: prefer minLength, clamped to valid range
  const length = Math.max(8, Math.min(128, policy.minLength ?? 16));

  // Build excludeChars from allowedSymbols / forbiddenChars
  let excludeChars = "";

  if (policy.allowedSymbols) {
    // Exclude any symbol NOT in the allowed set
    const allowed = new Set(policy.allowedSymbols);
    for (const ch of FULL_SYMBOLS) {
      if (!allowed.has(ch)) {
        excludeChars += ch;
      }
    }
  }

  if (policy.forbiddenChars) {
    for (const ch of policy.forbiddenChars) {
      if (!excludeChars.includes(ch)) {
        excludeChars += ch;
      }
    }
  }

  return {
    length,
    uppercase: policy.requireUppercase ?? true,
    lowercase: policy.requireLowercase ?? true,
    digits: policy.requireDigits ?? true,
    symbols: policy.requireSymbols ?? false,
    excludeChars: excludeChars || undefined,
    excludeAmbiguous: false,
  };
}

/**
 * Generate a password that satisfies a given policy.
 * Retries generation (up to 100 attempts) until the password
 * meets all policy constraints. With typical configs the first
 * attempt almost always passes; retries handle edge cases where
 * random sampling misses a required character class.
 */
export function generatePasswordForPolicy(policy: SitePolicy): string {
  const config = policyToConfig(policy);
  for (let i = 0; i < 100; i++) {
    const pw = generatePassword(config);
    if (validateAgainstPolicy(pw, policy)) return pw;
  }
  // Extremely unlikely fallback — return last attempt
  return generatePassword(config);
}

/**
 * Validate that a password satisfies a given policy.
 * Returns true if the password meets all policy constraints.
 */
export function validateAgainstPolicy(
  password: string,
  policy: SitePolicy,
): boolean {
  if (policy.minLength && password.length < policy.minLength) return false;
  if (policy.maxLength && password.length > policy.maxLength) return false;
  if (policy.requireUppercase && !/[A-Z]/.test(password)) return false;
  if (policy.requireLowercase && !/[a-z]/.test(password)) return false;
  if (policy.requireDigits && !/[0-9]/.test(password)) return false;
  if (policy.requireSymbols && !/[^A-Za-z0-9]/.test(password)) return false;

  if (policy.forbiddenChars) {
    for (const ch of password) {
      if (policy.forbiddenChars.includes(ch)) return false;
    }
  }

  if (policy.allowedSymbols) {
    const allowed = new Set(policy.allowedSymbols);
    for (const ch of password) {
      // If it's a non-alphanumeric char, it must be in the allowed set
      if (/[^A-Za-z0-9]/.test(ch) && !allowed.has(ch)) return false;
    }
  }

  return true;
}
