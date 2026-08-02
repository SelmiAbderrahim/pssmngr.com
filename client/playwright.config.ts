import { defineConfig, devices } from '@playwright/test'
import { existsSync } from 'fs'

/**
 * Resolve the Chromium executable path.
 *
 * Priority:
 * 1. PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH env var (explicit override)
 * 2. System chromium at /usr/bin/chromium (Alpine Docker containers)
 * 3. undefined → let Playwright use its downloaded browser
 */
function resolveChromiumPath(): string | undefined {
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
    return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  }
  // Alpine Linux (Docker) ships system chromium; downloaded builds are glibc and won't run
  if (existsSync('/usr/bin/chromium')) {
    return '/usr/bin/chromium'
  }
  return undefined
}

const chromiumExecutable = resolveChromiumPath()

/**
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './tests/e2e',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    ['html', { outputFolder: './coverage/e2e/report', open: process.env.CI ? 'never' : 'on-failure' }],
    ['json', { outputFile: './coverage/e2e/results.json' }],
    ['junit', { outputFile: './coverage/e2e/junit.xml' }],
  ],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: process.env.BASE_URL || 'http://localhost:5173',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',

    /* Take screenshot on failure */
    screenshot: 'only-on-failure',

    /* Record video on failure */
    video: 'retain-on-failure',

    /* Global timeout for each action */
    actionTimeout: 10 * 1000,

    /* Global timeout for navigation */
    navigationTimeout: 30 * 1000,

    /* Ignore HTTPS errors */
    ignoreHTTPSErrors: true,
  },

  /* Keep the default contributor setup aligned with the documented Chromium install. */
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          executablePath: chromiumExecutable,
          args: ['--no-sandbox', '--disable-gpu', '--disable-software-rasterizer'],
        },
      },
    },
  ],

  /* Run your local dev server before starting the tests */
  // Disabled for Docker environment - server should already be running
  // webServer: {
  //   command: 'npm run dev',
  //   url: 'http://localhost:5173',
  //   reuseExistingServer: !process.env.CI,
  //   timeout: 120 * 1000,
  // },

  /* Global setup and teardown */
  globalSetup: './tests/e2e/global-setup.ts',
  // globalTeardown: require.resolve('./tests/e2e/global-teardown.ts'),

  /* Output directory */
  outputDir: './coverage/e2e/artifacts',

  /* Test timeout */
  timeout: 60 * 1000,

  /* Expect timeout */
  expect: {
    timeout: 10 * 1000,
  },

  /* Test artifacts */
  preserveOutput: 'failures-only',

  /* Maximum test failures */
  maxFailures: process.env.CI ? 10 : undefined,

  /* Update snapshots */
  updateSnapshots: process.env.CI ? 'missing' : 'all',
})
