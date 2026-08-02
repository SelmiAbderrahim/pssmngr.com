// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Trusted Devices Component
 *
 * Lists registered devices with trust status and management actions.
 */
import React, { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Monitor,
  Trash2,
  Loader2,
  ShieldCheck,
  ShieldOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { trpcQuery, trpcMutation } from "@/lib/api/trpc";
import { getDeviceId } from "@/lib/device-keys";
import { clearPersistence } from "@/lib/persistent-unlock";

interface Device {
  id: string;
  deviceName: string;
  deviceType: "browser";
  trusted: boolean;
  lastIp: string | null;
  lastSeen: string | null;
  createdAt: string;
}

const DEVICE_QUERY_KEY = ["security", "devices"] as const;

function useDevices() {
  return useQuery({
    queryKey: DEVICE_QUERY_KEY,
    queryFn: () => trpcQuery<Device[]>("device", "list"),
  });
}

function useRemoveDevice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (deviceId: string) =>
      trpcMutation<{ success: boolean }>("device", "remove", { deviceId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: DEVICE_QUERY_KEY });
    },
  });
}

function useToggleTrust() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ deviceId, trust }: { deviceId: string; trust: boolean }) =>
      trpcMutation<Device>(
        "device",
        trust ? "trust" : "untrust",
        { deviceId },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: DEVICE_QUERY_KEY });
    },
  });
}

function useRevokeAllUnlocks() {
  return useMutation({
    mutationFn: () =>
      trpcMutation<{ success: boolean }>("device", "revokeAllPersistentUnlocks"),
  });
}

function DeviceTypeIcon({ type }: { type: Device["deviceType"] }) {
  void type;
  return <Monitor className="h-4 w-4" />;
}

type TFn = (key: string, options?: Record<string, unknown>) => string;

function formatLastSeen(dateStr: string | null, t: TFn): string {
  if (!dateStr) return t("common:time.never");
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return t("common:time.now");
  if (diffMins === 1) return t("common:time.minuteAgo");
  if (diffMins < 60) return t("common:time.minutesAgo", { count: diffMins });
  if (diffHours === 1) return t("common:time.hourAgo");
  if (diffHours < 24) return t("common:time.hoursAgo", { count: diffHours });
  if (diffDays === 1) return t("common:time.dayAgo");
  if (diffDays < 7) return t("common:time.daysAgo", { count: diffDays });
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

interface TrustedDevicesProps {
  className?: string;
}

export function TrustedDevices({ className }: TrustedDevicesProps) {
  const { t } = useTranslation(["settings", "common"]);
  const { data: devices, isLoading } = useDevices();
  const removeDevice = useRemoveDevice();
  const toggleTrust = useToggleTrust();
  const revokeAllUnlocks = useRevokeAllUnlocks();
  const [removeDialogId, setRemoveDialogId] = useState<string | null>(null);
  const [revokeAllOpen, setRevokeAllOpen] = useState(false);
  const [currentDeviceId, setCurrentDeviceId] = useState<string | null>(null);

  // Load current device ID on mount
  React.useEffect(() => {
    getDeviceId().then(setCurrentDeviceId);
  }, []);

  const handleRemove = useCallback(
    async (deviceId: string) => {
      try {
        await removeDevice.mutateAsync(deviceId);
        toast.success(
          t("security.devices.removeSuccess", "Device removed"),
        );
        setRemoveDialogId(null);
      } catch {
        toast.error(
          t("security.devices.removeError", "Failed to remove device"),
        );
      }
    },
    [removeDevice, t],
  );

  const handleToggleTrust = useCallback(
    async (deviceId: string, currentTrust: boolean) => {
      try {
        await toggleTrust.mutateAsync({
          deviceId,
          trust: !currentTrust,
        });
        toast.success(
          !currentTrust
            ? t("security.devices.trusted", "Device trusted")
            : t("security.devices.untrusted", "Device untrusted"),
        );
      } catch {
        toast.error(
          t("security.devices.trustError", "Failed to update device trust"),
        );
      }
    },
    [toggleTrust, t],
  );

  // Nulls `persistentUnlockExpiresAt` on every device row server-side, then
  // drops this device's local wrap immediately. Other devices lose their
  // silent restore at next session start (bootstrap revocation check).
  const handleRevokeAllUnlocks = useCallback(async () => {
    try {
      await revokeAllUnlocks.mutateAsync();
      await clearPersistence();
      toast.success(
        t(
          "security.devices.revokeAllUnlocks.success",
          "Remembered unlocks revoked on all devices",
        ),
      );
      setRevokeAllOpen(false);
    } catch {
      toast.error(
        t(
          "security.devices.revokeAllUnlocks.error",
          "Failed to revoke remembered unlocks",
        ),
      );
    }
  }, [revokeAllUnlocks, t]);

  if (isLoading) {
    return (
      <Card className={cn("w-full", className)}>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-60" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("w-full", className)}>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Monitor className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg">
            {t("security.devices.title", "Trusted Devices")}
          </CardTitle>
        </div>
        <CardDescription>
          {t(
            "security.devices.description",
            "Devices that have been registered with your account. Only trusted devices can access your vault without re-entering your Secret Key.",
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!devices || devices.length === 0 ? (
          <div className="rounded-lg border border-border bg-muted/30 p-4 text-center">
            <p className="text-sm text-muted-foreground">
              {t(
                "security.devices.none",
                "No devices registered yet.",
              )}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {devices.map((device) => {
              const isCurrent = device.id === currentDeviceId;
              return (
                <div
                  key={device.id}
                  className={cn(
                    "flex items-center justify-between rounded-lg border p-4",
                    isCurrent && "border-primary/50 bg-primary/5",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        "mt-0.5",
                        isCurrent
                          ? "text-primary"
                          : "text-muted-foreground",
                      )}
                    >
                      <DeviceTypeIcon type={device.deviceType} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">
                          {device.deviceName}
                        </span>
                        {isCurrent && (
                          <Badge variant="secondary" className="text-xs">
                            {t("security.devices.current", "This device")}
                          </Badge>
                        )}
                        {device.trusted ? (
                          <Badge
                            variant="outline"
                            className="gap-1 text-xs bg-green-50 text-green-900 border-green-200 dark:bg-green-900/20 dark:text-green-300"
                          >
                            <ShieldCheck className="h-3 w-3" />
                            {t("security.devices.trustedBadge", "Trusted")}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="gap-1 text-xs">
                            <ShieldOff className="h-3 w-3" />
                            {t("security.devices.untrustedBadge", "Untrusted")}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {device.lastIp && `${device.lastIp} · `}
                        {t("security.devices.lastSeen", "Last seen")}{" "}
                        {formatLastSeen(device.lastSeen, t)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    {!isCurrent && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="min-h-[44px] text-sm"
                          onClick={() =>
                            handleToggleTrust(device.id, device.trusted)
                          }
                          disabled={toggleTrust.isPending}
                        >
                          {device.trusted
                            ? t("security.devices.revokeTrust", "Revoke Trust")
                            : t("security.devices.trust", "Trust")}
                        </Button>

                        <AlertDialog
                          open={removeDialogId === device.id}
                          onOpenChange={(open) =>
                            setRemoveDialogId(open ? device.id : null)
                          }
                        >
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="min-h-[44px] min-w-[44px] text-destructive hover:bg-destructive/10 hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                              <span className="sr-only">
                                {t("security.devices.remove", "Remove")}
                              </span>
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                {t(
                                  "security.devices.removeConfirm.title",
                                  "Remove device?",
                                )}
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                {t(
                                  "security.devices.removeConfirm.description",
                                  "This device will need to be re-registered to access your vault. The Secret Key will be required on next login from this device.",
                                )}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel className="min-h-[44px]">
                                {t("common.cancel", "Cancel")}
                              </AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleRemove(device.id)}
                                disabled={removeDevice.isPending}
                                className="min-h-[44px] bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                {removeDevice.isPending ? (
                                  <>
                                    <Loader2 className="me-2 h-4 w-4 animate-spin" />
                                    {t("common.loading", "Loading...")}
                                  </>
                                ) : (
                                  t("security.devices.remove", "Remove")
                                )}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Server-side kill switch for persistent unlock */}
        <div className="mt-4 flex justify-end">
          <AlertDialog open={revokeAllOpen} onOpenChange={setRevokeAllOpen}>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="min-h-[44px] text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
              >
                <ShieldOff className="h-4 w-4 me-2" />
                {t(
                  "security.devices.revokeAllUnlocks.button",
                  "Revoke remembered unlocks on all devices",
                )}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t(
                    "security.devices.revokeAllUnlocks.confirmTitle",
                    "Revoke remembered unlocks?",
                  )}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {t(
                    "security.devices.revokeAllUnlocks.confirmDescription",
                    "Every device will ask for your master password again. Devices that are offline right now will ask the next time they come online.",
                  )}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="min-h-[44px]">
                  {t("common.cancel", "Cancel")}
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleRevokeAllUnlocks}
                  disabled={revokeAllUnlocks.isPending}
                  className="min-h-[44px] bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {revokeAllUnlocks.isPending ? (
                    <>
                      <Loader2 className="me-2 h-4 w-4 animate-spin" />
                      {t("common.loading", "Loading...")}
                    </>
                  ) : (
                    t("security.devices.revokeAllUnlocks.confirm", "Revoke")
                  )}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}
