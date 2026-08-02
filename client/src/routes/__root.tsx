// Copyright (c) 2026 Password Manager contributors
import { QueryClient } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  Outlet,
  useRouter,
} from "@tanstack/react-router";
import React, { Suspense } from "react";
import { Helmet } from "react-helmet-async";
import { NotFound } from "@/components/errors/NotFound";
import { GeneralError } from "@/components/errors/GeneralError";
import { config } from "@/lib/config";
import { usePageTracking, useWebVitals } from "@/hooks/analytics";
import { useTranslation } from "react-i18next";
import { ConsentBanner } from "@/components/privacy/ConsentBanner";
import { isGAEnabled } from "@/lib/analytics/gtag";

const enableDevtools =
  import.meta.env.DEV && import.meta.env.VITE_ENABLE_DEVTOOLS === "true";

const TanStackRouterDevtools =
  !enableDevtools
    ? () => null // Render nothing in production
    : React.lazy(() =>
      // Lazy load in development
      import("@tanstack/router-devtools").then((res) => ({
        default: res.TanStackRouterDevtools,
        // For Embedded Mode
        // default: res.TanStackRouterDevtoolsPanel
      })),
    );

/**
 * Root Layout Component
 *
 * Wraps the entire application with error boundary, helmet, and analytics tracking.
 */
function RootComponent() {
  const { t } = useTranslation("common");
  const router = useRouter();
  const matchWithTitle = [...router.state.matches]
    .reverse()
    .find((d) => {
      const ctx = (d as unknown as { context?: { title?: string } })?.context;
      return ctx?.title;
    });
  const title = (matchWithTitle as unknown as { context?: { title?: string } })?.context?.title || t("layouts.appName", "Password Manager");

  // Analytics tracking hooks (fire-and-forget, consent-aware)
  usePageTracking();
  useWebVitals();

  return (
    <Suspense fallback={<Outlet />}>
      <>
        {/* Default head rendered BEFORE <Outlet/> so a route's own <Helmet>
            (rendered deeper/after) overrides the title — otherwise this root
            default would win react-helmet-async's last-wins reconciliation and
            every page would share the generic app title. */}
        <Helmet>
          <title>{title}</title>
          {/* hreflang tags for internationalization */}
          <link rel="alternate" hrefLang="en" href={`${config.siteUrl}/`} />
          <link rel="alternate" hrefLang="ar" href={`${config.siteUrl}/ar`} />
          <link rel="alternate" hrefLang="es" href={`${config.siteUrl}/es`} />
          <link rel="alternate" hrefLang="fr" href={`${config.siteUrl}/fr`} />
          <link rel="alternate" hrefLang="de" href={`${config.siteUrl}/de`} />
          <link rel="alternate" hrefLang="x-default" href={`${config.siteUrl}/`} />
        </Helmet>
        <Outlet />
        {isGAEnabled ? <ConsentBanner /> : null}
        <Suspense>
          <TanStackRouterDevtools />
        </Suspense>
      </>
    </Suspense>
  );
}

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
  component: RootComponent,
  notFoundComponent: NotFound,
  errorComponent: GeneralError,
});
