// Global test setup for Vitest
import "@testing-library/jest-dom";
import { beforeAll, afterEach, afterAll, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { server } from "./utils/mock-server";

// Suppress console output during tests for cleaner dot reporter output
// Tests can still assert on console calls via vi.spyOn if needed
const originalConsole = {
  log: console.log,
  warn: console.warn,
  error: console.error,
  info: console.info,
  debug: console.debug,
};

// Mock i18next-http-backend to prevent HTTP requests
vi.mock("i18next-http-backend", () => {
  class MockBackend {
    static type = "backend";
    type = "backend";
    init() {}
    read(
      _language: string,
      _namespace: string,
      callback: (err: null, data: object) => void,
    ) {
      // Return empty translations - components use mocked react-i18next anyway
      callback(null, {});
    }
  }
  return { default: MockBackend };
});

// Mock i18next-browser-languagedetector
vi.mock("i18next-browser-languagedetector", () => {
  class MockDetector {
    static type = "languageDetector";
    type = "languageDetector";
    init() {}
    detect() {
      return "en";
    }
    cacheUserLanguage() {}
  }
  return { default: MockDetector };
});

// Mock handle-unauthorized to prevent loading auth-client (better-auth) at module scope.
// auth-client.ts calls createAuthClient() which validates VITE_API_URL synchronously,
// but the env var may not be available during module resolution in the full test suite.
vi.mock("@/lib/api/handle-unauthorized", () => ({
  handleUnauthorized: vi.fn(),
}));

// Mock sonner toast library for test environment
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    loading: vi.fn(),
    custom: vi.fn(),
    dismiss: vi.fn(),
    promise: vi.fn(),
  },
  Toaster: () => null,
}));

// Mock TanStack Router for unit tests that use Link components
// This avoids the router context requirement in component unit tests
vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual("@tanstack/react-router");
  return {
    ...actual,
    // Mock Link to render as a simple anchor tag
    Link: ({ to, children, className, ...props }: any) => {
      const React = require("react");
      return React.createElement(
        "a",
        { href: to, className, ...props },
        children,
      );
    },
    // Mock navigation hooks
    useNavigate: () => vi.fn(),
    useRouter: () => ({
      state: { location: { pathname: "/" } },
    }),
    useRouterState: () => ({
      location: { pathname: "/" },
    }),
    useParams: () => ({}),
    useSearch: () => ({}),
    useMatch: () => ({ params: {} }),
  };
});

// Global mock for usePasswordStrength hook - centralized to work with isolate: false
// Tests can customize by reassigning global.mockPasswordStrengthResult before rendering
declare global {
  // eslint-disable-next-line no-var
  var mockPasswordStrengthResult: {
    strength: "none" | "weak" | "medium" | "strong";
    score: number;
    requirements: {
      length: boolean;
      uppercase: boolean;
      lowercase: boolean;
      number: boolean;
      special: boolean;
    };
    feedback: string;
  };
}

// Default password strength result
global.mockPasswordStrengthResult = {
  strength: "strong",
  score: 100,
  requirements: {
    length: true,
    uppercase: true,
    lowercase: true,
    number: true,
    special: true,
  },
  feedback: "",
};

vi.mock("@/hooks/usePasswordStrength", () => ({
  usePasswordStrength: () => global.mockPasswordStrengthResult,
}));

// Mock react-i18next globally with comprehensive translations
vi.mock("react-i18next", () => ({
  useTranslation: (namespace?: string | string[]) => ({
    t: (key: string, paramsOrDefault?: string | Record<string, unknown>) => {
      // Handle t("key", "default string") pattern used by i18next
      const isStringDefault = typeof paramsOrDefault === "string";
      const params = isStringDefault
        ? undefined
        : (paramsOrDefault as Record<string, unknown> | undefined);
      const stringDefault = isStringDefault ? paramsOrDefault : undefined;

      // Handle returnObjects: true — return defaultValue array when provided
      if (params?.returnObjects && Array.isArray(params?.defaultValue)) {
        return params.defaultValue;
      }

      // Build full key with namespace prefix if provided
      const ns = Array.isArray(namespace) ? namespace[0] : namespace;
      const fullKey = ns ? `${ns}.${key}` : key;

      // Comprehensive translation map for all test files
      const translations: Record<
        string,
        string | ((p: Record<string, unknown>) => string)
      > = {
        // Common actions
        "actions.cancel": "Cancel",
        "actions.confirm": "Confirm",
        "actions.delete": "Delete",
        "actions.save": "Save",
        "actions.retry": "Retry",
        "actions.close": "Close",

        // Language switcher
        "language.select": "Select language",
        "common:errors.saveLanguageFailed":
          "Failed to save language preference. Please try again.",

        // Settings - Password Change
        "password.changeTitle": "Change Password",
        "password.currentRequired": "Current password is required",
        "password.minLength": "Password must be at least 8 characters",
        "password.maxLength": "Password must be less than 128 characters",
        "password.requireUppercase":
          "Password must contain at least one uppercase letter",
        "password.requireLowercase":
          "Password must contain at least one lowercase letter",
        "password.requireNumber": "Password must contain at least one number",
        "password.requireSpecial":
          "Password must contain at least one special character",
        "password.confirmRequired": "Password confirmation is required",
        "password.mismatch": "Passwords do not match",
        "password.sameAsCurrent":
          "New password cannot be the same as current password",
        "password.successMessage": "Password changed successfully",
        "password.currentLabel": "Current Password",
        "password.currentPlaceholder": "Enter your current password",
        "password.newLabel": "New Password",
        "password.newPlaceholder": "Enter your new password",
        "password.confirmNewLabel": "Confirm New Password",
        "password.hidePassword": "Hide password",
        "password.showPassword": "Show password",
        "password.changeButton": "Change Password",

        // Password strength requirement sr-only met/not-met annotations.
        // The component wraps these in parens, e.g. "(met)" / "(not met)".
        "passwordStrength.requirements.met": "met",
        "passwordStrength.requirements.notMet": "not met",

        // Accessibility skip-link (asserted as English text by route tests)
        "common:a11y.skipToContent": "Skip to main content",
        "a11y.skipToContent": "Skip to main content",

        // Generic error-boundary fallback.
        "pages.generalError.title": "Something went wrong",

        // Settings - Security (Passkeys)
        "settings.security.passkeys.deviceType.singleDevice": "Single device",
        "settings.security.passkeys.deviceType.multiDevice":
          "Synced across devices",

        // Settings - Security (Sessions)
        "settings.security.sessions.onOs": (p: Record<string, unknown>) =>
          `on ${p?.os || "Unknown"}`,

        // Auth Validation - Email
        "validation.email.required": "Email is required",
        "validation.email.invalid": "Please enter a valid email address",
        "validation.email.tooLong": "Email must be less than 255 characters",

        // Auth Validation - Password
        "validation.password.minLength": (p) =>
          `Password must be at least ${p?.min || 8} characters`,
        "validation.password.maxLength": (p) =>
          `Password must be less than ${p?.max || 128} characters`,
        "validation.password.required": "Password is required",
        "validation.password.confirmRequired":
          "Password confirmation is required",
        "validation.password.requireUppercase":
          "Password must contain at least one uppercase letter",
        "validation.password.requireLowercase":
          "Password must contain at least one lowercase letter",
        "validation.password.requireNumber":
          "Password must contain at least one number",
        "validation.password.requireSpecial":
          "Password must contain at least one special character",
        "validation.password.mismatch": "Passwords do not match",

        // Auth Validation - Name
        "validation.name.required": "Name is required",
        "validation.name.tooLong": "Name must be less than 100 characters",
        "validation.name.invalid":
          "Name can only contain letters, spaces, hyphens, and apostrophes",

        // Auth Validation - Terms

        // Auth Validation - Code
        "validation.code.required": "Verification code is required",

        // Auth Validation - Requirements
        "validation.requirements.length": (p) =>
          `At least ${p?.min || 8} characters`,
        "validation.requirements.uppercase": "At least one uppercase letter",
        "validation.requirements.lowercase": "At least one lowercase letter",
        "validation.requirements.number": "At least one number",
        "validation.requirements.special": "At least one special character",

        // Common
        cancel: "Cancel",
        confirm: "Confirm",
        delete: "Delete",
        save: "Save",
        loading: "Loading...",
        error: "Error",
        retry: "Retry",
        close: "Close",
        "common.dismiss": "Dismiss",
        "common.close": "Close",

        // Email Verification (auth namespace)
        "auth.emailVerification.verifyTitle": "Verify Your Email",
        "auth.emailVerification.sentDescription":
          "We sent a verification email to your address",
        "auth.emailVerification.instructions":
          "Check your inbox and enter the verification code to complete registration.",
        "auth.emailVerification.codeExpiry": "The code expires in 10 minutes.",
        "auth.emailVerification.resendIn": (p) =>
          `Resend in ${p?.countdown || p?.time || "1:00"}`,
        "auth.emailVerification.resendEmail": "Resend Email",
        "auth.emailVerification.resendSent": "Verification email sent!",
        "auth.emailVerification.didntReceive": "Didn't receive the email?",
        "auth.emailVerification.checkSpam":
          "Check your spam folder or try resending.",
        "auth.emailVerification.resending": "Sending...",
        "auth.emailVerification.sending": "Sending...",
        "auth.emailVerification.resentCount": (p) =>
          `Resent ${p?.count || 0} time${(p?.count || 0) === 1 ? "" : "s"}`,
        "auth.emailVerification.resendCount": (p) =>
          `Resent ${p?.count || 0} time${(p?.count || 0) === 1 ? "" : "s"}`,
        "auth.emailVerification.useDifferentEmail": "Use a different email",
      };

      // Try full namespaced key first, then fall back to key without namespace
      const translation = translations[fullKey] || translations[key];
      if (typeof translation === "function") {
        return translation(params || {});
      }
      // NOTE: this mock returns the KEY for unmapped keys regardless of whether
      // a default is provided (string 2nd arg OR { defaultValue }). Most tests
      // assert on the key, so do NOT fall back to the default here — add
      // explicit entries to the map above for the few tests that need English.
      void stringDefault;
      return translation || key;
    },
    i18n: {
      changeLanguage: vi.fn(),
      language: "en",
    },
  }),
  Trans: ({ children }: { children: React.ReactNode }) => children,
  initReactI18next: {
    type: "3rdParty",
    init: vi.fn(),
  },
}));

// Note: Accessibility testing setup is handled per test file
// Using jest-axe with vitest compatibility

// Setup MSW server and suppress console output
beforeAll(() => {
  // Suppress console output for cleaner test output
  console.log = vi.fn();
  console.warn = vi.fn();
  console.info = vi.fn();
  console.debug = vi.fn();
  console.error = vi.fn();

  // Set window.argon2 mock for vault-crypto tests.
  // The real adapter loads argon2-browser via <script> tag (UMD global),
  // but jsdom doesn't execute scripts, so we provide the mock here.
  (globalThis as Record<string, unknown>).argon2 = {
    ArgonType: { Argon2d: 0, Argon2i: 1, Argon2id: 2 },
    hash: async (params: {
      pass: Uint8Array;
      salt: Uint8Array;
      hashLen: number;
    }) => {
      const result = new Uint8Array(params.hashLen);
      for (let i = 0; i < params.hashLen; i++) {
        result[i] =
          (params.pass[i % params.pass.length] ?? 0) ^
          (params.salt[i % params.salt.length] ?? 0) ^
          (i & 0xff);
      }
      return { hash: result };
    },
  };

  // Start MSW server - use 'warn' to prevent test hanging on unhandled requests
  server.listen({ onUnhandledRequest: "warn" });
});

// Reset request handlers after each test
afterEach(() => {
  server.resetHandlers();
  cleanup();

  // Reset document attributes that may be set by LanguageProvider or other tests
  document.documentElement.lang = "en";
  document.documentElement.dir = "ltr";
  document.documentElement.style.direction = "ltr";
});

// Close server and restore console after all tests
afterAll(() => {
  server.close();

  // Restore original console
  console.log = originalConsole.log;
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;
  console.info = originalConsole.info;
  console.debug = originalConsole.debug;
});

// Mock navigator.clipboard globally — use Object.defineProperty with configurable: true
// so individual tests can override it. Object.assign(navigator, { clipboard: ... }) fails
// if a previous test or jsdom defines clipboard with only a getter.
Object.defineProperty(navigator, "clipboard", {
  value: {
    writeText: vi.fn().mockResolvedValue(undefined),
    readText: vi.fn().mockResolvedValue(""),
  },
  writable: true,
  configurable: true,
});

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  disconnect() {}
  observe() {}
  unobserve() {}
};

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  observe() {
    return null;
  }
  unobserve() {
    return null;
  }
  disconnect() {
    return null;
  }
} as any;

// Mock window.matchMedia
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
vi.stubGlobal("localStorage", localStorageMock);

// Mock sessionStorage
const sessionStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
vi.stubGlobal("sessionStorage", sessionStorageMock);

// Mock CSS transitions and animations to prevent test delays
Object.defineProperty(window, "getComputedStyle", {
  value: () => ({
    getPropertyValue: () => "",
    transitionDelay: "",
    transitionDuration: "",
    animationDelay: "",
    animationDuration: "",
  }),
});

// Mock requestAnimationFrame to prevent animation-related delays
global.requestAnimationFrame = vi.fn((cb) => {
  const id = setTimeout(cb, 0);
  return id as unknown as number;
});
global.cancelAnimationFrame = vi.fn((id: number) => {
  clearTimeout(id);
});

// Mock scrollIntoView for JSDOM (not implemented)
Element.prototype.scrollIntoView = vi.fn();

// Mock window.scrollTo for JSDOM (not implemented)
window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;

// Mock window.scroll for JSDOM (not implemented)
window.scroll = vi.fn() as unknown as typeof window.scroll;

// Polyfill Pointer Capture API for Radix UI compatibility (JSDOM doesn't implement these)
// This fixes the "target.hasPointerCapture is not a function" error in Select components
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = vi.fn(() => false);
}

if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = vi.fn();
}

if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = vi.fn();
}

// Timeout configuration is now centralized in vitest.config.ts
// Removed conflicting vi.setConfig to prevent override issues
