// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * <LastSyncedLabel />
 *
 * Subtle "Last synced May 22, 2026, 14:32" label intended to ride at
 * the top of any vault list, item detail, secure-notes list, or
 * security dashboard. Turns amber when offline AND cached data is
 * older than {@link STALE_DATA_THRESHOLD_MS}.
 *
 * The timestamp comes from the caller — typically the `dataUpdatedAt`
 * field on a TanStack Query result, but any ISO date / number works.
 */
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { STALE_DATA_THRESHOLD_MS } from "@/sync/types";

export interface LastSyncedLabelProps {
  /** ms since epoch OR ISO string. */
  dataUpdatedAt: number | string | undefined;
  className?: string;
}

function toDate(value: number | string | undefined): Date | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "number") return new Date(value);
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed) : null;
}

export function LastSyncedLabel({
  dataUpdatedAt,
  className,
}: LastSyncedLabelProps) {
  const { t, i18n } = useTranslation("sync");
  const { isOnline } = useOnlineStatus();
  const date = toDate(dataUpdatedAt);
  if (!date) return null;

  const now = Date.now();
  const age = now - date.getTime();
  const stale = !isOnline && age >= STALE_DATA_THRESHOLD_MS;

  const formatter = new Intl.DateTimeFormat(i18n.language || "en", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const datetime = formatter.format(date);

  const messageKey = stale ? "last_synced.stale" : "last_synced.fresh";
  const fallback = stale
    ? `Showing cached data from ${datetime}`
    : `Last synced ${datetime}`;

  return (
    <p
      className={cn(
        "text-xs",
        stale ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground",
        className,
      )}
      aria-live="polite"
    >
      {t(messageKey, { datetime, defaultValue: fallback })}
    </p>
  );
}

export default LastSyncedLabel;
