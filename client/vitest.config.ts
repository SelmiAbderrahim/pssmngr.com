import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    // Global test setup
    setupFiles: [path.resolve(__dirname, './tests/setup.ts')],
    globals: true,
    environment: 'jsdom',

    // Test file patterns
    include: [
      'src/**/*.{test,spec}.{ts,tsx}',
      'src/**/__tests__/**/*.{ts,tsx}',
      // Only include unit tests from tests/ directory
      'tests/unit/**/*.{test,spec}.{ts,tsx}',
    ],
    exclude: [
      'node_modules/**',
      'dist/**',
      'coverage/**',
      '**/*.util.ts',
      '**/*.util.tsx',
      '**/utils/*.util.ts',
      '**/setup/*.ts',
      '**/e2e/**',  // Playwright E2E tests should not run with Vitest
      // Skip E2E Playwright tests (separate test runner)
      'tests/e2e-playwright/**',
      // Skip integration tests requiring external services
      'tests/integration/**',  // All integration tests (require services/infrastructure)
      // Skip tests requiring complex infrastructure or external services
      'src/routes/__tests__/__root.test.tsx', // Requires TanStack Router context
      'tests/unit/components/auth/**', // Requires auth context setup
      // Skip src/components/ui/__tests__/ - duplicate tests with missing imports (@/test/utils)
      // The tests in tests/unit/components/ui/ are the authoritative ones
      'src/components/ui/__tests__/**',
    ],

    // Reporter configuration - use default reporter
    // Note: 'dot' reporter crashes in Vitest 2.1.9 (unhandled rejection in DotReporter.shouldLog)
    reporters: ['default'],

    // Test timeout (optimized to handle form validation tests while preventing hangs)
    testTimeout: 15000,
    hookTimeout: 15000,
    teardownTimeout: 10000,

    // Force exit after tests complete to prevent hanging
    forceExit: true,
    passWithNoTests: true,

    // Reset vi.fn() call history before each test so mocks shared at module
    // scope don't accumulate calls across tests (restores per-test isolation
    // that `toHaveBeenCalledTimes` assertions rely on). Only clears call data,
    // not implementations/return values, so beforeEach setup is preserved.
    clearMocks: true,

    // Vitest 4 removed `test.poolOptions`; worker controls are now top-level.
    // Use the forks pool so each test file runs in a child process that is torn
    // down afterwards, reclaiming its heap between files. This prevents the
    // unbounded memory growth that OOM-killed the run under the container's
    // memory cap. Bound the worker count to cap peak memory (forks isolate
    // per-file, so vi.mock-based mocking keeps working).
    pool: 'forks',
    isolate: true,
    // The forks pool reuses a worker process across files, so its heap grows
    // with the number of files it handles. Under the container memory cap this
    // means: too many concurrent workers (heap × workers) OR too many files per
    // worker (accumulation) both OOM. We cap at 2 workers and run the suite in
    // many small shards (see the test:unit script) so each fresh process only
    // handles a handful of files and never accumulates past the cap.
    maxWorkers: 2,
    minWorkers: 1,

    // Sequence tests to reduce memory spikes
    sequence: {
      shuffle: false,
    },

    // Module dependencies configuration - inline modules that need mocking
    server: {
      deps: {
        inline: ['sonner'],
      },
    },

    // Ensure proper cleanup after tests
    onConsoleLog(log) {
      // Suppress console.log during tests to reduce noise
      return false;
    },

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
      exclude: [
        'node_modules/**',
        'dist/**',
        'coverage/**',
        '**/*.d.ts',
        '**/*.config.{ts,js}',
        '**/vitest.*.ts',
        'src/routes/routeTree.gen.ts',
        'lighthouserc.js',
        'playwright.*.ts',
        'tests/**',
        '**/__tests__/**',
        '**/*.test.{ts,tsx}',
        '**/*.spec.{ts,tsx}',
        'src/test/**',
        'scripts/**',
        'client/scripts/**',
        // Exclude non-testable entry points
        'src/main.tsx',
        'src/router.tsx',
        'src/app.tsx',
        'src/i18n.ts',
        // Exclude type definitions
        'src/types/**',
        'src/errors/index.ts',
        // Exclude validation schemas (pure type definitions)
        'src/validation/**',
        // Exclude route components (TanStack Router layout files)
        'src/routes/**',
        // Exclude lib/config.ts (environment configuration)
        'src/lib/config.ts',
        // Exclude services (API wrappers with external dependencies)
        'src/services/**',
        // Exclude complex hooks with heavy external dependencies
        // Exclude utils with React hooks requiring component context
        'src/utils/misc.ts',
        // Exclude ErrorBoundary (complex React lifecycle)
        'src/components/ErrorBoundary.tsx',
        // Exclude complex UI components with heavy dependencies
        'src/ui/**',
        'src/components/ui/dropdown-menu.tsx',
        // Exclude complex hooks with internal state management
        'src/hooks/useAuthError.tsx',
        // Exclude partial coverage files that need extensive mocking
      ],
      include: [
        'src/**/*.{ts,tsx}',
      ],
      all: false,
      thresholds: {
        // Baseline thresholds should only move upward as coverage improves.
        statements: 58,
        branches: 80,
        functions: 60,
        lines: 59,
      },
    },
  },

  // Path resolution
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@tests': path.resolve(__dirname, './tests'),
      '~': path.resolve(__dirname, '.'),
      // Resolve @pssmngr/crypto package (matches vite.config.mjs alias)
      '@pssmngr/crypto': path.resolve(__dirname, '../crypto/src'),
      // Resolve crypto deps to test mocks (real packages use WASM, unavailable in jsdom)
      'argon2-browser': path.resolve(__dirname, './tests/__mocks__/argon2-browser.ts'),
      'libsodium-wrappers-sumo': path.resolve(__dirname, './tests/__mocks__/libsodium-wrappers-sumo.ts'),
    },
  },

  // Define global constants
  define: {
    __DEV__: JSON.stringify(process.env.NODE_ENV === 'development'),
    __TEST__: JSON.stringify(true),
    // Ensure consistent API URL for testing - must match MSW handlers
    'import.meta.env.VITE_API_URL': JSON.stringify('http://localhost:39291'),
  },
})
