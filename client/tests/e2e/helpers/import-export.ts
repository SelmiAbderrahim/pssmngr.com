/**
 * E2E Test Import/Export Helpers
 *
 * Utilities for navigating to the Import/Export settings page
 * and interacting with the import wizard and export UI.
 */

import { Page, expect } from "@playwright/test";

/**
 * Navigate to the Import/Export settings page.
 * Assumes user is authenticated and on the dashboard.
 */
export async function navigateToImportExport(page: Page): Promise<void> {
  await page.goto("/dashboard/settings/import-export");
  await expect(
    page.getByText(/import \/ export/i).first(),
  ).toBeVisible({ timeout: 15000 });
}

/**
 * Switch between Import and Export tabs on the settings page.
 */
export async function switchTab(
  page: Page,
  tab: "import" | "export",
): Promise<void> {
  const tabTrigger = page.getByRole("tab", { name: new RegExp(tab, "i") });
  await tabTrigger.click();
  // Wait for tab content to render
  await page.waitForTimeout(300);
}

/**
 * Upload a file to the import wizard via the hidden file input.
 * Creates a synthetic file in the browser and triggers the input change event.
 */
export async function uploadImportFile(
  page: Page,
  fileName: string,
  content: string,
  mimeType = "text/csv",
): Promise<void> {
  // Find the hidden file input and set files on it
  const fileInput = page.locator('input[type="file"]');
  const buffer = Buffer.from(content, "utf-8");
  await fileInput.setInputFiles({
    name: fileName,
    mimeType,
    buffer,
  });
}

/**
 * Generate a Chrome-format CSV string for import testing.
 * Chrome CSV headers: name,url,username,password,note
 */
export function generateChromeCSV(
  items: Array<{
    name: string;
    url: string;
    username: string;
    password: string;
    note?: string;
  }>,
): string {
  const header = "name,url,username,password,note";
  const rows = items.map(
    (item) =>
      `${escapeCSV(item.name)},${escapeCSV(item.url)},${escapeCSV(item.username)},${escapeCSV(item.password)},${escapeCSV(item.note ?? "")}`,
  );
  return [header, ...rows].join("\n");
}

/**
 * Generate a Bitwarden-format CSV string for import testing.
 */
export function generateBitwardenCSV(
  items: Array<{
    name: string;
    url: string;
    username: string;
    password: string;
    folder?: string;
    notes?: string;
  }>,
): string {
  const header =
    "folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp";
  const rows = items.map(
    (item) =>
      `${escapeCSV(item.folder ?? "")},0,login,${escapeCSV(item.name)},${escapeCSV(item.notes ?? "")},,0,${escapeCSV(item.url)},${escapeCSV(item.username)},${escapeCSV(item.password)},`,
  );
  return [header, ...rows].join("\n");
}

function escapeCSV(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
