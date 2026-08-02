// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Clock } from "lucide-react";

interface CountdownTimerProps {
  expiresAt: string;
  onExpired?: () => void;
}

function getTimeRemaining(expiresAt: string) {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return null;

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((diff / (1000 * 60)) % 60);
  const seconds = Math.floor((diff / 1000) % 60);

  return { days, hours, minutes, seconds, total: diff };
}

export function CountdownTimer({ expiresAt, onExpired }: CountdownTimerProps) {
  const { t } = useTranslation("common");
  const [remaining, setRemaining] = useState(() => getTimeRemaining(expiresAt));

  useEffect(() => {
    const interval = setInterval(() => {
      const next = getTimeRemaining(expiresAt);
      setRemaining(next);
      if (!next) {
        clearInterval(interval);
        onExpired?.();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [expiresAt, onExpired]);

  if (!remaining) {
    return (
      <span className="text-sm font-medium text-destructive">{t("countdown.expired", "Expired")}</span>
    );
  }

  const parts: string[] = [];
  if (remaining.days > 0) parts.push(`${remaining.days}d`);
  if (remaining.hours > 0 || remaining.days > 0) parts.push(`${remaining.hours}h`);
  parts.push(`${remaining.minutes}m`);
  parts.push(`${String(remaining.seconds).padStart(2, "0")}s`);

  return (
    <div className="flex items-center gap-1.5 text-sm tabular-nums text-muted-foreground">
      <Clock className="h-3.5 w-3.5" />
      <span>{parts.join(" ")}</span>
    </div>
  );
}
