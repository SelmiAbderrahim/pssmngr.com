import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig(({ mode }) => {
  // Load environment variables from parent directory (root .env)
  // Falls back to process.env for Docker container compatibility
  const fileEnv = loadEnv(mode, resolve(__dirname, ".."), "");

  // Merge file env with process.env (process.env takes precedence for Docker)
  const env = {
    ...fileEnv,
    VITE_API_URL: process.env.VITE_API_URL || fileEnv.VITE_API_URL,
    VITE_SITE_URL: process.env.VITE_SITE_URL || fileEnv.VITE_SITE_URL,
    VITE_ALLOWED_HOSTS:
      process.env.VITE_ALLOWED_HOSTS || fileEnv.VITE_ALLOWED_HOSTS,
    VITE_GA_MEASUREMENT_ID:
      process.env.VITE_GA_MEASUREMENT_ID || fileEnv.VITE_GA_MEASUREMENT_ID,
  };

  // Parse allowed hosts from env (comma-separated) or use default
  const allowedHosts = (env.VITE_ALLOWED_HOSTS || "localhost")
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean);

  return {
    define: {
      "import.meta.env.VITE_API_URL": JSON.stringify(env.VITE_API_URL),
      "import.meta.env.VITE_SITE_URL": JSON.stringify(env.VITE_SITE_URL),
      "import.meta.env.VITE_GA_MEASUREMENT_ID": JSON.stringify(
        env.VITE_GA_MEASUREMENT_ID,
      ),
    },
    plugins: [
      TanStackRouterVite({
        routeFileIgnorePattern: "(\\.test\\.|\\.spec\\.|__tests__|__mocks__)",
        // Split each route's component into its own lazy chunk so heavy,
        // route-only code (vault/dashboard + their @pssmngr/crypto -> libsodium
        // imports) is NOT bundled into the entry chunk.
        autoCodeSplitting: true,
      }),
      react(),
    ],

    // Treat .wasm files as static assets (not ESM modules)
    assetsInclude: ["**/*.wasm"],

    build: {
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks: {
            "vendor-react": ["react", "react-dom", "react/jsx-runtime"],
            "vendor-router": [
              "@tanstack/react-router",
              "@tanstack/react-query",
            ],
            "vendor-i18n": [
              "i18next",
              "react-i18next",
              "i18next-http-backend",
              "i18next-browser-languagedetector",
            ],
          },
        },
      },
    },

    server: {
      host: "0.0.0.0",
      port: 5173,
      allowedHosts: allowedHosts,
      proxy: {
        // Proxy API requests to backend server (avoids CORS in dev/E2E)
        "/api": {
          target: env.VITE_API_URL || "http://localhost:39291",
          changeOrigin: false,
        },
      },
    },

    resolve: {
      alias: {
        "~": __dirname,
        "@": resolve(__dirname, "./src"),
        "@pssmngr/crypto": resolve(__dirname, "../crypto/src"),
        // Resolve crypto deps from the @pssmngr/crypto package's node_modules.
        // Point libsodium to CJS entries: the ESM builds have a cross-package
        // relative import (./libsodium-sumo.mjs) and top-level await that break
        // both Vite's dev server and esbuild pre-bundling.
        "argon2-browser": resolve(
          __dirname,
          "../crypto/node_modules/argon2-browser",
        ),
        "libsodium-wrappers-sumo": resolve(
          __dirname,
          "../crypto/node_modules/libsodium-wrappers-sumo/dist/modules-sumo/libsodium-wrappers.js",
        ),
        "libsodium-sumo": resolve(
          __dirname,
          "../crypto/node_modules/libsodium-sumo/dist/modules-sumo/libsodium-sumo.js",
        ),
      },
      // Deduplicate React across workspace-linked packages.
      dedupe: ["react", "react-dom", "react-i18next"],
    },

    // Optimize deps to ensure React is pre-bundled correctly
    // libsodium-wrappers-sumo must be pre-bundled: its ESM entry does a relative
    // import of ./libsodium-sumo.mjs which lives in the separate libsodium-sumo
    // package. Without pre-bundling, Vite can't resolve this cross-package import.
    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "react-i18next",
        "better-auth/react",
        "jszip",
        "libsodium-wrappers-sumo",
        "libsodium-sumo",
      ],
      exclude: ["argon2-browser"],
    },
  };
});
