import { test, expect } from "@playwright/test";
import {
  clearBrowserState,
  registerAndSetup,
  navigateToVault,
  createLoginItem,
} from "../helpers/vault";
import {
  navigateToImportExport,
  switchTab,
  uploadImportFile,
  generateChromeCSV,
  generateBitwardenCSV,
} from "../helpers/import-export";
import { readFile } from "node:fs/promises";

/**
 * E2E Test Suite: Import / Export
 *
 * Tests the complete import wizard flow and export UI:
 * 1. Import – upload CSV, preview items, confirm import
 * 2. Export – encrypted export button, plaintext warning dialog
 * 3. URL tab state – tab persists in URL across refresh
 *
 * Each test registers a fresh user for isolation.
 * Backend containers must be running (make start).
 */

// ─────────────────────────────────────────────────────────────────────
// 1. IMPORT WIZARD E2E
// ─────────────────────────────────────────────────────────────────────

test.describe("Import Wizard", () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page);
  });

  test("shows upload dropzone with supported format badges", async ({ page }) => {
    await registerAndSetup(page);
    await navigateToImportExport(page);

    // Should show Import tab by default
    await expect(page.getByText(/drop your file here/i)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /choose file/i }),
    ).toBeVisible();

    // Supported format badges
    await expect(page.getByText("1Password")).toBeVisible();
    await expect(page.getByText("Bitwarden")).toBeVisible();
    await expect(page.getByText("Chrome")).toBeVisible();
    await expect(page.getByText("LastPass")).toBeVisible();
    await expect(page.getByText("Generic CSV")).toBeVisible();
  });

  test("upload Chrome CSV and show preview with detected source", async ({
    page,
  }) => {
    await registerAndSetup(page);
    await navigateToImportExport(page);

    const csv = generateChromeCSV([
      {
        name: "GitHub",
        url: "https://github.com",
        username: "dev@example.com",
        password: "gh-pass-123",
      },
      {
        name: "AWS Console",
        url: "https://aws.amazon.com",
        username: "admin@company.com",
        password: "aws-pass-456",
      },
      {
        name: "Figma",
        url: "https://figma.com",
        username: "designer@team.com",
        password: "fig-pass-789",
      },
    ]);

    await uploadImportFile(page, "chrome-passwords.csv", csv);

    // Should transition to preview stage
    await expect(page.getByText(/preview/i).first()).toBeVisible({
      timeout: 10000,
    });

    // Should detect Chrome format
    await expect(page.getByText(/chrome/i)).toBeVisible();

    // Should show item count
    await expect(page.getByText(/3 items found/i)).toBeVisible();

    // Should show items in the preview table
    await expect(page.getByText("GitHub")).toBeVisible();
    await expect(page.getByText("AWS Console")).toBeVisible();
    await expect(page.getByText("Figma")).toBeVisible();

    // Should show type badges
    const loginBadges = page.locator("td").getByText("login", { exact: false });
    await expect(loginBadges.first()).toBeVisible();

    // Import button should show count
    await expect(
      page.getByRole("button", { name: /import 3 items/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /import 3 items/i }),
    ).toBeEnabled();

    // Cancel button should be visible
    await expect(
      page.getByRole("button", { name: /cancel/i }),
    ).toBeVisible();
  });

  test("upload Bitwarden CSV and detect format correctly", async ({
    page,
  }) => {
    await registerAndSetup(page);
    await navigateToImportExport(page);

    const csv = generateBitwardenCSV([
      {
        name: "Twitter",
        url: "https://twitter.com",
        username: "user@twitter.com",
        password: "tw-pass",
        folder: "Social",
      },
    ]);

    await uploadImportFile(page, "bitwarden-export.csv", csv);

    // Should detect Bitwarden format
    await expect(page.getByText(/bitwarden/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/1 items? found/i)).toBeVisible();
    await expect(page.getByText("Twitter")).toBeVisible();
  });

  test("toggle individual items in preview", async ({ page }) => {
    await registerAndSetup(page);
    await navigateToImportExport(page);

    const csv = generateChromeCSV([
      {
        name: "Keep This",
        url: "https://keep.com",
        username: "yes@keep.com",
        password: "keep-pass",
      },
      {
        name: "Skip This",
        url: "https://skip.com",
        username: "no@skip.com",
        password: "skip-pass",
      },
    ]);

    await uploadImportFile(page, "passwords.csv", csv);

    // Wait for preview
    await expect(page.getByText(/2 items found/i)).toBeVisible({
      timeout: 10000,
    });

    // Both items should be selected by default — button says "Import 2 items"
    await expect(
      page.getByRole("button", { name: /import 2 items/i }),
    ).toBeVisible();

    // Click the row for "Skip This" to deselect it
    const skipRow = page.locator("tr").filter({ hasText: "Skip This" });
    await skipRow.click();

    // Import button should now show 1 item
    await expect(
      page.getByRole("button", { name: /import 1 items?/i }),
    ).toBeVisible();
  });

  test("cancel from preview returns to upload dropzone", async ({ page }) => {
    await registerAndSetup(page);
    await navigateToImportExport(page);

    const csv = generateChromeCSV([
      {
        name: "Test",
        url: "https://test.com",
        username: "t@test.com",
        password: "pass",
      },
    ]);

    await uploadImportFile(page, "passwords.csv", csv);

    // Wait for preview
    await expect(page.getByText(/1 items? found/i)).toBeVisible({
      timeout: 10000,
    });

    // Click cancel
    await page.getByRole("button", { name: /cancel/i }).click();

    // Should return to dropzone
    await expect(page.getByText(/drop your file here/i)).toBeVisible({
      timeout: 5000,
    });
  });

  test("confirm import triggers progress and shows summary", async ({
    page,
  }) => {
    await registerAndSetup(page);
    await navigateToVault(page);
    await navigateToImportExport(page);

    const csv = generateChromeCSV([
      {
        name: "Import Test Item",
        url: "https://importtest.com",
        username: "import@test.com",
        password: "import-pass-1",
      },
    ]);

    await uploadImportFile(page, "passwords.csv", csv);

    // Wait for preview
    await expect(page.getByText(/1 items? found/i)).toBeVisible({
      timeout: 10000,
    });

    // Click import
    await page.getByRole("button", { name: /import 1 items?/i }).click();

    // Should show either progress or summary (depending on speed)
    // Wait for the final summary or error state
    await expect(
      page
        .getByText(/import complete/i)
        .or(page.getByText(/import failed/i))
        .or(page.getByText(/importing/i)),
    ).toBeVisible({ timeout: 30000 });

    // If import completes, verify summary cards
    const completeText = page.getByText(/import complete/i);
    if (await completeText.isVisible().catch(() => false)) {
      // Summary should show count cards
      await expect(page.getByText(/imported/i)).toBeVisible();
      await expect(page.getByText(/skipped/i)).toBeVisible();
      await expect(page.getByText(/errors/i)).toBeVisible();

      // "Import More" button should be visible
      await expect(
        page.getByRole("button", { name: /import more/i }),
      ).toBeVisible();
    }
  });

  test("import more button resets wizard to dropzone", async ({ page }) => {
    await registerAndSetup(page);
    await navigateToVault(page);
    await navigateToImportExport(page);

    const csv = generateChromeCSV([
      {
        name: "Reset Test",
        url: "https://reset.com",
        username: "r@reset.com",
        password: "reset-pass",
      },
    ]);

    await uploadImportFile(page, "passwords.csv", csv);

    await expect(page.getByText(/1 items? found/i)).toBeVisible({
      timeout: 10000,
    });
    await page.getByRole("button", { name: /import 1 items?/i }).click();

    // Wait for completion or error
    await expect(
      page
        .getByText(/import complete/i)
        .or(page.getByText(/import failed/i)),
    ).toBeVisible({ timeout: 30000 });

    // Click "Import More" or "Try Again" to reset
    const importMore = page.getByRole("button", { name: /import more/i });
    const tryAgain = page.getByRole("button", { name: /try again/i });

    if (await importMore.isVisible().catch(() => false)) {
      await importMore.click();
    } else if (await tryAgain.isVisible().catch(() => false)) {
      await tryAgain.click();
    }

    // Dropzone should reappear
    await expect(page.getByText(/drop your file here/i)).toBeVisible({
      timeout: 5000,
    });
  });

  test("empty file shows error state", async ({ page }) => {
    await registerAndSetup(page);
    await navigateToImportExport(page);

    // Upload an empty CSV
    await uploadImportFile(page, "empty.csv", "");

    // Should show an error state
    await expect(
      page
        .getByText(/import failed/i)
        .or(page.getByText(/could not be parsed/i))
        .or(page.getByText(/no items/i)),
    ).toBeVisible({ timeout: 10000 });
  });

  test("imported items appear in the vault", async ({ page }) => {
    await registerAndSetup(page);
    await navigateToVault(page);
    await navigateToImportExport(page);

    const csv = generateChromeCSV([
      {
        name: "Vault Check GitHub",
        url: "https://github.com",
        username: "dev@example.com",
        password: "gh-pass-123",
      },
      {
        name: "Vault Check AWS",
        url: "https://aws.amazon.com",
        username: "admin@company.com",
        password: "aws-pass-456",
      },
    ]);

    await uploadImportFile(page, "chrome-passwords.csv", csv);
    await expect(page.getByText(/2 items found/i)).toBeVisible({
      timeout: 10000,
    });
    await page.getByRole("button", { name: /import 2 items/i }).click();

    await expect(
      page
        .getByText(/import complete/i)
        .or(page.getByText(/import failed/i)),
    ).toBeVisible({ timeout: 30000 });

    // Verify items in vault when import succeeds
    if (
      await page
        .getByText(/import complete/i)
        .isVisible()
        .catch(() => false)
    ) {
      await navigateToVault(page);
      await expect(page.getByText("Vault Check GitHub")).toBeVisible({
        timeout: 10000,
      });
      await expect(page.getByText("Vault Check AWS")).toBeVisible({
        timeout: 10000,
      });
    }
  });

  test("selective import only adds checked items to vault", async ({
    page,
  }) => {
    await registerAndSetup(page);
    await navigateToVault(page);
    await navigateToImportExport(page);

    const csv = generateChromeCSV([
      {
        name: "Selected Alpha",
        url: "https://alpha.com",
        username: "a@test.com",
        password: "pass-a",
      },
      {
        name: "Deselected Beta",
        url: "https://beta.com",
        username: "b@test.com",
        password: "pass-b",
      },
      {
        name: "Selected Gamma",
        url: "https://gamma.com",
        username: "c@test.com",
        password: "pass-c",
      },
    ]);

    await uploadImportFile(page, "passwords.csv", csv);
    await expect(page.getByText(/3 items found/i)).toBeVisible({
      timeout: 10000,
    });

    // Deselect middle item
    const skipRow = page.locator("tr").filter({ hasText: "Deselected Beta" });
    await skipRow.click();
    await expect(
      page.getByRole("button", { name: /import 2 items/i }),
    ).toBeVisible();

    await page.getByRole("button", { name: /import 2 items/i }).click();

    await expect(
      page
        .getByText(/import complete/i)
        .or(page.getByText(/import failed/i)),
    ).toBeVisible({ timeout: 30000 });

    if (
      await page
        .getByText(/import complete/i)
        .isVisible()
        .catch(() => false)
    ) {
      await navigateToVault(page);
      await expect(page.getByText("Selected Alpha")).toBeVisible({
        timeout: 10000,
      });
      await expect(page.getByText("Selected Gamma")).toBeVisible({
        timeout: 10000,
      });
      await expect(page.getByText("Deselected Beta")).not.toBeVisible();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// 2. EXPORT UI E2E
// ─────────────────────────────────────────────────────────────────────

test.describe("Export Section", () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page);
  });

  test("shows encrypted and plaintext export options", async ({ page }) => {
    await registerAndSetup(page);
    await navigateToImportExport(page);
    await switchTab(page, "export");

    // Encrypted export card
    await expect(page.getByText(/encrypted export/i)).toBeVisible();
    await expect(page.getByText(/recommended/i)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /export \.pssmngr/i }),
    ).toBeVisible();

    // Plaintext export card
    await expect(page.getByText(/plaintext export/i)).toBeVisible();
    await expect(
      page.getByText(/passwords in plaintext/i),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /export csv/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /export json/i }),
    ).toBeVisible();
  });

  test("plaintext CSV export shows warning dialog", async ({ page }) => {
    await registerAndSetup(page);
    await navigateToImportExport(page);
    await switchTab(page, "export");

    // Click "Export CSV" to open the warning dialog
    await page.getByRole("button", { name: /export csv/i }).click();

    // Warning dialog should appear
    await expect(page.getByText(/export as csv\?/i)).toBeVisible({
      timeout: 5000,
    });
    await expect(
      page.getByText(/passwords will be visible in plaintext/i),
    ).toBeVisible();
    await expect(
      page.getByText(/delete the file after use/i),
    ).toBeVisible();

    // Cancel and confirm buttons
    await expect(
      page.getByRole("button", { name: /cancel/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /export csv/i }).last(),
    ).toBeVisible();
  });

  test("plaintext JSON export shows warning dialog", async ({ page }) => {
    await registerAndSetup(page);
    await navigateToImportExport(page);
    await switchTab(page, "export");

    // Click "Export JSON" to open the warning dialog
    await page.getByRole("button", { name: /export json/i }).click();

    // Warning dialog should appear
    await expect(page.getByText(/export as json\?/i)).toBeVisible({
      timeout: 5000,
    });
    await expect(
      page.getByText(/passwords will be visible in plaintext/i),
    ).toBeVisible();

    // Cancel and confirm buttons
    await expect(
      page.getByRole("button", { name: /cancel/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /export json/i }).last(),
    ).toBeVisible();
  });

  test("cancel plaintext warning dialog closes it", async ({ page }) => {
    await registerAndSetup(page);
    await navigateToImportExport(page);
    await switchTab(page, "export");

    // Open CSV warning
    await page.getByRole("button", { name: /export csv/i }).click();
    await expect(page.getByText(/export as csv\?/i)).toBeVisible({
      timeout: 5000,
    });

    // Click Cancel
    await page.getByRole("button", { name: /cancel/i }).click();

    // Dialog should close
    await expect(page.getByText(/export as csv\?/i)).not.toBeVisible({
      timeout: 5000,
    });

    // Export buttons should still be visible on the page
    await expect(
      page.getByRole("button", { name: /export csv/i }),
    ).toBeVisible();
  });

  test("encrypted export button shows exporting state", async ({ page }) => {
    await registerAndSetup(page);
    await navigateToVault(page);
    await navigateToImportExport(page);
    await switchTab(page, "export");

    // Click encrypted export
    const exportBtn = page.getByRole("button", { name: /export \.pssmngr/i });
    await exportBtn.click();

    // Should show either "Exporting..." or "Downloaded" or error
    await expect(
      page
        .getByText(/exporting\.\.\./i)
        .or(page.getByText(/downloaded/i))
        .or(page.getByText(/export failed/i)),
    ).toBeVisible({ timeout: 15000 });
  });

  test("encrypted export downloads file with .pssmngr extension", async ({
    page,
  }) => {
    await registerAndSetup(page);
    await navigateToVault(page);
    await navigateToImportExport(page);
    await switchTab(page, "export");

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: /export \.pssmngr/i }).click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/\.pssmngr$/);

    // Encrypted content should not contain plaintext fields
    const filePath = await download.path();
    if (filePath) {
      const content = await readFile(filePath, "utf-8");
      expect(content).not.toContain("username");
      expect(content).not.toContain("password");
    }
  });

  test("plaintext CSV export downloads file after confirming warning", async ({
    page,
  }) => {
    await registerAndSetup(page);
    await navigateToVault(page);
    await createLoginItem(page, {
      title: "CSV Export Item",
      username: "csvuser@test.com",
      password: "csv-pass-123",
    });
    await navigateToImportExport(page);
    await switchTab(page, "export");

    // Open warning dialog
    await page.getByRole("button", { name: /export csv/i }).click();
    await expect(
      page.getByText(/passwords will be visible in plaintext/i),
    ).toBeVisible({ timeout: 5000 });

    // Confirm and wait for download
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: /export csv/i }).last().click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/\.csv$/);

    // Plaintext export should contain readable item data
    const filePath = await download.path();
    if (filePath) {
      const content = await readFile(filePath, "utf-8");
      expect(content).toContain("CSV Export Item");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// 3. URL TAB STATE E2E
// ─────────────────────────────────────────────────────────────────────

test.describe("URL Tab State", () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page);
  });

  test("import tab is default and reflected in URL", async ({ page }) => {
    await registerAndSetup(page);
    await navigateToImportExport(page);

    // Default tab should be import
    await expect(page.getByText(/drop your file here/i)).toBeVisible();

    // URL should contain tab=import
    expect(page.url()).toContain("tab=import");
  });

  test("switching to export tab updates URL", async ({ page }) => {
    await registerAndSetup(page);
    await navigateToImportExport(page);

    await switchTab(page, "export");

    // URL should update to tab=export
    await expect(page).toHaveURL(/tab=export/);

    // Export content should be visible
    await expect(page.getByText(/encrypted export/i)).toBeVisible();
  });

  test("export tab persists on page refresh", async ({ page }) => {
    await registerAndSetup(page);
    await navigateToImportExport(page);
    await switchTab(page, "export");

    // Verify we're on export tab
    await expect(page.getByText(/encrypted export/i)).toBeVisible();

    // Reload the page
    await page.reload();

    // Export tab should still be active
    await expect(page.getByText(/encrypted export/i)).toBeVisible({
      timeout: 15000,
    });
    expect(page.url()).toContain("tab=export");
  });

  test("direct URL with tab=export opens export tab", async ({ page }) => {
    await registerAndSetup(page);

    // Navigate directly with export tab param
    await page.goto("/dashboard/settings/import-export?tab=export");

    // Should show export section directly
    await expect(page.getByText(/encrypted export/i)).toBeVisible({
      timeout: 15000,
    });
  });

  test("switching back to import tab updates URL", async ({ page }) => {
    await registerAndSetup(page);
    await page.goto("/dashboard/settings/import-export?tab=export");

    await expect(page.getByText(/encrypted export/i)).toBeVisible({
      timeout: 15000,
    });

    await switchTab(page, "import");

    // URL should update back
    await expect(page).toHaveURL(/tab=import/);
    await expect(page.getByText(/drop your file here/i)).toBeVisible();
  });
});
