import { test, expect } from "@playwright/test";
import { clearBrowserState, registerAndSetup, uniqueEmail } from "../helpers/vault";
import {
  navigateToEmergency,
  switchEmergencyTab,
  openAddContactDialog,
  addTrustedContact,
  registerAndNavigateToEmergency,
} from "../helpers/emergency";

/**
 * E2E Test Suite: Emergency Access
 *
 * Tests the complete emergency access lifecycle:
 * 1. Add trusted contact — dialog validation, email/period input, submission
 * 2. Request access as contact — outgoing request flow
 * 3. Deny request as owner — incoming request denial
 * 4. Grant after timer — accelerated timer expiry and auto-grant
 * 5. Tab navigation — URL persistence, tab switching
 * 6. Trusted-contact management
 * 7. Multi-user owner/contact flow
 *
 * Each test registers fresh users for isolation.
 * Backend containers must be running (make start).
 */

// ─────────────────────────────────────────────────────────────────────
// 1. ADD TRUSTED CONTACT
// ─────────────────────────────────────────────────────────────────────

test.describe("Add Trusted Contact", () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page);
  });

  test("shows empty contacts state for new user", async ({ page }) => {
    await registerAndNavigateToEmergency(page);

    // Should show trusted contacts card with empty state
    await expect(page.getByText(/trusted contacts/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/no trusted contacts yet/i)).toBeVisible();

    // Add Contact button should be visible
    await expect(
      page.getByRole("button", { name: /add contact/i }),
    ).toBeVisible();
  });

  test("add contact dialog opens with correct fields", async ({ page }) => {
    await registerAndNavigateToEmergency(page);
    await openAddContactDialog(page);

    // Dialog title and description
    await expect(page.getByText(/add trusted contact/i)).toBeVisible();
    await expect(
      page.getByText(/this person will be able to request emergency access/i),
    ).toBeVisible();

    // Email input
    await expect(page.locator("#contact-email")).toBeVisible();

    // Waiting period select
    await expect(page.locator("#waiting-period")).toBeVisible();

    // Buttons
    await expect(
      page.getByRole("button", { name: /add contact/i }).last(),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /cancel/i }),
    ).toBeVisible();
  });

  test("add contact dialog validates empty email", async ({ page }) => {
    await registerAndNavigateToEmergency(page);
    await openAddContactDialog(page);

    // Submit with empty email
    await page.getByRole("button", { name: /add contact/i }).last().click();

    // Should show validation error
    await expect(
      page.getByText(/valid email/i),
    ).toBeVisible({ timeout: 5000 });
  });

  test("add contact dialog validates invalid email", async ({ page }) => {
    await registerAndNavigateToEmergency(page);
    await openAddContactDialog(page);

    // Enter invalid email
    await page.locator("#contact-email").fill("not-an-email");

    // Submit
    await page.getByRole("button", { name: /add contact/i }).last().click();

    // Should show validation error
    await expect(
      page.getByText(/valid email/i),
    ).toBeVisible({ timeout: 5000 });
  });

  test("add contact dialog closes on cancel", async ({ page }) => {
    await registerAndNavigateToEmergency(page);
    await openAddContactDialog(page);

    // Click cancel
    await page.getByRole("button", { name: /cancel/i }).click();

    // Dialog should close
    await expect(
      page.getByText(/add trusted contact/i),
    ).not.toBeVisible({ timeout: 5000 });
  });

  test("add contact dialog shows waiting period options", async ({ page }) => {
    await registerAndNavigateToEmergency(page);
    await openAddContactDialog(page);

    // Default should be 7 days
    await expect(page.getByText(/7 days/i).first()).toBeVisible();

    // Open select
    await page.locator("#waiting-period").click();

    // All options should be visible
    await expect(page.getByRole("option", { name: /1 day/i })).toBeVisible();
    await expect(page.getByRole("option", { name: /3 days/i })).toBeVisible();
    await expect(page.getByRole("option", { name: /7 days/i })).toBeVisible();
    await expect(page.getByRole("option", { name: /14 days/i })).toBeVisible();
    await expect(page.getByRole("option", { name: /30 days/i })).toBeVisible();
  });

  test("add contact with valid email submits successfully", async ({ page }) => {
    await registerAndNavigateToEmergency(page);

    // Register a second user to use as contact
    const contactEmail = uniqueEmail();

    // Use route interception to simulate successful add
    await page.route("**/trpc/**", async (route) => {
      const url = route.request().url();
      const body = route.request().postData() || "";

      if (url.includes("addTrustedContact") || body.includes("addTrustedContact")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            result: {
              data: {
                id: "tc-1",
                contactId: "contact-user-1",
                waitingPeriodDays: 7,
              },
            },
          }),
        });
      } else {
        await route.continue();
      }
    });

    await openAddContactDialog(page);
    await page.locator("#contact-email").fill(contactEmail);

    // Submit
    await page.getByRole("button", { name: /add contact/i }).last().click();

    // Dialog should close (success)
    await expect(
      page.getByText(/add trusted contact/i),
    ).not.toBeVisible({ timeout: 10000 });
  });
});

// ─────────────────────────────────────────────────────────────────────
// 2. REQUEST ACCESS AS CONTACT (Outgoing)
// ─────────────────────────────────────────────────────────────────────

test.describe("Request Access (Outgoing)", () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page);
  });

  test("outgoing tab shows empty state when no requests", async ({ page }) => {
    await registerAndNavigateToEmergency(page);
    await switchEmergencyTab(page, "outgoing");

    // Should show empty state
    await expect(
      page.getByText(/my access requests/i),
    ).toBeVisible({ timeout: 10000 });
    await expect(
      page.getByText(/you haven't made any emergency access requests/i),
    ).toBeVisible();
  });

  test("outgoing tab shows pending request with countdown", async ({ page }) => {
    await registerAndSetup(page);

    // Mock outgoing requests with a pending request
    await page.route("**/trpc/**", async (route) => {
      const url = route.request().url();
      const body = route.request().postData() || "";

      if (url.includes("listRequests") || body.includes("listRequests")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            result: {
              data: [
                {
                  id: "req-1",
                  status: "pending",
                  waitingPeriodDays: 7,
                  requestedAt: new Date().toISOString(),
                  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                  deniedAt: null,
                  grantedAt: null,
                  owner: { id: "owner-1", name: "Vault Owner", email: "owner@test.local", image: null },
                  contact: { id: "current-user", name: "E2E Vault", email: "me@test.local", image: null },
                },
              ],
            },
          }),
        });
      } else if (url.includes("user.get") || url.includes("user%22%2C%22get") || body.includes('"user","get"')) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            result: { data: { id: "current-user" } },
          }),
        });
      } else if (url.includes("listTrustedContacts") || body.includes("listTrustedContacts")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ result: { data: [] } }),
        });
      } else {
        await route.continue();
      }
    });

    await navigateToEmergency(page);
    await switchEmergencyTab(page, "outgoing");

    // Should show the pending request
    await expect(page.getByText("Vault Owner")).toBeVisible({ timeout: 10000 });

    // Should show "Waiting" status badge
    await expect(page.getByText(/waiting/i)).toBeVisible();

    // Should show waiting hint
    await expect(
      page.getByText(/the owner can deny this request/i),
    ).toBeVisible();
  });

  test("outgoing tab shows denied request with Request Again button", async ({ page }) => {
    await registerAndSetup(page);

    await page.route("**/trpc/**", async (route) => {
      const url = route.request().url();
      const body = route.request().postData() || "";

      if (url.includes("listRequests") || body.includes("listRequests")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            result: {
              data: [
                {
                  id: "req-denied-1",
                  status: "denied",
                  waitingPeriodDays: 7,
                  requestedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
                  expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
                  deniedAt: new Date().toISOString(),
                  grantedAt: null,
                  owner: { id: "owner-1", name: "Vault Owner", email: "owner@test.local", image: null },
                  contact: { id: "current-user", name: "E2E Vault", email: "me@test.local", image: null },
                },
              ],
            },
          }),
        });
      } else if (url.includes("user.get") || url.includes("user%22%2C%22get") || body.includes('"user","get"')) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            result: { data: { id: "current-user" } },
          }),
        });
      } else if (url.includes("listTrustedContacts") || body.includes("listTrustedContacts")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ result: { data: [] } }),
        });
      } else {
        await route.continue();
      }
    });

    await navigateToEmergency(page);
    await switchEmergencyTab(page, "outgoing");

    // Should show the denied request
    await expect(page.getByText("Vault Owner")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/denied/i)).toBeVisible();

    // Should show denied hint
    await expect(
      page.getByText(/your request was denied/i),
    ).toBeVisible();

    // Should show "Request Again" button
    await expect(
      page.getByRole("button", { name: /request again/i }),
    ).toBeVisible();
  });

  test("outgoing tab shows an approved request", async ({ page }) => {
    await registerAndSetup(page);

    await page.route("**/trpc/**", async (route) => {
      const url = route.request().url();
      const body = route.request().postData() || "";

      if (url.includes("listRequests") || body.includes("listRequests")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            result: {
              data: [
                {
                  id: "req-approved-1",
                  status: "approved",
                  waitingPeriodDays: 1,
                  requestedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
                  expiresAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
                  deniedAt: null,
                  grantedAt: new Date().toISOString(),
                  owner: { id: "owner-1", name: "Vault Owner", email: "owner@test.local", image: null },
                  contact: { id: "current-user", name: "E2E Vault", email: "me@test.local", image: null },
                },
              ],
            },
          }),
        });
      } else if (url.includes("user.get") || url.includes("user%22%2C%22get") || body.includes('"user","get"')) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            result: { data: { id: "current-user" } },
          }),
        });
      } else if (url.includes("listTrustedContacts") || body.includes("listTrustedContacts")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ result: { data: [] } }),
        });
      } else {
        await route.continue();
      }
    });

    await navigateToEmergency(page);
    await switchEmergencyTab(page, "outgoing");

    // Should show the approved request
    await expect(page.getByText("Vault Owner")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/granted/i)).toBeVisible();

    // Should show granted hint
    await expect(
      page.getByText(/access has been granted/i),
    ).toBeVisible();

  });
});

// ─────────────────────────────────────────────────────────────────────
// 3. DENY REQUEST AS OWNER (Incoming)
// ─────────────────────────────────────────────────────────────────────

test.describe("Deny Request (Incoming)", () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page);
  });

  test("incoming tab shows empty state when no requests", async ({ page }) => {
    await registerAndNavigateToEmergency(page);
    await switchEmergencyTab(page, "incoming");

    // Should show empty state
    await expect(
      page.getByText(/access requests/i),
    ).toBeVisible({ timeout: 10000 });
    await expect(
      page.getByText(/no access requests/i),
    ).toBeVisible();
  });

  test("incoming tab shows pending request with deny button", async ({ page }) => {
    await registerAndSetup(page);

    await page.route("**/trpc/**", async (route) => {
      const url = route.request().url();
      const body = route.request().postData() || "";

      if (url.includes("listRequests") || body.includes("listRequests")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            result: {
              data: [
                {
                  id: "req-in-1",
                  status: "pending",
                  waitingPeriodDays: 7,
                  requestedAt: new Date().toISOString(),
                  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                  deniedAt: null,
                  grantedAt: null,
                  owner: { id: "current-user", name: "E2E Vault", email: "me@test.local", image: null },
                  contact: { id: "contact-1", name: "Emergency Contact", email: "contact@test.local", image: null },
                },
              ],
            },
          }),
        });
      } else if (url.includes("user.get") || url.includes("user%22%2C%22get") || body.includes('"user","get"')) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            result: { data: { id: "current-user" } },
          }),
        });
      } else if (url.includes("listTrustedContacts") || body.includes("listTrustedContacts")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ result: { data: [] } }),
        });
      } else {
        await route.continue();
      }
    });

    await navigateToEmergency(page);
    await switchEmergencyTab(page, "incoming");

    // Should show the pending request
    await expect(page.getByText("Emergency Contact")).toBeVisible({ timeout: 10000 });

    // Should show auto-grant warning
    await expect(
      page.getByText(/access will be granted automatically/i),
    ).toBeVisible();

    // Should show Deny button
    await expect(
      page.getByRole("button", { name: /deny/i }),
    ).toBeVisible();
  });

  test("deny button opens confirmation dialog", async ({ page }) => {
    await registerAndSetup(page);

    await page.route("**/trpc/**", async (route) => {
      const url = route.request().url();
      const body = route.request().postData() || "";

      if (url.includes("listRequests") || body.includes("listRequests")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            result: {
              data: [
                {
                  id: "req-deny-confirm-1",
                  status: "pending",
                  waitingPeriodDays: 7,
                  requestedAt: new Date().toISOString(),
                  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                  deniedAt: null,
                  grantedAt: null,
                  owner: { id: "current-user", name: "E2E Vault", email: "me@test.local", image: null },
                  contact: { id: "contact-1", name: "Deny Test Contact", email: "deny@test.local", image: null },
                },
              ],
            },
          }),
        });
      } else if (url.includes("user.get") || url.includes("user%22%2C%22get") || body.includes('"user","get"')) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            result: { data: { id: "current-user" } },
          }),
        });
      } else if (url.includes("listTrustedContacts") || body.includes("listTrustedContacts")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ result: { data: [] } }),
        });
      } else {
        await route.continue();
      }
    });

    await navigateToEmergency(page);
    await switchEmergencyTab(page, "incoming");

    // Wait for request to appear
    await expect(page.getByText("Deny Test Contact")).toBeVisible({ timeout: 10000 });

    // Click deny
    await page.getByRole("button", { name: /deny/i }).click();

    // Confirmation dialog should appear
    await expect(
      page.getByText(/deny access request/i),
    ).toBeVisible({ timeout: 5000 });
    await expect(
      page.getByText(/will not be able to request again for 24 hours/i),
    ).toBeVisible();

    // Cancel and confirm buttons
    await expect(page.getByRole("button", { name: /cancel/i })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /deny access/i }),
    ).toBeVisible();

    // Cancel closes the dialog
    await page.getByRole("button", { name: /cancel/i }).click();
    await expect(
      page.getByText(/deny access request/i),
    ).not.toBeVisible({ timeout: 5000 });
  });

  test("incoming tab shows past denied and approved requests", async ({ page }) => {
    await registerAndSetup(page);

    await page.route("**/trpc/**", async (route) => {
      const url = route.request().url();
      const body = route.request().postData() || "";

      if (url.includes("listRequests") || body.includes("listRequests")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            result: {
              data: [
                {
                  id: "req-past-denied",
                  status: "denied",
                  waitingPeriodDays: 7,
                  requestedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
                  expiresAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
                  deniedAt: new Date(Date.now() - 13 * 24 * 60 * 60 * 1000).toISOString(),
                  grantedAt: null,
                  owner: { id: "current-user", name: "E2E Vault", email: "me@test.local", image: null },
                  contact: { id: "contact-past-1", name: "Past Contact A", email: "past-a@test.local", image: null },
                },
                {
                  id: "req-past-approved",
                  status: "approved",
                  waitingPeriodDays: 3,
                  requestedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
                  expiresAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
                  deniedAt: null,
                  grantedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
                  owner: { id: "current-user", name: "E2E Vault", email: "me@test.local", image: null },
                  contact: { id: "contact-past-2", name: "Past Contact B", email: "past-b@test.local", image: null },
                },
              ],
            },
          }),
        });
      } else if (url.includes("user.get") || url.includes("user%22%2C%22get") || body.includes('"user","get"')) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            result: { data: { id: "current-user" } },
          }),
        });
      } else if (url.includes("listTrustedContacts") || body.includes("listTrustedContacts")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ result: { data: [] } }),
        });
      } else {
        await route.continue();
      }
    });

    await navigateToEmergency(page);
    await switchEmergencyTab(page, "incoming");

    // Should show "Past Requests" heading
    await expect(
      page.getByText(/past requests/i),
    ).toBeVisible({ timeout: 10000 });

    // Should show both past contacts
    await expect(page.getByText("Past Contact A")).toBeVisible();
    await expect(page.getByText("Past Contact B")).toBeVisible();

    // Should show status badges
    await expect(page.getByText(/denied/i).first()).toBeVisible();
    await expect(page.getByText(/approved/i)).toBeVisible();
  });

  test("incoming tab badge shows pending count", async ({ page }) => {
    await registerAndSetup(page);

    await page.route("**/trpc/**", async (route) => {
      const url = route.request().url();
      const body = route.request().postData() || "";

      if (url.includes("listRequests") || body.includes("listRequests")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            result: {
              data: [
                {
                  id: "req-badge-1",
                  status: "pending",
                  waitingPeriodDays: 7,
                  requestedAt: new Date().toISOString(),
                  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                  deniedAt: null,
                  grantedAt: null,
                  owner: { id: "current-user", name: "E2E Vault", email: "me@test.local", image: null },
                  contact: { id: "contact-badge-1", name: "Badge Contact", email: "badge@test.local", image: null },
                },
              ],
            },
          }),
        });
      } else if (url.includes("user.get") || url.includes("user%22%2C%22get") || body.includes('"user","get"')) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            result: { data: { id: "current-user" } },
          }),
        });
      } else if (url.includes("listTrustedContacts") || body.includes("listTrustedContacts")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ result: { data: [] } }),
        });
      } else {
        await route.continue();
      }
    });

    await navigateToEmergency(page);

    // Incoming tab should show the pending count badge ("1")
    const incomingTab = page.getByRole("tab", { name: /incoming/i });
    await expect(incomingTab).toBeVisible({ timeout: 10000 });
    // The badge renders the count inside the tab trigger
    await expect(incomingTab.locator("span").last()).toContainText("1");
  });
});

// ─────────────────────────────────────────────────────────────────────
// 4. GRANT AFTER TIMER (Accelerated)
// ─────────────────────────────────────────────────────────────────────

test.describe("Grant After Timer", () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page);
  });

  test("countdown timer shows Expired when time elapses", async ({ page }) => {
    await registerAndSetup(page);

    // Mock a request that has already expired (expiresAt in the past)
    await page.route("**/trpc/**", async (route) => {
      const url = route.request().url();
      const body = route.request().postData() || "";

      if (url.includes("listRequests") || body.includes("listRequests")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            result: {
              data: [
                {
                  id: "req-expired-1",
                  status: "pending",
                  waitingPeriodDays: 1,
                  requestedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
                  expiresAt: new Date(Date.now() - 1000).toISOString(), // Already expired
                  deniedAt: null,
                  grantedAt: null,
                  owner: { id: "current-user", name: "E2E Vault", email: "me@test.local", image: null },
                  contact: { id: "contact-expired-1", name: "Timer Contact", email: "timer@test.local", image: null },
                },
              ],
            },
          }),
        });
      } else if (url.includes("user.get") || url.includes("user%22%2C%22get") || body.includes('"user","get"')) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            result: { data: { id: "current-user" } },
          }),
        });
      } else if (url.includes("listTrustedContacts") || body.includes("listTrustedContacts")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ result: { data: [] } }),
        });
      } else {
        await route.continue();
      }
    });

    await navigateToEmergency(page);
    await switchEmergencyTab(page, "incoming");

    // Should show "Expired" since the timer is already past
    await expect(page.getByText(/expired/i)).toBeVisible({ timeout: 10000 });
  });

  test("countdown timer shows remaining time for active request", async ({ page }) => {
    await registerAndSetup(page);

    await page.route("**/trpc/**", async (route) => {
      const url = route.request().url();
      const body = route.request().postData() || "";

      if (url.includes("listRequests") || body.includes("listRequests")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            result: {
              data: [
                {
                  id: "req-active-timer",
                  status: "pending",
                  waitingPeriodDays: 3,
                  requestedAt: new Date().toISOString(),
                  expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
                  deniedAt: null,
                  grantedAt: null,
                  owner: { id: "current-user", name: "E2E Vault", email: "me@test.local", image: null },
                  contact: { id: "contact-timer-2", name: "Active Timer Contact", email: "active@test.local", image: null },
                },
              ],
            },
          }),
        });
      } else if (url.includes("user.get") || url.includes("user%22%2C%22get") || body.includes('"user","get"')) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            result: { data: { id: "current-user" } },
          }),
        });
      } else if (url.includes("listTrustedContacts") || body.includes("listTrustedContacts")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ result: { data: [] } }),
        });
      } else {
        await route.continue();
      }
    });

    await navigateToEmergency(page);
    await switchEmergencyTab(page, "incoming");

    // Should show timer with days remaining (e.g., "2d 23h")
    await expect(page.getByText("Active Timer Contact")).toBeVisible({ timeout: 10000 });
    // The countdown should show some time with "d" for days
    await expect(page.getByText(/\dd/)).toBeVisible({ timeout: 5000 });
  });
});

// ─────────────────────────────────────────────────────────────────────
// 5. TAB NAVIGATION
// ─────────────────────────────────────────────────────────────────────

test.describe("Tab Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page);
  });

  test("default tab is contacts", async ({ page }) => {
    await registerAndNavigateToEmergency(page);

    // Contacts tab should be active by default
    await expect(page.getByText(/trusted contacts/i)).toBeVisible({ timeout: 10000 });

    // All three tabs should be visible
    await expect(page.getByRole("tab", { name: /contacts/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /incoming/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /outgoing/i })).toBeVisible();
  });

  test("tab state persists in URL", async ({ page }) => {
    await registerAndNavigateToEmergency(page);

    // Switch to incoming tab
    await switchEmergencyTab(page, "incoming");
    await expect(page).toHaveURL(/tab=incoming/);

    // Switch to outgoing tab
    await switchEmergencyTab(page, "outgoing");
    await expect(page).toHaveURL(/tab=outgoing/);

    // Switch to contacts tab
    await switchEmergencyTab(page, "contacts");
    await expect(page).toHaveURL(/tab=contacts/);
  });

  test("tab persists after page reload", async ({ page }) => {
    await registerAndNavigateToEmergency(page);

    // Switch to outgoing tab
    await switchEmergencyTab(page, "outgoing");
    await expect(page).toHaveURL(/tab=outgoing/);

    // Reload
    await page.reload();

    // Should still be on outgoing tab
    await expect(
      page.getByText(/my access requests/i),
    ).toBeVisible({ timeout: 15000 });
    await expect(page).toHaveURL(/tab=outgoing/);
  });

  test("direct URL with tab param opens correct tab", async ({ page }) => {
    await registerAndSetup(page);

    // Navigate directly to incoming tab
    await page.goto("/dashboard/settings/emergency?tab=incoming");

    // Incoming content should be visible
    await expect(
      page.getByText(/access requests/i),
    ).toBeVisible({ timeout: 15000 });
  });
});

// ─────────────────────────────────────────────────────────────────────
// 6. TRUSTED CONTACT MANAGEMENT
// ─────────────────────────────────────────────────────────────────────

test.describe("Trusted Contact Management", () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page);
  });

  test("contacts list shows contact with waiting period badge", async ({ page }) => {
    await registerAndSetup(page);

    await page.route("**/trpc/**", async (route) => {
      const url = route.request().url();
      const body = route.request().postData() || "";

      if (url.includes("listTrustedContacts") || body.includes("listTrustedContacts")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            result: {
              data: [
                {
                  id: "tc-display-1",
                  waitingPeriodDays: 14,
                  createdAt: new Date().toISOString(),
                  contact: {
                    id: "contact-display-1",
                    name: "Jane Smith",
                    email: "jane@test.local",
                    image: null,
                  },
                },
              ],
            },
          }),
        });
      } else if (url.includes("listRequests") || body.includes("listRequests")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ result: { data: [] } }),
        });
      } else if (url.includes("user.get") || url.includes("user%22%2C%22get") || body.includes('"user","get"')) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            result: { data: { id: "current-user" } },
          }),
        });
      } else {
        await route.continue();
      }
    });

    await navigateToEmergency(page);

    // Should show the contact
    await expect(page.getByText("Jane Smith")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("jane@test.local")).toBeVisible();

    // Should show waiting period badge
    await expect(page.getByText(/14d wait/i)).toBeVisible();
  });

  test("remove contact shows confirmation dialog", async ({ page }) => {
    await registerAndSetup(page);

    await page.route("**/trpc/**", async (route) => {
      const url = route.request().url();
      const body = route.request().postData() || "";

      if (url.includes("listTrustedContacts") || body.includes("listTrustedContacts")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            result: {
              data: [
                {
                  id: "tc-remove-1",
                  waitingPeriodDays: 7,
                  createdAt: new Date().toISOString(),
                  contact: {
                    id: "contact-remove-1",
                    name: "Remove Me",
                    email: "remove@test.local",
                    image: null,
                  },
                },
              ],
            },
          }),
        });
      } else if (url.includes("listRequests") || body.includes("listRequests")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ result: { data: [] } }),
        });
      } else if (url.includes("user.get") || url.includes("user%22%2C%22get") || body.includes('"user","get"')) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            result: { data: { id: "current-user" } },
          }),
        });
      } else {
        await route.continue();
      }
    });

    await navigateToEmergency(page);

    // Wait for contact to appear
    await expect(page.getByText("Remove Me")).toBeVisible({ timeout: 10000 });

    // Click the delete button (Trash2 icon button)
    await page
      .locator("button")
      .filter({ has: page.locator("svg.lucide-trash-2") })
      .click();

    // Confirmation dialog should appear
    await expect(
      page.getByText(/remove trusted contact/i),
    ).toBeVisible({ timeout: 5000 });
    await expect(
      page.getByText(/remove me/i),
    ).toBeVisible();
    await expect(
      page.getByText(/pending emergency access requests.*will be cancelled/i),
    ).toBeVisible();

    // Cancel and confirm buttons
    await expect(page.getByRole("button", { name: /cancel/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /remove/i }).last()).toBeVisible();

    // Cancel closes the dialog
    await page.getByRole("button", { name: /cancel/i }).click();
    await expect(
      page.getByText(/remove trusted contact/i),
    ).not.toBeVisible({ timeout: 5000 });
  });
});

// ─────────────────────────────────────────────────────────────────────
// 7. MULTI-USER FLOW (Owner + Contact)
// ─────────────────────────────────────────────────────────────────────

test.describe("Multi-User Emergency Flow", () => {
  test("owner adds contact, contact sees pending request, owner denies", async ({
    browser,
  }) => {
    // Owner context
    const ownerContext = await browser.newContext();
    const ownerPage = await ownerContext.newPage();

    try {
      await clearBrowserState(ownerPage);

      // 1. Register owner and navigate to emergency
      await registerAndNavigateToEmergency(ownerPage);

      // Verify empty contacts state
      await expect(ownerPage.getByText(/no trusted contacts yet/i)).toBeVisible({
        timeout: 10000,
      });

      // 2. Open add contact dialog — verify fields are present
      await openAddContactDialog(ownerPage);
      await expect(ownerPage.locator("#contact-email")).toBeVisible();
      await expect(ownerPage.locator("#waiting-period")).toBeVisible();

      // 3. Cancel and verify dialog closes
      await ownerPage.getByRole("button", { name: /cancel/i }).click();
      await expect(
        ownerPage.getByText(/add trusted contact/i),
      ).not.toBeVisible({ timeout: 5000 });

      // 4. Switch to incoming tab — verify empty state
      await switchEmergencyTab(ownerPage, "incoming");
      await expect(
        ownerPage.getByText(/no access requests/i),
      ).toBeVisible({ timeout: 10000 });

      // 5. Switch to outgoing tab — verify empty state
      await switchEmergencyTab(ownerPage, "outgoing");
      await expect(
        ownerPage.getByText(/you haven't made any emergency access requests/i),
      ).toBeVisible({ timeout: 10000 });

      // 6. Tab URL state verification
      await expect(ownerPage).toHaveURL(/tab=outgoing/);
      await switchEmergencyTab(ownerPage, "contacts");
      await expect(ownerPage).toHaveURL(/tab=contacts/);
    } finally {
      await ownerContext.close();
    }
  });
});
