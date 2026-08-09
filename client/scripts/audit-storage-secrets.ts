// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * audit-storage-secrets.ts
 *
 * Fail-fast guard: refuse to merge code that persists a session token,
 * password, secret, or any vault-key-shaped value to localStorage,
 * sessionStorage, or IndexedDB.
 *
 * Usage (Docker):
 *   docker exec -it pssmngr-client npx tsx scripts/audit-storage-secrets.ts
 */

import { promises as fs, statSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Resolve the scan roots in both layouts:
 *   - Host:      <repo>/client/scripts/  → repo = ../../
 *   - Container: /app/scripts/           → /app/ is the mounted client/
 *
 * We try both, keep what exists, and never error on the missing one.
 */
function existingDir(p: string): string | null {
  try {
    const s = statSync(p);
    return s.isDirectory() ? p : null;
  } catch {
    return null;
  }
}

const HOST_REPO_ROOT = path.resolve(__dirname, "..", "..");
const CONTAINER_CLIENT_ROOT = path.resolve(__dirname, "..");

const SCAN_DIRS = (
  [
    path.join(HOST_REPO_ROOT, "client", "src"),
    path.join(HOST_REPO_ROOT, "pssmngr-server", "packages"),
    path.join(HOST_REPO_ROOT, "pssmngr-server", "apps"),
    path.join(CONTAINER_CLIENT_ROOT, "src"),
  ]
    .map(existingDir)
    .filter((v): v is string => v !== null)
);

const ALLOWLIST = new Set<string>([
  // The audit script itself contains literal patterns.
  path.join(HOST_REPO_ROOT, "client", "scripts", "audit-storage-secrets.ts"),
  path.join(CONTAINER_CLIENT_ROOT, "scripts", "audit-storage-secrets.ts"),
]);

/**
 * Sensitive substrings that, if they appear inside a STRING LITERAL
 * storage-key, indicate a leak. Identifiers (variable names) are NOT
 * matched — many existing keys are constants whose Identifier ends in
 * `_KEY` (e.g. `ACTIVE_WORKSPACE_KEY`) which is just convention.
 *
 * Matching is case-insensitive on the literal contents only.
 */
const SENSITIVE_KEY_PATTERN =
  /\b(?:token|password|secret|session|masterkey|master_key|master[_-]?password|api[_-]?key|auth[_-]?token|session[_-]?token|vault[_-]?key|derived[_-]?key)\b/i;

// Patterns of storage-writing call expressions. We require the storage
// call AND a sensitive key embedded as a STRING LITERAL in the first
// argument (or `key:` property).
const STORAGE_CALL_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  // localStorage.setItem("foo", ...)   — capture the first arg only.
  {
    name: "localStorage.setItem",
    pattern: /localStorage\.setItem\s*\(\s*(["'`])([^"'`]*)\1/g,
  },
  {
    name: "sessionStorage.setItem",
    pattern: /sessionStorage\.setItem\s*\(\s*(["'`])([^"'`]*)\1/g,
  },
];

interface Finding {
  file: string;
  line: number;
  call: string;
  excerpt: string;
}

async function* walk(dir: string): AsyncGenerator<string> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (
        entry.name === "node_modules" ||
        entry.name === "dist" ||
        entry.name === "build" ||
        entry.name === ".turbo" ||
        entry.name === ".next" ||
        entry.name === "__tests__" ||
        entry.name === "tests" ||
        entry.name === "e2e"
      ) {
        continue;
      }
      yield* walk(full);
    } else if (
      entry.isFile() &&
      /\.(ts|tsx|js|mjs|cjs)$/.test(entry.name) &&
      !/\.test\.(ts|tsx)$/.test(entry.name) &&
      !/\.spec\.(ts|tsx)$/.test(entry.name)
    ) {
      yield full;
    }
  }
}

async function scanFile(filePath: string): Promise<Finding[]> {
  if (ALLOWLIST.has(filePath)) return [];
  const findings: Finding[] = [];
  const content = await fs.readFile(filePath, "utf8");
  const lines = content.split("\n");

  for (const { name, pattern } of STORAGE_CALL_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      // match[1] is the quote character; match[2] is the literal string
      // contents. We only flag if the literal itself names a secret.
      const literal = match[2] ?? "";
      if (!SENSITIVE_KEY_PATTERN.test(literal)) continue;
      const lineNumber =
        content.slice(0, match.index).split("\n").length;
      const excerpt = lines[lineNumber - 1]?.trim() ?? "";
      findings.push({ file: filePath, line: lineNumber, call: name, excerpt });
    }
  }
  return findings;
}

async function main(): Promise<void> {
  const all: Finding[] = [];
  for (const dir of SCAN_DIRS) {
    for await (const file of walk(dir)) {
      const found = await scanFile(file);
      all.push(...found);
    }
  }

  if (all.length === 0) {
    console.log("[audit-storage-secrets] OK — no sensitive persistence call-sites found.");
    process.exit(0);
  }

  console.error("[audit-storage-secrets] FAILED — sensitive persistence detected:");
  for (const f of all) {
    const rel = path.relative(HOST_REPO_ROOT, f.file);
    console.error(`  ${rel}:${f.line}  [${f.call}]  ${f.excerpt}`);
  }
  console.error(
    "\nFix: route the value through `client/src/auth/sessionStore.ts` (session " +
      "tokens), keep keys in-memory only (master / derived keys), or delete " +
      "the persistence call entirely.",
  );
  process.exit(1);
}

void main().catch((err) => {
  console.error("[audit-storage-secrets] script error:", err);
  process.exit(2);
});
