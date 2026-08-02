#!/usr/bin/env node

/**
 * Console Validation Script
 * Validates that frontend pages have ZERO console errors
 *
 * Usage: node scripts/validate-console.js
 */

import { chromium } from 'playwright';

const PAGES_TO_TEST = [
  { url: 'http://localhost:5173/', name: 'Homepage' },
  { url: 'http://localhost:5173/login', name: 'Login Page' },
];

const TIMEOUT = 30000;
const WAIT_AFTER_LOAD = 2000;

/**
 * Test a single page for console errors
 */
async function testPage(page, testConfig) {
  const errors = [];
  const warnings = [];

  // Capture console messages
  page.on('console', (msg) => {
    const type = msg.type();
    const text = msg.text();

    if (type === 'error') {
      errors.push({ type, text, location: msg.location() });
    } else if (type === 'warning') {
      warnings.push({ type, text, location: msg.location() });
    }
  });

  // Capture page errors
  page.on('pageerror', (error) => {
    errors.push({
      type: 'pageerror',
      text: error.message,
      location: error.stack,
    });
  });

  // Capture request failures
  page.on('requestfailed', (request) => {
    const failure = request.failure();
    if (failure) {
      errors.push({
        type: 'requestfailed',
        text: `${request.method()} ${request.url()} - ${failure.errorText}`,
      });
    }
  });

  console.log(`\n🔍 Testing: ${testConfig.name} (${testConfig.url})`);

  try {
    // Navigate to page
    await page.goto(testConfig.url, {
      waitUntil: 'networkidle',
      timeout: TIMEOUT,
    });

    // Wait for additional async operations
    await page.waitForTimeout(WAIT_AFTER_LOAD);

    // Log results
    console.log(`\n📊 Results for ${testConfig.name}:`);
    console.log(`   Errors: ${errors.length}`);
    console.log(`   Warnings: ${warnings.length}`);

    if (errors.length > 0) {
      console.error(`\n❌ Console Errors Found (${errors.length}):`);
      errors.forEach((error, index) => {
        console.error(`\n   Error ${index + 1}:`);
        console.error(`   Type: ${error.type}`);
        console.error(`   Message: ${error.text}`);
        if (error.location) {
          console.error(`   Location: ${JSON.stringify(error.location)}`);
        }
      });
    }

    if (warnings.length > 0) {
      console.warn(`\n⚠️  Console Warnings Found (${warnings.length}):`);
      warnings.forEach((warning, index) => {
        console.warn(`\n   Warning ${index + 1}:`);
        console.warn(`   Message: ${warning.text}`);
      });
    }

    if (errors.length === 0 && warnings.length === 0) {
      console.log(`\n✅ ${testConfig.name} is clean - ZERO errors and warnings!`);
    }

    return {
      name: testConfig.name,
      url: testConfig.url,
      errors,
      warnings,
      success: errors.length === 0,
    };
  } catch (error) {
    console.error(`\n❌ Failed to test ${testConfig.name}:`, error.message);
    return {
      name: testConfig.name,
      url: testConfig.url,
      errors: [{ type: 'test-error', text: error.message }],
      warnings: [],
      success: false,
    };
  }
}

/**
 * Main test runner
 */
async function main() {
  console.log('🚀 Starting Frontend Console Validation\n');
  console.log('=' .repeat(60));

  let browser;
  try {
    // Launch browser
    console.log('🌐 Launching Chromium browser...');
    browser = await chromium.launch({
      headless: true,
    });

    const context = await browser.newContext();
    const page = await context.newPage();

    // Test all pages
    const results = [];
    for (const pageConfig of PAGES_TO_TEST) {
      const result = await testPage(page, pageConfig);
      results.push(result);
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('\n📈 SUMMARY\n');

    const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);
    const totalWarnings = results.reduce((sum, r) => sum + r.warnings.length, 0);
    const allPassed = results.every((r) => r.success);

    results.forEach((result) => {
      const status = result.success ? '✅ PASS' : '❌ FAIL';
      console.log(`${status} - ${result.name} (${result.errors.length} errors, ${result.warnings.length} warnings)`);
    });

    console.log(`\nTotal Errors: ${totalErrors}`);
    console.log(`Total Warnings: ${totalWarnings}`);

    if (allPassed) {
      console.log('\n🎉 SUCCESS! All pages passed validation with ZERO errors!');
      process.exit(0);
    } else {
      console.error('\n💥 FAILURE! Some pages have console errors.');
      process.exit(1);
    }
  } catch (error) {
    console.error('\n💥 Fatal error:', error);
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Run the validation
main().catch((error) => {
  console.error('💥 Unhandled error:', error);
  process.exit(1);
});
