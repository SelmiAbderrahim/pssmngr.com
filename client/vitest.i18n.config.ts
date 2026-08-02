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

    // Test file patterns - specifically include our i18n test files
    include: [
      'src/i18n/__tests__/**/*.test.{ts,tsx,js,mjs}',
    ],
    exclude: [
      'node_modules/**',
      'dist/**',
      'coverage/**',
    ],

    // Reporter configuration
    reporters: ['verbose'],
    testTimeout: 10000,
    hookTimeout: 10000,

    // Force exit after tests complete
    forceExit: true,
    passWithNoTests: true,

    // Use threads pool with single thread
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: true,
        isolate: true,
      },
    },

    // Module dependencies configuration
    server: {
      deps: {
        inline: ['sonner'],
      },
    },
  },

  // Path resolution - must match main vitest.config.ts
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@tests': path.resolve(__dirname, './tests'),
      '~': path.resolve(__dirname, '.'),
      '@pssmngr/crypto': path.resolve(__dirname, '../crypto/src'),
      'argon2-browser': path.resolve(__dirname, './tests/__mocks__/argon2-browser.ts'),
      'libsodium-wrappers-sumo': path.resolve(__dirname, './tests/__mocks__/libsodium-wrappers-sumo.ts'),
    },
  },

  // Define global constants
  define: {
    __DEV__: JSON.stringify(process.env.NODE_ENV === 'development'),
    __TEST__: JSON.stringify(true),
    'import.meta.env.VITE_API_URL': JSON.stringify('http://localhost:39291'),
  },
})
