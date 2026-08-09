// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Component Translation Usage Tests
 *
 * Static analysis test that scans component source files to verify that
 * components containing user-facing text make use of the react-i18next
 * translation API (useTranslation hook, Trans component, or i18n.t).
 *
 * This guards against regressions where a developer adds a new component
 * with hardcoded English strings and forgets to hook it up to i18n.
 *
 * Detection strategy
 * ------------------
 * A file is considered to have "user-facing text" when it contains at least
 * one of these patterns in JSX/TSX:
 *   - >{UppercaseLetter}{3+ alpha chars}< — visible text nodes
 *   - aria-label="{UppercaseLetter}..."  — hardcoded aria labels
 *   - placeholder="{UppercaseLetter}..."  — hardcoded form placeholders
 *   - title="{UppercaseLetter}..."        — hardcoded title attributes
 *
 * A file is considered to use translations when it contains any of:
 *   - useTranslation
 *   - <Trans
 *   - i18n.t(
 *
 * Exempt files / directories are explicitly listed below and should be
 * updated when new utility-only components are added.
 *
 * @module i18n/__tests__/component-translation-usage
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Component sub-directories that contain user-facing React components.
 * These are the directories whose .tsx files will be checked.
 */
const REQUIRED_DIRS = [
  'auth',
  'dashboard',
  'emergency',
  'family',
  'import-export',
  'layout',
  'privacy',
  'vault',
];

/**
 * Component sub-directories that are intentionally excluded from the check.
 * These contain either pure infrastructure code, shadcn primitives, or
 * icon/logo components with no translatable text.
 */
const EXEMPT_DIRS = new Set(['ui', 'icons', 'templates', 'entitlements', 'shared', 'error', 'errors', 'forms', 'share']);

/**
 * Specific file basenames that are explicitly exempt from the translation
 * requirement.  These files have been reviewed and confirmed to contain no
 * user-facing text that requires translation (e.g. they only render
 * context/provider scaffolding, skeleton placeholders, or brand assets).
 */
const EXEMPT_FILES = new Set([
  // SEO / structured data — output is not rendered in the DOM as visible text
  'StructuredData.tsx',
  // Brand asset wrappers — logo images, no readable text
  'CardBrandLogo.tsx',
  'ProviderLogo.tsx',
  // Skeleton / loading placeholder — no actual text, just grey boxes
  // Pure wrapper / pass-through components with no text
  'CreateWorkspaceDialog.tsx',
  'AlertBlock.tsx',
  // Vault page dispatchers — pass-through only;
  // their `Promise<void>` prop types trip the JSX-text heuristic.
  'VaultBody.tsx',
  'VaultDialogs.tsx',
  'AuthenticatorsTab.tsx',
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const COMPONENTS_DIR = path.join(process.cwd(), 'src/components');

/**
 * Recursively collect all .tsx files under a directory.
 */
function getAllTsxFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];

  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip __tests__ subdirectories — they are not components
      if (entry.name === '__tests__') continue;
      results.push(...getAllTsxFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.tsx')) {
      results.push(fullPath);
    }
  }

  return results;
}

/**
 * Detect whether a source file likely contains user-facing text that needs
 * to be translated.
 *
 * Heuristics (any one is sufficient):
 *   1. JSX text node starting with an uppercase letter, at least 4 chars
 *      e.g. `>Submit<`, `>Enter your email<`
 *   2. Hardcoded aria-label starting with uppercase
 *   3. Hardcoded placeholder starting with uppercase
 *   4. Hardcoded title attribute starting with uppercase (on interactive elts)
 */
function hasUserFacingText(content: string): boolean {
  // Pattern 1: JSX text node — `>Capital Word(s)<`
  // Allow short words that might be markup artefacts; require 4+ alpha chars.
  const jsxTextNode = />([A-Z][a-zA-Z]{3,}[^<"]*)<\/|>\s*([A-Z][a-zA-Z]{3,}[^<"]*)\s*</;
  if (jsxTextNode.test(content)) return true;

  // Pattern 2: aria-label="Uppercase..."
  if (/aria-label="[A-Z]/.test(content)) return true;

  // Pattern 3: placeholder="Uppercase..."
  if (/placeholder="[A-Z]/.test(content)) return true;

  // Pattern 4: title="Uppercase..." on an element (not in a comment)
  if (/\btitle="[A-Z]/.test(content)) return true;

  return false;
}

/**
 * Detect whether a source file uses the react-i18next translation API.
 */
function usesTranslationApi(content: string): boolean {
  return (
    content.includes('useTranslation') ||
    content.includes('<Trans') ||
    content.includes('i18n.t(')
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Component Translation Usage — static analysis', () => {
  describe('Components with user-facing text use the translation API', () => {
    for (const dir of REQUIRED_DIRS) {
      const targetDir = path.join(COMPONENTS_DIR, dir);

      describe(`${dir}/`, () => {
        const files = getAllTsxFiles(targetDir);

        if (files.length === 0) {
          it(`directory src/components/${dir} exists and has .tsx files`, () => {
            // Soft check: if directory is gone, this test reminds maintainers
            // to remove the entry from REQUIRED_DIRS.
            expect(
              fs.existsSync(targetDir),
              `Directory src/components/${dir} does not exist — remove it from REQUIRED_DIRS`
            ).toBe(true);
          });
        } else {
          for (const filePath of files) {
            const basename = path.basename(filePath);

            // Skip explicitly exempt files
            if (EXEMPT_FILES.has(basename)) continue;

            // Skip files in exempt sub-directories
            const relPath = path.relative(COMPONENTS_DIR, filePath);
            const topDir = relPath.split(path.sep)[0];
            if (EXEMPT_DIRS.has(topDir)) continue;

            it(`${path.relative(COMPONENTS_DIR, filePath)} uses useTranslation or Trans when it has user-facing text`, () => {
              const content = fs.readFileSync(filePath, 'utf-8');

              if (!hasUserFacingText(content)) {
                // No detectable user-facing text — nothing to assert
                return;
              }

              expect(
                usesTranslationApi(content),
                [
                  `${path.relative(COMPONENTS_DIR, filePath)} appears to contain user-facing text`,
                  `but does not use useTranslation(), <Trans>, or i18n.t().`,
                  `Either add \`const { t } = useTranslation("namespace");\` and replace`,
                  `hardcoded strings with t() calls, or add the file to EXEMPT_FILES`,
                  `in component-translation-usage.test.ts if it truly has no translatable text.`,
                ].join('\n')
              ).toBe(true);
            });
          }
        }
      });
    }
  });
});
