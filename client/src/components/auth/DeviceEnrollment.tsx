// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Smartphone, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { enrollDevice } from "@/services/keypair-manager";

export interface DeviceEnrollmentProps {
  onComplete: () => void;
  onSkip?: () => void;
}

export function DeviceEnrollment({
  onComplete,
  onSkip,
}: DeviceEnrollmentProps) {
  const { t } = useTranslation("auth");
  const [deviceName, setDeviceName] = React.useState(() => {
    const ua = navigator.userAgent;
    if (/firefox/i.test(ua)) return "Firefox";
    if (/edg/i.test(ua)) return "Edge";
    if (/chrome/i.test(ua)) return "Chrome";
    if (/safari/i.test(ua)) return "Safari";
    return t("login.device.defaultBrowser", "Browser");
  });
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleEnroll = React.useCallback(async () => {
    if (!deviceName.trim()) return;
    setIsLoading(true);
    setError(null);

    try {
      await enrollDevice(deviceName.trim(), "browser");

      onComplete();
    } catch (err) {
      console.error("[DeviceEnrollment] Error:", err);
      setError(
        err instanceof Error
          ? err.message
          : t("login.device.enrollError", "Failed to register device"),
      );
    } finally {
      setIsLoading(false);
    }
  }, [deviceName, onComplete, t]);

  return (
    <div className="w-full max-w-md mx-auto space-y-4">
      <div className="space-y-2 text-center">
        <Smartphone className="mx-auto h-8 w-8 text-primary" />
        <h3 className="text-lg font-semibold">
          {t("login.device.title", "Name This Device")}
        </h3>
        <p className="text-sm text-muted-foreground">
          {t(
            "login.device.description",
            "Give this browser a name so you can recognize it in your device list.",
          )}
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive text-start"
        >
          {error}
        </div>
      )}

      <div className="grid gap-2">
        <Label htmlFor="device-name" className="text-start">
          {t("login.device.nameLabel", "Device Name")}
        </Label>
        <Input
          id="device-name"
          type="text"
          value={deviceName}
          onChange={(e) => setDeviceName(e.target.value)}
          placeholder={t("login.device.namePlaceholder", "e.g. Work Laptop")}
          maxLength={100}
          disabled={isLoading}
          autoFocus
        />
      </div>

      <Button
        type="button"
        className="w-full h-11"
        disabled={!deviceName.trim() || isLoading}
        onClick={handleEnroll}
      >
        {isLoading ? (
          <>
            <Loader2 className="h-4 w-4 me-1.5 animate-spin" />
            {t("login.device.registering", "Registering...")}
          </>
        ) : (
          t("login.device.register", "Register Device")
        )}
      </Button>

      {onSkip && (
        <button
          type="button"
          onClick={onSkip}
          className="w-full text-sm text-muted-foreground hover:text-foreground text-center"
          disabled={isLoading}
        >
          {t("login.device.skip", "Skip for now")}
        </button>
      )}
    </div>
  );
}
