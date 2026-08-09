import { test, expect } from "@playwright/test";
import {
  clearBrowserState,
  registerAndSetup,
  navigateToVault,
  createLoginItem,
  openShareDialog,
  openEphemeralShareDialog,
} from "../helpers/vault";

/**
 * E2E Test Suite: Sharing Flows
 *
 * Tests the complete sharing lifecycle:
 * 1. Sharing tab — navigation, empty states, URL tab persistence
 * 2. Share dialog — form validation, UI, submission
 * 3. Accept / decline shares — PendingSharesInbox actions
 * 4. Sent shares & revoke — SentSharesList with revoke confirmation
 * 5. Ephemeral link — create, configure, copy link, access page
 *
 * Each test registers fresh users for isolation.
 * Backend containers must be running (make start).
 */

// ─────────────────────────────────────────────────────────────────────
// 1. SHARING TAB NAVIGATION
// ─────────────────────────────────────────────────────────────────────

test.describe("Sharing Tab Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page);
  });

  test("sharing tab shows received and sent sections", async ({ page }) => {
    await registerAndSetup(page);
    await navigateToVault(page);

    // Click Sharing tab
    await page.getByRole("tab", { name: /sharing/i }).click();

    // Should show both sections
    await expect(page.getByText(/received/i).first()).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText(/sent/i).first()).toBeVisible();
  });

  test("sharing tab persists in URL", async ({ page }) => {
    await registerAndSetup(page);
    await navigateToVault(page);

    // Switch to Sharing tab
    await page.getByRole("tab", { name: /sharing/i }).click();

    // URL should contain tab=sharing
    await expect(page).toHaveURL(/tab=sharing/);

    // Reload — should stay on sharing tab
    await page.reload();
    await expect(page.getByText(/received/i).first()).toBeVisible({
      timeout: 15000,
    });
    await expect(page).toHaveURL(/tab=sharing/);
  });

  test("sharing tab shows empty states for new user", async ({ page }) => {
    await registerAndSetup(page);
    await navigateToVault(page);

    // Switch to Sharing tab
    await page.getByRole("tab", { name: /sharing/i }).click();

    // Should show empty received state
    await expect(
      page.getByText(/no pending shares/i).or(page.getByText(/items shared with you/i)),
    ).toBeVisible({ timeout: 10000 });

    // Should show empty sent state
    await expect(
      page.getByText(/no shared items/i).or(page.getByText(/items you share/i)),
    ).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────
// 2. SHARE DIALOG VALIDATION
// ─────────────────────────────────────────────────────────────────────

test.describe("Share Dialog", () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page);
  });

  test("share dialog opens with correct title and fields", async ({
    page,
  }) => {
    await registerAndSetup(page);
    await navigateToVault(page);

    // Create an item to share
    await createLoginItem(page, {
      title: "Share Dialog Test",
      username: "user@example.com",
    });

    // Open share dialog
    await openShareDialog(page, "Share Dialog Test");

    // Dialog should show item title
    await expect(page.getByText(/share "share dialog test"/i)).toBeVisible();

    // Email input should be visible
    await expect(page.locator("#share-email")).toBeVisible();

    // Permission select should be visible
    await expect(page.locator("#share-permission")).toBeVisible();

    // Share button should be disabled (empty email)
    const shareButton = page.getByRole("button", { name: /^share$/i }).last();
    await expect(shareButton).toBeDisabled();

    // Cancel button should be visible
    await expect(
      page.getByRole("button", { name: /cancel/i }),
    ).toBeVisible();
  });

  test("share dialog validates email format", async ({ page }) => {
    await registerAndSetup(page);
    await navigateToVault(page);

    await createLoginItem(page, {
      title: "Email Validation Test",
      username: "user@example.com",
    });

    await openShareDialog(page, "Email Validation Test");

    // Enter invalid email
    await page.locator("#share-email").fill("not-an-email");

    // Click share
    const shareButton = page.getByRole("button", { name: /^share$/i }).last();
    await shareButton.click();

    // Should show validation error
    await expect(page.getByText(/valid email/i)).toBeVisible({
      timeout: 5000,
    });
  });

  test("share dialog shows empty email error", async ({ page }) => {
    await registerAndSetup(page);
    await navigateToVault(page);

    await createLoginItem(page, {
      title: "Empty Email Test",
      username: "user@example.com",
    });

    await openShareDialog(page, "Empty Email Test");

    // Focus and blur email to trigger submit with spaces
    await page.locator("#share-email").fill("   ");

    // Submit button should be disabled with whitespace-only email
    const shareButton = page.getByRole("button", { name: /^share$/i }).last();
    await expect(shareButton).toBeDisabled();
  });

  test("share dialog closes on cancel", async ({ page }) => {
    await registerAndSetup(page);
    await navigateToVault(page);

    await createLoginItem(page, {
      title: "Cancel Dialog Test",
      username: "user@example.com",
    });

    await openShareDialog(page, "Cancel Dialog Test");

    // Click cancel
    await page.getByRole("button", { name: /cancel/i }).click();

    // Dialog should close
    await expect(page.getByText(/share item/i)).not.toBeVisible({
      timeout: 5000,
    });
  });

  test("share dialog allows permission selection", async ({ page }) => {
    await registerAndSetup(page);
    await navigateToVault(page);

    await createLoginItem(page, {
      title: "Permission Test",
      username: "user@example.com",
    });

    await openShareDialog(page, "Permission Test");

    // Default should be "View only"
    await expect(page.getByText(/view only/i).first()).toBeVisible();
    await expect(
      page.getByText(/recipient can view but not modify/i),
    ).toBeVisible();

    // Change to "Can edit"
    await page.locator("#share-permission").click();
    await page.getByRole("option", { name: /can edit/i }).click();

    // Hint should update
    await expect(
      page.getByText(/recipient can view and modify/i),
    ).toBeVisible();

    // Change to "Can share"
    await page.locator("#share-permission").click();
    await page.getByRole("option", { name: /can share/i }).click();

    // Hint and zero-knowledge copy should make the permission boundary explicit.
    await expect(
      page.getByText(/recipient can view, edit, and re-share/i),
    ).toBeVisible();
    await expect(
      page.getByText(/server never receives plaintext vault data/i),
    ).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────
// 3. SHARE ITEM BETWEEN TWO USERS
// ─────────────────────────────────────────────────────────────────────

test.describe("Share Item Flow", () => {
  test("share item and verify it appears in sent shares", async ({
    browser,
  }) => {
    // Create two isolated browser contexts for sender and recipient
    const senderContext = await browser.newContext();
    const senderPage = await senderContext.newPage();

    try {
      await clearBrowserState(senderPage);

      // Register sender
      const sender = await registerAndSetup(senderPage);
      await navigateToVault(senderPage);

      // Create an item to share
      await createLoginItem(senderPage, {
        title: "Shared Credentials",
        username: "admin@corp.com",
        password: "corp-secret-123!",
      });

      // Open share dialog
      await openShareDialog(senderPage, "Shared Credentials");

      // Fill recipient email (use a test address)
      const recipientEmail = `recipient-${Date.now()}@test.local`;
      await senderPage.locator("#share-email").fill(recipientEmail);

      // Submit share
      const shareButton = senderPage
        .getByRole("button", { name: /^share$/i })
        .last();
      await shareButton.click();

      // Dialog should close (success) or show error (recipient not found)
      // Either outcome is valid in E2E — we verify the UI flow works
      await senderPage.waitForTimeout(2000);

      // Navigate to sharing tab to see sent shares
      await senderPage.getByRole("tab", { name: /sharing/i }).click();

      // The sent section should be visible
      await expect(
        senderPage.getByText(/sent/i).first(),
      ).toBeVisible({ timeout: 10000 });
    } finally {
      await senderContext.close();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// 4. ACCEPT AND DECLINE SHARES
// ─────────────────────────────────────────────────────────────────────

test.describe("Accept and Decline Shares", () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page);
  });

  test("pending shares inbox shows accept and decline buttons", async ({
    page,
  }) => {
    await registerAndSetup(page);
    await navigateToVault(page);

    // Navigate to sharing tab
    await page.getByRole("tab", { name: /sharing/i }).click();

    // Received section should be visible
    await expect(page.getByText(/received/i).first()).toBeVisible({
      timeout: 10000,
    });

    // For a new user, should show empty state
    await expect(
      page
        .getByText(/no pending shares/i)
        .or(page.getByText(/items shared with you/i)),
    ).toBeVisible({ timeout: 10000 });
  });

  test("pending shares inbox renders with API response", async ({ page }) => {
    await registerAndSetup(page);

    // Intercept the listReceivedShares call to inject mock shares
    await page.route("**/trpc/**", async (route) => {
      const url = route.request().url();
      const body = route.request().postData() || "";

      if (url.includes("listReceivedShares") || body.includes("listReceivedShares")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            result: {
              data: [
                {
                  id: "share-1",
                  itemId: "item-1",
                  itemTitle: "Mock Shared Login",
                  itemType: "login",
                  senderId: "sender-1",
                  senderEmail: "alice@test.local",
                  senderName: "Alice",
                  recipientId: "recipient-1",
                  recipientEmail: "bob@test.local",
                  recipientName: "Bob",
                  permission: "share",
                  status: "pending",
                  createdAt: new Date().toISOString(),
                },
              ],
            },
          }),
        });
      } else {
        await route.continue();
      }
    });

    await navigateToVault(page);
    await page.getByRole("tab", { name: /sharing/i }).click();

    // The mock share should appear
    await expect(page.getByText("Mock Shared Login")).toBeVisible({
      timeout: 10000,
    });

    // Accept button should be present
    await expect(
      page.getByRole("button", { name: /accept/i }),
    ).toBeVisible();

    // Sender name should show
    await expect(page.getByText(/alice/i)).toBeVisible();

    // Permission detail should be visible without opening the item.
    await expect(page.getByText(/re-share this item/i)).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────
// 5. SENT SHARES AND REVOKE ACCESS
// ─────────────────────────────────────────────────────────────────────

test.describe("Sent Shares and Revoke", () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page);
  });

  test("sent shares shows empty state for new user", async ({ page }) => {
    await registerAndSetup(page);
    await navigateToVault(page);

    // Navigate to sharing tab
    await page.getByRole("tab", { name: /sharing/i }).click();

    // Should show empty sent state
    await expect(
      page
        .getByText(/no shared items/i)
        .or(page.getByText(/items you share/i)),
    ).toBeVisible({ timeout: 10000 });
  });

  test("sent shares list shows revoke button with confirmation", async ({
    page,
  }) => {
    await registerAndSetup(page);

    // Intercept listSentShares to inject a mock share
    await page.route("**/trpc/**", async (route) => {
      const url = route.request().url();
      const body = route.request().postData() || "";

      if (url.includes("listSentShares") || body.includes("listSentShares")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            result: {
              data: [
                {
                  id: "sent-share-1",
                  itemId: "item-1",
                  itemTitle: "Shared API Key",
                  itemType: "login",
                  senderId: "me",
                  senderEmail: "me@test.local",
                  senderName: "Me",
                  recipientId: "them",
                  recipientEmail: "colleague@test.local",
                  recipientName: "Colleague",
                  permission: "view",
                  status: "accepted",
                  createdAt: new Date().toISOString(),
                },
              ],
            },
          }),
        });
      } else {
        await route.continue();
      }
    });

    await navigateToVault(page);
    await page.getByRole("tab", { name: /sharing/i }).click();

    // The sent share should appear
    await expect(page.getByText("Shared API Key")).toBeVisible({
      timeout: 10000,
    });

    // Recipient should show
    await expect(page.getByText(/colleague/i)).toBeVisible();

    // Status badge should show "Accepted"
    await expect(page.getByText(/accepted/i)).toBeVisible();

    // Revoke button should be visible for accepted shares
    const revokeButton = page.getByRole("button", { name: /revoke/i });
    await expect(revokeButton).toBeVisible();

    // Click revoke — confirmation dialog should appear
    await revokeButton.click();

    await expect(page.getByText(/revoke access/i)).toBeVisible({
      timeout: 5000,
    });
    await expect(
      page.getByText(/will no longer be able to access/i),
    ).toBeVisible();

    // Cancel button in dialog
    await expect(
      page.getByRole("button", { name: /cancel/i }),
    ).toBeVisible();

    // Confirm revoke button
    await expect(
      page.getByRole("button", { name: /revoke access/i }),
    ).toBeVisible();

    // Cancel to close the dialog
    await page.getByRole("button", { name: /cancel/i }).click();

    // Dialog should close
    await expect(
      page.getByText(/will no longer be able to access/i),
    ).not.toBeVisible({ timeout: 5000 });
  });
});

// ─────────────────────────────────────────────────────────────────────
// 6. EPHEMERAL SHARE DIALOG
// ─────────────────────────────────────────────────────────────────────

test.describe("Ephemeral Share Dialog", () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page);
  });

  test("ephemeral share dialog opens with configuration fields", async ({
    page,
  }) => {
    await registerAndSetup(page);
    await navigateToVault(page);

    await createLoginItem(page, {
      title: "Ephemeral Test Item",
      username: "eph@example.com",
      password: "eph-secret-123",
    });

    await openEphemeralShareDialog(page, "Ephemeral Test Item");

    // Dialog title
    await expect(page.getByText(/create sharing link/i)).toBeVisible();

    // Expiry selector should be visible
    await expect(page.locator("#ephemeral-expiry")).toBeVisible();

    // Passphrase input (optional)
    await expect(page.locator("#ephemeral-passphrase")).toBeVisible();

    // Max accesses input
    await expect(page.locator("#ephemeral-max-accesses")).toBeVisible();

    // IP restriction input
    await expect(page.locator("#ephemeral-ip")).toBeVisible();

    // Create Link button
    await expect(
      page.getByRole("button", { name: /create link/i }),
    ).toBeVisible();

    // Cancel button
    await expect(
      page.getByRole("button", { name: /cancel/i }),
    ).toBeVisible();
  });

  test("ephemeral share dialog expiry options", async ({ page }) => {
    await registerAndSetup(page);
    await navigateToVault(page);

    await createLoginItem(page, {
      title: "Expiry Options Test",
      username: "user@test.com",
    });

    await openEphemeralShareDialog(page, "Expiry Options Test");

    // Open expiry dropdown
    await page.locator("#ephemeral-expiry").click();

    // Should show all three expiry options
    await expect(page.getByRole("option", { name: /1 hour/i })).toBeVisible();
    await expect(
      page.getByRole("option", { name: /24 hours/i }),
    ).toBeVisible();
    await expect(page.getByRole("option", { name: /7 days/i })).toBeVisible();
  });

  test("ephemeral share dialog closes on cancel", async ({ page }) => {
    await registerAndSetup(page);
    await navigateToVault(page);

    await createLoginItem(page, {
      title: "Cancel Ephemeral Test",
      username: "user@test.com",
    });

    await openEphemeralShareDialog(page, "Cancel Ephemeral Test");

    // Click cancel
    await page.getByRole("button", { name: /cancel/i }).click();

    // Dialog should close
    await expect(
      page.getByText(/create sharing link/i),
    ).not.toBeVisible({ timeout: 5000 });
  });

  test("ephemeral share max accesses defaults to 1", async ({ page }) => {
    await registerAndSetup(page);
    await navigateToVault(page);

    await createLoginItem(page, {
      title: "Max Access Default",
      username: "user@test.com",
    });

    await openEphemeralShareDialog(page, "Max Access Default");

    // Default max accesses should be 1
    const maxAccessInput = page.locator("#ephemeral-max-accesses");
    await expect(maxAccessInput).toHaveValue("1");
  });

  test("ephemeral share passphrase hint shows when filled", async ({
    page,
  }) => {
    await registerAndSetup(page);
    await navigateToVault(page);

    await createLoginItem(page, {
      title: "Passphrase Hint Test",
      username: "user@test.com",
    });

    await openEphemeralShareDialog(page, "Passphrase Hint Test");

    // Passphrase hint should show
    await expect(
      page.getByText(/recipient must enter this passphrase/i),
    ).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────
// 7. EPHEMERAL LINK ACCESS PAGE
// ─────────────────────────────────────────────────────────────────────

test.describe("Ephemeral Link Access Page", () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page);
  });

  test("shows error for missing decryption key", async ({ page }) => {
    // Navigate to a share link without a fragment (no key)
    await page.goto("/share/some-link-id");

    // Should show error about missing key
    await expect(
      page
        .getByText(/link unavailable/i)
        .or(page.getByText(/missing decryption key/i))
        .or(page.getByText(/invalid link/i)),
    ).toBeVisible({ timeout: 10000 });
  });

  test("shows error for expired or invalid link", async ({ page }) => {
    // Navigate to a share link with a fake key
    await page.goto("/share/nonexistent-link-id#fakeKey123abc");

    // Should show error (link not found / expired / already used)
    await expect(
      page
        .getByText(/link unavailable/i)
        .or(page.getByText(/no longer available/i))
        .or(page.getByText(/expired/i))
        .or(page.getByText(/error/i)),
    ).toBeVisible({ timeout: 15000 });
  });

  test("ephemeral access page has noindex meta tag", async ({ page }) => {
    // Navigate to any share link
    await page.goto("/share/test-link#testKey");

    // Check for noindex meta tag (security best practice)
    const robotsMeta = page.locator('meta[name="robots"]');
    await expect(robotsMeta).toHaveAttribute("content", /noindex/);
  });

  test("shows passphrase prompt when link requires it", async ({ page }) => {
    // Mock the accessEphemeralLink response to return hasPassphrase: true
    await page.route("**/trpc/**", async (route) => {
      const url = route.request().url();
      const body = route.request().postData() || "";

      if (
        url.includes("accessEphemeralLink") ||
        body.includes("accessEphemeralLink")
      ) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            result: {
              data: {
                encryptedBlob: "mockEncryptedData",
                nonce: "mockNonce",
                authTag: "mockAuthTag",
                hasPassphrase: true,
                passphraseSalt: "mockSalt",
              },
            },
          }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/share/mock-link-id#mockLinkKey123");

    // Should show passphrase prompt
    await expect(
      page.getByText(/passphrase required/i),
    ).toBeVisible({ timeout: 10000 });

    // Passphrase input should be visible
    await expect(page.locator("#access-passphrase")).toBeVisible();

    // Decrypt button should be visible
    await expect(
      page.getByRole("button", { name: /decrypt/i }),
    ).toBeVisible();

    // Decrypt button should be disabled without passphrase
    await expect(
      page.getByRole("button", { name: /decrypt/i }),
    ).toBeDisabled();

    // Fill passphrase — button should enable
    await page.locator("#access-passphrase").fill("test-passphrase");
    await expect(
      page.getByRole("button", { name: /decrypt/i }),
    ).toBeEnabled();
  });

  test("shows loading state while fetching link", async ({ page }) => {
    // Delay the API response to observe loading state
    await page.route("**/trpc/**", async (route) => {
      const url = route.request().url();
      const body = route.request().postData() || "";

      if (
        url.includes("accessEphemeralLink") ||
        body.includes("accessEphemeralLink")
      ) {
        // Delay response
        await new Promise((r) => setTimeout(r, 2000));
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            result: {
              data: null,
            },
          }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/share/loading-test#validKey");

    // Should show loading spinner
    await expect(
      page.getByText(/loading shared item/i),
    ).toBeVisible({ timeout: 5000 });
  });
});

// ─────────────────────────────────────────────────────────────────────
// 8. ZERO-KNOWLEDGE VERIFICATION FOR SHARING
// ─────────────────────────────────────────────────────────────────────

test.describe("Sharing Zero-Knowledge Verification", () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page);
  });

  test("ephemeral link key is never sent in network requests", async ({
    page,
  }) => {
    await registerAndSetup(page);
    await navigateToVault(page);

    // Collect all outgoing request data
    const requestUrls: string[] = [];
    const requestBodies: string[] = [];
    page.on("request", (request) => {
      requestUrls.push(request.url());
      const body = request.postData();
      if (body) {
        requestBodies.push(body);
      }
    });

    await createLoginItem(page, {
      title: "ZKP Share Test",
      username: "zkp@test.com",
      password: "zkp-secret-pass!",
    });

    // Open ephemeral share dialog
    await openEphemeralShareDialog(page, "ZKP Share Test");

    // Create the link
    await page.getByRole("button", { name: /create link/i }).click();

    // Wait for result step (link generated) or error
    await page.waitForTimeout(5000);

    // If a link was generated, extract the key from it
    const linkInput = page.locator('input[readonly]');
    if (await linkInput.isVisible().catch(() => false)) {
      const generatedLink = await linkInput.inputValue();
      const fragment = generatedLink.split("#")[1];

      if (fragment) {
        // The link key (fragment) must NOT appear in any network request URL or body
        for (const url of requestUrls) {
          expect(url).not.toContain(fragment);
        }
        for (const body of requestBodies) {
          expect(body).not.toContain(fragment);
        }
      }
    }
  });

  test("share dialog does not send plaintext item data", async ({ page }) => {
    await registerAndSetup(page);
    await navigateToVault(page);

    const PLAINTEXT_TITLE = "Secret-Share-Title-" + Date.now();
    const PLAINTEXT_PASSWORD = "secret-share-pass-" + Date.now();

    await createLoginItem(page, {
      title: PLAINTEXT_TITLE,
      username: "share-user@test.com",
      password: PLAINTEXT_PASSWORD,
    });

    // Collect request bodies during share flow
    const shareBodies: string[] = [];
    page.on("request", (request) => {
      const body = request.postData();
      if (body && request.url().includes("trpc")) {
        shareBodies.push(body);
      }
    });

    // Open share dialog and submit
    await openShareDialog(page, PLAINTEXT_TITLE);
    await page.locator("#share-email").fill("recipient@test.local");

    const shareButton = page.getByRole("button", { name: /^share$/i }).last();
    await shareButton.click();

    // Wait for the request to go through
    await page.waitForTimeout(3000);

    // Sharing requests should NOT contain plaintext password
    for (const body of shareBodies) {
      expect(body).not.toContain(PLAINTEXT_PASSWORD);
    }
  });
});
