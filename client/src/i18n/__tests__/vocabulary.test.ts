// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Vocabulary + forbidden-claims + grep-gate regression tests.
 *
 * Enforces canonical in-product vocabulary and rejects overselling claims.
 * These tests parse the English locale files and selected copy-sensitive
 * components to catch regressions in CI.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join, extname, relative } from "path";

const REPO_ROOT = join(__dirname, "..", "..", "..", "..");
const EN_LOCALES = join(REPO_ROOT, "client", "public", "locales", "en");
const CLIENT_SRC = join(REPO_ROOT, "client", "src");

// ---------------------------------------------------------------------------
// Vocabulary rules
// ---------------------------------------------------------------------------

/**
 * In-product locale files ONLY. Marketing (landing*), legal, docs, admin, and
 * playground-style namespaces use richer vocabulary by design and are out of
 * scope for the vocabulary sweep.
 */
const IN_PRODUCT_NAMESPACES = [
  "auth",
  "common",
  "emergency",
  "errors",
  "generator",
  "guide",
  "mobile",
  "organization",
  "settings",
  "sync",
  "validation",
  "vault",
  "watchtower",
  "workspace",
];

/**
 * Each entry is a forbidden vocabulary synonym plus the canonical term to
 * use instead. Patterns are word-boundary, case-insensitive.
 *
 * `allow` (optional) is an escape hatch for values where the word is used in
 * a DIFFERENT, legitimate sense (e.g. "support team" is a group of humans,
 * not the workspace concept; "Client ID" is an OAuth field, not a device).
 * Keep every allowance narrow and documented — a broad allow regex quietly
 * disables the rule.
 */
const VOCABULARY_RULES: Array<{
  term: string;
  canonical: string;
  pattern: RegExp;
  allow?: RegExp;
}> = [
  // vault
  { term: "keychain", canonical: "vault", pattern: /\bkeychain\b/i },
  { term: "locker", canonical: "vault", pattern: /\blocker\b/i },
  // "safe" as a NOUN for the vault ("your digital safe"). The adjective and
  // the "safe place" idiom are fine.
  {
    term: "safe (noun)",
    canonical: "vault",
    pattern: /\b(?:a|the|your|digital|password)\s+safe\b/i,
    allow: /safe\s+(?:place|spot|location)/i,
  },
  // item
  { term: "credential", canonical: "item", pattern: /\bcredentials?\b/i },
  {
    term: "record",
    canonical: "item",
    pattern: /\brecords?\b/i,
    // Audit records are records, not vault items.
    allow: /audit records/i,
  },
  { term: "entry", canonical: "item", pattern: /\bentr(?:y|ies)\b(?!\s*point)/i },
  // workspace
  {
    term: "team",
    canonical: "workspace",
    pattern: /\bteams?\b/i,
    // Humans, companies, and product names — not the tenancy concept:
    // "support team", "our team", "Microsoft Teams", audience descriptors
    // ("small teams"), and user-voice examples ("for my team").
    allow: /support team|our team|microsoft teams|small teams|for my team/i,
  },
  {
    term: "org",
    canonical: "workspace",
    pattern: /\borgs?\b/i,
    // Technical placeholders: a git group slug and an OAuth organization id.
    allow: /my-org|org-\.\.\./i,
  },
  { term: "tenant", canonical: "workspace", pattern: /\btenants?\b/i },
  // device
  {
    term: "client",
    canonical: "device",
    pattern: /\bclients?\b/i,
    // Crypto/networking/OAuth senses: client-side encryption, client IP,
    // Client ID / Client Secret fields.
    allow: /client[- ]side|client\s+ip\b|client\s+id\b|client\s+secret/i,
  },
  {
    term: "session",
    canonical: "device",
    pattern: /\bsessions?\b/i,
    // Login/auth sessions and checkout sessions ARE sessions — the rule only
    // forbids calling a device a "session". Session revocation / sign-out
    // management copy in settings is auth-session UI, not device naming.
    allow:
      /session (?:has )?expired|session is no longer|session has been revoked|sign(?:ing|ed)? (?:in|out)|log ?in|logged|checkout session|active sessions|current session|other sessions|revoke.{0,30}sessions?|sessions? revoked|revoke session|device mismatch|passkeys/i,
  },
  // master password
  { term: "main password", canonical: "master password", pattern: /\bmain password\b/i },
  { term: "master passphrase", canonical: "master password", pattern: /\bmaster passphrase\b/i },
  // Bare "passphrase" is legitimate for the share-link passphrase feature;
  // only forbid it as a name for the master password.
  {
    term: "vault/account passphrase",
    canonical: "master password",
    pattern: /\b(?:vault|account|login|your master)\s+passphrase\b/i,
  },
  // Secret Key
  { term: "recovery key", canonical: "Secret Key", pattern: /\brecovery key\b/i },
  { term: "account key", canonical: "Secret Key", pattern: /\baccount key\b/i },
];

/**
 * Forbidden overselling claims — never allowed in in-product copy.
 */
const FORBIDDEN_CLAIMS: RegExp[] = [
  /\bunhackable\b/i,
  /\bmilitary-grade\b/i,
  /\bbank-level\b/i,
  /\b100%\s*secure\b/i,
  /\bimpossible\b/i,
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface Occurrence {
  file: string;
  keyPath: string;
  value: string;
}

/**
 * Walk a JSON tree and yield every string leaf with its dotted key path.
 */
function* walkStrings(obj: unknown, path: string[] = []): Generator<{ path: string; value: string }> {
  if (typeof obj === "string") {
    yield { path: path.join("."), value: obj };
    return;
  }
  if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) {
      yield* walkStrings(v, [...path, k]);
    }
  }
}

function findMatches(pattern: RegExp, allow?: RegExp): Occurrence[] {
  const hits: Occurrence[] = [];
  for (const ns of IN_PRODUCT_NAMESPACES) {
    const fp = join(EN_LOCALES, `${ns}.json`);
    if (!existsSync(fp)) continue;
    const data = JSON.parse(readFileSync(fp, "utf-8"));
    for (const { path, value } of walkStrings(data)) {
      if (pattern.test(value) && !(allow && allow.test(value))) {
        hits.push({ file: `${ns}.json`, keyPath: path, value });
      }
    }
  }
  return hits;
}

// ---------------------------------------------------------------------------
// Copy-sensitive component surface for the grep gate
// ---------------------------------------------------------------------------

/**
 * Components whose human-facing JSX text must go through i18n.
 */
const COPY_POLICY_FILES = [
  "components/security/ProtectionExplainer.tsx",
  "components/vault/page/VaultHeader.tsx",
  "components/vault/page/ItemsTab.tsx",
  "components/vault/ShareFlow.tsx",
  "components/vault/SharingCenter.tsx",
];

/**
 * Allowlist of literal English strings that legitimately appear in JSX (brand
 * name, technical identifiers, punctuation-only fragments).
 */
const JSX_TEXT_ALLOWLIST = new Set<string>([
  "pssmngr",
]);

/**
 * Common TypeScript-generic tokens that show up as `>...<` matches when a
 * generic (`Promise<void>`, `Record<string, unknown>`) sits next to another
 * one on the same line. These are not JSX text and must not fail the gate.
 */
const TS_TYPE_TOKEN = /^(?:void|Promise|Array|Record|Map|Set|Partial|Readonly|Required|Pick|Omit|string|number|boolean|null|undefined|unknown|any|never|\||,|\s|<|>)+$/;

/**
 * Extract JSX text nodes that look like human-facing English strings.
 *
 * Matches `>text<` between JSX tags where text contains at least one 3+ char
 * alpha run. This is a heuristic — we still allowlist obvious false positives
 * (brand name, TypeScript generic fragments). JSX expressions like `>{...}<`
 * and `>{t(...)}<` are naturally excluded because the text contains `{`.
 */
function extractJSXTextNodes(source: string): string[] {
  const results: string[] = [];
  // Strip block comments and line comments so text inside them doesn't count.
  const stripped = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  const pattern = />([^<>{}\n]+?)</g;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(stripped))) {
    const raw = m[1]!.trim();
    if (!raw) continue;
    if (!/[A-Za-z]{3,}/.test(raw)) continue;
    if (JSX_TEXT_ALLOWLIST.has(raw)) continue;
    // Skip fragments that look like TypeScript generics (Promise, Record, …).
    if (TS_TYPE_TOKEN.test(raw)) continue;
    results.push(raw);
  }
  return results;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("canonical vocabulary", () => {
  for (const rule of VOCABULARY_RULES) {
    it(`does not use "${rule.term}" in in-product copy (use "${rule.canonical}")`, () => {
      const hits = findMatches(rule.pattern, rule.allow);
      if (hits.length > 0) {
        const detail = hits
          .map((h) => `  ${h.file}::${h.keyPath} — ${JSON.stringify(h.value)}`)
          .join("\n");
        throw new Error(
          `Found ${hits.length} occurrence(s) of "${rule.term}" — use "${rule.canonical}" instead:\n${detail}`,
        );
      }
      expect(hits).toEqual([]);
    });
  }
});

describe("forbidden claims", () => {
  for (const pattern of FORBIDDEN_CLAIMS) {
    it(`does not use ${pattern} in in-product copy`, () => {
      const hits = findMatches(pattern);
      if (hits.length > 0) {
        const detail = hits
          .map((h) => `  ${h.file}::${h.keyPath} — ${JSON.stringify(h.value)}`)
          .join("\n");
        throw new Error(
          `Forbidden overselling claim ${pattern} found:\n${detail}`,
        );
      }
      expect(hits).toEqual([]);
    });
  }
});

describe("copy policy grep gate", () => {
  for (const rel of COPY_POLICY_FILES) {
    it(`${rel} has no hardcoded English JSX text nodes`, () => {
      const fp = join(CLIENT_SRC, rel);
      if (!existsSync(fp)) {
        throw new Error(`Expected copy-policy file not found: ${relative(REPO_ROOT, fp)}`);
      }
      if (extname(fp) !== ".tsx") return; // safety
      const source = readFileSync(fp, "utf-8");
      const literals = extractJSXTextNodes(source);
      expect(literals, `Found bare English JSX text in ${rel}: ${JSON.stringify(literals)}`).toEqual([]);
    });
  }
});

describe("required product copy", () => {
  const en = JSON.parse(readFileSync(join(EN_LOCALES, "common.json"), "utf-8"));

  it("common.json has pages.* keys for vault, security, people, settings", () => {
    expect(en.pages?.vault?.title).toBeTruthy();
    expect(en.pages?.vault?.description).toBeTruthy();
    expect(en.pages?.security?.title).toBeTruthy();
    expect(en.pages?.security?.description).toBeTruthy();
    expect(en.pages?.security?.checkWeak).toBeTruthy();
    expect(en.pages?.security?.checkReused).toBeTruthy();
    expect(en.pages?.security?.checkBreached).toBeTruthy();
    expect(en.pages?.people?.title).toBeTruthy();
    expect(en.pages?.people?.description).toBeTruthy();
    expect(en.pages?.settings?.title).toBeTruthy();
    expect(en.pages?.settings?.description).toBeTruthy();
  });

  it("common.json has explainer.* keys for the three protection points", () => {
    expect(en.explainer?.title).toBeTruthy();
    expect(en.explainer?.encryptedOnDevice?.title).toBeTruthy();
    expect(en.explainer?.encryptedOnDevice?.body).toBeTruthy();
    expect(en.explainer?.twoSecretsNeverSent?.title).toBeTruthy();
    expect(en.explainer?.twoSecretsNeverSent?.body).toBeTruthy();
    expect(en.explainer?.youControlThisDevice?.title).toBeTruthy();
    expect(en.explainer?.youControlThisDevice?.body).toBeTruthy();
    expect(en.explainer?.youControlThisDevice?.link).toBeTruthy();
  });

  it("common.json has sharingCenter.person/link description keys", () => {
    expect(en.sharingCenter?.personDescription).toBeTruthy();
    expect(en.sharingCenter?.linkDescription).toBeTruthy();
  });

  it("Vault empty state copy exists in vault.json", () => {
    const v = JSON.parse(readFileSync(join(EN_LOCALES, "vault.json"), "utf-8"));
    expect(v.empty).toMatch(/only you can fill it/);
    expect(v.emptyDescription).toMatch(/never leave your devices/);
    expect(v.emptyImport).toBeTruthy();
  });

  for (const lang of ["ar", "fr", "de", "es"] as const) {
    it(`${lang}/common.json has the three new namespaces (parity)`, () => {
      const fp = join(REPO_ROOT, "client", "public", "locales", lang, "common.json");
      const data = JSON.parse(readFileSync(fp, "utf-8"));
      expect(data.pages?.vault?.description).toBeTruthy();
      expect(data.explainer?.title).toBeTruthy();
      expect(data.sharingCenter?.personDescription).toBeTruthy();
      // Non-en translations must NOT be English copies.
      expect(data.pages.vault.description).not.toBe(
        "Everything you save is encrypted on this device before it goes anywhere.",
      );
      expect(data.explainer.title).not.toBe("How pssmngr protects you");
    });
  }
});
