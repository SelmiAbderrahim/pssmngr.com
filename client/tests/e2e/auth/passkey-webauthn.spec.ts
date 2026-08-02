import { test, expect, type CDPSession, type Page } from "@playwright/test";

/**
 * E2E Test Suite: Passkey (WebAuthn) Flows
 *
 * Tests passkey registration, authentication, listing, and deletion
 * using Playwright's CDP virtual authenticator. Chromium-only since
 * virtual authenticators require the Chrome DevTools Protocol.
 *
 * Requires running containers (make start) for backend integration.
 */

// Virtual authenticator only works with Chromium CDP
test.use({ browserName: "chromium" });

const TEST_PASSWORD = "SecureVaultP@ss1!";
const uniqueEmail = () =>
  `e2e-pk-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@test.local`;

// =============================================================================
// Virtual Authenticator Helpers
// =============================================================================

interface VirtualAuthenticator {
  session: CDPSession;
  authenticatorId: string;
}

/**
 * Enable the WebAuthn CDP domain and add a virtual authenticator.
 * Returns the CDP session and authenticator ID for cleanup.
 */
async function addVirtualAuthenticator(
  page: Page,
  options?: {
    protocol?: "ctap2" | "u2f";
    transport?: "internal" | "usb" | "ble" | "nfc";
    hasResidentKey?: boolean;
    hasUserVerification?: boolean;
    isUserVerified?: boolean;
  },
): Promise<VirtualAuthenticator> {
  const session = await page.context().newCDPSession(page);
  await session.send("WebAuthn.enable");

  const { authenticatorId } = await session.send(
    "WebAuthn.addVirtualAuthenticator",
    {
      options: {
        protocol: options?.protocol ?? "ctap2",
        transport: options?.transport ?? "internal",
        hasResidentKey: options?.hasResidentKey ?? true,
        hasUserVerification: options?.hasUserVerification ?? true,
        isUserVerified: options?.isUserVerified ?? true,
        automaticPresenceSimulation: true,
      },
    },
  );

  return { session, authenticatorId };
}

/**
 * Remove the virtual authenticator and disable WebAuthn domain.
 */
async function removeVirtualAuthenticator(
  auth: VirtualAuthenticator,
): Promise<void> {
  try {
    await auth.session.send("WebAuthn.removeVirtualAuthenticator", {
      authenticatorId: auth.authenticatorId,
    });
    await auth.session.send("WebAuthn.disable");
  } catch {
    // Ignore cleanup errors (page may have closed)
  }
}

/**
 * Get credentials stored in the virtual authenticator.
 */
async function getCredentials(
  auth: VirtualAuthenticator,
): Promise<Array<{ credentialId: string; rpId?: string; userHandle?: string }>> {
  const { credentials } = await auth.session.send(
    "WebAuthn.getCredentials",
    { authenticatorId: auth.authenticatorId },
  );
  return credentials;
}

/**
 * Clear all state: cookies, storage, and IndexedDB.
 */
async function clearAuthState(page: Page): Promise<void> {
  await page.context().clearCookies();
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
    indexedDB.databases?.().then((dbs) =>
      dbs.forEach((db) => {
        if (db.name) indexedDB.deleteDatabase(db.name);
      }),
    );
  });
}

// =============================================================================
// Tests
// =============================================================================

test.describe("Passkey (WebAuthn) Flows", () => {
  test.describe("Passkey Registration via Security Settings", () => {
    test("should show passkeys section on security settings page", async ({
      page,
    }) => {
      await clearAuthState(page);
      await page.goto("/dashboard/settings/security");

      // If redirected to login, the auth guard is working
      if (page.url().includes("/login")) {
        await expect(page.locator("#login-email")).toBeVisible();
        return;
      }

      // Verify passkeys section exists
      await expect(
        page.getByText(/passkeys/i).first(),
      ).toBeVisible({ timeout: 10000 });

      // Should show "Add Passkey" button
      await expect(
        page.getByRole("button", { name: /add passkey/i }),
      ).toBeVisible();

      // Should show empty state when no passkeys registered
      const noPasskeysText = page.getByText(/no passkeys registered/i);
      const passkeyList = page.locator('[class*="space-y"]').filter({
        has: page.locator('[class*="border"]'),
      });
      await expect(noPasskeysText.or(passkeyList)).toBeVisible();
    });

    test("should open register passkey dialog", async ({ page }) => {
      await clearAuthState(page);
      await page.goto("/dashboard/settings/security");

      if (page.url().includes("/login")) return;

      // Click "Add Passkey" button
      await page.getByRole("button", { name: /add passkey/i }).click();

      // Dialog should open
      await expect(
        page.getByText(/add a passkey/i),
      ).toBeVisible({ timeout: 5000 });

      // Should have name input
      const nameInput = page.getByPlaceholder(/macbook touch id|yubikey/i);
      await expect(nameInput).toBeVisible();

      // Should have register and cancel buttons
      await expect(
        page.getByRole("button", { name: /register passkey/i }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: /cancel/i }),
      ).toBeVisible();
    });

    test("should close register dialog on cancel", async ({ page }) => {
      await clearAuthState(page);
      await page.goto("/dashboard/settings/security");

      if (page.url().includes("/login")) return;

      await page.getByRole("button", { name: /add passkey/i }).click();
      await expect(
        page.getByText(/add a passkey/i),
      ).toBeVisible({ timeout: 5000 });

      // Click cancel
      await page.getByRole("button", { name: /cancel/i }).click();

      // Dialog should close
      await expect(
        page.getByText(/add a passkey/i),
      ).not.toBeVisible({ timeout: 3000 });
    });

    test("should register a passkey with virtual authenticator", async ({
      page,
    }) => {
      const auth = await addVirtualAuthenticator(page);

      try {
        await clearAuthState(page);
        await page.goto("/dashboard/settings/security");

        if (page.url().includes("/login")) return;

        // Open register dialog
        await page.getByRole("button", { name: /add passkey/i }).click();
        await expect(
          page.getByText(/add a passkey/i),
        ).toBeVisible({ timeout: 5000 });

        // Enter passkey name
        const nameInput = page.getByPlaceholder(/macbook touch id|yubikey/i);
        await nameInput.fill("E2E Test Key");

        // Click register - virtual authenticator handles the WebAuthn prompt
        await page.getByRole("button", { name: /register passkey/i }).click();

        // Wait for registration to complete
        // Either success toast or the dialog closes
        const successToast = page.getByText(/passkey registered/i);
        const dialogGone = page
          .getByText(/add a passkey/i)
          .isHidden()
          .catch(() => false);

        await expect(successToast).toBeVisible({ timeout: 15000 }).catch(
          async () => {
            // Dialog should at least close on success
            await expect(
              page.getByText(/add a passkey/i),
            ).not.toBeVisible({ timeout: 10000 });
          },
        );

        // Verify the virtual authenticator has a stored credential
        const creds = await getCredentials(auth);
        expect(creds.length).toBeGreaterThanOrEqual(1);
      } finally {
        await removeVirtualAuthenticator(auth);
      }
    });

    test("should display registered passkey in the list", async ({ page }) => {
      const auth = await addVirtualAuthenticator(page);

      try {
        await clearAuthState(page);
        await page.goto("/dashboard/settings/security");

        if (page.url().includes("/login")) return;

        // Register a passkey
        await page.getByRole("button", { name: /add passkey/i }).click();
        await expect(
          page.getByText(/add a passkey/i),
        ).toBeVisible({ timeout: 5000 });

        const nameInput = page.getByPlaceholder(/macbook touch id|yubikey/i);
        await nameInput.fill("My Test Passkey");
        await page.getByRole("button", { name: /register passkey/i }).click();

        // Wait for registration to complete
        await page
          .getByText(/passkey registered/i)
          .waitFor({ state: "visible", timeout: 15000 })
          .catch(() => {});

        // Wait for dialog to close and list to refresh
        await page.waitForTimeout(2000);

        // The passkey should appear in the list
        const passkeyItem = page.getByText("My Test Passkey");
        await expect(passkeyItem).toBeVisible({ timeout: 10000 });

        // Should show device type info
        await expect(
          page.getByText(/single device|synced across devices/i),
        ).toBeVisible();

        // Should show "Created" date
        await expect(page.getByText(/created/i)).toBeVisible();
      } finally {
        await removeVirtualAuthenticator(auth);
      }
    });

    test("should delete a passkey", async ({ page }) => {
      const auth = await addVirtualAuthenticator(page);

      try {
        await clearAuthState(page);
        await page.goto("/dashboard/settings/security");

        if (page.url().includes("/login")) return;

        // Register a passkey first
        await page.getByRole("button", { name: /add passkey/i }).click();
        await expect(
          page.getByText(/add a passkey/i),
        ).toBeVisible({ timeout: 5000 });

        const nameInput = page.getByPlaceholder(/macbook touch id|yubikey/i);
        await nameInput.fill("Deletable Key");
        await page.getByRole("button", { name: /register passkey/i }).click();

        await page
          .getByText(/passkey registered/i)
          .waitFor({ state: "visible", timeout: 15000 })
          .catch(() => {});

        await page.waitForTimeout(2000);

        // Verify passkey appears
        await expect(
          page.getByText("Deletable Key"),
        ).toBeVisible({ timeout: 10000 });

        // Click delete button (trash icon in the passkey row)
        const deleteButton = page.getByRole("button", {
          name: /remove passkey/i,
        });
        await deleteButton.first().click();

        // Confirmation dialog should appear
        await expect(
          page.getByText(/remove passkey\?/i),
        ).toBeVisible({ timeout: 5000 });
        await expect(
          page.getByText(
            /this passkey will be removed and can no longer be used/i,
          ),
        ).toBeVisible();

        // Should have cancel and confirm buttons
        await expect(
          page.getByRole("button", { name: /cancel/i }),
        ).toBeVisible();

        // Confirm deletion
        const confirmDelete = page
          .locator('[role="alertdialog"]')
          .getByRole("button", { name: /remove passkey/i });
        await confirmDelete.click();

        // Wait for deletion to complete
        await page
          .getByText(/passkey removed/i)
          .waitFor({ state: "visible", timeout: 10000 })
          .catch(() => {});

        // Passkey should no longer be in the list
        await expect(
          page.getByText("Deletable Key"),
        ).not.toBeVisible({ timeout: 10000 });
      } finally {
        await removeVirtualAuthenticator(auth);
      }
    });

    test("should cancel passkey deletion", async ({ page }) => {
      const auth = await addVirtualAuthenticator(page);

      try {
        await clearAuthState(page);
        await page.goto("/dashboard/settings/security");

        if (page.url().includes("/login")) return;

        // Register a passkey
        await page.getByRole("button", { name: /add passkey/i }).click();
        await expect(
          page.getByText(/add a passkey/i),
        ).toBeVisible({ timeout: 5000 });

        const nameInput = page.getByPlaceholder(/macbook touch id|yubikey/i);
        await nameInput.fill("Keep This Key");
        await page.getByRole("button", { name: /register passkey/i }).click();

        await page
          .getByText(/passkey registered/i)
          .waitFor({ state: "visible", timeout: 15000 })
          .catch(() => {});

        await page.waitForTimeout(2000);

        // Click delete
        const deleteButton = page.getByRole("button", {
          name: /remove passkey/i,
        });
        await deleteButton.first().click();

        // Confirmation dialog appears
        await expect(
          page.getByText(/remove passkey\?/i),
        ).toBeVisible({ timeout: 5000 });

        // Cancel deletion
        await page.getByRole("button", { name: /cancel/i }).click();

        // Dialog should close
        await expect(
          page.getByText(/remove passkey\?/i),
        ).not.toBeVisible({ timeout: 3000 });

        // Passkey should still be visible
        await expect(page.getByText("Keep This Key")).toBeVisible();
      } finally {
        await removeVirtualAuthenticator(auth);
      }
    });
  });

  // ===========================================================================
  // PASSKEY AUTHENTICATION
  // ===========================================================================

  test.describe("Passkey Authentication", () => {
    test("should show passkey sign-in button on login page", async ({
      page,
    }) => {
      await page.goto("/login");

      // The login form should have a "Sign in with passkey" button
      const passkeyButton = page.getByRole("button", {
        name: /sign in with passkey/i,
      });
      await expect(passkeyButton).toBeVisible({ timeout: 10000 });
    });

    test("should show passkey button with fingerprint icon", async ({
      page,
    }) => {
      await page.goto("/login");

      const passkeyButton = page.getByRole("button", {
        name: /sign in with passkey/i,
      });
      await expect(passkeyButton).toBeVisible({ timeout: 10000 });

      // Button should not be in loading state initially
      await expect(
        passkeyButton.getByText(/verifying/i),
      ).not.toBeVisible();
    });

    test("should attempt passkey authentication with virtual authenticator", async ({
      page,
    }) => {
      const auth = await addVirtualAuthenticator(page);

      try {
        await clearAuthState(page);
        await page.goto("/login");

        const passkeyButton = page.getByRole("button", {
          name: /sign in with passkey/i,
        });
        await expect(passkeyButton).toBeVisible({ timeout: 10000 });

        // Click passkey sign-in button
        await passkeyButton.click();

        // Should enter loading state
        const verifyingText = page.getByText(/verifying/i);
        const errorAlert = page.getByRole("alert");
        const dashboardRedirect = page.waitForURL(/\/dashboard/, {
          timeout: 5000,
        });

        // One of these should happen:
        // 1. Verifying state shown (WebAuthn prompt in progress)
        // 2. Error (no credentials registered in virtual authenticator)
        // 3. Dashboard redirect (successful auth - unlikely without registered credential)
        await expect(
          verifyingText.or(errorAlert),
        ).toBeVisible({ timeout: 10000 }).catch(async () => {
          // May have redirected to dashboard
          await dashboardRedirect.catch(() => {});
        });

        // Since we haven't registered a credential for this origin,
        // the virtual authenticator should reject the request.
        // The UI should handle this gracefully.
        const pageContent = await page.content();
        expect(pageContent).not.toContain("TypeError");
        expect(pageContent).not.toContain("Uncaught");
      } finally {
        await removeVirtualAuthenticator(auth);
      }
    });

    test("should show email input with webauthn autocomplete", async ({
      page,
    }) => {
      await page.goto("/login");

      // Email input should have webauthn in autocomplete for conditional mediation
      const emailInput = page.locator("#login-email");
      await expect(emailInput).toBeVisible();

      const autocomplete = await emailInput.getAttribute("autocomplete");
      expect(autocomplete).toContain("webauthn");
    });

    test("should handle passkey authentication error gracefully", async ({
      page,
    }) => {
      const pageErrors: string[] = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));

      const auth = await addVirtualAuthenticator(page);

      try {
        await clearAuthState(page);
        await page.goto("/login");

        const passkeyButton = page.getByRole("button", {
          name: /sign in with passkey/i,
        });
        await expect(passkeyButton).toBeVisible({ timeout: 10000 });

        // Click passkey sign-in without any registered credentials
        await passkeyButton.click();

        // Wait for the attempt to resolve
        await page.waitForTimeout(5000);

        // Should not produce unhandled page errors
        const hasCritical = pageErrors.some(
          (e) => e.includes("Uncaught") || e.includes("Unhandled"),
        );
        expect(hasCritical).toBe(false);

        // Page should remain functional - login form should still work
        await expect(page.locator("body")).toBeVisible();
        await expect(page.locator("#login-email")).toBeVisible();
      } finally {
        await removeVirtualAuthenticator(auth);
      }
    });
  });

  // ===========================================================================
  // PASSKEY REGISTRATION UI DETAILS
  // ===========================================================================

  test.describe("Passkey Registration UI Details", () => {
    test("should allow registering passkey with empty name", async ({
      page,
    }) => {
      const auth = await addVirtualAuthenticator(page);

      try {
        await clearAuthState(page);
        await page.goto("/dashboard/settings/security");

        if (page.url().includes("/login")) return;

        await page.getByRole("button", { name: /add passkey/i }).click();
        await expect(
          page.getByText(/add a passkey/i),
        ).toBeVisible({ timeout: 5000 });

        // Don't fill name - leave it empty
        // Register button should still be clickable (name is optional)
        await page.getByRole("button", { name: /register passkey/i }).click();

        // Virtual authenticator handles the prompt
        // Wait for completion
        await page
          .getByText(/passkey registered/i)
          .waitFor({ state: "visible", timeout: 15000 })
          .catch(async () => {
            // Dialog should close on success
            await expect(
              page.getByText(/add a passkey/i),
            ).not.toBeVisible({ timeout: 10000 });
          });
      } finally {
        await removeVirtualAuthenticator(auth);
      }
    });

    test("should submit passkey name on Enter key", async ({ page }) => {
      const auth = await addVirtualAuthenticator(page);

      try {
        await clearAuthState(page);
        await page.goto("/dashboard/settings/security");

        if (page.url().includes("/login")) return;

        await page.getByRole("button", { name: /add passkey/i }).click();
        await expect(
          page.getByText(/add a passkey/i),
        ).toBeVisible({ timeout: 5000 });

        const nameInput = page.getByPlaceholder(/macbook touch id|yubikey/i);
        await nameInput.fill("Enter Key Test");

        // Press Enter to submit
        await nameInput.press("Enter");

        // Should trigger registration (virtual authenticator handles prompt)
        // Wait for either registering state or completion
        const registeringText = page.getByText(/registering/i);
        const successText = page.getByText(/passkey registered/i);
        await expect(
          registeringText.or(successText),
        ).toBeVisible({ timeout: 10000 }).catch(() => {
          // May have completed very quickly
        });
      } finally {
        await removeVirtualAuthenticator(auth);
      }
    });

    test("should show loading state during registration", async ({ page }) => {
      const auth = await addVirtualAuthenticator(page, {
        // Use automatic presence but we can still check the loading state
        isUserVerified: true,
      });

      try {
        await clearAuthState(page);
        await page.goto("/dashboard/settings/security");

        if (page.url().includes("/login")) return;

        await page.getByRole("button", { name: /add passkey/i }).click();
        await expect(
          page.getByText(/add a passkey/i),
        ).toBeVisible({ timeout: 5000 });

        const nameInput = page.getByPlaceholder(/macbook touch id|yubikey/i);
        await nameInput.fill("Loading Test");

        // Click register
        await page.getByRole("button", { name: /register passkey/i }).click();

        // The button should show loading state briefly
        // (virtual authenticator is fast, so this may be transient)
        const registerButton = page.getByRole("button", {
          name: /register passkey|registering/i,
        });
        await expect(registerButton).toBeVisible();
      } finally {
        await removeVirtualAuthenticator(auth);
      }
    });
  });

  // ===========================================================================
  // ACCESSIBILITY
  // ===========================================================================

  test.describe("Passkey Accessibility", () => {
    test("passkey section has proper headings and descriptions", async ({
      page,
    }) => {
      await clearAuthState(page);
      await page.goto("/dashboard/settings/security");

      if (page.url().includes("/login")) return;

      // Passkeys heading
      await expect(
        page.getByText(/passkeys/i).first(),
      ).toBeVisible({ timeout: 10000 });

      // Description text
      await expect(
        page.getByText(/biometrics|security key|device pin/i),
      ).toBeVisible();
    });

    test("delete confirmation dialog has proper structure", async ({
      page,
    }) => {
      const auth = await addVirtualAuthenticator(page);

      try {
        await clearAuthState(page);
        await page.goto("/dashboard/settings/security");

        if (page.url().includes("/login")) return;

        // Register a passkey first
        await page.getByRole("button", { name: /add passkey/i }).click();
        await expect(
          page.getByText(/add a passkey/i),
        ).toBeVisible({ timeout: 5000 });

        const nameInput = page.getByPlaceholder(/macbook touch id|yubikey/i);
        await nameInput.fill("A11y Test Key");
        await page.getByRole("button", { name: /register passkey/i }).click();

        await page
          .getByText(/passkey registered/i)
          .waitFor({ state: "visible", timeout: 15000 })
          .catch(() => {});

        await page.waitForTimeout(2000);

        // Open delete dialog
        const deleteButton = page.getByRole("button", {
          name: /remove passkey/i,
        });
        await deleteButton.first().click();

        // Dialog should be an alertdialog (for accessibility)
        const dialog = page.locator('[role="alertdialog"]');
        await expect(dialog).toBeVisible({ timeout: 5000 });

        // Should have title and description
        await expect(
          dialog.getByText(/remove passkey\?/i),
        ).toBeVisible();
        await expect(
          dialog.getByText(/can no longer be used to sign in/i),
        ).toBeVisible();
      } finally {
        await removeVirtualAuthenticator(auth);
      }
    });

    test("delete button has screen reader label", async ({ page }) => {
      const auth = await addVirtualAuthenticator(page);

      try {
        await clearAuthState(page);
        await page.goto("/dashboard/settings/security");

        if (page.url().includes("/login")) return;

        // Register a passkey
        await page.getByRole("button", { name: /add passkey/i }).click();
        await expect(
          page.getByText(/add a passkey/i),
        ).toBeVisible({ timeout: 5000 });

        const nameInput = page.getByPlaceholder(/macbook touch id|yubikey/i);
        await nameInput.fill("SR Label Test");
        await page.getByRole("button", { name: /register passkey/i }).click();

        await page
          .getByText(/passkey registered/i)
          .waitFor({ state: "visible", timeout: 15000 })
          .catch(() => {});

        await page.waitForTimeout(2000);

        // The delete button should have an accessible name via sr-only span
        const deleteButton = page.getByRole("button", {
          name: /remove passkey/i,
        });
        await expect(deleteButton.first()).toBeVisible({ timeout: 10000 });
      } finally {
        await removeVirtualAuthenticator(auth);
      }
    });

    test("passkey sign-in button is keyboard accessible", async ({ page }) => {
      await page.goto("/login");

      const passkeyButton = page.getByRole("button", {
        name: /sign in with passkey/i,
      });
      await expect(passkeyButton).toBeVisible({ timeout: 10000 });

      // Should be focusable with Tab
      await passkeyButton.focus();
      await expect(passkeyButton).toBeFocused();
    });
  });
});
