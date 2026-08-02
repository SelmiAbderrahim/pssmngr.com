#!/usr/bin/env node

/**
 * RTL & Responsive Design Compliance Checker
 *
 * Validates that codebase follows RTL-safe patterns:
 * - Uses logical properties (ms-, me-, ps-, pe-, start-, end-)
 * - Avoids physical directional properties (ml-, mr-, pl-, pr-, left-, right-)
 * - Uses gap-* instead of space-x-*
 * - Icons are properly mirrored
 *
 * @module scripts/rtl-responsive-check
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// =============================================================================
// CONFIGURATION
// =============================================================================

const CONFIG = {
  // Directories to scan
  srcDirs: ['src/components', 'src/routes', 'src/layouts'],

  // File extensions to check
  extensions: ['.tsx', '.jsx'],

  // Physical properties that should be converted to logical
  physicalPatterns: [
    // Margins
    { pattern: /\bml-\d+/g, replacement: 'ms-*', severity: 'error' },
    { pattern: /\bmr-\d+/g, replacement: 'me-*', severity: 'error' },
    { pattern: /\bml-\[/g, replacement: 'ms-[*]', severity: 'error' },
    { pattern: /\bmr-\[/g, replacement: 'me-[*]', severity: 'error' },

    // Paddings
    { pattern: /\bpl-\d+/g, replacement: 'ps-*', severity: 'error' },
    { pattern: /\bpr-\d+/g, replacement: 'pe-*', severity: 'error' },
    { pattern: /\bpl-\[/g, replacement: 'ps-[*]', severity: 'error' },
    { pattern: /\bpr-\[/g, replacement: 'pe-[*]', severity: 'error' },

    // Text alignment
    { pattern: /\btext-left\b/g, replacement: 'text-start', severity: 'error' },
    { pattern: /\btext-right\b/g, replacement: 'text-end', severity: 'error' },

    // Positioning
    { pattern: /\bleft-\d+/g, replacement: 'start-*', severity: 'error' },
    { pattern: /\bright-\d+/g, replacement: 'end-*', severity: 'error' },
    { pattern: /\bleft-\[/g, replacement: 'start-[*]', severity: 'error' },
    { pattern: /\bright-\[/g, replacement: 'end-[*]', severity: 'error' },

    // Borders
    { pattern: /\bborder-l-/g, replacement: 'border-s-*', severity: 'error' },
    { pattern: /\bborder-r-/g, replacement: 'border-e-*', severity: 'error' },
    { pattern: /\bborder-l\b/g, replacement: 'border-s', severity: 'error' },
    { pattern: /\bborder-r\b/g, replacement: 'border-e', severity: 'error' },

    // Rounded corners
    { pattern: /\brounded-l-/g, replacement: 'rounded-s-*', severity: 'error' },
    { pattern: /\brounded-r-/g, replacement: 'rounded-e-*', severity: 'error' },
    { pattern: /\brounded-tl-/g, replacement: 'rounded-ss-*', severity: 'warn' },
    { pattern: /\brounded-tr-/g, replacement: 'rounded-se-*', severity: 'warn' },
    { pattern: /\brounded-bl-/g, replacement: 'rounded-es-*', severity: 'warn' },
    { pattern: /\brounded-br-/g, replacement: 'rounded-ee-*', severity: 'warn' },

    // Spacing (space-x can cause issues in RTL)
    { pattern: /\bspace-x-\d+/g, replacement: 'gap-*', severity: 'warn' },
    { pattern: /\bspace-x-\[/g, replacement: 'gap-[*]', severity: 'warn' },

    // Float
    { pattern: /\bfloat-left\b/g, replacement: 'float-start', severity: 'error' },
    { pattern: /\bfloat-right\b/g, replacement: 'float-end', severity: 'error' },

    // Scroll
    { pattern: /\bscroll-ml-/g, replacement: 'scroll-ms-*', severity: 'error' },
    { pattern: /\bscroll-mr-/g, replacement: 'scroll-me-*', severity: 'error' },
    { pattern: /\bscroll-pl-/g, replacement: 'scroll-ps-*', severity: 'error' },
    { pattern: /\bscroll-pr-/g, replacement: 'scroll-pe-*', severity: 'error' },
  ],

  // Patterns that are allowed (exceptions)
  allowedPatterns: [
    // RTL variants are fine
    /rtl:ml-/,
    /rtl:mr-/,
    /rtl:pl-/,
    /rtl:pr-/,
    /rtl:left-/,
    /rtl:right-/,
    /rtl:text-left/,
    /rtl:text-right/,
    /rtl:border-l/,
    /rtl:border-r/,
    /rtl:rounded-l/,
    /rtl:rounded-r/,
    /rtl:float-left/,
    /rtl:float-right/,

    // LTR variants are fine (explicit direction)
    /ltr:ml-/,
    /ltr:mr-/,
    /ltr:pl-/,
    /ltr:pr-/,
    /ltr:left-/,
    /ltr:right-/,

    // Comments and documentation
    /\/\/.*text-left/,
    /\/\/.*text-right/,
    /\/\*.*text-left/,
    /\/\*.*text-right/,

    // Centering patterns (left-1/2 with -translate-x-1/2)
    /left-1\/2.*-translate-x-1\/2/,
    /-translate-x-1\/2.*left-1\/2/,
    /left-1\/2/,  // Accept left-1/2 as it's a centering pattern

    // Data attributes that position based on side (Radix UI patterns)
    /data-\[side=left\]/,
    /data-\[side=right\]/,
    /data-\[state=open\].*left-/,
    /data-\[state=open\].*right-/,
  ],

  // Exit codes
  exitCodes: {
    success: 0,
    warnings: 0, // Warnings don't fail the build
    errors: 1,
  },
};

// =============================================================================
// UTILITIES
// =============================================================================

const colors = {
  red: (text) => `\x1b[31m${text}\x1b[0m`,
  yellow: (text) => `\x1b[33m${text}\x1b[0m`,
  green: (text) => `\x1b[32m${text}\x1b[0m`,
  blue: (text) => `\x1b[34m${text}\x1b[0m`,
  gray: (text) => `\x1b[90m${text}\x1b[0m`,
  bold: (text) => `\x1b[1m${text}\x1b[0m`,
};

function getGitStagedFiles() {
  try {
    const output = execSync('git diff --cached --name-only --diff-filter=ACM', {
      encoding: 'utf-8',
    });
    return output.split('\n').filter(Boolean);
  } catch {
    return null; // Not in a git repo or no staged files
  }
}

function getAllFiles(dir, extensions) {
  const files = [];

  function traverse(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        traverse(fullPath);
      } else if (entry.isFile() && extensions.some(ext => entry.name.endsWith(ext))) {
        files.push(fullPath);
      }
    }
  }

  if (fs.existsSync(dir)) {
    traverse(dir);
  }

  return files;
}

function isAllowedPattern(line, match) {
  // Check if the match is part of an allowed pattern
  for (const allowed of CONFIG.allowedPatterns) {
    if (allowed.test(line)) {
      return true;
    }
  }
  return false;
}

function checkFile(filePath) {
  const issues = [];
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  lines.forEach((line, index) => {
    const lineNumber = index + 1;

    for (const { pattern, replacement, severity } of CONFIG.physicalPatterns) {
      const matches = line.match(pattern);

      if (matches) {
        for (const match of matches) {
          if (!isAllowedPattern(line, match)) {
            issues.push({
              file: filePath,
              line: lineNumber,
              column: line.indexOf(match) + 1,
              match,
              replacement,
              severity,
              lineContent: line.trim(),
            });
          }
        }
      }
    }
  });

  return issues;
}

// =============================================================================
// MAIN
// =============================================================================

function main() {
  console.log(colors.bold('\n🔍 RTL & Responsive Design Compliance Check\n'));

  const args = process.argv.slice(2);
  const checkStagedOnly = args.includes('--staged');
  const fixMode = args.includes('--fix');

  let filesToCheck = [];

  if (checkStagedOnly) {
    console.log(colors.gray('Checking staged files only...\n'));
    const stagedFiles = getGitStagedFiles();

    if (stagedFiles === null) {
      console.log(colors.yellow('Not in a git repository or no staged files.'));
      process.exit(0);
    }

    filesToCheck = stagedFiles.filter(f =>
      CONFIG.extensions.some(ext => f.endsWith(ext)) &&
      CONFIG.srcDirs.some(dir => f.includes(dir))
    );
  } else {
    console.log(colors.gray('Checking all source files...\n'));
    for (const dir of CONFIG.srcDirs) {
      const fullPath = path.resolve(process.cwd(), dir);
      filesToCheck.push(...getAllFiles(fullPath, CONFIG.extensions));
    }
  }

  if (filesToCheck.length === 0) {
    console.log(colors.green('✓ No files to check\n'));
    process.exit(0);
  }

  console.log(colors.gray(`Scanning ${filesToCheck.length} files...\n`));

  const allIssues = [];

  for (const file of filesToCheck) {
    const issues = checkFile(file);
    allIssues.push(...issues);
  }

  // Group issues by file
  const issuesByFile = {};
  for (const issue of allIssues) {
    if (!issuesByFile[issue.file]) {
      issuesByFile[issue.file] = [];
    }
    issuesByFile[issue.file].push(issue);
  }

  // Report issues
  const errorCount = allIssues.filter(i => i.severity === 'error').length;
  const warnCount = allIssues.filter(i => i.severity === 'warn').length;

  if (allIssues.length === 0) {
    console.log(colors.green('✓ All files pass RTL compliance checks!\n'));
    process.exit(0);
  }

  // Print issues
  for (const [file, issues] of Object.entries(issuesByFile)) {
    const relativePath = path.relative(process.cwd(), file);
    console.log(colors.bold(relativePath));

    for (const issue of issues) {
      const icon = issue.severity === 'error' ? colors.red('✗') : colors.yellow('⚠');
      const severityColor = issue.severity === 'error' ? colors.red : colors.yellow;

      console.log(`  ${icon} Line ${issue.line}:${issue.column}: ${severityColor(issue.match)} → Use ${colors.green(issue.replacement)}`);
      console.log(colors.gray(`    ${issue.lineContent.substring(0, 80)}${issue.lineContent.length > 80 ? '...' : ''}`));
    }
    console.log('');
  }

  // Summary
  console.log(colors.bold('Summary:'));
  if (errorCount > 0) {
    console.log(colors.red(`  ✗ ${errorCount} error(s)`));
  }
  if (warnCount > 0) {
    console.log(colors.yellow(`  ⚠ ${warnCount} warning(s)`));
  }
  console.log('');

  // Exit with appropriate code
  if (errorCount > 0) {
    console.log(colors.red('RTL compliance check failed. Please fix the errors above.'));
    console.log(colors.gray('Use logical properties (ms-, me-, ps-, pe-, start-, end-) instead of physical ones.\n'));
    process.exit(CONFIG.exitCodes.errors);
  } else {
    console.log(colors.yellow('RTL compliance check passed with warnings.'));
    console.log(colors.gray('Consider converting space-x-* to gap-* for better RTL support.\n'));
    process.exit(CONFIG.exitCodes.warnings);
  }
}

main();
