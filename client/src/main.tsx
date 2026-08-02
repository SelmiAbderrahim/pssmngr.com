// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Client entry / bootstrap.
 *
 * The whole app is client-rendered — there is no prerendered public surface.
 *
 * DOM-emitting, browser-only widgets (Toaster and devtools) stay
 * wrapped in <ClientOnly> so they mount only once the browser environment is
 * available. The context-only providers (Auth, Language, Sync) emit no DOM and
 * are safe to include directly.
 */
import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { HelmetProvider } from "react-helmet-async";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

import { I18nextProvider } from "react-i18next";
import { router } from "@/router";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider } from "@/providers/AuthProvider";
import { LanguageProvider } from "@/providers/LanguageProvider";
import { LayoutTemplateProvider } from "@/providers/LayoutTemplateProvider";
import { SyncWorkerProvider } from "@/sync/SyncWorkerProvider";
import { ClientOnly } from "@/components/ClientOnly";
import { initializeLogger } from "@/lib/logger";
import { setupGlobalErrorHandlers } from "@/lib/logger/globalHandlers";
import { setupNetworkLogging } from "@/lib/logger/networkLogger";
import { setupDevToolsCommands } from "@/lib/logger/devtools";
import { overrideConsole } from "@/lib/logger/globalConsoleOverride";
import { initGA } from "@/lib/analytics/gtag";
import { queryClient } from "@/lib/query-client";
import { initLanguageSync } from "@/lib/api/language-sync";
import i18n from "@/i18n";
import "./index.css";

const SUPPORTED_PATH_LOCALES = new Set(["ar", "en", "fr", "de", "es"]);
const enableDevtools =
  import.meta.env.DEV && import.meta.env.VITE_ENABLE_DEVTOOLS === "true";

function normalizeLocalizedSpaPath() {
  const [, locale, rest = ""] =
    window.location.pathname.match(/^\/([a-z]{2})(\/.*)?$/) ?? [];

  if (!locale || !SUPPORTED_PATH_LOCALES.has(locale)) {
    return;
  }

  const normalizedPath = rest || "/";
  localStorage.setItem("i18nextLng", locale);
  void i18n.changeLanguage(locale);

  const direction = locale === "ar" ? "rtl" : "ltr";
  document.documentElement.lang = locale;
  document.documentElement.dir = direction;
  document.documentElement.style.direction = direction;

  window.history.replaceState(
    window.history.state,
    "",
    `${normalizedPath}${window.location.search}${window.location.hash}`,
  );
}

normalizeLocalizedSpaPath();

// Get debug level from environment FIRST
// Log level controlled by VITE_DEBUG_LEVEL env var (ERROR, WARN, INFO, DEBUG, TRACE)
const debugLevel = (import.meta.env.VITE_DEBUG_LEVEL?.toUpperCase() ||
  "ERROR") as "ERROR" | "WARN" | "INFO" | "DEBUG" | "TRACE";

// Override console methods BEFORE any other code logs
// This filters ALL console output (including third-party libraries) by DEBUG_LEVEL
overrideConsole(debugLevel);

// Initialize structured logging system
const logger = initializeLogger({
  service: "frontend",
  minLevel: debugLevel,
});

logger.info("Application starting", { function: "main" });
setupGlobalErrorHandlers();
setupNetworkLogging();
setupDevToolsCommands();
logger.debug("Logging system initialized", { function: "main" });

// Initialize language sync for Accept-Language header
// This invalidates queries when language changes to refetch with new header
initLanguageSync();
logger.debug("Language sync initialized", { function: "main" });

// Initialize Google Analytics (no-op unless VITE_GA_MEASUREMENT_ID is set)
initGA();

// Create helmet context
const helmetContext = {};

const app = (
  <React.StrictMode>
    <I18nextProvider i18n={i18n}>
      <ErrorBoundary>
        <HelmetProvider context={helmetContext}>
          <QueryClientProvider client={queryClient}>
            <SyncWorkerProvider />
            <AuthProvider>
              <LanguageProvider>
                <LayoutTemplateProvider>
                  <TooltipProvider delayDuration={0}>
                    <RouterProvider router={router} context={{ queryClient }} />
                  </TooltipProvider>
                </LayoutTemplateProvider>
              </LanguageProvider>
            </AuthProvider>
            <ClientOnly>
              {enableDevtools ? (
                <ReactQueryDevtools initialIsOpen={false} />
              ) : null}
              <Toaster
                position="top-right"
                richColors
                closeButton
                toastOptions={{
                  duration: 4000,
                  classNames: {
                    toast: "bg-background text-foreground border-border",
                    title: "text-foreground",
                    description: "text-muted-foreground",
                  },
                }}
              />
            </ClientOnly>
          </QueryClientProvider>
        </HelmetProvider>
      </ErrorBoundary>
    </I18nextProvider>
  </React.StrictMode>
);

const rootElement = document.getElementById("root")!;
ReactDOM.createRoot(rootElement).render(app);
