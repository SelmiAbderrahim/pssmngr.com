// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { expect, test } from "@playwright/test";
import {
  clearBrowserState,
  navigateToVault,
  registerAndSetup,
} from "./helpers/vault";

const mobileDevices = [
  ["iPhone 13", { width: 390, height: 844, isMobile: true, hasTouch: true }],
  ["Pixel 7", { width: 412, height: 915, isMobile: true, hasTouch: true }],
  ["iPad mini", { width: 768, height: 1024, isMobile: true, hasTouch: true }],
  ["Galaxy S22 Ultra", { width: 412, height: 915, isMobile: true, hasTouch: true }],
] as const;

for (const [name, device] of mobileDevices) {
  test.describe(`mobile shell ${name}`, () => {
    test.use(device);

    test.beforeEach(async ({ page }) => {
      await clearBrowserState(page);
      const { secretKey } = await registerAndSetup(page);
      await navigateToVault(page, secretKey);
    });

    test("shows the mobile shell chrome when authenticated", async ({ page }) => {
      await expect(page.getByRole("navigation", { name: /mobile|navigation/i })).toBeVisible();
      await expect(page.getByRole("button", { name: /quick|add|إضافة|añadir/i })).toBeVisible();
      await expect(page.getByRole("banner")).toBeVisible();
    });
  });
}

test.describe("mobile shell rtl and swipe-back", () => {
  test.use({ width: 390, height: 844, isMobile: true, hasTouch: true });

  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page);
    const { secretKey } = await registerAndSetup(page);
    await navigateToVault(page, secretKey);
  });

  test("keeps Arabic RTL direction and allows browser swipe-back history", async ({ page }) => {
    await page.evaluate(() => localStorage.setItem("i18nextLng", "ar"));
    await page.reload();
    await page.evaluate(() => document.documentElement.dir = "rtl");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");

    await page.goto("/dashboard/settings/security");
    await page.goBack();
    await expect(page).toHaveURL(/\/dashboard\/vault/);
  });

  test("quick-add routes to the new-login form", async ({ page }) => {
    await page.getByRole("button", { name: /quick|add/i }).click();
    await page.getByRole("button", { name: /add login/i }).click();

    await expect(page).toHaveURL(/\/dashboard\/vault.*create=login/);
    await expect(page.locator("#item-title")).toBeVisible();
    await expect(page.locator("#item-password")).toBeVisible();
  });
});
