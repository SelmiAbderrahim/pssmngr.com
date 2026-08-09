import { test, expect } from "@playwright/test";
import { clearBrowserState, registerAndSetup } from "../helpers/vault";

/**
 * E2E Test Suite: Password & Passphrase Generator
 *
 * Tests the generator page:
 * 1. Default password generation on load
 * 2. Toggle settings and verify password changes
 * 3. Switch to passphrase tab and generate passphrase
 * 4. Copy to clipboard
 * 5. Site policy presets
 * 6. Tab state persists on refresh
 */

// ─────────────────────────────────────────────────────────────────────
// Helper: navigate to generator page
// ─────────────────────────────────────────────────────────────────────

async function navigateToGenerator(
  page: import("@playwright/test").Page,
  tab?: "password" | "passphrase",
) {
  const url = tab
    ? `/dashboard/generator?tab=${tab}`
    : "/dashboard/generator";
  await page.goto(url);
  await expect(page.getByText("Password Generator")).toBeVisible({
    timeout: 15000,
  });
}

// ─────────────────────────────────────────────────────────────────────
// 1. DEFAULT PASSWORD GENERATION
// ─────────────────────────────────────────────────────────────────────

test.describe("Default Password Generation", () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page);
  });

  test("shows generated password on page load", async ({ page }) => {
    await registerAndSetup(page);
    await navigateToGenerator(page);

    // Password output should be visible and non-empty
    const output = page.locator('[aria-label="Generated password"]');
    await expect(output).toBeVisible();
    const text = await output.textContent();
    expect(text).toBeTruthy();
    expect(text!.length).toBeGreaterThanOrEqual(8);
  });

  test("shows entropy meter with strength label", async ({ page }) => {
    await registerAndSetup(page);
    await navigateToGenerator(page);

    // Strength label should be visible (one of: Weak, Fair, Good, Strong, Very Strong)
    await expect(
      page.getByText(/weak|fair|good|strong|very strong/i).first(),
    ).toBeVisible();

    // Entropy bits should be shown
    await expect(page.getByText(/bits of entropy/i)).toBeVisible();
  });

  test("regenerate button produces new password", async ({ page }) => {
    await registerAndSetup(page);
    await navigateToGenerator(page);

    const output = page.locator('[aria-label="Generated password"]');
    const firstPassword = await output.textContent();

    // Click regenerate multiple times — at least one should differ (crypto randomness)
    let foundDifferent = false;
    for (let i = 0; i < 5; i++) {
      await page.getByRole("button", { name: /regenerate password/i }).click();
      const newPassword = await output.textContent();
      if (newPassword !== firstPassword) {
        foundDifferent = true;
        break;
      }
    }
    expect(foundDifferent).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 2. TOGGLE SETTINGS
// ─────────────────────────────────────────────────────────────────────

test.describe("Password Settings Toggles", () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page);
  });

  test("disabling symbols produces password without symbols", async ({
    page,
  }) => {
    await registerAndSetup(page);
    await navigateToGenerator(page);

    // Symbols toggle is on by default — turn it off
    const symbolsSwitch = page.locator("#gen-symbols");
    await symbolsSwitch.click();

    // Wait for regeneration
    await page.waitForTimeout(300);

    const output = page.locator('[aria-label="Generated password"]');
    const password = await output.textContent();
    expect(password).toBeTruthy();

    // Should contain only alphanumeric + digits (no symbols)
    expect(password).toMatch(/^[A-Za-z0-9]+$/);
  });

  test("disabling all except digits produces digits-only password", async ({
    page,
  }) => {
    await registerAndSetup(page);
    await navigateToGenerator(page);

    // Turn off uppercase, lowercase, symbols (leave digits on)
    await page.locator("#gen-uppercase").click();
    await page.locator("#gen-lowercase").click();
    await page.locator("#gen-symbols").click();

    await page.waitForTimeout(300);

    const output = page.locator('[aria-label="Generated password"]');
    const password = await output.textContent();
    expect(password).toBeTruthy();
    expect(password).toMatch(/^[0-9]+$/);
  });

  test("last remaining charset toggle is disabled", async ({ page }) => {
    await registerAndSetup(page);
    await navigateToGenerator(page);

    // Turn off 3 of 4 charsets
    await page.locator("#gen-uppercase").click();
    await page.locator("#gen-lowercase").click();
    await page.locator("#gen-symbols").click();

    // The remaining digits toggle should be disabled (can't turn off last one)
    await expect(page.locator("#gen-digits")).toBeDisabled();
  });

  test("changing length produces password of correct length", async ({
    page,
  }) => {
    await registerAndSetup(page);
    await navigateToGenerator(page);

    // Set length to minimum (8) via slider
    const slider = page.locator("#password-length");
    // Fill via keyboard: focus slider, press Home to go to min
    await slider.focus();
    await page.keyboard.press("Home");

    await page.waitForTimeout(300);

    const output = page.locator('[aria-label="Generated password"]');
    const password = await output.textContent();
    expect(password).toBeTruthy();
    expect(password!.length).toBe(8);
  });

  test("exclude ambiguous toggle removes ambiguous characters", async ({
    page,
  }) => {
    await registerAndSetup(page);
    await navigateToGenerator(page);

    // Enable exclude ambiguous
    await page.locator("#gen-ambiguous").click();

    // Generate several passwords and check none contain ambiguous chars
    const ambiguousChars = ["0", "O", "1", "l", "I"];
    const output = page.locator('[aria-label="Generated password"]');

    for (let i = 0; i < 5; i++) {
      await page.getByRole("button", { name: /regenerate password/i }).click();
      await page.waitForTimeout(100);
      const password = await output.textContent();
      if (password) {
        for (const ch of ambiguousChars) {
          expect(password).not.toContain(ch);
        }
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// 3. PASSPHRASE TAB
// ─────────────────────────────────────────────────────────────────────

test.describe("Passphrase Generator", () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page);
  });

  test("switch to passphrase tab and see generated passphrase", async ({
    page,
  }) => {
    await registerAndSetup(page);
    await navigateToGenerator(page);

    // Click passphrase tab
    await page.getByRole("tab", { name: /passphrase/i }).click();

    // Passphrase output should be visible
    const output = page.locator('[aria-label="Generated passphrase"]');
    await expect(output).toBeVisible();
    const text = await output.textContent();
    expect(text).toBeTruthy();

    // Default: 4 words with hyphen separator → 3 hyphens
    const hyphens = (text!.match(/-/g) || []).length;
    expect(hyphens).toBe(3);
  });

  test("regenerate produces different passphrase", async ({ page }) => {
    await registerAndSetup(page);
    await navigateToGenerator(page, "passphrase");

    const output = page.locator('[aria-label="Generated passphrase"]');
    const first = await output.textContent();

    let foundDifferent = false;
    for (let i = 0; i < 5; i++) {
      await page
        .getByRole("button", { name: /regenerate passphrase/i })
        .click();
      const next = await output.textContent();
      if (next !== first) {
        foundDifferent = true;
        break;
      }
    }
    expect(foundDifferent).toBe(true);
  });

  test("capitalize toggle affects word casing", async ({ page }) => {
    await registerAndSetup(page);
    await navigateToGenerator(page, "passphrase");

    const output = page.locator('[aria-label="Generated passphrase"]');

    // Capitalize is on by default — words should start with uppercase
    let passphrase = await output.textContent();
    expect(passphrase).toBeTruthy();
    const words = passphrase!.split("-");
    for (const word of words) {
      expect(word[0]).toBe(word[0].toUpperCase());
    }

    // Turn off capitalize
    await page.locator("#pp-capitalize").click();
    await page.waitForTimeout(300);

    passphrase = await output.textContent();
    expect(passphrase).toBeTruthy();
    const lowerWords = passphrase!.split("-");
    for (const word of lowerWords) {
      expect(word).toBe(word.toLowerCase());
    }
  });

  test("include number option appends digit", async ({ page }) => {
    await registerAndSetup(page);
    await navigateToGenerator(page, "passphrase");

    // Turn on include number
    await page.locator("#pp-number").click();
    await page.waitForTimeout(300);

    const output = page.locator('[aria-label="Generated passphrase"]');
    const passphrase = await output.textContent();
    expect(passphrase).toBeTruthy();

    // Last character should be a digit
    expect(passphrase!.slice(-1)).toMatch(/[0-9]/);
  });

  test("changing separator updates passphrase format", async ({ page }) => {
    await registerAndSetup(page);
    await navigateToGenerator(page, "passphrase");

    // Change separator to underscore
    await page.locator("button").filter({ hasText: /hyphen/i }).click();
    await page.getByRole("option", { name: /underscore/i }).click();

    await page.waitForTimeout(300);

    const output = page.locator('[aria-label="Generated passphrase"]');
    const passphrase = await output.textContent();
    expect(passphrase).toBeTruthy();

    // Should contain underscores, not hyphens
    expect(passphrase).toContain("_");
    expect(passphrase).not.toContain("-");
  });

  test("passphrase shows entropy meter", async ({ page }) => {
    await registerAndSetup(page);
    await navigateToGenerator(page, "passphrase");

    await expect(page.getByText(/bits of entropy/i)).toBeVisible();
    await expect(
      page.getByText(/weak|fair|good|strong|very strong/i).first(),
    ).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────
// 4. COPY TO CLIPBOARD
// ─────────────────────────────────────────────────────────────────────

test.describe("Copy to Clipboard", () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page);
  });

  test("copy password button triggers clipboard write", async ({
    page,
    context,
  }) => {
    // Grant clipboard permissions
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);

    await registerAndSetup(page);
    await navigateToGenerator(page);

    const output = page.locator('[aria-label="Generated password"]');
    const password = await output.textContent();

    // Click copy
    await page.getByRole("button", { name: /copy password/i }).click();

    // Verify clipboard content
    const clipboardText = await page.evaluate(() =>
      navigator.clipboard.readText(),
    );
    expect(clipboardText).toBe(password);
  });

  test("copy passphrase button triggers clipboard write", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);

    await registerAndSetup(page);
    await navigateToGenerator(page, "passphrase");

    const output = page.locator('[aria-label="Generated passphrase"]');
    const passphrase = await output.textContent();

    await page.getByRole("button", { name: /copy passphrase/i }).click();

    const clipboardText = await page.evaluate(() =>
      navigator.clipboard.readText(),
    );
    expect(clipboardText).toBe(passphrase);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 5. SITE POLICY PRESETS
// ─────────────────────────────────────────────────────────────────────

test.describe("Site Policy Presets", () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page);
  });

  test("selecting Banking preset changes password length", async ({
    page,
  }) => {
    await registerAndSetup(page);
    await navigateToGenerator(page);

    // Open preset selector
    await page.locator("#policy-preset").click();
    await page.getByRole("option", { name: /banking/i }).click();

    await page.waitForTimeout(300);

    // Banking preset: minLength=12, maxLength=16
    const output = page.locator('[aria-label="Generated password"]');
    const password = await output.textContent();
    expect(password).toBeTruthy();
    expect(password!.length).toBe(12);
  });

  test("selecting Social Media preset disables symbols", async ({ page }) => {
    await registerAndSetup(page);
    await navigateToGenerator(page);

    await page.locator("#policy-preset").click();
    await page.getByRole("option", { name: /social media/i }).click();

    await page.waitForTimeout(300);

    // Social: requireSymbols=false, minLength=8
    const output = page.locator('[aria-label="Generated password"]');
    const password = await output.textContent();
    expect(password).toBeTruthy();

    // Should be alphanumeric only (no symbols)
    expect(password).toMatch(/^[A-Za-z0-9]+$/);
  });

  test("manual toggle change resets preset to custom", async ({ page }) => {
    await registerAndSetup(page);
    await navigateToGenerator(page);

    // Select a preset
    await page.locator("#policy-preset").click();
    await page.getByRole("option", { name: /banking/i }).click();

    // Toggle a setting manually — preset should reset to "No preset (custom)"
    await page.locator("#gen-ambiguous").click();

    // The preset selector should show "No preset (custom)"
    await expect(page.locator("#policy-preset")).toContainText(
      /no preset/i,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────
// 6. TAB STATE PERSISTENCE
// ─────────────────────────────────────────────────────────────────────

test.describe("Tab State Persistence", () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page);
  });

  test("password tab is default and reflected in URL", async ({ page }) => {
    await registerAndSetup(page);
    await navigateToGenerator(page);

    // URL should have tab=password (or no tab param, defaulting to password)
    // The password tab should be active
    const passwordTab = page.getByRole("tab", { name: /password/i });
    await expect(passwordTab).toHaveAttribute("data-state", "active");

    // Password output should be visible
    await expect(
      page.locator('[aria-label="Generated password"]'),
    ).toBeVisible();
  });

  test("switching to passphrase tab updates URL", async ({ page }) => {
    await registerAndSetup(page);
    await navigateToGenerator(page);

    // Switch to passphrase
    await page.getByRole("tab", { name: /passphrase/i }).click();

    // URL should contain tab=passphrase
    await expect(page).toHaveURL(/tab=passphrase/);

    // Passphrase output should be visible
    await expect(
      page.locator('[aria-label="Generated passphrase"]'),
    ).toBeVisible();
  });

  test("passphrase tab persists on page refresh", async ({ page }) => {
    await registerAndSetup(page);
    await navigateToGenerator(page);

    // Switch to passphrase tab
    await page.getByRole("tab", { name: /passphrase/i }).click();
    await expect(page).toHaveURL(/tab=passphrase/);

    // Reload
    await page.reload();

    // Passphrase tab should still be active after reload
    await expect(page.getByText("Password Generator")).toBeVisible({
      timeout: 15000,
    });
    const passphraseTab = page.getByRole("tab", { name: /passphrase/i });
    await expect(passphraseTab).toHaveAttribute("data-state", "active");
    await expect(
      page.locator('[aria-label="Generated passphrase"]'),
    ).toBeVisible();
  });

  test("direct URL with tab=passphrase opens passphrase tab", async ({
    page,
  }) => {
    await registerAndSetup(page);
    await navigateToGenerator(page, "passphrase");

    const passphraseTab = page.getByRole("tab", { name: /passphrase/i });
    await expect(passphraseTab).toHaveAttribute("data-state", "active");
    await expect(
      page.locator('[aria-label="Generated passphrase"]'),
    ).toBeVisible();
  });
});
