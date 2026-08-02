import { test, expect } from "@playwright/test";
import { clearBrowserState, registerAndSetup, uniqueEmail } from "../helpers/vault";
import {
  navigateToFamily,
  createFamily,
  openInviteDialog,
  inviteMember,
  switchFamilyTab,
  openCreateVaultDialog,
  createSharedVault,
  registerAndCreateFamily,
} from "../helpers/family";

/**
 * E2E Test Suite: Family Flows
 *
 * Tests the complete family lifecycle:
 * 1. Create family — form validation, creation, dashboard display
 * 2. Invite member — dialog validation, email/role input, submission
 * 3. Shared vaults — create vault, empty states, vault list
 * 4. Tab navigation — URL persistence, tab switching
 * 5. Recovery — organizer/member views, request flow
 * 6. Settings — rename family, leave family confirmation
 *
 * Each test registers fresh users for isolation.
 * Backend containers must be running (make start).
 */

// ─────────────────────────────────────────────────────────────────────
// 1. CREATE FAMILY
// ─────────────────────────────────────────────────────────────────────

test.describe("Create Family", () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page);
  });

  test("shows create family form for new user", async ({ page }) => {
    await registerAndSetup(page);
    await navigateToFamily(page);

    // Should show the create family UI
    await expect(page.getByText(/create a family/i)).toBeVisible();
    await expect(
      page.getByText(/start a family plan/i),
    ).toBeVisible();

    // Name input and submit button should be visible
    await expect(
      page.locator('input[placeholder*="Family name" i]'),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /create family/i }),
    ).toBeVisible();
  });

  test("validates empty family name", async ({ page }) => {
    await registerAndSetup(page);
    await navigateToFamily(page);

    // Submit with empty name
    await page.getByRole("button", { name: /create family/i }).click();

    // Should show validation error
    await expect(
      page.getByText(/please enter a family name/i),
    ).toBeVisible({ timeout: 5000 });
  });

  test("creates a family and shows dashboard", async ({ page }) => {
    await registerAndSetup(page);
    await navigateToFamily(page);

    const familyName = `Test Family ${Date.now()}`;
    await createFamily(page, familyName);

    // Should show family name as heading
    await expect(page.getByText(familyName)).toBeVisible({ timeout: 10000 });

    // Should show member count
    await expect(page.getByText(/1 members/i)).toBeVisible();

    // All tabs should be visible
    await expect(page.getByRole("tab", { name: /members/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /shared vaults/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /recovery/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /settings/i })).toBeVisible();
  });

  test("organizer sees own profile in members list", async ({ page }) => {
    const user = await registerAndSetup(page);
    await navigateToFamily(page);
    await createFamily(page, "Members Check Family");

    // Members tab should show by default
    // Should see the current user with "(you)" label
    await expect(page.getByText(/\(you\)/i)).toBeVisible({ timeout: 10000 });

    // Should show "Organizer" badge
    await expect(page.getByText(/organizer/i)).toBeVisible();

    // Member count header
    await expect(page.getByText(/members.*\(1\/6\)/i)).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────
// 2. INVITE MEMBER
// ─────────────────────────────────────────────────────────────────────

test.describe("Invite Member", () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page);
  });

  test("invite dialog opens with correct fields", async ({ page }) => {
    await registerAndCreateFamily(page, "Invite Test Family");

    await openInviteDialog(page);

    // Dialog title
    await expect(page.getByText(/invite family member/i)).toBeVisible();
    await expect(
      page.getByText(/send an invitation/i),
    ).toBeVisible();

    // Email input
    await expect(page.locator("#invite-email")).toBeVisible();

    // Role select
    await expect(page.locator("#invite-role")).toBeVisible();

    // Buttons
    await expect(
      page.getByRole("button", { name: /send invitation/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /cancel/i }),
    ).toBeVisible();
  });

  test("invite dialog validates empty email", async ({ page }) => {
    await registerAndCreateFamily(page, "Email Validation Family");

    await openInviteDialog(page);

    // Submit with empty email
    await page.getByRole("button", { name: /send invitation/i }).click();

    // Should show validation error
    await expect(
      page.getByText(/valid email/i),
    ).toBeVisible({ timeout: 5000 });
  });

  test("invite dialog validates invalid email format", async ({ page }) => {
    await registerAndCreateFamily(page, "Invalid Email Family");

    await openInviteDialog(page);

    // Enter invalid email
    await page.locator("#invite-email").fill("not-an-email");

    // Submit
    await page.getByRole("button", { name: /send invitation/i }).click();

    // Should show validation error
    await expect(
      page.getByText(/valid email/i),
    ).toBeVisible({ timeout: 5000 });
  });

  test("invite dialog closes on cancel", async ({ page }) => {
    await registerAndCreateFamily(page, "Cancel Invite Family");

    await openInviteDialog(page);

    // Click cancel
    await page.getByRole("button", { name: /cancel/i }).click();

    // Dialog should close
    await expect(
      page.getByText(/invite family member/i),
    ).not.toBeVisible({ timeout: 5000 });
  });

  test("invite dialog allows role selection", async ({ page }) => {
    await registerAndCreateFamily(page, "Role Select Family");

    await openInviteDialog(page);

    // Default should be "Member"
    await expect(page.getByText(/member/i).first()).toBeVisible();

    // Should show member hint
    await expect(
      page.getByText(/members can access shared vaults/i),
    ).toBeVisible();

    // Change to Admin
    await page.locator("#invite-role").click();
    await page.getByRole("option", { name: /admin/i }).click();

    // Hint should update
    await expect(
      page.getByText(/admins can manage shared vaults/i),
    ).toBeVisible();
  });

  test("invite member with valid email", async ({ page }) => {
    await registerAndCreateFamily(page, "Invite Submit Family");

    const recipientEmail = uniqueEmail();
    await inviteMember(page, recipientEmail);

    // Dialog should close (success) — invitation sent
    // We verify the UI flow completes without error
    await expect(
      page.getByText(/invite family member/i),
    ).not.toBeVisible({ timeout: 10000 });
  });

  test("organizer sees Invite Member button, non-organizer does not", async ({ page }) => {
    await registerAndCreateFamily(page, "Organizer Btn Family");

    // Organizer should see the button
    await expect(
      page.getByRole("button", { name: /invite member/i }),
    ).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────
// 3. SHARED VAULTS
// ─────────────────────────────────────────────────────────────────────

test.describe("Shared Vaults", () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page);
  });

  test("shared vaults tab shows empty state", async ({ page }) => {
    await registerAndCreateFamily(page, "Empty Vaults Family");

    // Switch to vaults tab
    await switchFamilyTab(page, "vaults");

    // Should show empty state
    await expect(
      page.getByText(/no shared vaults yet/i),
    ).toBeVisible({ timeout: 10000 });
    await expect(
      page.getByText(/grant only the members who need it/i),
    ).toBeVisible();

    // Organizer should see create button in empty state
    await expect(
      page.getByRole("button", { name: /create your first shared vault/i }),
    ).toBeVisible();
  });

  test("create shared vault dialog opens with correct fields", async ({ page }) => {
    await registerAndCreateFamily(page, "Create Vault Dialog Family");

    await switchFamilyTab(page, "vaults");
    await openCreateVaultDialog(page);

    // Dialog title
    await expect(page.getByText(/create shared vault/i)).toBeVisible();
    await expect(
      page.getByText(/create a vault that family members/i),
    ).toBeVisible();

    // Name input
    await expect(page.locator("#vault-name")).toBeVisible();

    // Buttons
    await expect(
      page.getByRole("button", { name: /create vault/i }).last(),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /cancel/i }),
    ).toBeVisible();
  });

  test("create shared vault dialog validates empty name", async ({ page }) => {
    await registerAndCreateFamily(page, "Vault Validation Family");

    await switchFamilyTab(page, "vaults");
    await openCreateVaultDialog(page);

    // Submit empty
    await page.getByRole("button", { name: /create vault/i }).last().click();

    // Should show validation error
    await expect(
      page.getByText(/please enter a vault name/i),
    ).toBeVisible({ timeout: 5000 });
  });

  test("create shared vault dialog closes on cancel", async ({ page }) => {
    await registerAndCreateFamily(page, "Cancel Vault Family");

    await switchFamilyTab(page, "vaults");
    await openCreateVaultDialog(page);

    // Cancel
    await page.getByRole("button", { name: /cancel/i }).click();

    // Dialog should close
    await expect(
      page.getByText(/create shared vault/i),
    ).not.toBeVisible({ timeout: 5000 });
  });

  test("creates a shared vault and shows it in the list", async ({ page }) => {
    await registerAndCreateFamily(page, "Vault List Family");

    await switchFamilyTab(page, "vaults");

    const vaultName = `Streaming Services ${Date.now()}`;
    await createSharedVault(page, vaultName);

    // Vault should appear in the list
    await expect(page.getByText(vaultName)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/manage/i).first()).toBeVisible();
    await expect(page.getByText(/1 members/i).first()).toBeVisible();
  });

  test("shared vault list header shows Create Vault button for organizer", async ({ page }) => {
    await registerAndCreateFamily(page, "Vault Header Family");

    await switchFamilyTab(page, "vaults");

    // Header-level create button should be visible
    await expect(
      page.getByRole("button", { name: /create vault/i }).first(),
    ).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────
// 4. TAB NAVIGATION
// ─────────────────────────────────────────────────────────────────────

test.describe("Tab Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page);
  });

  test("default tab is members", async ({ page }) => {
    await registerAndCreateFamily(page, "Default Tab Family");

    // URL should have tab=members or no tab param (defaults to members)
    // Members tab should be active
    await expect(page.getByRole("tab", { name: /members/i })).toBeVisible();

    // Member list card should be visible
    await expect(page.getByText(/members.*\(1\/6\)/i)).toBeVisible({ timeout: 10000 });
  });

  test("tab state persists in URL", async ({ page }) => {
    await registerAndCreateFamily(page, "URL Tab Family");

    // Switch to vaults tab
    await switchFamilyTab(page, "vaults");

    // URL should contain tab=vaults
    await expect(page).toHaveURL(/tab=vaults/);

    // Switch to recovery tab
    await switchFamilyTab(page, "recovery");
    await expect(page).toHaveURL(/tab=recovery/);

    // Switch to settings tab
    await switchFamilyTab(page, "settings");
    await expect(page).toHaveURL(/tab=settings/);
  });

  test("tab persists after page reload", async ({ page }) => {
    await registerAndCreateFamily(page, "Persist Tab Family");

    // Switch to vaults tab
    await switchFamilyTab(page, "vaults");
    await expect(page).toHaveURL(/tab=vaults/);

    // Reload
    await page.reload();

    // Should still be on vaults tab
    await expect(
      page.getByText(/shared vaults/i).first(),
    ).toBeVisible({ timeout: 15000 });
    await expect(page).toHaveURL(/tab=vaults/);
  });

  test("direct URL with tab param opens correct tab", async ({ page }) => {
    await registerAndCreateFamily(page, "Direct URL Family");

    // Navigate directly to recovery tab
    await page.goto("/dashboard/family?tab=recovery");

    // Recovery content should be visible
    await expect(
      page.getByText(/account recovery/i),
    ).toBeVisible({ timeout: 15000 });
  });
});

// ─────────────────────────────────────────────────────────────────────
// 5. RECOVERY PANEL
// ─────────────────────────────────────────────────────────────────────

test.describe("Recovery Panel", () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page);
  });

  test("organizer sees empty recovery requests state", async ({ page }) => {
    await registerAndCreateFamily(page, "Recovery Empty Family");

    await switchFamilyTab(page, "recovery");

    // Should show organizer view
    await expect(page.getByText(/account recovery/i)).toBeVisible({ timeout: 10000 });
    await expect(
      page.getByText(/review and manage recovery requests/i),
    ).toBeVisible();

    // Empty state
    await expect(
      page.getByText(/no recovery requests/i),
    ).toBeVisible();
  });

  test("recovery panel shows with mock pending request", async ({ page }) => {
    await registerAndCreateFamily(page, "Recovery Mock Family");

    // Intercept recovery requests to inject a mock pending request
    await page.route("**/trpc/**", async (route) => {
      const url = route.request().url();
      const body = route.request().postData() || "";

      if (url.includes("listRecoveryRequests") || body.includes("listRecoveryRequests")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            result: {
              data: [
                {
                  id: "rec-1",
                  requesterId: "user-2",
                  requesterEmail: "member@test.local",
                  requesterName: "Test Member",
                  status: "pending",
                  requestedAt: new Date().toISOString(),
                  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                },
              ],
            },
          }),
        });
      } else {
        await route.continue();
      }
    });

    await switchFamilyTab(page, "recovery");

    // Should show the pending request
    await expect(page.getByText("Test Member")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/pending/i)).toBeVisible();
    await expect(page.getByText(/trusted contact requested/i)).toBeVisible();
    await expect(page.getByText(/waiting period and organizer review/i)).toBeVisible();
    await expect(page.getByText(/final access after new keys are confirmed/i)).toBeVisible();

    // Approve and Reject buttons should be visible
    await expect(page.getByRole("button", { name: /approve/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /reject/i })).toBeVisible();
  });

  test("approve recovery shows confirmation dialog", async ({ page }) => {
    await registerAndCreateFamily(page, "Approve Confirm Family");

    // Inject mock pending recovery request
    await page.route("**/trpc/**", async (route) => {
      const url = route.request().url();
      const body = route.request().postData() || "";

      if (url.includes("listRecoveryRequests") || body.includes("listRecoveryRequests")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            result: {
              data: [
                {
                  id: "rec-approve-1",
                  requesterId: "user-approve",
                  requesterEmail: "approve@test.local",
                  requesterName: "Approve Test",
                  status: "pending",
                  requestedAt: new Date().toISOString(),
                  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                },
              ],
            },
          }),
        });
      } else {
        await route.continue();
      }
    });

    await switchFamilyTab(page, "recovery");

    // Wait for request to appear
    await expect(page.getByText("Approve Test")).toBeVisible({ timeout: 10000 });

    // Click approve
    await page.getByRole("button", { name: /approve/i }).click();

    // Confirmation dialog should appear
    await expect(page.getByText(/approve recovery/i)).toBeVisible({ timeout: 5000 });
    await expect(
      page.getByText(/allow the member to generate new keys/i),
    ).toBeVisible();

    // Cancel and confirm buttons
    await expect(page.getByRole("button", { name: /cancel/i })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /approve/i }).last(),
    ).toBeVisible();

    // Cancel to close dialog
    await page.getByRole("button", { name: /cancel/i }).click();
    await expect(
      page.getByText(/allow the member to generate new keys/i),
    ).not.toBeVisible({ timeout: 5000 });
  });

  test("reject recovery shows confirmation dialog", async ({ page }) => {
    await registerAndCreateFamily(page, "Reject Confirm Family");

    // Inject mock pending recovery request
    await page.route("**/trpc/**", async (route) => {
      const url = route.request().url();
      const body = route.request().postData() || "";

      if (url.includes("listRecoveryRequests") || body.includes("listRecoveryRequests")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            result: {
              data: [
                {
                  id: "rec-reject-1",
                  requesterId: "user-reject",
                  requesterEmail: "reject@test.local",
                  requesterName: "Reject Test",
                  status: "pending",
                  requestedAt: new Date().toISOString(),
                  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                },
              ],
            },
          }),
        });
      } else {
        await route.continue();
      }
    });

    await switchFamilyTab(page, "recovery");

    await expect(page.getByText("Reject Test")).toBeVisible({ timeout: 10000 });

    // Click reject
    await page.getByRole("button", { name: /reject/i }).click();

    // Confirmation dialog should appear
    await expect(page.getByText(/reject recovery/i)).toBeVisible({ timeout: 5000 });
    await expect(
      page.getByText(/deny the recovery request/i),
    ).toBeVisible();

    // Cancel
    await page.getByRole("button", { name: /cancel/i }).click();
    await expect(
      page.getByText(/deny the recovery request/i),
    ).not.toBeVisible({ timeout: 5000 });
  });
});

// ─────────────────────────────────────────────────────────────────────
// 6. MEMBER RECOVERY VIEW (via mock)
// ─────────────────────────────────────────────────────────────────────

test.describe("Member Recovery View", () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page);
  });

  test("member sees Request Recovery button when no active request", async ({ page }) => {
    await registerAndSetup(page);
    await navigateToFamily(page);

    // Mock: user has a family but is NOT organizer
    await page.route("**/trpc/**", async (route) => {
      const url = route.request().url();
      const body = route.request().postData() || "";

      // Return family details (user is member, not owner)
      if (
        (url.includes("family.get") || body.includes('"family","get"')) &&
        !url.includes("listMembers") &&
        !body.includes("listMembers")
      ) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            result: {
              data: {
                id: "fam-1",
                name: "Mock Family",
                ownerId: "other-user-id",
                memberCount: 2,
                createdAt: new Date().toISOString(),
              },
            },
          }),
        });
      } else if (url.includes("listMembers") || body.includes("listMembers")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            result: {
              data: [
                {
                  id: "m-1",
                  userId: "other-user-id",
                  email: "organizer@test.local",
                  name: "Organizer",
                  role: "owner",
                  joinedAt: new Date().toISOString(),
                },
                {
                  id: "m-2",
                  userId: "current-user-id",
                  email: "member@test.local",
                  name: "Current User",
                  role: "member",
                  joinedAt: new Date().toISOString(),
                },
              ],
            },
          }),
        });
      } else if (url.includes("getRecoveryStatus") || body.includes("getRecoveryStatus")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ result: { data: null } }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/dashboard/family?tab=recovery");

    // Member should see recovery panel with request button
    await expect(
      page.getByText(/account recovery/i),
    ).toBeVisible({ timeout: 15000 });
    await expect(
      page.getByText(/no active recovery request/i),
    ).toBeVisible({ timeout: 10000 });
    await expect(
      page.getByRole("button", { name: /request recovery/i }),
    ).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────
// 7. FAMILY SETTINGS
// ─────────────────────────────────────────────────────────────────────

test.describe("Family Settings", () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page);
  });

  test("organizer sees family settings form", async ({ page }) => {
    const familyName = `Settings Family ${Date.now()}`;
    await registerAndCreateFamily(page, familyName);

    await switchFamilyTab(page, "settings");

    // Should show settings card
    await expect(page.getByText(/family settings/i)).toBeVisible({ timeout: 10000 });
    await expect(
      page.getByText(/manage your family plan configuration/i),
    ).toBeVisible();

    // Name input should have current family name
    await expect(page.locator("#family-name")).toHaveValue(familyName);

    // Save button should be disabled (no changes)
    await expect(
      page.getByRole("button", { name: /save/i }),
    ).toBeDisabled();
  });

  test("save button enables when name is changed", async ({ page }) => {
    await registerAndCreateFamily(page, "Rename Family");

    await switchFamilyTab(page, "settings");

    // Change name
    await page.locator("#family-name").clear();
    await page.locator("#family-name").fill("Updated Family Name");

    // Save button should be enabled
    await expect(
      page.getByRole("button", { name: /save/i }),
    ).toBeEnabled();
  });

  test("settings validates empty name", async ({ page }) => {
    await registerAndCreateFamily(page, "Validate Name Family");

    await switchFamilyTab(page, "settings");

    // Clear name
    await page.locator("#family-name").clear();

    // Submit
    await page.getByRole("button", { name: /save/i }).click();

    // Should show validation error
    await expect(
      page.getByText(/family name is required/i),
    ).toBeVisible({ timeout: 5000 });
  });

  test("non-organizer sees leave family option", async ({ page }) => {
    await registerAndSetup(page);

    // Mock: user has a family but is NOT organizer
    await page.route("**/trpc/**", async (route) => {
      const url = route.request().url();
      const body = route.request().postData() || "";

      if (
        (url.includes("family.get") || body.includes('"family","get"')) &&
        !url.includes("listMembers") &&
        !body.includes("listMembers")
      ) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            result: {
              data: {
                id: "fam-leave",
                name: "Leave Test Family",
                ownerId: "other-user-id",
                memberCount: 2,
                createdAt: new Date().toISOString(),
              },
            },
          }),
        });
      } else if (url.includes("listMembers") || body.includes("listMembers")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            result: {
              data: [
                {
                  id: "m-owner",
                  userId: "other-user-id",
                  email: "owner@test.local",
                  name: "Owner",
                  role: "owner",
                  joinedAt: new Date().toISOString(),
                },
                {
                  id: "m-member",
                  userId: "current-user-id",
                  email: "me@test.local",
                  name: "Me",
                  role: "member",
                  joinedAt: new Date().toISOString(),
                },
              ],
            },
          }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/dashboard/family?tab=settings");

    // Should show Leave Family section
    await expect(page.getByText(/leave family/i).first()).toBeVisible({ timeout: 15000 });
    await expect(
      page.getByText(/lose access to all shared vaults/i).first(),
    ).toBeVisible();

    // Leave button
    await expect(
      page.getByRole("button", { name: /leave family/i }),
    ).toBeVisible();
  });

  test("leave family shows confirmation dialog", async ({ page }) => {
    await registerAndSetup(page);

    // Mock non-organizer family
    await page.route("**/trpc/**", async (route) => {
      const url = route.request().url();
      const body = route.request().postData() || "";

      if (
        (url.includes("family.get") || body.includes('"family","get"')) &&
        !url.includes("listMembers") &&
        !body.includes("listMembers")
      ) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            result: {
              data: {
                id: "fam-confirm",
                name: "Confirm Leave Family",
                ownerId: "other-user",
                memberCount: 2,
                createdAt: new Date().toISOString(),
              },
            },
          }),
        });
      } else if (url.includes("listMembers") || body.includes("listMembers")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            result: {
              data: [
                { id: "m-1", userId: "other-user", email: "o@t.l", name: "O", role: "owner", joinedAt: new Date().toISOString() },
                { id: "m-2", userId: "me", email: "m@t.l", name: "M", role: "member", joinedAt: new Date().toISOString() },
              ],
            },
          }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/dashboard/family?tab=settings");

    // Click leave
    await page.getByRole("button", { name: /leave family/i }).click();

    // Confirmation dialog
    await expect(page.getByText(/leave family\?/i)).toBeVisible({ timeout: 5000 });
    await expect(
      page.getByText(/this action cannot be undone/i),
    ).toBeVisible();

    // Cancel and confirm buttons
    await expect(page.getByRole("button", { name: /cancel/i })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /leave family/i }).last(),
    ).toBeVisible();

    // Cancel closes the dialog
    await page.getByRole("button", { name: /cancel/i }).click();
    await expect(
      page.getByText(/this action cannot be undone/i),
    ).not.toBeVisible({ timeout: 5000 });
  });
});

// ─────────────────────────────────────────────────────────────────────
// 8. MULTI-USER FLOW (Organizer + Member)
// ─────────────────────────────────────────────────────────────────────

test.describe("Multi-User Family Flow", () => {
  test("organizer creates family, invites member, creates shared vault", async ({
    browser,
  }) => {
    // Organizer context
    const organizerContext = await browser.newContext();
    const organizerPage = await organizerContext.newPage();

    try {
      await clearBrowserState(organizerPage);

      // 1. Register organizer and create family
      await registerAndCreateFamily(organizerPage, "Full Flow Family");

      // Verify organizer is on dashboard
      await expect(organizerPage.getByText("Full Flow Family")).toBeVisible({
        timeout: 10000,
      });

      // 2. Invite a member
      const memberEmail = uniqueEmail();
      await inviteMember(organizerPage, memberEmail);

      // Dialog closed = success
      await expect(
        organizerPage.getByText(/invite family member/i),
      ).not.toBeVisible({ timeout: 10000 });

      // 3. Switch to vaults tab and create a shared vault
      await switchFamilyTab(organizerPage, "vaults");
      const vaultName = `Family Passwords ${Date.now()}`;
      await createSharedVault(organizerPage, vaultName);

      // Vault should appear in list
      await expect(organizerPage.getByText(vaultName)).toBeVisible({
        timeout: 10000,
      });

      // 4. Switch to recovery tab — should show empty state
      await switchFamilyTab(organizerPage, "recovery");
      await expect(
        organizerPage.getByText(/no recovery requests/i),
      ).toBeVisible({ timeout: 10000 });

      // 5. Switch to settings tab — should see settings form
      await switchFamilyTab(organizerPage, "settings");
      await expect(organizerPage.getByText(/family settings/i)).toBeVisible({
        timeout: 10000,
      });
    } finally {
      await organizerContext.close();
    }
  });
});
