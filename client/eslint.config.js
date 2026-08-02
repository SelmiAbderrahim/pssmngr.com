import reactRefresh from "eslint-plugin-react-refresh";
import reactHooks from "eslint-plugin-react-hooks";
import eslintConfigPrettier from "eslint-config-prettier";
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

/**
 * RTL Compliance ESLint Configuration
 *
 * This configuration enforces the use of logical CSS properties
 * for proper RTL (Right-to-Left) language support.
 *
 * Physical properties (ml-, mr-, pl-, pr-, left-, right-) should be
 * replaced with logical equivalents (ms-, me-, ps-, pe-, start-, end-).
 */

export default tseslint.config(
  // Global ignores - must be a standalone config object with ONLY ignores key
  {
    ignores: [
      "dist/",
      "dist-server/",
      "public/init-fouc.js",
      "landing-visual.tmp.mjs",
      ".eslintrc.cjs",
      "public/wasm/",
      "src/routeTree.gen.ts",
      "test-library.js",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: {
      globals: {
        // Browser globals
        window: "readonly",
        document: "readonly",
        navigator: "readonly",
        getComputedStyle: "readonly",
        console: "readonly",
        // ES2020+ globals
        Promise: "readonly",
        Symbol: "readonly",
        BigInt: "readonly",
        globalThis: "readonly",
      },
    },
    plugins: {
      "react-refresh": reactRefresh,
      "react-hooks": reactHooks,
    },
    rules: {
      "react-refresh/only-export-components": [
        "error",
        { allowConstantExport: true },
      ],
      "@typescript-eslint/no-empty-interface": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/consistent-type-definitions": "off",
      // These rules remain disabled until the existing call sites are typed.
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off",

      // RTL Compliance: Warn on physical directional properties in className strings
      // Note: These are pattern-based warnings. Use `npm run rtl:check` for comprehensive checks.
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/\\b(ml|mr|pl|pr)-\\d/]",
          message:
            "RTL: Use logical properties (ms-, me-, ps-, pe-) instead of physical (ml-, mr-, pl-, pr-).",
        },
        {
          selector: "Literal[value=/\\btext-(left|right)\\b/]",
          message:
            "RTL: Use text-start/text-end instead of text-left/text-right for RTL support.",
        },
        {
          selector: "Literal[value=/\\b(left|right)-\\d/]",
          message:
            "RTL: Use start-*/end-* instead of left-*/right-* for positioning.",
        },
        {
          selector: "Literal[value=/\\bborder-(l|r)\\b/]",
          message:
            "RTL: Use border-s/border-e instead of border-l/border-r for RTL support.",
        },
        {
          selector: "Literal[value=/\\brounded-(l|r)-/]",
          message:
            "RTL: Use rounded-s-*/rounded-e-* instead of rounded-l-*/rounded-r-* for RTL support.",
        },
      ],
    },
  },
  // Allow @ts-nocheck with descriptions for migration files
  {
    files: [
      "src/types/standards.ts",
      "src/validation/schemas.ts",
    ],
    rules: {
      "@typescript-eslint/ban-ts-comment": [
        "error",
        {
          "ts-expect-error": "allow-with-description",
          "ts-ignore": false,
          "ts-nocheck": "allow-with-description",
          "ts-check": false,
          minimumDescriptionLength: 3,
        },
      ],
    },
  },
  // Node.js config files and test scripts
  {
    files: [
      "*.config.js",
      "*.config.cjs",
      "*.cjs",
      "*.mjs",
      "lighthouserc.js",
      "scripts/**/*.js",
      "scripts/**/*.cjs",
      "scripts/**/*.mjs",
      "tests/security/**/*.js",
    ],
    languageOptions: {
      globals: {
        // Node.js globals
        module: "readonly",
        require: "readonly",
        process: "readonly",
        console: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        Buffer: "readonly",
        global: "readonly",
        setTimeout: "readonly",
        setInterval: "readonly",
        clearTimeout: "readonly",
        clearInterval: "readonly",
      },
    },
    rules: {
      "@typescript-eslint/no-var-requires": "off",
      "no-restricted-syntax": "off",
    },
  },
  {
    files: [
      "**/__tests__/**/*.{ts,tsx}",
      "tests/**/*.{ts,tsx}",
      "e2e/**/*.{ts,tsx}",
    ],
    rules: {
      "@typescript-eslint/no-var-requires": "off",
      "@typescript-eslint/no-dynamic-delete": "off",
      "@typescript-eslint/no-extraneous-class": "off",
      "no-empty-pattern": "off",
      "no-useless-escape": "off",
      "no-restricted-syntax": "off",
      "react-refresh/only-export-components": "off",
    },
  },
  // These modules intentionally colocate components with hooks or style
  // factories. The exports are stable, but they are not component-only files.
  {
    files: [
      "src/components/ui/**/*.tsx",
      "src/components/vault/SensitiveActionGate.tsx",
      "src/features/guide/GuideProvider.tsx",
      "src/providers/**/*.tsx",
      "src/ui/**/*.tsx",
    ],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
  // Placement animations and physical X-axis centering in these Radix
  // primitives are geometry, not reading-direction layout.
  {
    files: [
      "src/components/ui/alert-dialog.tsx",
      "src/components/ui/dropdown-menu.tsx",
      "src/ui/dropdown-menu.tsx",
      "src/ui/select.tsx",
    ],
    rules: {
      "no-restricted-syntax": "off",
    },
  },
  eslintConfigPrettier,
);
