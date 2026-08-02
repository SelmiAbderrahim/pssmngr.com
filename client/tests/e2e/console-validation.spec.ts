/**
 * Console Validation Test
 * Validates that homepage and login page have ZERO console errors
 *
 * This test script:
 * 1. Navigates to http://localhost:5173/
 * 2. Captures all console messages
 * 3. Checks for errors
 * 4. Takes screenshot
 * 5. Repeats for /login page
 */

import { test, expect } from '@playwright/test';

test.describe('Frontend Console Validation', () => {
  let consoleErrors: Array<{
    type: string;
    text: string;
    location?: string;
  }> = [];

  let consoleWarnings: Array<{
    type: string;
    text: string;
    location?: string;
  }> = [];

  test.beforeEach(async ({ page }) => {
    // Reset error arrays
    consoleErrors = [];
    consoleWarnings = [];

    // Capture console messages
    page.on('console', (msg) => {
      const type = msg.type();
      const text = msg.text();
      const location = msg.location();

      if (type === 'error') {
        consoleErrors.push({
          type,
          text,
          location: location.url,
        });
      } else if (type === 'warning') {
        consoleWarnings.push({
          type,
          text,
          location: location.url,
        });
      }
    });

    // Capture page errors
    page.on('pageerror', (error) => {
      consoleErrors.push({
        type: 'pageerror',
        text: error.message,
        location: error.stack,
      });
    });

    // Capture request failures
    page.on('requestfailed', (request) => {
      const failure = request.failure();
      if (failure) {
        consoleErrors.push({
          type: 'requestfailed',
          text: `${request.method()} ${request.url()} - ${failure.errorText}`,
        });
      }
    });
  });

  test('Homepage (/) should have ZERO console errors', async ({ page }) => {
    console.log('\n🔍 Testing Homepage: http://localhost:5173/');

    // Navigate to homepage
    await page.goto('http://localhost:5173/', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    // Wait for page to be fully loaded
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000); // Additional wait for async operations

    // Take screenshot
    await page.screenshot({
      path: 'tests/e2e/screenshots/homepage.png',
      fullPage: true,
    });

    // Log results
    console.log(`\n📊 Homepage Results:`);
    console.log(`   Errors: ${consoleErrors.length}`);
    console.log(`   Warnings: ${consoleWarnings.length}`);

    if (consoleErrors.length > 0) {
      console.error('\n❌ Console Errors Found:');
      consoleErrors.forEach((error, index) => {
        console.error(`\n   Error ${index + 1}:`);
        console.error(`   Type: ${error.type}`);
        console.error(`   Message: ${error.text}`);
        console.error(`   Location: ${error.location || 'N/A'}`);
      });
    }

    if (consoleWarnings.length > 0) {
      console.warn('\n⚠️  Console Warnings Found:');
      consoleWarnings.forEach((warning, index) => {
        console.warn(`\n   Warning ${index + 1}:`);
        console.warn(`   Type: ${warning.type}`);
        console.warn(`   Message: ${warning.text}`);
        console.warn(`   Location: ${warning.location || 'N/A'}`);
      });
    }

    if (consoleErrors.length === 0 && consoleWarnings.length === 0) {
      console.log('\n✅ Homepage is clean - ZERO errors and warnings!');
    }

    // Assert NO errors
    expect(consoleErrors,
      `Found ${consoleErrors.length} console error(s) on homepage:\n${consoleErrors.map(e => e.text).join('\n')}`
    ).toHaveLength(0);
  });

  test('Login page (/login) should have ZERO console errors', async ({ page }) => {
    console.log('\n🔍 Testing Login Page: http://localhost:5173/login');

    // Reset error arrays for this test
    consoleErrors = [];
    consoleWarnings = [];

    // Navigate to login page
    await page.goto('http://localhost:5173/login', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    // Wait for page to be fully loaded
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000); // Additional wait for async operations

    // Take screenshot
    await page.screenshot({
      path: 'tests/e2e/screenshots/login-page.png',
      fullPage: true,
    });

    // Log results
    console.log(`\n📊 Login Page Results:`);
    console.log(`   Errors: ${consoleErrors.length}`);
    console.log(`   Warnings: ${consoleWarnings.length}`);

    if (consoleErrors.length > 0) {
      console.error('\n❌ Console Errors Found:');
      consoleErrors.forEach((error, index) => {
        console.error(`\n   Error ${index + 1}:`);
        console.error(`   Type: ${error.type}`);
        console.error(`   Message: ${error.text}`);
        console.error(`   Location: ${error.location || 'N/A'}`);
      });
    }

    if (consoleWarnings.length > 0) {
      console.warn('\n⚠️  Console Warnings Found:');
      consoleWarnings.forEach((warning, index) => {
        console.warn(`\n   Warning ${index + 1}:`);
        console.warn(`   Type: ${warning.type}`);
        console.warn(`   Message: ${warning.text}`);
        console.warn(`   Location: ${warning.location || 'N/A'}`);
      });
    }

    if (consoleErrors.length === 0 && consoleWarnings.length === 0) {
      console.log('\n✅ Login page is clean - ZERO errors and warnings!');
    }

    // Assert NO errors
    expect(consoleErrors,
      `Found ${consoleErrors.length} console error(s) on login page:\n${consoleErrors.map(e => e.text).join('\n')}`
    ).toHaveLength(0);
  });

  test('Full flow: Homepage -> Login navigation should have ZERO errors', async ({ page }) => {
    console.log('\n🔍 Testing Full Navigation Flow');

    // Reset error arrays
    consoleErrors = [];
    consoleWarnings = [];

    // 1. Start at homepage
    await page.goto('http://localhost:5173/', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });
    await page.waitForTimeout(1000);

    const errorsAfterHomepage = consoleErrors.length;
    console.log(`\n   Homepage loaded: ${errorsAfterHomepage} errors`);

    // 2. Navigate to login
    await page.goto('http://localhost:5173/login', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });
    await page.waitForTimeout(1000);

    const errorsAfterLogin = consoleErrors.length - errorsAfterHomepage;
    console.log(`   Login page loaded: ${errorsAfterLogin} new errors`);

    // Log any errors found during flow
    if (consoleErrors.length > 0) {
      console.error('\n❌ Console Errors During Flow:');
      consoleErrors.forEach((error, index) => {
        console.error(`\n   Error ${index + 1}:`);
        console.error(`   Type: ${error.type}`);
        console.error(`   Message: ${error.text}`);
        console.error(`   Location: ${error.location || 'N/A'}`);
      });
    }

    if (consoleErrors.length === 0) {
      console.log('\n✅ Full navigation flow is clean - ZERO errors!');
    }

    // Assert NO errors throughout the entire flow
    expect(consoleErrors,
      `Found ${consoleErrors.length} console error(s) during navigation flow:\n${consoleErrors.map(e => e.text).join('\n')}`
    ).toHaveLength(0);
  });
});
