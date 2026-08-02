/**
 * Test User Fixtures for E2E Tests
 *
 * Provides test user data and utilities for E2E testing.
 * Credentials come from the E2E_TEST_EMAIL / E2E_TEST_PASSWORD env vars
 * (see .env.example). Never hardcode a real account here.
 *
 * @module tests/e2e/fixtures/test-users
 */

import { Page } from "@playwright/test";

/**
 * Default test user credentials.
 * Set E2E_TEST_EMAIL / E2E_TEST_PASSWORD in your environment to point the
 * suite at a real seeded account. The fallbacks are non-personal placeholders.
 */
export const DEFAULT_TEST_USER = {
  email: process.env.E2E_TEST_EMAIL ?? "test-user@example.test",
  password: process.env.E2E_TEST_PASSWORD ?? "Test-Passw0rd!E2E",
  name: "Test User",
};

/**
 * Login helper function
 */
export async function login(
  page: Page,
  email: string = DEFAULT_TEST_USER.email,
  password: string = DEFAULT_TEST_USER.password
): Promise<void> {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");

  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  // Wait for successful login (redirect to dashboard)
  await page.waitForURL(/dashboard/, { timeout: 30000 });
}

/**
 * Logout helper function
 */
export async function logout(page: Page): Promise<void> {
  // Click user menu
  const userMenu = page.locator('[data-testid="user-menu"]');
  if (await userMenu.isVisible()) {
    await userMenu.click();
    await page.getByRole("menuitem", { name: /sign out|logout/i }).click();
    await page.waitForURL(/login|home|\//);
  }
}

/**
 * Clear session and storage
 */
export async function clearSession(page: Page): Promise<void> {
  await page.context().clearCookies();
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
}

/**
 * Setup authenticated session
 */
export async function setupAuthenticatedSession(
  page: Page,
  user = DEFAULT_TEST_USER
): Promise<void> {
  await clearSession(page);
  await login(page, user.email, user.password);
}

/**
 * Create test user via API (if available)
 */
export async function createTestUser(
  page: Page,
  userData: {
    email: string;
    password: string;
    name: string;
  }
): Promise<void> {
  // Navigate to registration
  await page.goto("/register");
  await page.waitForLoadState("networkidle");

  // Fill registration form
  await page.getByLabel(/full name|name/i).fill(userData.name);
  await page.getByLabel(/email/i).fill(userData.email);
  await page.getByLabel(/^password$/i).fill(userData.password);
  await page.getByLabel(/confirm password/i).fill(userData.password);

  // Accept terms if present
  const termsCheckbox = page.getByRole("checkbox");
  if (await termsCheckbox.isVisible()) {
    await termsCheckbox.click();
  }

  // Submit
  await page.getByRole("button", { name: /create account|register|sign up/i }).click();

  // Wait for success (either verification page or dashboard)
  await page.waitForURL(/verify|dashboard/, { timeout: 30000 });
}


/**
 * Generate unique test email
 */
export function generateTestEmail(prefix = "test"): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}-${timestamp}-${random}@test.pssmngr.com`;
}
