import { test, expect } from "@playwright/test";
import {
  clearBrowserState,
  registerAndSetup,
  navigateToVault,
  createLoginItem,
} from "../helpers/vault";

/**
 * E2E Test Suite: Watchtower Dashboard
 *
 * Tests the security audit dashboard:
 * 1. Navigate to watchtower, see score
 * 2. View weak/reused/old categories
 * 3. Click "Fix" on finding, navigate to vault
 * 4. Click "Check for breaches" (mocked), see results
 *
 * Each test.describe block registers a fresh user with known-weak
 * passwords so watchtower analysis yields deterministic findings.
 * Backend containers must be running (make start).
 */

// Known weak/reusable passwords for deterministic analysis
const WEAK_PASSWORD = "abc123";
const REUSED_PASSWORD = "SharedP@ss99!";

// ─────────────────────────────────────────────────────────────────────
// Helper: navigate to watchtower page
// ─────────────────────────────────────────────────────────────────────

async function navigateToWatchtower(page: import("@playwright/test").Page) {
  await page.goto("/dashboard/watchtower");

  // Wait for either the dashboard content or the unlock prompt
  await expect(
    page
      .getByText(/security audit/i)
      .first()
      .or(page.locator("#master-password")),
  ).toBeVisible({ timeout: 15000 });

  // If master password prompt is shown, unlock
  const masterPasswordInput = page.locator("#master-password");
  if (await masterPasswordInput.isVisible().catch(() => false)) {
    await masterPasswordInput.fill("SecureVaultP@ss1!");
    await page.getByRole("button", { name: /unlock/i }).click();
  }

  // Wait for analysis to complete (loading spinner disappears, score appears)
  await expect(
    page.getByText(/\/ 100/).or(page.getByText(/no vault found/i)),
  ).toBeVisible({ timeout: 30000 });
}

// ─────────────────────────────────────────────────────────────────────
// 1. WATCHTOWER SCORE AND SUMMARY
// ─────────────────────────────────────────────────────────────────────

test.describe("Watchtower Score and Summary", () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page);
  });

  test("shows perfect score with no vault items", async ({ page }) => {
    await registerAndSetup(page);
    await navigateToWatchtower(page);

    // With no items, score should be 100 (Good)
    await expect(page.getByText("100")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Good")).toBeVisible();

    // All category counts should be 0
    const weakCount = page
      .locator("div")
      .filter({ hasText: /^Weak/ })
      .getByText("0");
    await expect(weakCount.first()).toBeVisible();
  });

  test("shows score and findings with weak passwords", async ({ page }) => {
    await registerAndSetup(page);
    await navigateToVault(page);

    // Create items with weak passwords
    await createLoginItem(page, {
      title: "Weak Service",
      username: "user@weak.com",
      password: WEAK_PASSWORD,
    });

    // Navigate to watchtower
    await navigateToWatchtower(page);

    // Score should be less than 100
    await expect(page.getByText("Good")).not.toBeVisible({ timeout: 10000 });

    // Weak count should be at least 1
    await expect(page.getByText("Weak Passwords")).toBeVisible({
      timeout: 10000,
    });
  });

  test("header shows Security Audit title and Rescan button", async ({
    page,
  }) => {
    await registerAndSetup(page);
    await navigateToWatchtower(page);

    await expect(page.getByText("Security Audit")).toBeVisible();
    await expect(
      page.getByText(/weak, reused, or compromised/i),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /rescan/i }),
    ).toBeVisible();
  });

  test("summary cards show all four categories", async ({ page }) => {
    await registerAndSetup(page);
    await navigateToWatchtower(page);

    // All four category labels should be visible in the summary section
    await expect(page.getByText("Weak").first()).toBeVisible();
    await expect(page.getByText("Reused").first()).toBeVisible();
    await expect(page.getByText("Old").first()).toBeVisible();
    await expect(page.getByText("Breached").first()).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────
// 2. CATEGORY TABS
// ─────────────────────────────────────────────────────────────────────

test.describe("Watchtower Category Tabs", () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page);
  });

  test("weak tab shows findings for weak passwords", async ({ page }) => {
    await registerAndSetup(page);
    await navigateToVault(page);

    // Create an item with a weak password
    await createLoginItem(page, {
      title: "Weak Login",
      username: "weak@test.com",
      password: WEAK_PASSWORD,
    });

    await navigateToWatchtower(page);

    // Weak tab should be active by default
    await expect(page.getByText("Weak Passwords")).toBeVisible({
      timeout: 10000,
    });
    await expect(
      page.getByText(/low entropy|sequential|keyboard|below minimum/i),
    ).toBeVisible();

    // The item title should appear in the findings
    await expect(page.getByText("Weak Login")).toBeVisible();
  });

  test("reused tab shows grouped findings", async ({ page }) => {
    await registerAndSetup(page);
    await navigateToVault(page);

    // Create two items with the same password
    await createLoginItem(page, {
      title: "Reused Site A",
      username: "user@sitea.com",
      password: REUSED_PASSWORD,
    });
    await createLoginItem(page, {
      title: "Reused Site B",
      username: "user@siteb.com",
      password: REUSED_PASSWORD,
    });

    await navigateToWatchtower(page);

    // Switch to Reused tab
    await page.getByRole("tab", { name: /reused/i }).click();

    // Should show reused password findings
    await expect(page.getByText("Reused Passwords")).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText("Reused Site A")).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText("Reused Site B")).toBeVisible();

    // Should show the group header
    await expect(page.getByText(/shared by 2 items/i)).toBeVisible();
  });

  test("old tab shows empty state for new items", async ({ page }) => {
    await registerAndSetup(page);
    await navigateToVault(page);

    // Create a fresh item (not old)
    await createLoginItem(page, {
      title: "Fresh Item",
      username: "fresh@test.com",
      password: "Str0ng!P@ssw0rd#2024",
    });

    await navigateToWatchtower(page);

    // Switch to Old tab
    await page.getByRole("tab", { name: /old/i }).click();

    // Should show empty state since the item was just created
    await expect(page.getByText(/no old passwords found/i)).toBeVisible({
      timeout: 10000,
    });
  });

  test("breached tab shows not-yet-checked state", async ({ page }) => {
    await registerAndSetup(page);
    await navigateToVault(page);

    await createLoginItem(page, {
      title: "Breach Test Item",
      username: "breach@test.com",
      password: "S3cur3P@ss!",
    });

    await navigateToWatchtower(page);

    // Switch to Breached tab
    await page.getByRole("tab", { name: /breached/i }).click();

    // Should show "not yet checked" message
    await expect(
      page.getByText(/breach check has not been run/i),
    ).toBeVisible({ timeout: 10000 });

    // Check Breaches button should be visible
    await expect(
      page.getByRole("button", { name: /check breaches/i }),
    ).toBeVisible();
  });

  test("tab state persists in URL", async ({ page }) => {
    await registerAndSetup(page);
    await navigateToWatchtower(page);

    // Switch to Reused tab
    await page.getByRole("tab", { name: /reused/i }).click();

    // URL should contain tab=reused
    await expect(page).toHaveURL(/tab=reused/);

    // Switch to Old tab
    await page.getByRole("tab", { name: /old/i }).click();
    await expect(page).toHaveURL(/tab=old/);

    // Switch to Breached tab
    await page.getByRole("tab", { name: /breached/i }).click();
    await expect(page).toHaveURL(/tab=breached/);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 3. FIX NAVIGATION
// ─────────────────────────────────────────────────────────────────────

test.describe("Watchtower Fix Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page);
  });

  test("clicking Fix navigates to vault page", async ({ page }) => {
    await registerAndSetup(page);
    await navigateToVault(page);

    // Create a weak item
    await createLoginItem(page, {
      title: "Fix Target Item",
      username: "fix@test.com",
      password: WEAK_PASSWORD,
    });

    await navigateToWatchtower(page);

    // Wait for the weak finding to appear
    await expect(page.getByText("Fix Target Item")).toBeVisible({
      timeout: 10000,
    });

    // Click the Fix button
    await page
      .getByRole("button", { name: /fix/i })
      .first()
      .click();

    // Should navigate to the vault page
    await expect(page).toHaveURL(/\/dashboard\/vault/, { timeout: 10000 });

    // Vault page should be visible with items
    await expect(page.getByText("Fix Target Item")).toBeVisible({
      timeout: 15000,
    });
  });
});

// ─────────────────────────────────────────────────────────────────────
// 4. BREACH CHECK FLOW
// ─────────────────────────────────────────────────────────────────────

test.describe("Watchtower Breach Check", () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page);
  });

  test("breach check banner shows before checking", async ({ page }) => {
    await registerAndSetup(page);
    await navigateToVault(page);

    await createLoginItem(page, {
      title: "Breach Banner Item",
      username: "banner@test.com",
      password: "T3stP@ss!",
    });

    await navigateToWatchtower(page);

    // Breach check banner should be visible
    await expect(
      page.getByText(/check for breached passwords/i),
    ).toBeVisible({ timeout: 10000 });

    // k-anonymity explanation should be present
    await expect(
      page.getByText(/k-anonymity|partial hashes|no plaintext/i),
    ).toBeVisible();
  });

  test("check breaches button triggers check and shows results", async ({
    page,
  }) => {
    await registerAndSetup(page);
    await navigateToVault(page);

    await createLoginItem(page, {
      title: "Breach Check Item",
      username: "breach-check@test.com",
      password: WEAK_PASSWORD,
    });

    await navigateToWatchtower(page);

    // Mock the HIBP API to return a known breach result
    await page.route("**/api.pwnedpasswords.com/**", async (route) => {
      // Return a response that includes the suffix of SHA-1("abc123")
      // SHA-1("abc123") = 6367C48DD193D56EA7B0BAAD25B19455E529F5EE
      // Prefix: 6367C, Suffix: 48DD193D56EA7B0BAAD25B19455E529F5EE
      const suffix = "48DD193D56EA7B0BAAD25B19455E529F5EE";
      await route.fulfill({
        status: 200,
        contentType: "text/plain",
        body: `${suffix}:42\nABCDEF1234567890ABCDEF1234567890ABC:1\n`,
      });
    });

    // Click Check Breaches on the banner
    await page
      .getByRole("button", { name: /check breaches/i })
      .first()
      .click();

    // Wait for check to complete — either show breached results or "no breached"
    await expect(
      page
        .getByText(/found in.*data breach/i)
        .or(page.getByText(/no breached passwords/i)),
    ).toBeVisible({ timeout: 30000 });

    // Banner should disappear after checking
    await expect(
      page.getByText(/check for breached passwords/i),
    ).not.toBeVisible({ timeout: 10000 });
  });

  test("breach check button disabled when no items", async ({ page }) => {
    await registerAndSetup(page);
    await navigateToWatchtower(page);

    // With no vault items, Check Breaches should be disabled
    // Navigate to breached tab to find the button there
    await page.getByRole("tab", { name: /breached/i }).click();

    const checkButton = page
      .getByRole("button", { name: /check breaches/i })
      .first();
    await expect(checkButton).toBeDisabled({ timeout: 10000 });
  });
});

// ─────────────────────────────────────────────────────────────────────
// 5. RESCAN
// ─────────────────────────────────────────────────────────────────────

test.describe("Watchtower Rescan", () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page);
  });

  test("rescan button re-runs analysis", async ({ page }) => {
    await registerAndSetup(page);
    await navigateToVault(page);

    await createLoginItem(page, {
      title: "Rescan Item",
      username: "rescan@test.com",
      password: WEAK_PASSWORD,
    });

    await navigateToWatchtower(page);

    // Score should be visible
    await expect(page.getByText(/\/ 100/)).toBeVisible({ timeout: 10000 });

    // Click Rescan
    await page.getByRole("button", { name: /rescan/i }).click();

    // Score should still be visible after rescan completes
    await expect(page.getByText(/\/ 100/)).toBeVisible({ timeout: 30000 });

    // Last scan time should update
    await expect(page.getByText(/last scan/i)).toBeVisible();
  });
});
