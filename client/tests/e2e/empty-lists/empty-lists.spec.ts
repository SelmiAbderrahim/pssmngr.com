/**
 * E2E Tests — Empty List Scenarios
 *
 * Verifies every list view renders an empty state (not an error page)
 * when no items exist. Registers a single fresh user (with owner-hiding
 * to bypass self-hosted admin check) then re-uses that session.
 */

import { test, expect, Page, Browser } from "@playwright/test";
import { Client } from "pg";
import { createConnection } from "net";

const TEST_PASSWORD = "SecureVaultP@ss1!";

const PG_CONFIG = {
  host: "pssmngr-postgres",
  port: 5432,
  user: "pssmngr",
  password: process.env.POSTGRES_PASSWORD || "pssmngr_dev",
  database: "pssmngr",
};

/* ── DB Helpers ──────────────────────────────────────────────── */

function flushRateLimits(): Promise<void> {
  return new Promise((resolve) => {
    const socket = createConnection(6379, "pssmngr-redis");
    let buffer = "";
    socket.setTimeout(3000);
    socket.on("timeout", () => { socket.destroy(); resolve(); });
    socket.on("error", () => resolve());
    socket.on("connect", () => {
      const lua =
        "local k = redis.call('KEYS','rl:*') if #k > 0 then return redis.call('DEL',unpack(k)) end return 0";
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

function uniqueEmail(): string {
  return `e2e-empty-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@test.local`;
}

async function hideOwnerMembers(): Promise<void> {
  const client = new Client(PG_CONFIG);
  try {
    await client.connect();
    await client.query(
      `UPDATE member SET role = '_owner_hidden' WHERE role = 'owner'`,
    );
  } finally {
    await client.end().catch(() => {});
  }
}

async function restoreOwnerMembers(): Promise<void> {
  const client = new Client(PG_CONFIG);
  try {
    await client.connect();
    await client.query(
      `UPDATE member SET role = 'owner' WHERE role = '_owner_hidden'`,
    );
  } finally {
    await client.end().catch(() => {});
  }
}

async function cleanTestUsers(): Promise<void> {
  const client = new Client(PG_CONFIG);
  try {
    await client.connect();
    const e2eFilter = `(SELECT id FROM "user" WHERE email LIKE 'e2e-%@test.local')`;
    await client.query(`
      DELETE FROM share_envelope WHERE sender_user_id IN ${e2eFilter} OR recipient_user_id IN ${e2eFilter};
      DELETE FROM shared_vault_item WHERE created_by IN ${e2eFilter};
      DELETE FROM shared_vault WHERE created_by IN ${e2eFilter};
      DELETE FROM ephemeral_share WHERE sender_user_id IN ${e2eFilter};
      DELETE FROM recovery_request WHERE requester_id IN ${e2eFilter} OR approver_id IN ${e2eFilter};
      DELETE FROM account WHERE user_id IN ${e2eFilter};
      DELETE FROM member WHERE user_id IN ${e2eFilter};
      DELETE FROM device WHERE user_id IN ${e2eFilter};
      DELETE FROM vault WHERE user_id IN ${e2eFilter};
      DELETE FROM item WHERE vault_id NOT IN (SELECT id FROM vault);
      DELETE FROM "user" WHERE email LIKE 'e2e-%@test.local';
    `);
  } catch {
    // Non-fatal
  } finally {
    await client.end().catch(() => {});
  }
}

/* ── Browser Helpers ─────────────────────────────────────────── */

async function clearBrowserState(page: Page): Promise<void> {
  await page.context().clearCookies();
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
      // ignore
    }
  });
}

/**
 * Register a fresh user via the UI. Temporarily hides "owner" members
 * to bypass the self-hosted admin check.
 */
async function registerFreshUser(
  page: Page,
): Promise<{ email: string; secretKey: string; storageState: string }> {
  await cleanTestUsers();
  await flushRateLimits();

  const userEmail = uniqueEmail();

  await hideOwnerMembers();

  try {
    await page.goto("/register");

    await page.locator("#register-name").fill("Test");
    await page.locator("#register-lastName").fill("Empty");
    await page.locator("#register-email").fill(userEmail);
    await page.locator("#register-password").fill(TEST_PASSWORD);
    await page.locator("#register-confirm-password").fill(TEST_PASSWORD);
    await page.locator("#register-terms").click();
    await page.getByRole("button", { name: /sign up/i }).click();

    // Wait for either recovery kit (cloud) or dashboard (self-hosted)
    const recoveryKit = page.getByText(/save your secret key/i);
    const dashboard = page.getByText(/welcome back/i);
    await expect(recoveryKit.or(dashboard)).toBeVisible({ timeout: 30000 });

    let secretKey = "";

    if (await recoveryKit.isVisible().catch(() => false)) {
      secretKey =
        (await page.locator("#recovery-secret-key").textContent()) ?? "";
      expect(secretKey.length).toBeGreaterThan(10);

      await page.locator("#recovery-confirm").click();
      await page
        .getByRole("button", { name: /continue to dashboard/i })
        .click();

      const devicePrompt = page.getByText(/name this device/i);
      if (
        await devicePrompt.isVisible({ timeout: 5000 }).catch(() => false)
      ) {
        await page.getByText(/skip for now/i).click();
      }
    }

    await page.waitForURL(/\/dashboard/, { timeout: 15000 });

    // Save browser state so tests can reuse the session
    const storageState = `/tmp/e2e-empty-storage-${Date.now()}.json`;
    await page.context().storageState({ path: storageState });

    return { email: userEmail, secretKey, storageState };
  } finally {
    await restoreOwnerMembers();
  }
}

/* ── Tests ───────────────────────────────────────────────────── */

test.describe("Empty list views", () => {
  let storageStatePath: string;

  test.beforeAll(async ({ browser }) => {
    // Register one fresh user and capture session state
    const page = await browser.newPage();
    const result = await registerFreshUser(page);
    storageStatePath = result.storageState;
    await page.close();
  });

  test.afterAll(async () => {
    await cleanTestUsers();
  });

  test("dashboard home shows empty/welcome state for new user", async ({
    browser,
  }) => {
    const context = await browser.newContext({ storageState: storageStatePath });
    const page = await context.newPage();

    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    // Should not show error messages
    await expect(page.getByText(/something went wrong/i)).not.toBeVisible();
    await expect(page.getByText(/500/i)).not.toBeVisible();

    // Should show welcome message
    await expect(
      page.getByText(/welcome back/i).first(),
    ).toBeVisible({ timeout: 15000 });

    await context.close();
  });

  test("vault page shows empty state, not error, when no items exist", async ({
    browser,
  }) => {
    const context = await browser.newContext({ storageState: storageStatePath });
    const page = await context.newPage();

    await page.goto("/dashboard/vault");
    await page.waitForLoadState("networkidle");

    // Verify no server errors
    await expect(page.getByText(/something went wrong/i)).not.toBeVisible();
    await expect(page.getByText(/500/i)).not.toBeVisible();

    // Vault should show empty state, no-vault message, or unlock prompt
    await expect(
      page
        .getByText(/no items yet/i)
        .or(page.getByText(/add your first item/i))
        .or(page.getByText(/no vault found/i))
        .or(page.getByText(/vault will be created/i))
        .or(page.getByText(/unlock vault/i))
        .first(),
    ).toBeVisible({ timeout: 15000 });

    await context.close();
  });

  test("watchtower page shows empty/no-vault state, not error", async ({
    browser,
  }) => {
    const context = await browser.newContext({ storageState: storageStatePath });
    const page = await context.newPage();

    await page.goto("/dashboard/watchtower");
    await page.waitForLoadState("networkidle");

    // Verify no server errors
    await expect(page.getByText(/something went wrong/i)).not.toBeVisible();
    await expect(page.getByText(/500/i)).not.toBeVisible();

    // Watchtower should show unlock-vault prompt or all-clear state
    await expect(
      page
        .getByText(/unlock your vault/i)
        .or(page.getByText(/no weak passwords/i))
        .or(page.getByText(/no reused passwords/i))
        .or(page.getByText(/no vault found/i))
        .or(page.getByRole("button", { name: /unlock vault/i }))
        .first(),
    ).toBeVisible({ timeout: 15000 });

    await context.close();
  });

  test("family page shows create-family state, not error", async ({
    browser,
  }) => {
    const context = await browser.newContext({ storageState: storageStatePath });
    const page = await context.newPage();

    await page.goto("/dashboard/family");
    await page.waitForLoadState("networkidle");

    // Should not show error state
    await expect(page.getByText(/something went wrong/i)).not.toBeVisible();
    await expect(page.getByText(/500/i)).not.toBeVisible();

    // Every self-hosted install includes family features.
    await expect(
      page
        .getByText(/create a family/i)
        .or(page.getByRole("button", { name: /create family/i }))
        .first(),
    ).toBeVisible({ timeout: 15000 });

    await context.close();
  });

  test("trash view shows empty trash state, not error", async ({
    browser,
  }) => {
    const context = await browser.newContext({ storageState: storageStatePath });
    const page = await context.newPage();

    await page.goto("/dashboard/vault?tab=trash");
    await page.waitForLoadState("networkidle");

    // Should not show error state
    await expect(page.getByText(/something went wrong/i)).not.toBeVisible();
    await expect(page.getByText(/500/i)).not.toBeVisible();

    // Should show empty trash or vault-related message
    await expect(
      page
        .getByText(/trash is empty/i)
        .or(page.getByText(/no vault/i))
        .or(page.getByText(/unlock/i))
        .or(page.getByText(/no deleted items/i))
        .first(),
    ).toBeVisible({ timeout: 15000 });

    await context.close();
  });

  test("all tRPC API calls return non-500 status for fresh user", async ({
    browser,
  }) => {
    const context = await browser.newContext({ storageState: storageStatePath });
    const page = await context.newPage();

    const apiResponses: { url: string; status: number }[] = [];

    page.on("response", (response) => {
      const url = response.url();
      if (url.includes("/trpc/")) {
        apiResponses.push({ url, status: response.status() });
      }
    });

    // Visit all pages
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    await page.goto("/dashboard/vault");
    await page.waitForLoadState("networkidle");

    await page.goto("/dashboard/watchtower");
    await page.waitForLoadState("networkidle");

    await page.goto("/dashboard/family");
    await page.waitForLoadState("networkidle");

    // No server errors (5xx)
    const serverErrors = apiResponses.filter((r) => r.status >= 500);
    expect(
      serverErrors,
      `Server errors found: ${JSON.stringify(serverErrors)}`,
    ).toHaveLength(0);

    // Verify we actually captured API calls
    expect(apiResponses.length).toBeGreaterThan(0);

    await context.close();
  });
});
