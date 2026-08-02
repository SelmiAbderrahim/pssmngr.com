// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * <OfflineBanner />
 *
 * Top-fixed, RTL-aware, dismissible banner that surfaces the offline
 * queue depth and complements the basic connectivity indicator with the
 * number of changes waiting to sync.
 *
 * - Hidden when the user is online AND the queue is empty.
 * - Re-appears on the next offline transition or queue-grew event
 *   even if previously dismissed.
 * - Uses CSS logical properties (`start-*`, `end-*`, `ps-*`, `pe-*`)
 *   so the layout reads correctly in Arabic / RTL.
 */
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CloudOff, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { pendingCount } from "@/sync/offlineQueue";
import { SYNC_EVENTS } from "@/sync/types";

export interface OfflineBannerProps {
  className?: string;
}

export function OfflineBanner({ className }: OfflineBannerProps) {
  const { t } = useTranslation("sync");
  const { isOnline } = useOnlineStatus();
  const [queueDepth, setQueueDepth] = useState<number>(0);
  const [dismissed, setDismissed] = useState<boolean>(false);

  const refresh = useCallback(async () => {
    try {
      setQueueDepth(await pendingCount());
    } catch {
      setQueueDepth(0);
    }
  }, []);

  // Initial load + listen for queue mutations from the worker.
  useEffect(() => {
    void refresh();
    if (typeof window === "undefined") return;
    const onChange = () => void refresh();
    window.addEventListener(SYNC_EVENTS.queueChanged, onChange);
    window.addEventListener(SYNC_EVENTS.syncCompleted, onChange);
    return () => {
      window.removeEventListener(SYNC_EVENTS.queueChanged, onChange);
      window.removeEventListener(SYNC_EVENTS.syncCompleted, onChange);
    };
  }, [refresh]);

  // Re-show the banner on every offline transition so the user can't
  // silently miss a connectivity drop after dismissing it once.
  useEffect(() => {
    if (!isOnline) setDismissed(false);
  }, [isOnline]);

  const visible = !dismissed && (!isOnline || queueDepth > 0);
  if (!visible) return null;

  const titleKey = isOnline
    ? "offline_banner.syncing_title"
    : "offline_banner.title";
  const fallbackTitle = isOnline ? "Syncing changes" : "You are offline";

  return (
    <div
      role="alert"
      aria-live="polite"
      className={cn(
        "fixed top-0 start-0 end-0 z-[60]",
        "bg-amber-50 text-amber-900 border-b border-amber-200",
        "dark:bg-amber-900/20 dark:text-amber-100 dark:border-amber-800",
        "ps-4 pe-4 py-2",
        className,
      )}
    >
      <div className="container mx-auto flex items-center gap-3">
        <CloudOff className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">
            {t(titleKey, fallbackTitle)}
          </p>
          {queueDepth > 0 && (
            <p className="text-xs">
              {t("offline_banner.queue_count", {
                count: queueDepth,
                defaultValue:
                  queueDepth === 1
                    ? "1 change waiting to sync"
                    : `${queueDepth} changes waiting to sync`,
              })}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label={t("offline_banner.dismiss", "Dismiss")}
          className={cn(
            "rounded-md p-1 hover:bg-amber-100 dark:hover:bg-amber-900/40",
            "transition-colors duration-150",
            "min-h-[44px] min-w-[44px] flex items-center justify-center",
          )}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

export default OfflineBanner;
