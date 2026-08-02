#!/usr/bin/env node

/**
 * Responsive Design Compliance Checker
 *
 * Validates that components follow responsive design patterns:
 * - Uses responsive breakpoints (sm:, md:, lg:, xl:)
 * - Touch targets meet WCAG 2.1 AA (44x44px minimum)
 * - Proper viewport-relative units
 * - Flexible layouts (flex, grid)
 *
 * @module scripts/responsive-check
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

  // Patterns to check for responsive issues
  responsivePatterns: [
    // Fixed widths that might need to be responsive
    {
      pattern: /\bw-\d{3,}/g, // w-100 or higher (likely fixed width)
      message: 'Consider using responsive widths (w-full, max-w-*, or breakpoint variants)',
      severity: 'warn',
    },
    {
      pattern: /\bh-\d{3,}/g, // h-100 or higher (likely fixed height)
      message: 'Consider using responsive heights (h-auto, min-h-*, or breakpoint variants)',
      severity: 'warn',
    },

    // Fixed pixel values without responsiveness
    {
      pattern: /\bw-\[\d+px\]/g,
      message: 'Fixed pixel width - consider using responsive units or breakpoint variants',
      severity: 'warn',
    },
    {
      pattern: /\bh-\[\d+px\]/g,
      message: 'Fixed pixel height - consider using responsive units or breakpoint variants',
      severity: 'warn',
    },

    // Grid columns without responsive variants
    {
      pattern: /\bgrid-cols-[4-9]\b(?!.*(?:sm:|md:|lg:|xl:))/g,
      message: 'High grid-cols count without responsive variants may cause mobile issues',
      severity: 'warn',
    },

    // Small touch targets (buttons, links with small padding)
    {
      pattern: /\bp-1\b|\bp-0\.5\b/g,
      message: 'Small padding may result in touch targets below 44px - ensure adequate touch area',
      severity: 'info',
    },
  ],

  // Good patterns to look for (just for stats)
  goodPatterns: [
    /\bsm:/g, // Small breakpoint
    /\bmd:/g, // Medium breakpoint
    /\blg:/g, // Large breakpoint
    /\bxl:/g, // Extra large breakpoint
    /\b2xl:/g, // 2XL breakpoint
    /\bmin-h-\[44px\]/g, // Touch target height
    /\bmin-w-\[44px\]/g, // Touch target width
    /\bgap-/g, // Gap-based spacing
    /\bflex\b/g, // Flexbox
    /\bgrid\b/g, // Grid
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
  cyan: (text) => `\x1b[36m${text}\x1b[0m`,
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
    return null;
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

function checkFile(filePath) {
  const issues = [];
  const stats = {
    breakpoints: 0,
    touchTargets: 0,
    flexGrid: 0,
    gaps: 0,
  };

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  // Count good patterns
  for (const pattern of CONFIG.goodPatterns) {
    const matches = content.match(pattern);
    if (matches) {
      if (pattern.source.includes('sm:|md:|lg:|xl:|2xl:')) {
        stats.breakpoints += matches.length;
      } else if (pattern.source.includes('44px')) {
        stats.touchTargets += matches.length;
      } else if (pattern.source.includes('flex|grid')) {
        stats.flexGrid += matches.length;
      } else if (pattern.source.includes('gap-')) {
        stats.gaps += matches.length;
      }
    }
  }

  // Check for issues
  lines.forEach((line, index) => {
    const lineNumber = index + 1;

    for (const { pattern, message, severity } of CONFIG.responsivePatterns) {
      const matches = line.match(pattern);

      if (matches) {
        for (const match of matches) {
          // Skip if line already has responsive variants
          if (line.includes('sm:') || line.includes('md:') || line.includes('lg:') || line.includes('xl:')) {
            continue;
          }

          issues.push({
            file: filePath,
            line: lineNumber,
            column: line.indexOf(match) + 1,
            match,
            message,
            severity,
            lineContent: line.trim(),
          });
        }
      }
    }
  });

  return { issues, stats };
}

// =============================================================================
// MAIN
// =============================================================================

function main() {
  console.log(colors.bold('\n📱 Responsive Design Compliance Check\n'));

  const args = process.argv.slice(2);
  const checkStagedOnly = args.includes('--staged');
  const verbose = args.includes('--verbose') || args.includes('-v');

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
  const totalStats = {
    breakpoints: 0,
    touchTargets: 0,
    flexGrid: 0,
    gaps: 0,
  };

  for (const file of filesToCheck) {
    const { issues, stats } = checkFile(file);
    allIssues.push(...issues);
    totalStats.breakpoints += stats.breakpoints;
    totalStats.touchTargets += stats.touchTargets;
    totalStats.flexGrid += stats.flexGrid;
    totalStats.gaps += stats.gaps;
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
  const infoCount = allIssues.filter(i => i.severity === 'info').length;

  // Print stats
  console.log(colors.bold('📊 Responsive Design Statistics:'));
  console.log(`  ${colors.cyan('Breakpoint uses:')} ${totalStats.breakpoints}`);
  console.log(`  ${colors.cyan('Touch targets (44px):')} ${totalStats.touchTargets}`);
  console.log(`  ${colors.cyan('Flex/Grid layouts:')} ${totalStats.flexGrid}`);
  console.log(`  ${colors.cyan('Gap-based spacing:')} ${totalStats.gaps}`);
  console.log('');

  if (allIssues.length === 0) {
    console.log(colors.green('✓ All files pass responsive design checks!\n'));
    process.exit(0);
  }

  // Print issues (grouped by severity)
  if (verbose || errorCount > 0 || warnCount > 0) {
    for (const [file, issues] of Object.entries(issuesByFile)) {
      const relativePath = path.relative(process.cwd(), file);
      const hasErrors = issues.some(i => i.severity === 'error');
      const hasWarns = issues.some(i => i.severity === 'warn');

      if (verbose || hasErrors || hasWarns) {
        console.log(colors.bold(relativePath));

        for (const issue of issues) {
          if (!verbose && issue.severity === 'info') continue;

          const icon = issue.severity === 'error'
            ? colors.red('✗')
            : issue.severity === 'warn'
              ? colors.yellow('⚠')
              : colors.blue('ℹ');

          const severityColor = issue.severity === 'error'
            ? colors.red
            : issue.severity === 'warn'
              ? colors.yellow
              : colors.blue;

          console.log(`  ${icon} Line ${issue.line}: ${severityColor(issue.match)}`);
          console.log(colors.gray(`    ${issue.message}`));
        }
        console.log('');
      }
    }
  }

  // Summary
  console.log(colors.bold('Summary:'));
  if (errorCount > 0) {
    console.log(colors.red(`  ✗ ${errorCount} error(s)`));
  }
  if (warnCount > 0) {
    console.log(colors.yellow(`  ⚠ ${warnCount} warning(s)`));
  }
  if (infoCount > 0 && verbose) {
    console.log(colors.blue(`  ℹ ${infoCount} info(s)`));
  }
  console.log('');

  // Exit with appropriate code
  if (errorCount > 0) {
    console.log(colors.red('Responsive design check failed. Please fix the errors above.\n'));
    process.exit(CONFIG.exitCodes.errors);
  } else {
    console.log(colors.green('✓ Responsive design check passed!\n'));
    process.exit(CONFIG.exitCodes.warnings);
  }
}

main();
