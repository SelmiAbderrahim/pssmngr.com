// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface TouchTargetFinding {
  file: string;
  line: number;
  message: string;
}

const INTERACTIVE_PATTERNS = [
  /<button\b/,
  /<a\b/,
  /<Button\b/,
  /<Link\b/,
  /<MenuItem\b/,
  /<DropdownMenuItem\b/,
];

const SMALL_SIZE_PATTERN =
  /\b(?:h|w|min-h|min-w)-(?:(?:0|1|2|3|4|5|6|7|8|9|10)\b|\[(?:[0-3]?\d|4[0-3])px\])/;
const SAFE_SIZE_PATTERN =
  /\b(?:h|w|min-h|min-w)-(?:(?:11|12|14|16|20|24)\b|\[(?:4[4-9]|[5-9]\d|\d{3,})px\])/;

const SWITCH_PATTERN = /<Switch\b/;

export function auditTouchTargets(rootDir: string): TouchTargetFinding[] {
  const files = collectTsxFiles(rootDir);
  const findings: TouchTargetFinding[] = [];

  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    const lines = source.split(/\r?\n/);

    lines.forEach((line, index) => {
      if (SWITCH_PATTERN.test(line)) return;
      if (!INTERACTIVE_PATTERNS.some((pattern) => pattern.test(line))) return;
      if (!line.includes("className")) return;
      if (!SMALL_SIZE_PATTERN.test(line)) return;
      if (SAFE_SIZE_PATTERN.test(line) || line.includes("min-h-[44px]") || line.includes("min-w-[44px]")) {
        return;
      }

      findings.push({
        file: path.relative(rootDir, file),
        line: index + 1,
        message: "Interactive element has an explicit static size below 44px.",
      });
    });
  }

  return findings;
}

function collectTsxFiles(rootDir: string): string[] {
  const files: string[] = [];

  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name === "coverage") {
        continue;
      }
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && fullPath.endsWith(".tsx")) {
        files.push(fullPath);
      }
    }
  }

  walk(rootDir);
  return files.sort();
}

function formatFinding(finding: TouchTargetFinding): string {
  return `${finding.file}:${finding.line} ${finding.message}`;
}

const isCli = process.argv[1] === fileURLToPath(import.meta.url);
if (isCli) {
  const rootDir = process.argv[2] ?? path.resolve(process.cwd(), "src");
  const findings = auditTouchTargets(rootDir);
  if (findings.length > 0) {
    console.log(findings.map(formatFinding).join("\n"));
    process.exitCode = 1;
  }
}

