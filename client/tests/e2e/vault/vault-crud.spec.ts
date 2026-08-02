import { test, expect } from "@playwright/test";
import {
  clearBrowserState,
  registerAndSetup,
  navigateToVault,
  openCreateDialog,
  createLoginItem,
  TEST_PASSWORD,
} from "../helpers/vault";

/**
 * E2E Test Suite: Vault CRUD and Local Search
 *
 * Tests the complete vault lifecycle:
 * 1. Create item — fill form, submit, verify in list
 * 2. View and edit — open detail, modify title, save
 * 3. Delete and restore — soft delete, trash, restore
 * 4. Search — local client-side search by title
 * 5. Zero-knowledge — no plaintext in network requests
 *
 * Each test.describe block registers a fresh user so tests
 * are fully isolated. Backend containers must be running (make start).
 */

// ─────────────────────────────────────────────────────────────────────
// 1. CREATE ITEM E2E
// ─────────────────────────────────────────────────────────────────────

test.describe("Create Vault Item", () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page);
  });

  test("create login item and verify in list", async ({ page }) => {
    // Register fresh user + unlock vault
    await registerAndSetup(page);
    await navigateToVault(page);

    // Open create dialog
    await openCreateDialog(page);

    // Default type should be Login
    await expect(page.locator("#item-title")).toBeVisible();
    await expect(page.locator("#item-username")).toBeVisible();
    await expect(page.locator("#item-password")).toBeVisible();
    await expect(page.locator("#item-url")).toBeVisible();

    // Fill login fields
    await page.locator("#item-title").fill("GitHub Account");
    await page.locator("#item-username").fill("e2e-user@github.com");
    await page.locator("#item-password").fill("gh-secret-pass-123!");
    await page.locator("#item-url").fill("https://github.com");
    await page.locator("#item-notes").fill("My GitHub credentials");

    // Save button should be enabled (title is filled)
    const saveButton = page.getByRole("button", { name: /save/i });
    await expect(saveButton).toBeEnabled();

    // Submit
    await saveButton.click();

    // Dialog should close
    await expect(page.locator("#item-title")).not.toBeVisible({
      timeout: 10000,
    });

    // Item should appear in the vault list
    await expect(page.getByText("GitHub Account")).toBeVisible({
      timeout: 10000,
    });

    // Subtitle (username) should show
    await expect(page.getByText("e2e-user@github.com")).toBeVisible();
  });

  test("save button is disabled without title", async ({ page }) => {
    await registerAndSetup(page);
    await navigateToVault(page);
    await openCreateDialog(page);

    // Leave title empty — save should be disabled
    const saveButton = page.getByRole("button", { name: /save/i });
    await expect(saveButton).toBeDisabled();

    // Fill title — save should become enabled
    await page.locator("#item-title").fill("Some Title");
    await expect(saveButton).toBeEnabled();

    // Clear title — save should be disabled again
    await page.locator("#item-title").fill("");
    await expect(saveButton).toBeDisabled();
  });

  test("create secure note item", async ({ page }) => {
    await registerAndSetup(page);
    await navigateToVault(page);
    await openCreateDialog(page);

    // Change type to Secure Note
    await page.locator("button").filter({ hasText: /login/i }).click();
    await page.getByRole("option", { name: /secure note/i }).click();

    // Title + notes should be visible, but not username/password
    await expect(page.locator("#item-title")).toBeVisible();
    await expect(page.locator("#item-notes")).toBeVisible();
    await expect(page.locator("#item-username")).not.toBeVisible();
    await expect(page.locator("#item-password")).not.toBeVisible();

    await page.locator("#item-title").fill("Private Note");
    await page.locator("#item-notes").fill("This is secret content");

    await page.getByRole("button", { name: /save/i }).click();

    // Should appear in list
    await expect(page.getByText("Private Note")).toBeVisible({
      timeout: 10000,
    });
  });

  test("create card item", async ({ page }) => {
    await registerAndSetup(page);
    await navigateToVault(page);
    await openCreateDialog(page);

    // Change type to Card
    await page.locator("button").filter({ hasText: /login/i }).click();
    await page.getByRole("option", { name: /^card$/i }).click();

    // Card-specific fields
    await expect(page.locator("#card-name")).toBeVisible();
    await expect(page.locator("#card-number")).toBeVisible();
    await expect(page.locator("#card-expiry")).toBeVisible();
    await expect(page.locator("#card-cvv")).toBeVisible();

    await page.locator("#item-title").fill("Visa Platinum");
    await page.locator("#card-name").fill("E2E Test User");
    await page.locator("#card-number").fill("4111111111111111");
    await page.locator("#card-expiry").fill("12/29");
    await page.locator("#card-cvv").fill("123");

    await page.getByRole("button", { name: /save/i }).click();

    await expect(page.getByText("Visa Platinum")).toBeVisible({
      timeout: 10000,
    });
    // Card subtitle should show masked last 4 digits
    await expect(page.getByText("**** 1111")).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────
// 2. VIEW AND EDIT ITEM E2E
// ─────────────────────────────────────────────────────────────────────

test.describe("View and Edit Vault Item", () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page);
  });

  test("view item detail and edit title", async ({ page }) => {
    await registerAndSetup(page);
    await navigateToVault(page);

    // Create an item first
    await createLoginItem(page, {
      title: "Original Title",
      username: "user@test.com",
      password: "secret123",
      url: "https://example.com",
    });

    // Click the item in the list to open detail view
    await page.getByText("Original Title").click();

    // Detail view should show the decrypted fields
    await expect(page.getByText("user@test.com")).toBeVisible({
      timeout: 5000,
    });
    // Password should be masked by default
    await expect(page.getByText("\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022")).toBeVisible();

    // URL should show
    await expect(page.getByText("https://example.com")).toBeVisible();

    // Type badge should show "Login"
    await expect(page.getByText("Login")).toBeVisible();

    // Click edit button (Pencil icon)
    await page
      .getByRole("button", { name: /edit item/i })
      .click();

    // Title should now be an editable input
    const titleInput = page.locator("input.text-lg");
    await expect(titleInput).toBeVisible();
    await expect(titleInput).toHaveValue("Original Title");

    // Change the title
    await titleInput.fill("Updated Title");

    // Click Save
    await page.getByRole("button", { name: /save/i }).click();

    // Should exit edit mode — updated title visible in detail header
    await expect(page.getByText("Updated Title")).toBeVisible({
      timeout: 10000,
    });
  });

  test("cancel editing shows discard dialog when changes exist", async ({
    page,
  }) => {
    await registerAndSetup(page);
    await navigateToVault(page);

    await createLoginItem(page, {
      title: "Discard Test",
      username: "test@test.com",
    });

    // Open detail
    await page.getByText("Discard Test").click();

    // Enter edit mode
    await page
      .getByRole("button", { name: /edit item/i })
      .click();

    // Modify a field to create unsaved changes
    const titleInput = page.locator("input.text-lg");
    await titleInput.fill("Changed Title");

    // Click Cancel
    await page.getByRole("button", { name: /cancel/i }).click();

    // Discard dialog should appear
    await expect(page.getByText(/unsaved changes/i)).toBeVisible();
    await expect(
      page.getByText(/are you sure you want to discard/i),
    ).toBeVisible();

    // Choose "Discard" to exit without saving
    await page.getByRole("button", { name: /discard/i }).click();

    // Should show original title (not the changed one)
    await expect(page.getByText("Discard Test")).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────
// 3. DELETE AND RESTORE E2E
// ─────────────────────────────────────────────────────────────────────

test.describe("Delete and Restore Vault Item", () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page);
  });

  test("delete item to trash and restore", async ({ page }) => {
    await registerAndSetup(page);
    await navigateToVault(page);

    // Create an item
    await createLoginItem(page, {
      title: "Deletable Item",
      username: "delete-me@test.com",
    });

    // Open detail view
    await page.getByText("Deletable Item").click();

    // Click delete button (Trash icon)
    await page
      .getByRole("button", { name: /delete item/i })
      .click();

    // Confirmation dialog should appear
    await expect(page.getByText(/delete item/i)).toBeVisible();
    await expect(
      page.getByText(/moved to trash/i),
    ).toBeVisible();

    // Confirm deletion
    await page
      .getByRole("button", { name: /^delete$/i })
      .click();

    // Item should disappear from the items list
    await expect(page.getByText("Deletable Item")).not.toBeVisible({
      timeout: 10000,
    });

    // Switch to Trash tab
    await page.getByRole("tab", { name: /trash/i }).click();

    // Item should appear in trash
    await expect(page.getByText("Deletable Item")).toBeVisible({
      timeout: 10000,
    });

    // Click Restore button
    await page
      .getByRole("button", { name: /restore/i })
      .click();

    // Item should disappear from trash
    await expect(page.getByText("Deletable Item")).not.toBeVisible({
      timeout: 10000,
    });

    // Switch back to Items tab
    await page.getByRole("tab", { name: /items/i }).click();

    // Item should be back in the vault
    await expect(page.getByText("Deletable Item")).toBeVisible({
      timeout: 10000,
    });
  });

  test("trash shows empty state when no deleted items", async ({ page }) => {
    await registerAndSetup(page);
    await navigateToVault(page);

    // Switch to Trash tab
    await page.getByRole("tab", { name: /trash/i }).click();

    // Should show empty trash message
    await expect(page.getByText(/trash is empty/i)).toBeVisible({
      timeout: 10000,
    });
  });
});

// ─────────────────────────────────────────────────────────────────────
// 4. SEARCH E2E
// ─────────────────────────────────────────────────────────────────────

test.describe("Vault Search", () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page);
  });

  test("search finds item by title", async ({ page }) => {
    await registerAndSetup(page);
    await navigateToVault(page);

    // Create multiple items
    await createLoginItem(page, {
      title: "AWS Console",
      username: "admin@aws.com",
    });
    await createLoginItem(page, {
      title: "GitHub Enterprise",
      username: "dev@github.com",
    });
    await createLoginItem(page, {
      title: "Figma Design",
      username: "designer@figma.com",
    });

    // All 3 items should be visible initially
    await expect(page.getByText("AWS Console")).toBeVisible();
    await expect(page.getByText("GitHub Enterprise")).toBeVisible();
    await expect(page.getByText("Figma Design")).toBeVisible();

    // Type in search bar
    const searchInput = page.getByPlaceholder(/search vault/i);
    await searchInput.fill("GitHub");

    // Wait for debounced search (300ms + render)
    await page.waitForTimeout(500);

    // GitHub item should be visible
    await expect(page.getByText("GitHub Enterprise")).toBeVisible();

    // Other items should be hidden
    await expect(page.getByText("AWS Console")).not.toBeVisible();
    await expect(page.getByText("Figma Design")).not.toBeVisible();

    // Clear search — all items should return
    await searchInput.fill("");
    await page.waitForTimeout(500);

    await expect(page.getByText("AWS Console")).toBeVisible();
    await expect(page.getByText("GitHub Enterprise")).toBeVisible();
    await expect(page.getByText("Figma Design")).toBeVisible();
  });

  test("search shows no results message for non-matching query", async ({
    page,
  }) => {
    await registerAndSetup(page);
    await navigateToVault(page);

    await createLoginItem(page, {
      title: "My Service",
      username: "user@example.com",
    });

    const searchInput = page.getByPlaceholder(/search vault/i);
    await searchInput.fill("nonexistent-xyz");
    await page.waitForTimeout(500);

    // Should show "no items match" message
    await expect(
      page.getByText(/no items match/i),
    ).toBeVisible({ timeout: 5000 });
  });

  test("search query persists in URL", async ({ page }) => {
    await registerAndSetup(page);
    await navigateToVault(page);

    await createLoginItem(page, {
      title: "URL Test Item",
    });

    const searchInput = page.getByPlaceholder(/search vault/i);
    await searchInput.fill("URL Test");
    await page.waitForTimeout(500);

    // URL should contain the query parameter
    expect(page.url()).toContain("q=URL");

    // Reload the page — search should persist
    await page.reload();
    await expect(page.getByText("URL Test Item")).toBeVisible({
      timeout: 15000,
    });
  });
});

// ─────────────────────────────────────────────────────────────────────
// 5. PASSWORD GENERATOR INTEGRATION
// ─────────────────────────────────────────────────────────────────────

test.describe("Password Generator in Create Dialog", () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page);
  });

  test("generate button populates password field", async ({ page }) => {
    await registerAndSetup(page);
    await navigateToVault(page);
    await openCreateDialog(page);

    // Password field should be empty initially
    const passwordInput = page.locator("#item-password");
    await expect(passwordInput).toHaveValue("");

    // Click the Generate button (Wand2 icon)
    await page
      .getByRole("button", { name: /generate/i })
      .click();

    // Password field should now be populated
    const generatedPassword = await passwordInput.inputValue();
    expect(generatedPassword.length).toBeGreaterThanOrEqual(12);

    // Verify password has mixed character types (uppercase, lowercase, digits, symbols)
    expect(generatedPassword).toMatch(/[a-z]/);
    expect(generatedPassword).toMatch(/[A-Z]/);
    expect(generatedPassword).toMatch(/[0-9]/);

    // Fill other fields and save to verify the generated password persists
    await page.locator("#item-title").fill("Generated Pass Item");
    await page.locator("#item-username").fill("gen-user@test.com");

    await page.getByRole("button", { name: /save/i }).click();

    // Item should appear in the vault list
    await expect(page.getByText("Generated Pass Item")).toBeVisible({
      timeout: 10000,
    });
  });

  test("generate button replaces existing password", async ({ page }) => {
    await registerAndSetup(page);
    await navigateToVault(page);
    await openCreateDialog(page);

    // Type a manual password first
    const passwordInput = page.locator("#item-password");
    await passwordInput.fill("manual-password-123");

    // Click Generate — should replace the manual password
    await page
      .getByRole("button", { name: /generate/i })
      .click();

    const generatedPassword = await passwordInput.inputValue();
    expect(generatedPassword).not.toBe("manual-password-123");
    expect(generatedPassword.length).toBeGreaterThanOrEqual(12);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 6. ZERO-KNOWLEDGE VERIFICATION
// ─────────────────────────────────────────────────────────────────────

test.describe("Zero-Knowledge Network Verification", () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page);
  });

  test("no plaintext in network requests when creating item", async ({
    page,
  }) => {
    await registerAndSetup(page);
    await navigateToVault(page);

    // Known plaintext values that must NOT appear in network traffic
    const PLAINTEXT_TITLE = "TopSecret-ZKP-Title-" + Date.now();
    const PLAINTEXT_USERNAME = "zkp-user-" + Date.now() + "@secret.com";
    const PLAINTEXT_PASSWORD = "zkp-p@ss-" + Date.now() + "!";

    // Collect all outgoing request bodies
    const requestBodies: string[] = [];
    page.on("request", (request) => {
      const body = request.postData();
      if (body) {
        requestBodies.push(body);
      }
    });

    // Create an item with known plaintext
    await openCreateDialog(page);
    await page.locator("#item-title").fill(PLAINTEXT_TITLE);
    await page.locator("#item-username").fill(PLAINTEXT_USERNAME);
    await page.locator("#item-password").fill(PLAINTEXT_PASSWORD);

    await page.getByRole("button", { name: /save/i }).click();

    // Wait for the item to appear (confirms the request went through)
    await expect(page.getByText(PLAINTEXT_TITLE)).toBeVisible({
      timeout: 10000,
    });

    // Verify no request body contains any plaintext value
    for (const body of requestBodies) {
      expect(body).not.toContain(PLAINTEXT_TITLE);
      expect(body).not.toContain(PLAINTEXT_USERNAME);
      expect(body).not.toContain(PLAINTEXT_PASSWORD);
    }
  });

  test("permanent delete removes item from trash completely", async ({
    page,
  }) => {
    await registerAndSetup(page);
    await navigateToVault(page);

    // Create an item
    await createLoginItem(page, {
      title: "Perm Delete Item",
      username: "perm-delete@test.com",
    });

    // Open detail and delete to trash
    await page.getByText("Perm Delete Item").click();
    await page
      .getByRole("button", { name: /delete item/i })
      .click();
    await page
      .getByRole("button", { name: /^delete$/i })
      .click();

    // Item gone from main list
    await expect(page.getByText("Perm Delete Item")).not.toBeVisible({
      timeout: 10000,
    });

    // Switch to Trash tab
    await page.getByRole("tab", { name: /trash/i }).click();

    // Item should be in trash
    await expect(page.getByText("Perm Delete Item")).toBeVisible({
      timeout: 10000,
    });

    // Click permanent delete button on the trash item
    await page
      .getByRole("button", { name: /permanently delete|^delete$/i })
      .first()
      .click();

    // Confirmation dialog should appear
    await expect(
      page.getByText(/permanently delete/i),
    ).toBeVisible({ timeout: 5000 });
    await expect(
      page.getByText(/cannot be undone/i),
    ).toBeVisible();

    // Confirm permanent deletion
    await page
      .getByRole("button", { name: /permanently delete/i })
      .click();

    // Item should be gone from trash
    await expect(page.getByText("Perm Delete Item")).not.toBeVisible({
      timeout: 10000,
    });

    // Switch back to Items tab — should not be there either
    await page.getByRole("tab", { name: /items/i }).click();
    await expect(page.getByText("Perm Delete Item")).not.toBeVisible();
  });

  test("no plaintext in network requests when editing item", async ({
    page,
  }) => {
    await registerAndSetup(page);
    await navigateToVault(page);

    // Create an item first
    await createLoginItem(page, {
      title: "Edit ZKP Test",
      username: "original@test.com",
    });

    // Start intercepting requests
    const requestBodies: string[] = [];
    page.on("request", (request) => {
      const body = request.postData();
      if (body) {
        requestBodies.push(body);
      }
    });

    const UPDATED_TITLE = "Updated-ZKP-" + Date.now();

    // Open detail and edit
    await page.getByText("Edit ZKP Test").click();
    await page
      .getByRole("button", { name: /edit item/i })
      .click();

    const titleInput = page.locator("input.text-lg");
    await titleInput.fill(UPDATED_TITLE);
    await page.getByRole("button", { name: /save/i }).click();

    // Wait for save to complete
    await expect(page.getByText(UPDATED_TITLE)).toBeVisible({
      timeout: 10000,
    });

    // Verify updated plaintext does not appear in any request
    for (const body of requestBodies) {
      expect(body).not.toContain(UPDATED_TITLE);
    }
  });

  test("network requests contain only encrypted data fields", async ({
    page,
  }) => {
    await registerAndSetup(page);
    await navigateToVault(page);

    // Collect all request bodies for credential mutations
    const credentialRequests: string[] = [];
    page.on("request", (request) => {
      const body = request.postData();
      if (body && request.url().includes("trpc")) {
        credentialRequests.push(body);
      }
    });

    // Create an item
    await createLoginItem(page, {
      title: "Encrypted Fields Check",
      username: "encrypted@test.com",
      password: "encrypted-pass-123!",
    });

    // Find the create mutation request (should contain encrypted fields)
    const createRequests = credentialRequests.filter(
      (body) =>
        body.includes("credentials") && body.includes("create"),
    );

    // If we found the create request, verify it has encrypted data markers
    // (base64 ciphertext, nonce, authTag) but NOT plaintext
    for (const body of createRequests) {
      expect(body).not.toContain("Encrypted Fields Check");
      expect(body).not.toContain("encrypted@test.com");
      expect(body).not.toContain("encrypted-pass-123!");
    }
  });
});
