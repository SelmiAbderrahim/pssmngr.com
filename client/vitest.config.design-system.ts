import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  testEnvironment: 'jsdom',
  include: [
    'src/**/__tests__/design-system/**/*.test.ts',
    'src/**/__tests__/design-system/**/*.test.tsx',
  ],
  exclude: [
    'node_modules',
    'dist',
    '.idea',
    '.git',
    '.cache',
  ],
  setupFiles: [
    './src/__tests__/setup/design-system-setup.ts',
  ],
  testTimeout: 10000,
  hookTimeout: 10000,
  globals: true,
  coverage: {
    provider: 'v8',
    reporter: ['text', 'json', 'html'],
    exclude: [
      'node_modules/',
      'src/__tests__/',
      '**/*.d.ts',
      '**/*.config.*',
      'dist/',
    ],
    thresholds: {
      global: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
  },
  testMatch: [
    '**/design-system/**/*.test.(ts|tsx)',
  ],
  reporters: [
    'verbose',
    'json',
  ],
  outputFile: {
    json: './test-results/design-system-results.json',
  },
});