#!/usr/bin/env node

/**
 * Design System Test CLI Script
 *
 * Run this script to validate design system compliance across the project.
 * Suitable for CI/CD pipelines and local development.
 *
 * Usage:
 *   node scripts/test-design-system.js
 *   node scripts/test-design-system.js --threshold=95
 *   node scripts/test-design-system.js --format=json
 *   node scripts/test-design-system.js --help
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// Parse command line arguments
const args = process.argv.slice(2);
const config = {};

for (const arg of args) {
  if (arg.startsWith('--threshold=')) {
    config.threshold = parseInt(arg.split('=')[1]);
  } else if (arg.startsWith('--format=')) {
    config.outputFormat = arg.split('=')[1];
  } else if (arg === '--include-warnings') {
    config.includeWarnings = true;
  } else if (arg === '--no-fail-on-violations') {
    config.failOnViolations = false;
  } else if (arg === '--help' || arg === '-h') {
    showHelp();
    process.exit(0);
  }
}

function showHelp() {
  console.log(`
🎨 Design System Test CLI

Usage: node scripts/test-design-system.js [options]

Options:
  --threshold=<number>     Minimum compliance percentage (default: 100)
  --format=<format>        Output format: text, json, or junit (default: text)
  --include-warnings       Include warnings as failures
  --no-fail-on-violations  Don't exit with error code on violations
  --help, -h              Show this help message

Examples:
  node scripts/test-design-system.js
  node scripts/test-design-system.js --threshold=95
  node scripts/test-design-system.js --format=json
  node scripts/test-design-system.js --threshold=90 --include-warnings

Exit Codes:
  0  - All tests passed
  1  - Tests failed or violations found
`);
}

try {
  console.log('🚀 Running Design System Compliance Tests...\n');

  // Run the actual design system tests using Vitest
  const vitestCommand = `npx vitest run src/__tests__/design-system/index.test.ts --reporter=verbose`;

  if (config.outputFormat === 'json') {
    // For JSON output, we need to run tests and capture the output
    console.log('Running tests with JSON output...');
    execSync(vitestCommand, {
      cwd: projectRoot,
      stdio: 'inherit',
      env: {
        ...process.env,
        NODE_ENV: 'test',
        DESIGN_SYSTEM_CONFIG: JSON.stringify(config),
      },
    });
  } else {
    // Run tests with standard output
    execSync(vitestCommand, {
      cwd: projectRoot,
      stdio: 'inherit',
      env: {
        ...process.env,
        NODE_ENV: 'test',
        DESIGN_SYSTEM_CONFIG: JSON.stringify(config),
      },
    });
  }

  console.log('\n✅ Design System tests completed successfully!');
} catch (error) {
  console.error('\n❌ Design System tests failed!');
  console.error('Exit code:', error.status);

  // Provide helpful guidance
  console.log('\n💡 To fix design system issues:');
  console.log('1. Check for hardcoded colors (#ffffff, #000000, etc.)');
  console.log('2. Use semantic color tokens (bg-primary, text-foreground, etc.)');
  console.log('3. Use spacing tokens (p-4, gap-6, space-y-4, etc.)');
  console.log('4. Use border radius tokens (rounded-lg, rounded-md, etc.)');
  console.log('5. Use shadow tokens (shadow-sm, shadow-md, etc.)');
  console.log('6. Use typography tokens (text-lg, font-semibold, etc.)');
  console.log('7. Use CSS custom properties instead of hardcoded values');

  process.exit(1);
}