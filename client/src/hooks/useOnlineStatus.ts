// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * useOnlineStatus
 *
 * Single source of truth for browser connectivity. Combines:
 *   1. `navigator.onLine` and the window `online` / `offline` events.
 *   2. A lightweight visibility-gated health-check ping (60s) that catches
 *      "captive-portal / zombie-online" states where the browser reports
 *      online but no traffic can actually leave the device.
 *
 * Returns `{ isOnline, lastChangedAt, source }`.
 *
 * @module hooks/useOnlineStatus
 */
import { useEffect, useState, useRef, useCallback } from "react";
import type { OnlineStatus } from "@/sync/types";

/** Default 60s ping cadence (tunable for tests). */
const DEFAULT_PING_INTERVAL_MS = 60_000;

/**
 * The endpoint we hit for the connectivity ping. Resolves relative to the
 * current origin so the request is same-origin and survives behind a proxy.
 *
 * We pick `/api/health` because the backend exposes a lightweight readiness
 * probe there. The test harness can override with `__PSSMNGR_PING_URL`.
 */
function getPingUrl(): string {
  if (typeof window !== "undefined") {
    const override = (window as unknown as { __PSSMNGR_PING_URL?: string })
      .__PSSMNGR_PING_URL;
    if (override) return override;
  }
  return "/api/health";
}

export interface UseOnlineStatusOptions {
  /** Override the ping cadence (test hook). */
  pingIntervalMs?: number;
  /** Override the fetch implementation (test hook). */
  fetchImpl?: typeof fetch;
}

/**
 * Read connectivity from the browser + a periodic health-check ping.
 */
export function useOnlineStatus(
  options: UseOnlineStatusOptions = {},
): OnlineStatus {
  const pingIntervalMs = options.pingIntervalMs ?? DEFAULT_PING_INTERVAL_MS;
  const fetchImpl =
    options.fetchImpl ??
    (typeof fetch !== "undefined" ? fetch.bind(globalThis) : undefined);

  const initialOnline =
    typeof navigator !== "undefined" ? navigator.onLine : true;

  const [status, setStatus] = useState<OnlineStatus>(() => ({
    isOnline: initialOnline,
    lastChangedAt: new Date(),
    source: "navigator",
  }));

  // Track the latest value without re-binding effects.
  const isOnlineRef = useRef(initialOnline);
  isOnlineRef.current = status.isOnline;

  const update = useCallback(
    (next: boolean, source: OnlineStatus["source"]) => {
      if (next === isOnlineRef.current) return;
      isOnlineRef.current = next;
      setStatus({ isOnline: next, lastChangedAt: new Date(), source });
    },
    [],
  );

  // ── Browser online/offline events ───────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleOnline = () => update(true, "navigator");
    const handleOffline = () => update(false, "navigator");
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [update]);

  // ── Visibility-gated health-check ping ──────────────────────────
  useEffect(() => {
    if (typeof window === "undefined" || !fetchImpl) return;

    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const doPing = async () => {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
      }
      try {
        const res = await fetchImpl(getPingUrl(), {
          method: "GET",
          credentials: "include",
          // 5s ceiling so a wedged TCP doesn't tarpit forever.
          signal: AbortSignal.timeout?.(5_000),
          cache: "no-store",
        });
        if (cancelled) return;
        // 2xx and 3xx are "reachable". 401 / 403 also mean the network is up.
        const reachable = res.ok || res.status === 401 || res.status === 403;
        if (reachable && !isOnlineRef.current) {
          update(true, "ping");
        } else if (!reachable && isOnlineRef.current) {
          update(false, "ping");
        }
      } catch {
        if (cancelled) return;
        if (isOnlineRef.current) update(false, "ping");
      }
    };

    timer = setInterval(doPing, pingIntervalMs);

    const onVisibility = () => {
      if (document.visibilityState === "visible") doPing();
    };
    document.addEventListener?.("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      document.removeEventListener?.("visibilitychange", onVisibility);
    };
  }, [fetchImpl, pingIntervalMs, update]);

  return status;
}

export default useOnlineStatus;
