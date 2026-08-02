/**
 * E2E Test Family Helpers
 *
 * Utilities for creating families, inviting members,
 * creating shared vaults, and managing recovery flows
 * in E2E tests.
 */

import { Page, expect } from "@playwright/test";
import { registerAndSetup } from "./vault";

/**
 * Navigate to the family dashboard page.
 * Waits for either the family dashboard or the "Create a Family" form.
 */
export async function navigateToFamily(page: Page): Promise<void> {
  await page.goto("/dashboard/family");

  // Wait for either the create form or the family dashboard to load
  await expect(
    page
      .getByText(/create a family/i)
      .or(page.getByText(/members/i).first()),
  ).toBeVisible({ timeout: 15000 });
}

/**
 * Create a family with the given name.
 * Assumes user is on the family page with no existing family.
 */
export async function createFamily(
  page: Page,
  familyName: string,
): Promise<void> {
  // Fill family name
  await page
    .locator('input[placeholder*="Family name" i]')
    .fill(familyName);

  // Click Create Family button
  await page.getByRole("button", { name: /create family/i }).click();

  // Wait for family dashboard to appear (tabs visible)
  await expect(
    page.getByRole("tab", { name: /members/i }),
  ).toBeVisible({ timeout: 15000 });
}

/**
 * Open the invite member dialog.
 * Assumes user is on the family page with the Members tab active.
 */
export async function openInviteDialog(page: Page): Promise<void> {
  await page.getByRole("button", { name: /invite member/i }).click();

  // Wait for dialog
  await expect(
    page.getByText(/invite family member/i),
  ).toBeVisible({ timeout: 5000 });
}

/**
 * Fill and submit the invite member dialog.
 */
export async function inviteMember(
  page: Page,
  email: string,
  role: "member" | "admin" = "member",
): Promise<void> {
  await openInviteDialog(page);

  // Fill email
  await page.locator("#invite-email").fill(email);

  // Select role if not default
  if (role === "admin") {
    await page.locator("#invite-role").click();
    await page.getByRole("option", { name: /admin/i }).click();
  }

  // Submit
  await page.getByRole("button", { name: /send invitation/i }).click();

  // Wait for dialog to close
  await expect(
    page.getByText(/invite family member/i),
  ).not.toBeVisible({ timeout: 10000 });
}

/**
 * Open the create shared vault dialog.
 * Assumes user is on the Shared Vaults tab.
 */
export async function openCreateVaultDialog(page: Page): Promise<void> {
  await page.getByRole("button", { name: /create vault/i }).first().click();

  // Wait for dialog
  await expect(
    page.getByText(/create shared vault/i),
  ).toBeVisible({ timeout: 5000 });
}

/**
 * Create a shared vault with the given name.
 * Assumes user is on the Shared Vaults tab.
 */
export async function createSharedVault(
  page: Page,
  vaultName: string,
): Promise<void> {
  await openCreateVaultDialog(page);

  // Fill name
  await page.locator("#vault-name").fill(vaultName);

  // Submit
  await page.getByRole("button", { name: /create vault/i }).last().click();

  // Wait for dialog to close
  await expect(
    page.getByText(/create shared vault/i),
  ).not.toBeVisible({ timeout: 10000 });
}

/**
 * Switch to a specific tab on the family page.
 */
export async function switchFamilyTab(
  page: Page,
  tab: "members" | "vaults" | "recovery" | "settings",
): Promise<void> {
  const tabLabels: Record<string, RegExp> = {
    members: /members/i,
    vaults: /shared vaults/i,
    recovery: /recovery/i,
    settings: /settings/i,
  };
  await page.getByRole("tab", { name: tabLabels[tab] }).click();
}

/**
 * Register a user, navigate to family page, and create a family.
 * Returns user info.
 */
export async function registerAndCreateFamily(
  page: Page,
  familyName: string,
  email?: string,
): Promise<{ email: string; secretKey: string }> {
  const user = await registerAndSetup(page, email);
  await navigateToFamily(page);
  await createFamily(page, familyName);
  return user;
}
