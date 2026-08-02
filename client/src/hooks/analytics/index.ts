// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";
import { gaPageview, gaEvent } from "@/lib/analytics/gtag";

/**
 * Fire a Google Analytics page_view whenever the active route path changes.
 * No-op unless VITE_GA_MEASUREMENT_ID is configured (see lib/analytics/gtag).
 */
export function usePageTracking() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  useEffect(() => {
    gaPageview(pathname);
  }, [pathname]);
}

/**
 * Real User Monitoring for the two Core Web Vitals most affected by the
 * prerender work: LCP (Largest Contentful Paint) and CLS (Cumulative Layout
 * Shift). Uses the native PerformanceObserver API (no dependency) and reports
 * once per page when it is backgrounded/unloaded, via the consent-/GA-gated
 * gaEvent (no PII — vitals are plain numbers). SSR-safe: all browser access is
 * inside the effect, which never runs during prerendering.
 *
 */
export function useWebVitals() {
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof PerformanceObserver === "undefined"
    ) {
      return;
    }

    const observers: PerformanceObserver[] = [];
    let lcp = 0;
    let cls = 0;

    try {
      const lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const last = entries[entries.length - 1] as
          | (PerformanceEntry & { renderTime?: number; loadTime?: number })
          | undefined;
        if (last) lcp = last.renderTime || last.loadTime || last.startTime;
      });
      lcpObserver.observe({ type: "largest-contentful-paint", buffered: true });
      observers.push(lcpObserver);
    } catch {
      /* LCP not supported in this browser */
    }

    try {
      const clsObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as Array<
          PerformanceEntry & { value: number; hadRecentInput?: boolean }
        >) {
          if (!entry.hadRecentInput) cls += entry.value;
        }
      });
      clsObserver.observe({ type: "layout-shift", buffered: true });
      observers.push(clsObserver);
    } catch {
      /* CLS not supported in this browser */
    }

    let reported = false;
    const report = () => {
      if (reported) return;
      reported = true;
      gaEvent("web_vitals", {
        lcp_ms: Math.round(lcp),
        cls: Math.round(cls * 1000) / 1000,
      });
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") report();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", report);

    return () => {
      observers.forEach((observer) => observer.disconnect());
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", report);
    };
  }, []);
}
