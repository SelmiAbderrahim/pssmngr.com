import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      exclude: ['src/index.ts', 'coverage/**'],
      thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
    },
    include: ['src/**/*.test.ts'],
    exclude: ['src/__benchmarks__/**'],
    setupFiles: ['./vitest.setup.ts'],
  },
  resolve: {
    alias: {
      'libsodium-wrappers-sumo': path.resolve(
        __dirname,
        'node_modules/libsodium-wrappers-sumo/dist/modules-sumo/libsodium-wrappers.js',
      ),
    },
  },
});
