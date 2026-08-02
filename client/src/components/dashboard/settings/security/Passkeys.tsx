// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Passkeys Component
 *
 * Register, list, and delete WebAuthn passkeys for passwordless authentication.
 *
 * @module components/dashboard/settings/security/Passkeys
 */

import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Fingerprint,
  Plus,
  Trash2,
  Loader2,
  ShieldCheck,
  Smartphone,
  Monitor,
  Cloud,
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
import { Input } from "@/components/ui/input";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  usePasskeys,
  useRegisterPasskey,
  useDeletePasskey,
} from "@/hooks/deployment/useSecurity";
import type { Passkey } from "@/hooks/deployment/useSecurity";

// =============================================================================
// Helpers
// =============================================================================

function DeviceTypeIcon({ type }: { type: string }) {
  switch (type) {
    case "singleDevice":
      return <Smartphone className="h-4 w-4" />;
    case "multiDevice":
      return <Cloud className="h-4 w-4" />;
    default:
      return <Monitor className="h-4 w-4" />;
  }
}

function useDeviceTypeLabel() {
  const { t } = useTranslation("settings");
  return (type: string): string => {
    switch (type) {
      case "singleDevice":
        return t("security.passkeys.deviceType.singleDevice", "Single device");
      case "multiDevice":
        return t("security.passkeys.deviceType.multiDevice", "Synced across devices");
      default:
        return type;
    }
  };
}

function useFormatCreatedAt() {
  const { t } = useTranslation("settings");
  return (dateStr: string | null): string => {
    if (!dateStr) return t("security.passkeys.dateUnknown", "Unknown");
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };
}

// =============================================================================
// Types
// =============================================================================

interface PasskeysProps {
  className?: string;
}

// =============================================================================
// Component
// =============================================================================

export function Passkeys({ className }: PasskeysProps) {
  const { t } = useTranslation("settings");
  const deviceTypeLabel = useDeviceTypeLabel();
  const formatCreatedAt = useFormatCreatedAt();
  const { data: passkeys, isLoading } = usePasskeys();
  const registerPasskey = useRegisterPasskey();
  const deletePasskey = useDeletePasskey();

  const [deleteDialogId, setDeleteDialogId] = useState<string | null>(null);
  const [showRegisterDialog, setShowRegisterDialog] = useState(false);
  const [passkeyName, setPasskeyName] = useState("");

  const handleRegister = useCallback(async () => {
    try {
      await registerPasskey.mutateAsync({
        name: passkeyName.trim() || undefined,
      });
      toast.success(
        t("security.passkeys.registerSuccess", "Passkey registered"),
      );
      setShowRegisterDialog(false);
      setPasskeyName("");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to register passkey";

      // Don't show error for user cancellation
      if (
        message.includes("cancelled") ||
        message.includes("canceled") ||
        message.includes("NotAllowedError") ||
        message.includes("AbortError")
      ) {
        return;
      }

      toast.error(
        t("security.passkeys.registerError", "Failed to register passkey"),
      );
    }
  }, [registerPasskey, passkeyName, t]);

  const handleDelete = useCallback(
    async (passkeyId: string) => {
      try {
        await deletePasskey.mutateAsync(passkeyId);
        toast.success(
          t("security.passkeys.deleteSuccess", "Passkey removed"),
        );
        setDeleteDialogId(null);
      } catch {
        toast.error(
          t("security.passkeys.deleteError", "Failed to remove passkey"),
        );
      }
    },
    [deletePasskey, t],
  );

  // Loading state
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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Fingerprint className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">
              {t("security.passkeys.title", "Passkeys")}
            </CardTitle>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="min-h-[44px]"
            onClick={() => setShowRegisterDialog(true)}
          >
            <Plus className="me-2 h-4 w-4" />
            {t("security.passkeys.add", "Add Passkey")}
          </Button>
        </div>
        <CardDescription>
          {t(
            "security.passkeys.description",
            "Passkeys let you sign in with biometrics, a security key, or your device PIN instead of a password.",
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!passkeys || passkeys.length === 0 ? (
          <div className="rounded-lg border border-border bg-muted/30 p-4 text-center">
            <p className="text-sm text-muted-foreground">
              {t(
                "security.passkeys.none",
                "No passkeys registered yet. Add a passkey for passwordless sign-in.",
              )}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {passkeys.map((pk: Passkey) => (
              <div
                key={pk.id}
                className="flex items-center justify-between rounded-lg border p-4"
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 text-muted-foreground">
                    <DeviceTypeIcon type={pk.deviceType} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">
                        {pk.name || t("security.passkeys.unnamed", "Unnamed passkey")}
                      </span>
                      {pk.backedUp && (
                        <Badge
                          variant="outline"
                          className="gap-1 text-xs bg-green-50 text-green-900 border-green-200 dark:bg-green-900/20 dark:text-green-300"
                        >
                          <ShieldCheck className="h-3 w-3" />
                          {t("security.passkeys.backedUp", "Backed up")}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {deviceTypeLabel(pk.deviceType)} &middot;{" "}
                      {t("security.passkeys.created", "Created")}{" "}
                      {formatCreatedAt(pk.createdAt)}
                    </p>
                  </div>
                </div>

                <AlertDialog
                  open={deleteDialogId === pk.id}
                  onOpenChange={(open) =>
                    setDeleteDialogId(open ? pk.id : null)
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
                        {t("security.passkeys.delete", "Remove passkey")}
                      </span>
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        {t(
                          "security.passkeys.deleteConfirm.title",
                          "Remove passkey?",
                        )}
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        {t(
                          "security.passkeys.deleteConfirm.description",
                          "This passkey will be removed and can no longer be used to sign in. You can register a new one at any time.",
                        )}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel className="min-h-[44px]">
                        {t("common.cancel", "Cancel")}
                      </AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => handleDelete(pk.id)}
                        disabled={deletePasskey.isPending}
                        className="min-h-[44px] bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        {deletePasskey.isPending ? (
                          <>
                            <Loader2 className="me-2 h-4 w-4 animate-spin" />
                            {t("common.loading", "Loading...")}
                          </>
                        ) : (
                          t("security.passkeys.delete", "Remove passkey")
                        )}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ))}
          </div>
        )}

        {/* Register Passkey Dialog */}
        <Dialog open={showRegisterDialog} onOpenChange={setShowRegisterDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {t("security.passkeys.registerTitle", "Add a passkey")}
              </DialogTitle>
              <DialogDescription>
                {t(
                  "security.passkeys.registerDescription",
                  "Give your passkey a name to help identify it later, then follow the browser prompt to complete registration.",
                )}
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Input
                placeholder={t(
                  "security.passkeys.namePlaceholder",
                  'e.g. "MacBook Touch ID", "YubiKey 5"',
                )}
                value={passkeyName}
                onChange={(e) => setPasskeyName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !registerPasskey.isPending) {
                    handleRegister();
                  }
                }}
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShowRegisterDialog(false);
                  setPasskeyName("");
                }}
                className="min-h-[44px]"
              >
                {t("common.cancel", "Cancel")}
              </Button>
              <Button
                onClick={handleRegister}
                disabled={registerPasskey.isPending}
                className="min-h-[44px]"
              >
                {registerPasskey.isPending ? (
                  <>
                    <Loader2 className="me-2 h-4 w-4 animate-spin" />
                    {t("security.passkeys.registering", "Registering...")}
                  </>
                ) : (
                  <>
                    <Fingerprint className="me-2 h-4 w-4" />
                    {t("security.passkeys.register", "Register Passkey")}
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
