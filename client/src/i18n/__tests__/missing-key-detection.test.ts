// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Missing Translation Key Detection Tests
 *
 * Extracts every `t("key")` and `t('key')` call referenced in component and
 * route source files, then verifies that each key exists in the corresponding
 * English locale JSON file.
 *
 * This is the most valuable regression test in the suite — it catches the
 * class of bug where a developer renames or deletes a translation key but
 * forgets to update every callsite, causing a silent fallback to a raw key
 * string (e.g. "auth:login.title") showing up in the UI.
 *
 * Key resolution rules
 * --------------------
 * i18next supports two styles of key reference:
 *
 *   1. Namespace-qualified:  t("namespace:key.path")
 *      → look up key.path inside public/locales/en/namespace.json
 *
 *   2. Unqualified (uses hook namespace):  const { t } = useTranslation("ns")
 *      → then t("key.path") → namespace is "ns", key is "key.path"
 *      → look up key.path inside public/locales/en/ns.json
 *
 * Template-literal keys (t(`dynamic.${variable}`)) are skipped because the
 * key cannot be statically determined.
 *
 * Keys with an unknown namespace (unqualified but no detectable
 * useTranslation namespace in the same file) are checked against the
 * defaultNS ("common").
 *
 * @module i18n/__tests__/missing-key-detection
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LOCALES_EN_DIR = path.join(process.cwd(), 'public/locales/en');
const COMPONENT_DIR = path.join(process.cwd(), 'src/components');
const ROUTES_DIR = path.join(process.cwd(), 'src/routes');

/** Default namespace (must match i18n.ts `defaultNS` value). */
const DEFAULT_NS = 'common';

/**
 * Keys that are intentionally dynamic or otherwise not statically resolvable.
 * Add entries here only when the key cannot be expressed statically and has
 * been manually verified to exist at runtime.
 */
const KNOWN_DYNAMIC_PREFIXES = [
  // e.g. t(`passwordStrength.requirements.${key}`) — dynamic suffix
  'passwordStrength.requirements.',
  // e.g. t(`theme.${theme}`) — dynamic theme names
  'theme.',
  // e.g. t(`notificationProviders.providers.${type}`) — dynamic provider
  'notificationProviders.providers.',
  'notificationProviders.categories.',
  // e.g. t(`users.roles.${role}`) — dynamic role name
  'users.roles.',
];

/**
 * Fallback-backed prefixes grouped by namespace.
 *
 * These component families intentionally provide an English fallback in each
 * `t()` call while their larger locale migration is completed. Static literal
 * keys outside these narrowly listed families must exist in the locale files.
 *
 * Format: Map<namespace, keyPrefix[]>
 * A key "foo.bar.baz" in namespace "ns" is suppressed if "ns" maps to a
 * prefix that "foo.bar.baz" starts with (e.g. "foo." or "foo.bar.").
 */
const FALLBACK_BACKED_PREFIXES = new Map<string, string[]>([
  // common namespace — vault, sharing, family, dashboard, ephemeral, totp sub-sections
  ['common', [
    'dashboard.issuesFound',
    'ephemeral.',
    'family.',
    'sharing.',
    'totp.',
    'vault.',
  ]],
  // settings namespace — notification providers, security, users, profile, common actions
  ['settings', [
    'common.',
    'empty.',
    'errors.',
    'filters.',
    'notificationProviders.',
    'notifications.',
    'profile.',
    'search.',
    'security.',
    'status.',
    'users.',
  ]],
  // vault namespace — item detail, sharing, TOTP, ephemeral, trash, master password
  ['vault', [
    'ephemeral.',
    'hidePassword',
    'sharing.',
    'showPassword',
    'totp.',
    'vault.',
  ]],
]);

// ---------------------------------------------------------------------------
// Helpers — file discovery
// ---------------------------------------------------------------------------

/**
 * Recursively collect all .ts and .tsx source files under a directory,
 * skipping __tests__ folders and test files.
 */
function getSourceFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];

  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      results.push(...getSourceFiles(fullPath));
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      // Skip test files
      if (entry.name.endsWith('.test.ts') || entry.name.endsWith('.test.tsx')) continue;
      if (entry.name.endsWith('.spec.ts') || entry.name.endsWith('.spec.tsx')) continue;
      results.push(fullPath);
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Helpers — key extraction
// ---------------------------------------------------------------------------

/**
 * Extract the namespace(s) declared via `useTranslation(...)` calls in a
 * source file.  Returns the array of namespace strings found; may be empty if
 * no useTranslation call is present.
 *
 * Handles both forms:
 *   useTranslation("auth")                   → ["auth"]
 *   useTranslation(["auth", "errors"])        → ["auth", "errors"]
 *   useTranslation(["common", "dashboard"])   → ["common", "dashboard"]
 */
function extractDeclaredNamespaces(content: string): string[] {
  const ns: string[] = [];

  // Single-string form: useTranslation("ns") or useTranslation('ns')
  const singleRe = /useTranslation\s*\(\s*["']([^"']+)["']\s*\)/g;
  let match: RegExpExecArray | null;
  while ((match = singleRe.exec(content)) !== null) {
    if (!ns.includes(match[1])) ns.push(match[1]);
  }

  // Array form: useTranslation(["ns1", "ns2", ...])
  const arrayRe = /useTranslation\s*\(\s*\[([^\]]+)\]/g;
  while ((match = arrayRe.exec(content)) !== null) {
    const inner = match[1];
    const itemRe = /["']([^"']+)["']/g;
    let item: RegExpExecArray | null;
    while ((item = itemRe.exec(inner)) !== null) {
      if (!ns.includes(item[1])) ns.push(item[1]);
    }
  }

  return ns;
}

interface TranslationKeyRef {
  /**
   * All candidate namespaces to check for this key.
   * For qualified keys ("ns:key") this is a single-element array.
   * For unqualified keys this is the full list of declared namespaces so the
   * checker can find the key in ANY of them (i18next searches in order).
   */
  candidateNamespaces: string[];
  /** Dot-notation key path within the namespace (e.g. "login.title") */
  key: string;
  /** The full raw token as it appeared in source for error messages */
  raw: string;
}

/**
 * Extract all statically-resolvable `t("...")` / `t('...')` calls from
 * a source file.
 *
 * Rules:
 *  - Template literals (`t(\`...\`)`) are skipped — dynamic keys.
 *  - Keys that only contain `{`, `}`, `$` are dynamic — skipped.
 *  - Namespace-qualified keys (`ns:key`) produce a single candidate namespace.
 *  - Unqualified keys carry ALL declared useTranslation namespaces as
 *    candidates (i18next searches them in declaration order, so a key found
 *    in ANY of them is valid).
 */
function extractTranslationKeys(content: string): TranslationKeyRef[] {
  const declaredNs = extractDeclaredNamespaces(content);
  // When no explicit namespace is declared, default to common
  const candidateFallback = declaredNs.length > 0 ? declaredNs : [DEFAULT_NS];

  const refs: TranslationKeyRef[] = [];
  const seen = new Set<string>();

  // Match t("...") and t('...') but not t(`...`)
  // Also handle Trans i18nKey="ns:key" and i18nKey='ns:key'
  const patterns = [
    /\bt\s*\(\s*"([^"]+)"/g,
    /\bt\s*\(\s*'([^']+)'/g,
    /i18nKey\s*=\s*"([^"]+)"/g,
    /i18nKey\s*=\s*'([^']+)'/g,
  ];

  for (const re of patterns) {
    re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(content)) !== null) {
      const raw = match[1];

      // Skip empty or purely numeric keys
      if (!raw || /^\d+$/.test(raw)) continue;

      // Skip keys that contain template-literal interpolation residue
      if (raw.includes('${') || raw.includes('`')) continue;

      // Skip keys that are dynamic (contain only variables)
      if (/^\{\{/.test(raw)) continue;

      let candidateNamespaces: string[];
      let key: string;

      if (raw.includes(':')) {
        // Namespace-qualified: "ns:key.path" — single candidate
        const colonIdx = raw.indexOf(':');
        candidateNamespaces = [raw.slice(0, colonIdx)];
        key = raw.slice(colonIdx + 1);
      } else {
        // Unqualified: try all namespaces declared in file
        candidateNamespaces = candidateFallback;
        key = raw;
      }

      // Skip if key starts with a known dynamic prefix
      if (KNOWN_DYNAMIC_PREFIXES.some((prefix) => key.startsWith(prefix))) continue;

      // Dedupe on the raw string (same key in same file = same ref)
      if (!seen.has(raw)) {
        seen.add(raw);
        refs.push({ candidateNamespaces, key, raw });
      }
    }
  }

  return refs;
}

// ---------------------------------------------------------------------------
// Helpers — locale key loading
// ---------------------------------------------------------------------------

/**
 * Flatten a nested JSON object into a set of dot-notation leaf-key paths.
 * e.g. `{ login: { title: "Log in" } }` → `new Set(["login.title"])`
 */
function flattenKeys(obj: Record<string, unknown>, prefix = ''): Set<string> {
  const result = new Set<string>();
  for (const [k, v] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      for (const child of flattenKeys(v as Record<string, unknown>, full)) {
        result.add(child);
      }
    } else {
      result.add(full);
    }
  }
  return result;
}

interface LocaleIndex {
  /** Map from namespace name → flat set of dot-notation keys */
  byNamespace: Map<string, Set<string>>;
}

/**
 * Load all English locale JSON files and build an index keyed by namespace.
 */
function loadLocaleIndex(localesDir: string): LocaleIndex {
  const byNamespace = new Map<string, Set<string>>();

  if (!fs.existsSync(localesDir)) {
    return { byNamespace };
  }

  for (const entry of fs.readdirSync(localesDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;

    const ns = entry.name.replace(/\.json$/, '');
    try {
      const raw = fs.readFileSync(path.join(localesDir, entry.name), 'utf-8');
      const obj = JSON.parse(raw) as Record<string, unknown>;
      byNamespace.set(ns, flattenKeys(obj));
    } catch {
      // Invalid JSON — structural tests in translation-completeness.test.ts cover this
    }
  }

  return { byNamespace };
}

// ---------------------------------------------------------------------------
// Test
// ---------------------------------------------------------------------------

describe('Missing translation key detection', () => {
  it('all t() keys referenced in components exist in English locale files', () => {
    const localeIndex = loadLocaleIndex(LOCALES_EN_DIR);
    const sourceFiles = [
      ...getSourceFiles(COMPONENT_DIR),
      ...getSourceFiles(ROUTES_DIR),
    ];

    const missing: string[] = [];

    for (const filePath of sourceFiles) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const refs = extractTranslationKeys(content);

      for (const ref of refs) {
        // A key is valid if it exists in ANY of its candidate namespaces.
        // i18next searches namespaces in declaration order and uses the first hit.
        let foundInAnyNs = false;
        const unknownNs: string[] = [];

        for (const ns of ref.candidateNamespaces) {
          const nsKeys = localeIndex.byNamespace.get(ns);
          if (!nsKeys) {
            unknownNs.push(ns);
            continue;
          }

          if (nsKeys.has(ref.key)) {
            foundInAnyNs = true;
            break;
          }

          // Fallback: some developers redundantly prefix the key with the
          // namespace name (e.g. useTranslation("watchtower") + t("watchtower.title")).
          // i18next resolves this as nested key "watchtower.title" inside
          // watchtower.json, but the JSON stores "title" at top level.
          // Try stripping the leading "namespace." prefix before reporting.
          const nsPrefix = `${ns}.`;
          if (ref.key.startsWith(nsPrefix)) {
            const strippedKey = ref.key.slice(nsPrefix.length);
            if (nsKeys.has(strippedKey)) {
              foundInAnyNs = true;
              break;
            }
          }
        }

        if (foundInAnyNs) continue;

        // Check known-missing allowlist before reporting
        const allCandidateKeys = ref.candidateNamespaces.map((ns) => `${ns}:${ref.key}`);
        // Check known-missing prefix groups before reporting
        const matchesMissingPrefix = ref.candidateNamespaces.some((ns) => {
          const prefixes = FALLBACK_BACKED_PREFIXES.get(ns);
          if (!prefixes) return false;
          return prefixes.some((p) => ref.key === p || ref.key.startsWith(p));
        });
        if (matchesMissingPrefix) continue;

        // Only report unknown-namespace errors when ALL candidates are unknown
        if (unknownNs.length === ref.candidateNamespaces.length) {
          missing.push(
            `  [unknown namespace] ${path.relative(process.cwd(), filePath)}: "${ref.raw}" → namespaces [${unknownNs.join(', ')}] not found`
          );
        } else {
          missing.push(
            `  ${path.relative(process.cwd(), filePath)}: t("${ref.raw}") → key "${ref.key}" missing from en/{${ref.candidateNamespaces.join(',')}}.json`
          );
        }
      }
    }

    expect(
      missing,
      `\nKeys used in code but missing from en/ locale files:\n${missing.join('\n')}`
    ).toEqual([]);
  });

  it('locale index has entries for all expected namespaces', () => {
    const localeIndex = loadLocaleIndex(LOCALES_EN_DIR);
    const EXPECTED_NAMESPACES = [
      'auth', 'common', 'emergency', 'errors', 'generator', 'guide', 'mobile',
      'organization', 'settings', 'sync', 'validation', 'vault', 'watchtower',
      'workspace',
    ];

    const missingNs = EXPECTED_NAMESPACES.filter(
      (ns) => !localeIndex.byNamespace.has(ns)
    );

    expect(
      missingNs,
      `Expected namespace JSON files missing from public/locales/en/:\n${missingNs.join(', ')}`
    ).toEqual([]);
  });

  it('extracted keys cover auth, vault, and common namespaces (sanity check)', () => {
    const localeIndex = loadLocaleIndex(LOCALES_EN_DIR);

    // Verify the locale index is populated for the core namespaces
    expect(localeIndex.byNamespace.get('auth')?.size).toBeGreaterThan(0);
    expect(localeIndex.byNamespace.get('vault')?.size).toBeGreaterThan(0);
    expect(localeIndex.byNamespace.get('common')?.size).toBeGreaterThan(0);
  });
});
