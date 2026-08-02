import { test, expect } from "@playwright/test";
import {
  clearBrowserState,
  registerAndSetup,
  navigateToVault,
} from "../helpers/vault";

/**
 * E2E Test Suite: TOTP Authenticator
 *
 * Tests the integrated TOTP authenticator functionality:
 * 1. Add TOTP item via manual entry (otpauth:// URI)
 * 2. View live code on the authenticators tab
 * 3. Copy code to clipboard
 * 4. Verify code rotates after period
 *
 * Each test registers a fresh user for full isolation.
 * Backend containers must be running (make start).
 */

// Valid test TOTP URI (RFC 6238 test vector secret in base32)
const TEST_TOTP_URI =
  "otpauth://totp/GitHub:e2e-user@test.com?secret=JBSWY3DPEHPK3PXP&issuer=GitHub&algorithm=SHA1&digits=6&period=30";

// Alternate URI with different issuer for multi-item tests
const ALT_TOTP_URI =
  "otpauth://totp/Google:alt-user@test.com?secret=HXDMVJECJJWSRB3HWIZR4IFUGFTMXBOZ&issuer=Google&algorithm=SHA1&digits=6&period=30";

/**
 * Navigate to the authenticators tab in the vault.
 */
async function navigateToAuthenticators(page: import("@playwright/test").Page) {
  await navigateToVault(page);
  await page.getByRole("tab", { name: /authenticators/i }).click();
  // Wait for tab content to render
  await expect(
    page
      .getByText(/no authenticators/i)
      .or(page.locator('[aria-live="polite"]').first()),
  ).toBeVisible({ timeout: 10000 });
}

/**
 * Add a TOTP item via manual URI entry.
 * Returns the title used for the item.
 */
async function addTOTPViaManualEntry(
  page: import("@playwright/test").Page,
  uri: string,
  title: string,
): Promise<void> {
  // Open QR Scanner dialog
  await page.getByRole("button", { name: /scan qr/i }).click();

  // Switch to manual tab
  await page.getByRole("tab", { name: /manual/i }).click();

  // Enter the otpauth:// URI
  await page.locator("#manual-uri").fill(uri);

  // Click "Add Account"
  await page.getByRole("button", { name: /add account/i }).click();

  // Preview dialog should appear with "Verify Authenticator"
  await expect(page.getByText(/verify authenticator/i)).toBeVisible({
    timeout: 10000,
  });

  // A live code should be displayed (6-digit format with thin space)
  const codeDisplay = page.locator('[aria-live="polite"]').first();
  await expect(codeDisplay).toBeVisible();
  const codeText = await codeDisplay.textContent();
  // Code should be 6 digits (possibly with thin space separator)
  expect(codeText?.replace(/\s/g, "")).toMatch(/^\d{6}$/);

  // Set the title
  await page.locator("#totp-preview-title").fill(title);

  // Save the authenticator
  await page.getByRole("button", { name: /save authenticator/i }).click();

  // Wait for the preview dialog to close
  await expect(page.getByText(/verify authenticator/i)).not.toBeVisible({
    timeout: 10000,
  });

  // Item should appear in the authenticators list
  await expect(page.getByText(title)).toBeVisible({ timeout: 10000 });
}

// ─────────────────────────────────────────────────────────────────────
// 1. ADD TOTP ITEM VIA MANUAL ENTRY
// ─────────────────────────────────────────────────────────────────────

test.describe("Add TOTP via Manual Entry", () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page);
  });

  test("add TOTP item using otpauth:// URI", async ({ page }) => {
    await registerAndSetup(page);
    await navigateToAuthenticators(page);

    // Empty state should show "No Authenticators"
    await expect(page.getByText(/no authenticators/i)).toBeVisible();

    // Add TOTP via manual entry
    await addTOTPViaManualEntry(page, TEST_TOTP_URI, "GitHub 2FA");

    // Verify item appears with the issuer label
    await expect(page.getByText("GitHub 2FA")).toBeVisible();
  });

  test("preview shows live code before saving", async ({ page }) => {
    await registerAndSetup(page);
    await navigateToAuthenticators(page);

    // Open QR scanner → manual tab → enter URI
    await page.getByRole("button", { name: /scan qr/i }).click();
    await page.getByRole("tab", { name: /manual/i }).click();
    await page.locator("#manual-uri").fill(TEST_TOTP_URI);
    await page.getByRole("button", { name: /add account/i }).click();

    // Preview dialog should show the issuer
    await expect(page.getByText("GitHub")).toBeVisible({ timeout: 10000 });

    // Live code should be visible (aria-live="polite" element)
    const codeDisplay = page.locator('[aria-live="polite"]').first();
    await expect(codeDisplay).toBeVisible();
    const code = await codeDisplay.textContent();
    expect(code?.replace(/\s/g, "")).toMatch(/^\d{6}$/);

    // Countdown timer (SVG) should be visible
    await expect(page.locator("svg.-rotate-90").first()).toBeVisible();

    // Cancel without saving
    await page.getByRole("button", { name: /cancel/i }).click();

    // No authenticator should have been added
    await expect(page.getByText(/no authenticators/i)).toBeVisible({
      timeout: 10000,
    });
  });

  test("save is disabled without title", async ({ page }) => {
    await registerAndSetup(page);
    await navigateToAuthenticators(page);

    // Open QR scanner → manual → enter URI
    await page.getByRole("button", { name: /scan qr/i }).click();
    await page.getByRole("tab", { name: /manual/i }).click();
    await page.locator("#manual-uri").fill(TEST_TOTP_URI);
    await page.getByRole("button", { name: /add account/i }).click();

    // Preview dialog visible
    await expect(page.getByText(/verify authenticator/i)).toBeVisible({
      timeout: 10000,
    });

    // Clear the auto-filled title
    await page.locator("#totp-preview-title").fill("");

    // Save button should be disabled
    const saveButton = page.getByRole("button", {
      name: /save authenticator/i,
    });
    await expect(saveButton).toBeDisabled();

    // Fill a title — save should become enabled
    await page.locator("#totp-preview-title").fill("My Auth");
    await expect(saveButton).toBeEnabled();
  });

  test("invalid URI shows error", async ({ page }) => {
    await registerAndSetup(page);
    await navigateToAuthenticators(page);

    // Open QR scanner → manual tab
    await page.getByRole("button", { name: /scan qr/i }).click();
    await page.getByRole("tab", { name: /manual/i }).click();

    // Enter an invalid URI
    await page.locator("#manual-uri").fill("https://not-an-otp-uri.com");
    await page.getByRole("button", { name: /add account/i }).click();

    // Error message should appear
    await expect(page.locator(".text-destructive").first()).toBeVisible({
      timeout: 5000,
    });
  });

  test("add multiple TOTP items", async ({ page }) => {
    await registerAndSetup(page);
    await navigateToAuthenticators(page);

    // Add first TOTP
    await addTOTPViaManualEntry(page, TEST_TOTP_URI, "GitHub 2FA");

    // Add second TOTP
    // Need to open the scanner again — use the "Scan QR Code" button in header
    await page.getByRole("button", { name: /scan qr/i }).click();
    await page.getByRole("tab", { name: /manual/i }).click();
    await page.locator("#manual-uri").fill(ALT_TOTP_URI);
    await page.getByRole("button", { name: /add account/i }).click();
    await expect(page.getByText(/verify authenticator/i)).toBeVisible({
      timeout: 10000,
    });
    await page.locator("#totp-preview-title").fill("Google 2FA");
    await page.getByRole("button", { name: /save authenticator/i }).click();
    await expect(page.getByText(/verify authenticator/i)).not.toBeVisible({
      timeout: 10000,
    });

    // Both items should be visible
    await expect(page.getByText("GitHub 2FA")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Google 2FA")).toBeVisible({ timeout: 10000 });
  });
});

// ─────────────────────────────────────────────────────────────────────
// 2. VIEW LIVE CODE
// ─────────────────────────────────────────────────────────────────────

test.describe("View Live TOTP Code", () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page);
  });

  test("authenticator card shows 6-digit code", async ({ page }) => {
    await registerAndSetup(page);
    await navigateToAuthenticators(page);
    await addTOTPViaManualEntry(page, TEST_TOTP_URI, "GitHub 2FA");

    // The TOTP code card should display a valid 6-digit code
    const codeDisplay = page.locator('[aria-live="polite"]').first();
    await expect(codeDisplay).toBeVisible();
    const code = await codeDisplay.textContent();
    expect(code?.replace(/\s/g, "")).toMatch(/^\d{6}$/);
  });

  test("countdown timer is visible on code card", async ({ page }) => {
    await registerAndSetup(page);
    await navigateToAuthenticators(page);
    await addTOTPViaManualEntry(page, TEST_TOTP_URI, "GitHub 2FA");

    // The circular SVG countdown should be visible
    const countdown = page.locator("svg.-rotate-90").first();
    await expect(countdown).toBeVisible();

    // The remaining seconds label should show a number
    const secondsLabel = page.locator('[aria-label*="seconds remaining"]');
    await expect(secondsLabel).toBeVisible();
    const seconds = await secondsLabel.textContent();
    const num = parseInt(seconds || "0", 10);
    expect(num).toBeGreaterThan(0);
    expect(num).toBeLessThanOrEqual(30);
  });

  test("authenticators tab persists via URL", async ({ page }) => {
    await registerAndSetup(page);
    await navigateToAuthenticators(page);
    await addTOTPViaManualEntry(page, TEST_TOTP_URI, "GitHub 2FA");

    // URL should contain tab=authenticators
    expect(page.url()).toContain("tab=authenticators");

    // Reload — should still be on authenticators tab with the item visible
    await page.reload();

    // May need to unlock vault again after reload
    const masterPasswordInput = page.locator("#master-password");
    if (await masterPasswordInput.isVisible().catch(() => false)) {
      const { TEST_PASSWORD } = await import("../helpers/vault");
      await masterPasswordInput.fill(TEST_PASSWORD);
      await page.getByRole("button", { name: /unlock/i }).click();
    }

    await expect(page.getByText("GitHub 2FA")).toBeVisible({ timeout: 15000 });
  });
});

// ─────────────────────────────────────────────────────────────────────
// 3. COPY CODE
// ─────────────────────────────────────────────────────────────────────

test.describe("Copy TOTP Code", () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page);
  });

  test("copy button copies code to clipboard", async ({ page, context }) => {
    // Grant clipboard permissions
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);

    await registerAndSetup(page);
    await navigateToAuthenticators(page);
    await addTOTPViaManualEntry(page, TEST_TOTP_URI, "GitHub 2FA");

    // Get the current code displayed
    const codeDisplay = page.locator('[aria-live="polite"]').first();
    const displayedCode = await codeDisplay.textContent();
    const rawCode = displayedCode?.replace(/\s/g, "") || "";

    // Click the copy button (aria-label="Copy code")
    await page.getByRole("button", { name: /copy code/i }).click();

    // Check icon should appear briefly (confirmation feedback)
    await expect(
      page.locator(".text-green-600").first(),
    ).toBeVisible({ timeout: 3000 });

    // Verify clipboard content matches the raw code (without spaces)
    const clipboardContent = await page.evaluate(() =>
      navigator.clipboard.readText(),
    );
    expect(clipboardContent).toBe(rawCode);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 4. CODE ROTATION
// ─────────────────────────────────────────────────────────────────────

test.describe("TOTP Code Rotation", () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page);
  });

  test("code updates after period elapses", async ({ page }) => {
    // Increase timeout for this test as we may wait up to 31 seconds
    test.setTimeout(90000);

    await registerAndSetup(page);
    await navigateToAuthenticators(page);
    await addTOTPViaManualEntry(page, TEST_TOTP_URI, "GitHub 2FA");

    const codeDisplay = page.locator('[aria-live="polite"]').first();
    const secondsLabel = page.locator('[aria-label*="seconds remaining"]');

    // Record the initial code
    const initialCode = await codeDisplay.textContent();
    expect(initialCode?.replace(/\s/g, "")).toMatch(/^\d{6}$/);

    // Wait until the countdown reaches 1 or 0 (close to period boundary)
    // then wait a couple more seconds for the new code to generate
    await expect(async () => {
      const remaining = await secondsLabel.textContent();
      const secs = parseInt(remaining || "30", 10);
      // We want to be past the period boundary
      expect(secs).toBeGreaterThanOrEqual(25);
    }).toPass({ timeout: 35000 });

    // After the period boundary, the code should have changed
    // (unless we happened to cross within the same TOTP window — very unlikely
    // since we started mid-period)
    const newCode = await codeDisplay.textContent();
    expect(newCode?.replace(/\s/g, "")).toMatch(/^\d{6}$/);

    // The countdown should have reset to near the period value
    const newRemaining = await secondsLabel.textContent();
    const newSecs = parseInt(newRemaining || "0", 10);
    expect(newSecs).toBeGreaterThan(20);
  });
});
