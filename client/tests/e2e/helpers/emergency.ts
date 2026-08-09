/**
 * E2E Test Emergency Access Helpers
 *
 * Utilities for navigating emergency access settings,
 * adding trusted contacts, managing access requests,
 * and switching tabs in E2E tests.
 */

import { Page, expect } from "@playwright/test";
import { registerAndSetup } from "./vault";

/**
 * Navigate to the emergency access settings page.
 * Waits for the page heading to be visible.
 */
export async function navigateToEmergency(page: Page): Promise<void> {
  await page.goto("/dashboard/settings/emergency");

  // Wait for the emergency access page to load
  await expect(
    page.getByText(/emergency access/i).first(),
  ).toBeVisible({ timeout: 15000 });
}

/**
 * Switch to a specific tab on the emergency access page.
 */
export async function switchEmergencyTab(
  page: Page,
  tab: "contacts" | "incoming" | "outgoing",
): Promise<void> {
  const tabLabels: Record<string, RegExp> = {
    contacts: /contacts/i,
    incoming: /incoming/i,
    outgoing: /outgoing/i,
  };
  await page.getByRole("tab", { name: tabLabels[tab] }).click();
}

/**
 * Open the Add Trusted Contact dialog.
 * Assumes user is on the emergency page with the Contacts tab active.
 */
export async function openAddContactDialog(page: Page): Promise<void> {
  await page.getByRole("button", { name: /add contact/i }).click();

  // Wait for dialog
  await expect(
    page.getByText(/add trusted contact/i),
  ).toBeVisible({ timeout: 5000 });
}

/**
 * Add a trusted contact via the dialog.
 * Fills email and optionally sets waiting period, then submits.
 */
export async function addTrustedContact(
  page: Page,
  email: string,
  waitingPeriodDays?: string,
): Promise<void> {
  await openAddContactDialog(page);

  // Fill email
  await page.locator("#contact-email").fill(email);

  // Set waiting period if specified
  if (waitingPeriodDays) {
    await page.locator("#waiting-period").click();
    await page
      .getByRole("option", { name: new RegExp(`${waitingPeriodDays} day`) })
      .click();
  }

  // Submit
  await page.getByRole("button", { name: /add contact/i }).last().click();

  // Wait for dialog to close
  await expect(
    page.getByText(/add trusted contact/i),
  ).not.toBeVisible({ timeout: 10000 });
}

/**
 * Register a user and navigate to the emergency access page.
 * Returns user info.
 */
export async function registerAndNavigateToEmergency(
  page: Page,
  email?: string,
): Promise<{ email: string; secretKey: string }> {
  const user = await registerAndSetup(page, email);
  await navigateToEmergency(page);
  return user;
}
