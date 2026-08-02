// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Headless component that starts the sync worker once on mount and
 * tears it down on unmount. It also reflects the connectivity from
 * {@link useOnlineStatus} into the worker so flushes are gated.
 *
 * It surfaces two toasts (success / failure) when the worker reports
 * a completed flush — the messages live in the `sync` namespace.
 */
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { startSyncWorker } from "./syncWorker";
import { SYNC_EVENTS } from "./types";

export function SyncWorkerProvider() {
  const { isOnline } = useOnlineStatus();
  const { t } = useTranslation("sync");
  const onlineRef = useRef(isOnline);
  onlineRef.current = isOnline;

  useEffect(() => {
    const stop = startSyncWorker({ isOnline: () => onlineRef.current });
    return () => stop();
  }, []);

  // Toast on every completed flush. Quiet when nothing happened.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onCompleted = (event: Event) => {
      const detail = (event as CustomEvent<{ succeeded: number; failed: number }>)
        .detail;
      if (!detail) return;
      if (detail.succeeded > 0) {
        toast.success(
          t("sync_complete.toast", {
            count: detail.succeeded,
            defaultValue: `${detail.succeeded} changes synced`,
          }),
        );
      }
      if (detail.failed > 0) {
        toast.error(
          t("sync_failed.toast", {
            count: detail.failed,
            defaultValue: `Could not sync ${detail.failed} changes. They will retry automatically.`,
          }),
        );
      }
    };
    window.addEventListener(SYNC_EVENTS.syncCompleted, onCompleted);
    return () => window.removeEventListener(SYNC_EVENTS.syncCompleted, onCompleted);
  }, [t]);

  return null;
}

export default SyncWorkerProvider;
