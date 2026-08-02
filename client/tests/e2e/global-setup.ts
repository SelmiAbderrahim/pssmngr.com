/**
 * Playwright Global Setup
 *
 * Runs once before all E2E tests.
 * 1. Removes E2E test users from the database (prevents "admin already exists" errors)
 * 2. Clears Redis rate-limit keys (prevents 429 during parallel registrations)
 */

import { cleanTestUsers, flushRateLimits } from "./helpers/vault";

export default async function globalSetup() {
  await cleanTestUsers();
  await flushRateLimits();
}
