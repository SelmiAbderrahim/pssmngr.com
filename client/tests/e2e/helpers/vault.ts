/**
 * E2E Test Vault Helpers
 *
 * Utilities for registering a user, unlocking the vault,
 * and creating items in E2E tests.
 */

import { Page, expect } from "@playwright/test";
import { createConnection } from "net";
import { Client } from "pg";

const TEST_PASSWORD = "SecureVaultP@ss1!";

/**
 * Module-level map to store secret keys per Page instance.
 * Populated by registerAndSetup(), consumed by navigateToVault().
 * This avoids requiring every caller to thread secretKey through.
 */
const pageSecretKeys = new WeakMap<Page, string>();

const PG_CONFIG = {
  host: "pssmngr-postgres",
  port: 5432,
  user: "pssmngr",
  password: process.env.POSTGRES_PASSWORD || "pssmngr_dev",
  database: "pssmngr",
};

/**
 * Flush all rate-limit keys from Redis.
 *
 * Connects directly to pssmngr-redis on the Docker network and
 * deletes every key matching `rl:*`. This prevents 429 errors
 * when many E2E tests register or log in in sequence.
 */
export function flushRateLimits(): Promise<void> {
  return new Promise((resolve) => {
    const socket = createConnection(6379, "pssmngr-redis");
    let buffer = "";

    socket.setTimeout(3000);
    socket.on("timeout", () => { socket.destroy(); resolve(); });
    socket.on("error", () => resolve());

    socket.on("connect", () => {
      const lua = "local k = redis.call('KEYS','rl:*') if #k > 0 then return redis.call('DEL',unpack(k)) end return 0";
      socket.write(`EVAL "${lua}" 0\r\n`);
    });

    socket.on("data", (data) => {
      buffer += data.toString();
      if (buffer.includes("\r\n")) {
        socket.write("QUIT\r\n");
        socket.end();
        resolve();
      }
    });
  });
}

/**
 * Remove all E2E test users from the database.
 *
 * In self-hosted mode, the first registered user becomes the "owner" and
 * subsequent public registrations are blocked. This function removes test
 * users (email matching `e2e-*@test.local`) so each test can register
 * a fresh user.
 */
export async function cleanTestUsers(): Promise<void> {
  const client = new Client(PG_CONFIG);
  try {
    await client.connect();
    // Delete from NO ACTION FK tables first, then CASCADE-enabled ones handle themselves
    const e2eFilter = `(SELECT id FROM "user" WHERE email LIKE 'e2e-%@test.local')`;
    await client.query(`
      DELETE FROM share_envelope WHERE sender_user_id IN ${e2eFilter} OR recipient_user_id IN ${e2eFilter};
      DELETE FROM shared_vault_item WHERE created_by IN ${e2eFilter};
      DELETE FROM shared_vault WHERE created_by IN ${e2eFilter};
      DELETE FROM ephemeral_share WHERE sender_user_id IN ${e2eFilter};
      DELETE FROM recovery_request WHERE requester_id IN ${e2eFilter} OR approver_id IN ${e2eFilter};
      DELETE FROM account WHERE user_id IN ${e2eFilter};
      DELETE FROM member WHERE user_id IN ${e2eFilter};
      DELETE FROM "user" WHERE email LIKE 'e2e-%@test.local';
    `);
  } catch {
    // Non-fatal: database may not be reachable
  } finally {
    await client.end().catch(() => {});
  }
}

/**
 * Generate a unique email for test isolation.
 */
export function uniqueEmail(): string {
  return `e2e-vault-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@test.local`;
}

/**
 * Clear all browser storage (cookies, localStorage, sessionStorage, IndexedDB).
 */
export async function clearBrowserState(page: Page): Promise<void> {
  await page.context().clearCookies();
  // Navigate to the app first so we have a valid origin for storage access
  await page.goto("/", { waitUntil: "domcontentloaded" }).catch(() => {});
  await page.evaluate(() => {
    try {
      localStorage.clear();
      sessionStorage.clear();
      indexedDB.databases?.().then((dbs) =>
        dbs.forEach((db) => {
          if (db.name) indexedDB.deleteDatabase(db.name);
        }),
      );
    } catch {
      // Storage access may be denied on about:blank
    }
  });
}

/**
 * Register a new user and navigate to the dashboard.
 * Returns the secret key from the recovery kit.
 */
export async function registerAndSetup(
  page: Page,
  email?: string,
): Promise<{ email: string; secretKey: string }> {
  // Clean test users (unblock self-hosted admin check) and rate limits
  await cleanTestUsers();
  await flushRateLimits();

  const userEmail = email ?? uniqueEmail();

  await page.goto("/register");

  await page.locator("#register-name").fill("Test");
  await page.locator("#register-lastName").fill("Vault");
  await page.locator("#register-email").fill(userEmail);
  await page.locator("#register-password").fill(TEST_PASSWORD);
  await page.locator("#register-confirm-password").fill(TEST_PASSWORD);
  await page.locator("#register-terms").click();
  await page.getByRole("button", { name: /sign up/i }).click();

  // Wait for either recovery kit (cloud mode) or dashboard (self-hosted auto-sign-in)
  const recoveryKit = page.getByText(/save your secret key/i);
  const dashboard = page.getByText(/welcome back/i);
  await expect(recoveryKit.or(dashboard)).toBeVisible({ timeout: 30000 });

  let secretKey = "";

  if (await recoveryKit.isVisible().catch(() => false)) {
    // Cloud mode: recovery kit → device enrollment → dashboard
    secretKey =
      (await page.locator("#recovery-secret-key").textContent()) ?? "";
    expect(secretKey.length).toBeGreaterThan(10);

    await page.locator("#recovery-confirm").click();
    await page
      .getByRole("button", { name: /continue to dashboard/i })
      .click();

    // Skip device enrollment if shown
    const devicePrompt = page.getByText(/name this device/i);
    if (await devicePrompt.isVisible({ timeout: 5000 }).catch(() => false)) {
      await page.getByText(/skip for now/i).click();
    }
  }

  // Should reach dashboard
  await page.waitForURL(/\/dashboard/, { timeout: 15000 });

  return { email: userEmail, secretKey };
}

/**
 * Navigate to the vault page. If the vault is locked, unlock it.
 *
 * @param secretKey - The secret key from the recovery kit (needed on new devices)
 */
export async function navigateToVault(
  page: Page,
  secretKey?: string,
): Promise<void> {
  await page.goto("/dashboard/vault");

  // Wait for the page to load
  await page.waitForLoadState("domcontentloaded");

  // Check if vault unlock dialog is shown
  const masterPasswordInput = page.getByPlaceholder(/enter your master password/i);
  const unlockDialog = page.getByRole("dialog", { name: /unlock vault/i });

  // Wait for either unlock dialog or vault content
  await expect(
    unlockDialog.or(page.getByText(/add item/i)),
  ).toBeVisible({ timeout: 15000 });

  // If master password prompt is shown, unlock
  if (await unlockDialog.isVisible().catch(() => false)) {
    await masterPasswordInput.fill(TEST_PASSWORD);

    // Fill secret key if the prompt is visible
    const secretKeyInput = page.getByPlaceholder(/XXXXX-XXXXX/i);
    if (await secretKeyInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      if (secretKey) {
        await secretKeyInput.fill(secretKey);
      }
    }

    await page
      .getByRole("button", { name: /unlock/i })
      .click();

    // Wait for vault to load items or show empty state
    await expect(
      page
        .getByText(/add item/i)
        .or(page.getByText(/no items yet/i))
        .or(page.getByText(/add your first item/i))
        .first(),
    ).toBeVisible({ timeout: 30000 });
  }
}

/**
 * Open the "Add Item" dialog from the vault page.
 */
export async function openCreateDialog(page: Page): Promise<void> {
  // Click the "Add Item" button (header or empty state)
  const addButton = page.getByRole("button", { name: /add item/i }).first();
  const addFirstButton = page.getByRole("button", {
    name: /add your first item/i,
  });

  if (await addFirstButton.isVisible().catch(() => false)) {
    await addFirstButton.click();
  } else {
    await addButton.click();
  }

  // Wait for dialog
  await expect(page.locator("#item-title")).toBeVisible({ timeout: 5000 });
}

/**
 * Create a login item through the UI.
 * Assumes the vault page is open and unlocked.
 */
export async function createLoginItem(
  page: Page,
  opts: {
    title: string;
    username?: string;
    password?: string;
    url?: string;
    notes?: string;
  },
): Promise<void> {
  await openCreateDialog(page);

  // Title
  await page.locator("#item-title").fill(opts.title);

  // Type is already "Login" by default

  // Username
  if (opts.username) {
    await page.locator("#item-username").fill(opts.username);
  }

  // Password
  if (opts.password) {
    await page.locator("#item-password").fill(opts.password);
  }

  // URL
  if (opts.url) {
    await page.locator("#item-url").fill(opts.url);
  }

  // Notes
  if (opts.notes) {
    await page.locator("#item-notes").fill(opts.notes);
  }

  // Submit
  await page.getByRole("button", { name: /save/i }).click();

  // Wait for dialog to close
  await expect(page.locator("#item-title")).not.toBeVisible({ timeout: 10000 });

  // Wait for the new item to appear in the list
  await expect(page.getByText(opts.title)).toBeVisible({ timeout: 10000 });
}

/**
 * Navigate to the Sharing tab in the vault page.
 */
export async function navigateToSharingTab(page: Page): Promise<void> {
  await navigateToVault(page);
  await page.getByRole("tab", { name: /sharing/i }).click();
  // Wait for sharing tab content to appear
  await expect(
    page
      .getByText(/received/i)
      .first()
      .or(page.getByText(/no pending shares/i)),
  ).toBeVisible({ timeout: 15000 });
}

/**
 * Open the Share dialog for an item.
 * Assumes vault is open and an item with the given title exists.
 */
export async function openShareDialog(
  page: Page,
  itemTitle: string,
): Promise<void> {
  // Click item to open detail view
  await page.getByText(itemTitle).click();
  await expect(page.getByText(itemTitle)).toBeVisible({ timeout: 5000 });

  // Click the share button (Share2 icon)
  await page
    .getByRole("button", { name: /^share$/i })
    .click();

  // Wait for share dialog
  await expect(page.getByText(/share item/i)).toBeVisible({ timeout: 5000 });
}

/**
 * Open the Ephemeral Share dialog for an item.
 * Assumes vault is open and an item with the given title exists.
 */
export async function openEphemeralShareDialog(
  page: Page,
  itemTitle: string,
): Promise<void> {
  // Click item to open detail view
  await page.getByText(itemTitle).click();
  await expect(page.getByText(itemTitle)).toBeVisible({ timeout: 5000 });

  // Click the ephemeral share button (Link2 icon)
  await page
    .getByRole("button", { name: /create link/i })
    .click();

  // Wait for ephemeral share dialog
  await expect(page.getByText(/create sharing link/i)).toBeVisible({
    timeout: 5000,
  });
}

export { TEST_PASSWORD };
