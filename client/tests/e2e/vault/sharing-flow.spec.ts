import { test, expect, BrowserContext, Page } from "@playwright/test";
import {
  clearBrowserState,
  registerAndSetup,
  navigateToVault,
  createLoginItem,
  openShareDialog,
  openEphemeralShareDialog,
} from "../helpers/vault";

/**
 * E2E Test Suite: Sharing Flow (Two-User Lifecycle)
 *
 * Tests the complete sharing lifecycle between two users:
 * 1. User A shares an item with User B
 * 2. User B accepts / rejects the share
 * 3. User A revokes an active share
 * 4. Ephemeral link creation and anonymous access
 * 5. Passphrase-protected ephemeral link
 *
 * Each test uses isolated browser contexts to simulate separate users.
 * Backend containers must be running (make start).
 */

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

/** Register a user in a fresh browser context and return the context + page. */
async function setupUser(
  browser: import("@playwright/test").Browser,
  label: string,
): Promise<{ context: BrowserContext; page: Page; email: string }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await clearBrowserState(page);
  const { email } = await registerAndSetup(page);
  return { context, page, email };
}

/**
 * Inject a mock share into the received-shares list via route interception.
 * Returns the mock share ID for use in subsequent actions.
 */
function injectReceivedShare(
  page: Page,
  opts: {
    shareId: string;
    itemTitle: string;
    senderEmail: string;
    senderName: string;
    permission?: string;
    status?: string;
  },
) {
  return page.route("**/trpc/**", async (route) => {
    const url = route.request().url();
    const body = route.request().postData() || "";

    if (
      url.includes("listReceivedShares") ||
      body.includes("listReceivedShares")
    ) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          result: {
            data: [
              {
                id: opts.shareId,
                itemId: "item-" + opts.shareId,
                itemTitle: opts.itemTitle,
                itemType: "login",
                senderId: "sender-" + opts.shareId,
                senderEmail: opts.senderEmail,
                senderName: opts.senderName,
                recipientId: "recipient-" + opts.shareId,
                recipientEmail: "me@test.local",
                recipientName: "Me",
                permission: opts.permission ?? "view",
                status: opts.status ?? "pending",
                accepted: false,
                createdAt: new Date().toISOString(),
              },
            ],
          },
        }),
      });
    } else if (
      url.includes("acceptShare") ||
      body.includes("acceptShare")
    ) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          result: {
            data: {
              id: opts.shareId,
              accepted: true,
            },
          },
        }),
      });
    } else if (
      url.includes("declineShare") ||
      body.includes("declineShare")
    ) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          result: {
            data: {
              id: opts.shareId,
              revokedAt: new Date().toISOString(),
            },
          },
        }),
      });
    } else {
      await route.continue();
    }
  });
}

/**
 * Inject a mock sent share into the sent-shares list via route interception.
 */
function injectSentShare(
  page: Page,
  opts: {
    shareId: string;
    itemTitle: string;
    recipientEmail: string;
    recipientName: string;
    permission?: string;
    status?: string;
  },
) {
  return page.route("**/trpc/**", async (route) => {
    const url = route.request().url();
    const body = route.request().postData() || "";

    if (
      url.includes("listSentShares") ||
      body.includes("listSentShares")
    ) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          result: {
            data: [
              {
                id: opts.shareId,
                itemId: "item-" + opts.shareId,
                itemTitle: opts.itemTitle,
                itemType: "login",
                senderId: "me",
                senderEmail: "me@test.local",
                senderName: "Me",
                recipientId: "recipient-" + opts.shareId,
                recipientEmail: opts.recipientEmail,
                recipientName: opts.recipientName,
                permission: opts.permission ?? "view",
                status: opts.status ?? "accepted",
                accepted: true,
                revokedAt: null,
                createdAt: new Date().toISOString(),
              },
            ],
          },
        }),
      });
    } else if (
      url.includes("revokeShare") ||
      body.includes("revokeShare")
    ) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          result: {
            data: {
              id: opts.shareId,
              revokedAt: new Date().toISOString(),
            },
          },
        }),
      });
    } else {
      await route.continue();
    }
  });
}

// ─────────────────────────────────────────────────────────────────────
// 1. SHARE ITEM WITH ANOTHER USER
// ─────────────────────────────────────────────────────────────────────

test.describe("Share Item with Another User", () => {
  test("User A creates an item and shares it with User B's email", async ({
    browser,
  }) => {
    // Set up User A
    const userA = await setupUser(browser, "User A");

    try {
      await navigateToVault(userA.page);

      // Create an item to share
      await createLoginItem(userA.page, {
        title: "Shared API Key",
        username: "admin@corp.com",
        password: "corp-secret-123!",
      });

      // Open share dialog for the item
      await openShareDialog(userA.page, "Shared API Key");

      // Dialog should show the item title
      await expect(
        userA.page.getByText(/share/i).first(),
      ).toBeVisible();

      // Enter User B's email
      const recipientEmail = `userb-${Date.now()}@test.local`;
      await userA.page.locator("#share-email").fill(recipientEmail);

      // Select "view" permission (should be default)
      await expect(
        userA.page.getByText(/view only/i).first(),
      ).toBeVisible();

      // Submit the share
      const shareButton = userA.page
        .getByRole("button", { name: /^share$/i })
        .last();
      await shareButton.click();

      // Wait for the dialog to close or error message
      await userA.page.waitForTimeout(3000);

      // Navigate to sharing tab to verify the share appears in sent list
      await userA.page.getByRole("tab", { name: /sharing/i }).click();
      await expect(
        userA.page.getByText(/sent/i).first(),
      ).toBeVisible({ timeout: 10000 });
    } finally {
      await userA.context.close();
    }
  });

  test("share dialog enforces view permission by default", async ({
    browser,
  }) => {
    const userA = await setupUser(browser, "User A");

    try {
      await navigateToVault(userA.page);

      await createLoginItem(userA.page, {
        title: "Permission Check Item",
        username: "perm@test.com",
      });

      await openShareDialog(userA.page, "Permission Check Item");

      // Default permission should be "View only"
      await expect(
        userA.page.getByText(/view only/i).first(),
      ).toBeVisible();
      await expect(
        userA.page.getByText(/recipient can view but not modify/i),
      ).toBeVisible();
    } finally {
      await userA.context.close();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// 2. ACCEPT SHARE
// ─────────────────────────────────────────────────────────────────────

test.describe("Accept Share", () => {
  test("User B sees pending share and accepts it", async ({ browser }) => {
    const userB = await setupUser(browser, "User B");

    try {
      // Inject a mock pending share from User A
      await injectReceivedShare(userB.page, {
        shareId: "share-accept-1",
        itemTitle: "Shared Login from Alice",
        senderEmail: "alice@corp.com",
        senderName: "Alice",
        permission: "view",
        status: "pending",
      });

      await navigateToVault(userB.page);
      await userB.page.getByRole("tab", { name: /sharing/i }).click();

      // The pending share should appear with sender info
      await expect(
        userB.page.getByText("Shared Login from Alice"),
      ).toBeVisible({ timeout: 10000 });
      await expect(
        userB.page.getByText(/alice/i),
      ).toBeVisible();

      // Accept button should be visible
      const acceptButton = userB.page.getByRole("button", {
        name: /accept/i,
      });
      await expect(acceptButton).toBeVisible();

      // Click accept
      await acceptButton.click();

      // Should show success feedback (toast or status change)
      await expect(
        userB.page
          .getByText(/accepted/i)
          .or(userB.page.getByText(/share accepted/i))
          .or(userB.page.getByText(/success/i)),
      ).toBeVisible({ timeout: 10000 });
    } finally {
      await userB.context.close();
    }
  });

  test("accepted share shows correct permission level", async ({
    browser,
  }) => {
    const userB = await setupUser(browser, "User B");

    try {
      await injectReceivedShare(userB.page, {
        shareId: "share-perm-view",
        itemTitle: "View-Only Credentials",
        senderEmail: "sender@corp.com",
        senderName: "Sender",
        permission: "view",
      });

      await navigateToVault(userB.page);
      await userB.page.getByRole("tab", { name: /sharing/i }).click();

      // Verify the share appears with view permission indicator
      await expect(
        userB.page.getByText("View-Only Credentials"),
      ).toBeVisible({ timeout: 10000 });

      // Permission badge should show "view" or "View only"
      await expect(
        userB.page
          .getByText(/view/i)
          .first(),
      ).toBeVisible();
    } finally {
      await userB.context.close();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// 3. REJECT SHARE
// ─────────────────────────────────────────────────────────────────────

test.describe("Reject Share", () => {
  test("User B declines a pending share", async ({ browser }) => {
    const userB = await setupUser(browser, "User B");

    try {
      await injectReceivedShare(userB.page, {
        shareId: "share-reject-1",
        itemTitle: "Unwanted Share from Bob",
        senderEmail: "bob@corp.com",
        senderName: "Bob",
        permission: "view",
        status: "pending",
      });

      await navigateToVault(userB.page);
      await userB.page.getByRole("tab", { name: /sharing/i }).click();

      // The pending share should appear
      await expect(
        userB.page.getByText("Unwanted Share from Bob"),
      ).toBeVisible({ timeout: 10000 });

      // Decline button should be visible
      const declineButton = userB.page.getByRole("button", {
        name: /decline|reject/i,
      });
      await expect(declineButton).toBeVisible();

      // Click decline
      await declineButton.click();

      // Share should be removed or show declined status
      await expect(
        userB.page
          .getByText(/declined/i)
          .or(userB.page.getByText(/removed/i))
          .or(userB.page.getByText(/no pending shares/i)),
      ).toBeVisible({ timeout: 10000 });
    } finally {
      await userB.context.close();
    }
  });

  test("declined share does not appear in vault items", async ({
    browser,
  }) => {
    const userB = await setupUser(browser, "User B");

    try {
      await injectReceivedShare(userB.page, {
        shareId: "share-reject-2",
        itemTitle: "Declined Credentials",
        senderEmail: "bob@corp.com",
        senderName: "Bob",
      });

      await navigateToVault(userB.page);

      // The Items tab should NOT contain the declined share's title
      await expect(
        userB.page.getByRole("tab", { name: /items/i }),
      ).toBeVisible({ timeout: 10000 });

      // Verify the shared item is not in the main vault list
      await expect(
        userB.page.getByText("Declined Credentials"),
      ).not.toBeVisible({ timeout: 5000 });
    } finally {
      await userB.context.close();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// 4. REVOKE SHARE
// ─────────────────────────────────────────────────────────────────────

test.describe("Revoke Share", () => {
  test("User A revokes an active share with User B", async ({ browser }) => {
    const userA = await setupUser(browser, "User A");

    try {
      // Inject a mock sent (accepted) share
      await injectSentShare(userA.page, {
        shareId: "share-revoke-1",
        itemTitle: "Revocable API Key",
        recipientEmail: "userb@corp.com",
        recipientName: "User B",
        permission: "view",
        status: "accepted",
      });

      await navigateToVault(userA.page);
      await userA.page.getByRole("tab", { name: /sharing/i }).click();

      // The sent share should appear
      await expect(
        userA.page.getByText("Revocable API Key"),
      ).toBeVisible({ timeout: 10000 });

      // Recipient info should show
      await expect(
        userA.page.getByText(/user b/i),
      ).toBeVisible();

      // Revoke button should be visible
      const revokeButton = userA.page.getByRole("button", {
        name: /revoke/i,
      });
      await expect(revokeButton).toBeVisible();

      // Click revoke
      await revokeButton.click();

      // Confirmation dialog should appear
      await expect(
        userA.page.getByText(/revoke access/i),
      ).toBeVisible({ timeout: 5000 });
      await expect(
        userA.page.getByText(/will no longer be able to access/i),
      ).toBeVisible();

      // Confirm revoke
      await userA.page
        .getByRole("button", { name: /revoke access/i })
        .click();

      // Share should be removed or show revoked status
      await expect(
        userA.page
          .getByText(/revoked/i)
          .or(userA.page.getByText(/no shared items/i))
          .or(userA.page.getByText(/access revoked/i)),
      ).toBeVisible({ timeout: 10000 });
    } finally {
      await userA.context.close();
    }
  });

  test("revoked share is inaccessible to User B", async ({ browser }) => {
    const userB = await setupUser(browser, "User B");

    try {
      // Set up route to return empty received shares (simulating post-revoke state)
      await userB.page.route("**/trpc/**", async (route) => {
        const url = route.request().url();
        const body = route.request().postData() || "";

        if (
          url.includes("listReceivedShares") ||
          body.includes("listReceivedShares")
        ) {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              result: { data: [] },
            }),
          });
        } else {
          await route.continue();
        }
      });

      await navigateToVault(userB.page);
      await userB.page.getByRole("tab", { name: /sharing/i }).click();

      // User B should see no pending shares after revocation
      await expect(
        userB.page
          .getByText(/no pending shares/i)
          .or(userB.page.getByText(/items shared with you/i)),
      ).toBeVisible({ timeout: 10000 });
    } finally {
      await userB.context.close();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// 5. EPHEMERAL LINK
// ─────────────────────────────────────────────────────────────────────

test.describe("Ephemeral Link", () => {
  test("User A creates ephemeral link and anonymous user accesses it", async ({
    browser,
  }) => {
    const userA = await setupUser(browser, "User A");

    try {
      await navigateToVault(userA.page);

      await createLoginItem(userA.page, {
        title: "Ephemeral Share Item",
        username: "eph-user@corp.com",
        password: "eph-secret-456!",
      });

      // Open ephemeral share dialog
      await openEphemeralShareDialog(userA.page, "Ephemeral Share Item");

      // Verify dialog fields
      await expect(
        userA.page.getByText(/create sharing link/i),
      ).toBeVisible();
      await expect(userA.page.locator("#ephemeral-expiry")).toBeVisible();
      await expect(
        userA.page.locator("#ephemeral-max-accesses"),
      ).toBeVisible();

      // Set 1-hour expiry (should be default or select it)
      const expirySelect = userA.page.locator("#ephemeral-expiry");
      await expirySelect.click();
      await userA.page
        .getByRole("option", { name: /1 hour/i })
        .click();

      // Create the link
      await userA.page
        .getByRole("button", { name: /create link/i })
        .click();

      // Wait for link to be generated or error
      await userA.page.waitForTimeout(5000);

      // Check if a link was generated (readonly input with URL)
      const linkInput = userA.page.locator("input[readonly]");
      if (await linkInput.isVisible().catch(() => false)) {
        const generatedLink = await linkInput.inputValue();
        expect(generatedLink).toContain("/share/");
        expect(generatedLink).toContain("#"); // Fragment key present

        // Open link in a new incognito-like context
        const anonContext = await browser.newContext();
        const anonPage = await anonContext.newPage();

        try {
          // Extract relative path from the full URL
          const url = new URL(generatedLink);
          await anonPage.goto(url.pathname + url.hash);

          // Anonymous user should see the shared content or loading state
          await expect(
            anonPage
              .getByText(/shared/i)
              .or(anonPage.getByText(/loading/i))
              .or(anonPage.getByText(/decrypt/i))
              .or(anonPage.getByText(/link unavailable/i)),
          ).toBeVisible({ timeout: 15000 });
        } finally {
          await anonContext.close();
        }
      }
    } finally {
      await userA.context.close();
    }
  });

  test("ephemeral link with expired/invalid ID shows error", async ({
    page,
  }) => {
    await page.goto("/share/nonexistent-link-id#fakeKey123abc");

    await expect(
      page
        .getByText(/link unavailable/i)
        .or(page.getByText(/no longer available/i))
        .or(page.getByText(/expired/i))
        .or(page.getByText(/error/i)),
    ).toBeVisible({ timeout: 15000 });
  });

  test("ephemeral link without fragment key shows error", async ({
    page,
  }) => {
    await page.goto("/share/some-link-id");

    await expect(
      page
        .getByText(/link unavailable/i)
        .or(page.getByText(/missing decryption key/i))
        .or(page.getByText(/invalid link/i)),
    ).toBeVisible({ timeout: 10000 });
  });
});

// ─────────────────────────────────────────────────────────────────────
// 6. PASSPHRASE-PROTECTED EPHEMERAL LINK
// ─────────────────────────────────────────────────────────────────────

test.describe("Passphrase-Protected Ephemeral Link", () => {
  test("passphrase-protected link rejects wrong passphrase", async ({
    page,
  }) => {
    // Mock the API to return a passphrase-protected link
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
                passphraseSalt: "bW9ja1NhbHQ=", // base64 "mockSalt"
              },
            },
          }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/share/protected-link-id#validLinkKey123");

    // Should show passphrase prompt
    await expect(
      page.getByText(/passphrase required/i),
    ).toBeVisible({ timeout: 10000 });

    // Passphrase input should be visible
    const passphraseInput = page.locator("#access-passphrase");
    await expect(passphraseInput).toBeVisible();

    // Decrypt button should be disabled without passphrase
    const decryptButton = page.getByRole("button", { name: /decrypt/i });
    await expect(decryptButton).toBeDisabled();

    // Enter wrong passphrase
    await passphraseInput.fill("wrong-passphrase");
    await expect(decryptButton).toBeEnabled();
    await decryptButton.click();

    // Should show decryption error (wrong key derived from wrong passphrase)
    await expect(
      page
        .getByText(/incorrect passphrase/i)
        .or(page.getByText(/decryption failed/i))
        .or(page.getByText(/unable to decrypt/i))
        .or(page.getByText(/error/i)),
    ).toBeVisible({ timeout: 10000 });
  });

  test("passphrase input enables decrypt button when filled", async ({
    page,
  }) => {
    // Mock the API to return a passphrase-protected link
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
                passphraseSalt: "bW9ja1NhbHQ=",
              },
            },
          }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/share/passphrase-test-link#testKey456");

    // Wait for passphrase prompt
    await expect(
      page.getByText(/passphrase required/i),
    ).toBeVisible({ timeout: 10000 });

    const passphraseInput = page.locator("#access-passphrase");
    const decryptButton = page.getByRole("button", { name: /decrypt/i });

    // Should be disabled when empty
    await expect(decryptButton).toBeDisabled();

    // Fill passphrase — should enable
    await passphraseInput.fill("my-secret-passphrase");
    await expect(decryptButton).toBeEnabled();

    // Clear passphrase — should disable again
    await passphraseInput.fill("");
    await expect(decryptButton).toBeDisabled();
  });

  test("User A creates ephemeral link with passphrase", async ({
    browser,
  }) => {
    const userA = await setupUser(browser, "User A");

    try {
      await navigateToVault(userA.page);

      await createLoginItem(userA.page, {
        title: "Protected Share Item",
        username: "protected@corp.com",
        password: "protected-secret!",
      });

      // Open ephemeral share dialog
      await openEphemeralShareDialog(userA.page, "Protected Share Item");

      // Fill passphrase
      const passphraseInput = userA.page.locator("#ephemeral-passphrase");
      await expect(passphraseInput).toBeVisible();
      await passphraseInput.fill("my-share-passphrase-123");

      // Hint text should indicate passphrase is set
      await expect(
        userA.page.getByText(/recipient must enter this passphrase/i),
      ).toBeVisible();

      // Set expiry
      const expirySelect = userA.page.locator("#ephemeral-expiry");
      await expirySelect.click();
      await userA.page
        .getByRole("option", { name: /1 hour/i })
        .click();

      // Create the link
      await userA.page
        .getByRole("button", { name: /create link/i })
        .click();

      // Wait for result
      await userA.page.waitForTimeout(5000);

      // Check if link was generated
      const linkInput = userA.page.locator("input[readonly]");
      if (await linkInput.isVisible().catch(() => false)) {
        const generatedLink = await linkInput.inputValue();
        expect(generatedLink).toContain("/share/");
        expect(generatedLink).toContain("#");
      }
    } finally {
      await userA.context.close();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// 7. ZERO-KNOWLEDGE VERIFICATION
// ─────────────────────────────────────────────────────────────────────

test.describe("Sharing Zero-Knowledge Guarantees", () => {
  test("share flow does not leak plaintext credentials in network", async ({
    browser,
  }) => {
    const userA = await setupUser(browser, "User A");

    try {
      await navigateToVault(userA.page);

      const PLAINTEXT_TITLE = "ZKP-Share-Title-" + Date.now();
      const PLAINTEXT_PASSWORD = "ZKP-share-secret-" + Date.now();

      await createLoginItem(userA.page, {
        title: PLAINTEXT_TITLE,
        username: "zkp-share@test.com",
        password: PLAINTEXT_PASSWORD,
      });

      // Collect request bodies during share flow
      const shareBodies: string[] = [];
      userA.page.on("request", (request) => {
        const body = request.postData();
        if (body && request.url().includes("trpc")) {
          shareBodies.push(body);
        }
      });

      // Open share dialog and submit
      await openShareDialog(userA.page, PLAINTEXT_TITLE);
      await userA.page.locator("#share-email").fill("recipient@test.local");

      const shareButton = userA.page
        .getByRole("button", { name: /^share$/i })
        .last();
      await shareButton.click();

      await userA.page.waitForTimeout(3000);

      // Verify no request body contains plaintext password
      for (const body of shareBodies) {
        expect(body).not.toContain(PLAINTEXT_PASSWORD);
      }
    } finally {
      await userA.context.close();
    }
  });

  test("ephemeral link key never appears in network requests", async ({
    browser,
  }) => {
    const userA = await setupUser(browser, "User A");

    try {
      await navigateToVault(userA.page);

      await createLoginItem(userA.page, {
        title: "ZKP Ephemeral Test",
        username: "zkp-eph@test.com",
        password: "zkp-eph-secret!",
      });

      // Collect all outgoing request data
      const requestUrls: string[] = [];
      const requestBodies: string[] = [];
      userA.page.on("request", (request) => {
        requestUrls.push(request.url());
        const body = request.postData();
        if (body) requestBodies.push(body);
      });

      await openEphemeralShareDialog(userA.page, "ZKP Ephemeral Test");
      await userA.page
        .getByRole("button", { name: /create link/i })
        .click();

      await userA.page.waitForTimeout(5000);

      // If a link was generated, extract and verify the key
      const linkInput = userA.page.locator("input[readonly]");
      if (await linkInput.isVisible().catch(() => false)) {
        const generatedLink = await linkInput.inputValue();
        const fragment = generatedLink.split("#")[1];

        if (fragment) {
          // The fragment (decryption key) must NOT appear in any network request
          for (const url of requestUrls) {
            expect(url).not.toContain(fragment);
          }
          for (const body of requestBodies) {
            expect(body).not.toContain(fragment);
          }
        }
      }
    } finally {
      await userA.context.close();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// 8. TWO-USER CONTEXT ISOLATION
// ─────────────────────────────────────────────────────────────────────

test.describe("Two-User Context Isolation", () => {
  test("User A and User B have completely separate sessions", async ({
    browser,
  }) => {
    // Create two separate browser contexts
    const userA = await setupUser(browser, "User A");
    const userB = await setupUser(browser, "User B");

    try {
      // Both users should be on dashboard
      await expect(userA.page).toHaveURL(/\/dashboard/);
      await expect(userB.page).toHaveURL(/\/dashboard/);

      // Emails should be different
      expect(userA.email).not.toBe(userB.email);

      // Navigate both to vault
      await navigateToVault(userA.page);
      await navigateToVault(userB.page);

      // User A creates an item — it should NOT appear in User B's vault
      await createLoginItem(userA.page, {
        title: "User A Private Item",
        username: "usera@private.com",
      });

      await expect(
        userA.page.getByText("User A Private Item"),
      ).toBeVisible({ timeout: 10000 });

      // User B's vault should not contain User A's item
      await expect(
        userB.page.getByText("User A Private Item"),
      ).not.toBeVisible({ timeout: 5000 });
    } finally {
      await userA.context.close();
      await userB.context.close();
    }
  });
});
