// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Two-Factor Authentication Disable Component
 *
 * Dialog for disabling 2FA with verification code requirement.
 *
 * @module components/dashboard/settings/security/TwoFactorDisable
 */

import * as React from "react";
import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { ShieldAlert, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { toast } from "sonner";
import { useDisable2FA } from "@/hooks/deployment/useSecurity";

// =============================================================================
// Types
// =============================================================================

interface TwoFactorDisableProps {
  /** Callback when 2FA is disabled */
  onDisabled?: () => void;
  /** Trigger element (defaults to a button) */
  trigger?: React.ReactNode;
  /** Optional className */
  className?: string;
}

// =============================================================================
// Component
// =============================================================================

export function TwoFactorDisable({
  onDisabled,
  trigger,
  className,
}: TwoFactorDisableProps) {
  const { t } = useTranslation("settings");
  const [open, setOpen] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");

  const disable2FA = useDisable2FA();

  const handleCodeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value.replace(/\D/g, "").slice(0, 6);
      setVerificationCode(value);
    },
    []
  );

  const handleDisable = useCallback(async () => {
    if (verificationCode.length !== 6) {
      toast.error(t("security.twoFactor.invalidCode"));
      return;
    }

    const result = await disable2FA.mutateAsync(verificationCode);
    if (result.success) {
      toast.success(t("security.twoFactor.disabledSuccess"));
      setOpen(false);
      setVerificationCode("");
      onDisabled?.();
    } else {
      toast.error(result.error || t("security.twoFactor.disableFailed"));
    }
  }, [verificationCode, disable2FA, t, onDisabled]);

  const handleOpenChange = useCallback((newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      setVerificationCode("");
    }
  }, []);

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger asChild>
        {trigger || (
          <Button variant="destructive" className={className}>
            <ShieldAlert className="me-2 h-4 w-4" />
            {t("security.twoFactor.disable")}
          </Button>
        )}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            {t("security.twoFactor.disableTitle")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("security.twoFactor.disableDescription")}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* Warning */}
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <p className="text-sm text-destructive">
            {t(
              "security.twoFactor.disable.warning",
              "Disabling 2FA will make your account less secure. You will no longer need a verification code to sign in."
            )}
          </p>
        </div>

        {/* Verification Code Input */}
        <div className="space-y-2">
          <Label htmlFor="disable-verification-code">
            {t("security.twoFactor.enterCode")}
          </Label>
          <Input
            id="disable-verification-code"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="000000"
            value={verificationCode}
            onChange={handleCodeChange}
            className="min-h-[44px] text-center text-2xl tracking-widest font-mono"
            maxLength={6}
            autoComplete="one-time-code"
          />
          <p className="text-xs text-muted-foreground">
            {t(
              "security.twoFactor.disable.codeHint",
              "Enter the 6-digit code from your authenticator app"
            )}
          </p>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel className="min-h-[44px]">
            {t("common.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDisable}
            disabled={verificationCode.length !== 6 || disable2FA.isPending}
            className="min-h-[44px] bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {disable2FA.isPending ? (
              <>
                <Loader2 className="me-2 h-4 w-4 animate-spin" />
                {t("common.loading", "Loading...")}
              </>
            ) : (
              t("security.twoFactor.disable")
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default TwoFactorDisable;
