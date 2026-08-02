// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Backup Codes Component
 *
 * Display and manage 2FA backup codes with:
 * - View existing codes
 * - Copy all codes
 * - Download as file
 * - Regenerate codes
 *
 * @module components/dashboard/settings/security/BackupCodes
 */

import * as React from "react";
import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Key,
  Copy,
  Check,
  Download,
  RefreshCw,
  Loader2,
  AlertTriangle,
  Eye,
  EyeOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { copySensitiveText } from "@/lib/clipboard";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  useBackupCodes,
  useRegenerateBackupCodes,
} from "@/hooks/deployment/useSecurity";

// =============================================================================
// Types
// =============================================================================

interface BackupCodesProps {
  /** Optional className */
  className?: string;
}

// =============================================================================
// Component
// =============================================================================

export function BackupCodes({ className }: BackupCodesProps) {
  const { t } = useTranslation("settings");

  // State
  const [showCodes, setShowCodes] = useState(false);
  const [copiedCodes, setCopiedCodes] = useState(false);
  const [regenerateCode, setRegenerateCode] = useState("");
  const [regenerateDialogOpen, setRegenerateDialogOpen] = useState(false);

  // Queries and mutations
  const { data: backupCodesData, isLoading } = useBackupCodes();
  const regenerateBackupCodes = useRegenerateBackupCodes();

  const codes = backupCodesData?.codes || [];

  // Handlers
  const handleCopyAll = useCallback(async () => {
    const codesText = codes.join("\n");
    // SECURITY (Round 4, fix #31): schedules a 30s clipboard auto-wipe
    await copySensitiveText(codesText);
    setCopiedCodes(true);
    toast.success(t("security.twoFactor.codesCopied"));
    setTimeout(() => setCopiedCodes(false), 2000);
  }, [codes, t]);

  const handleDownload = useCallback(() => {
    const codesText = codes.join("\n");
    const blob = new Blob([codesText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "backup-codes.txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(t("security.twoFactor.backupCodes.downloaded", "Backup codes downloaded"));
  }, [codes, t]);

  const handleRegenerateCodeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value.replace(/\D/g, "").slice(0, 6);
      setRegenerateCode(value);
    },
    []
  );

  const handleRegenerate = useCallback(async () => {
    if (regenerateCode.length !== 6) {
      toast.error(t("security.twoFactor.invalidCode"));
      return;
    }

    const result = await regenerateBackupCodes.mutateAsync(regenerateCode);
    if (result) {
      toast.success(
        t(
          "security.twoFactor.backupCodes.regenerated",
          "Backup codes regenerated"
        )
      );
      setRegenerateDialogOpen(false);
      setRegenerateCode("");
      setShowCodes(true);
    } else {
      toast.error(
        t(
          "security.twoFactor.backupCodes.regenerateFailed",
          "Failed to regenerate backup codes"
        )
      );
    }
  }, [regenerateCode, regenerateBackupCodes, t]);

  if (isLoading) {
    return (
      <Card className={cn("w-full", className)}>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!codes.length) {
    return (
      <Card className={cn("w-full", className)}>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Key className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">
              {t("security.twoFactor.backupCodesTitle")}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {t("security.twoFactor.noBackupCodes")}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("w-full", className)}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Key className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">
              {t("security.twoFactor.backupCodesTitle")}
            </CardTitle>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowCodes(!showCodes)}
            className="min-h-[44px] min-w-[44px]"
          >
            {showCodes ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
            <span className="ms-2 hidden sm:inline">
              {showCodes ? t("common.hide", "Hide") : t("common.show", "Show")}
            </span>
          </Button>
        </div>
        <CardDescription>
          {t("security.twoFactor.backupCodesDescription")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Usage info */}
        {backupCodesData && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>
              {t(
                "security.twoFactor.backupCodes.remaining",
                "{{remaining}} of {{total}} codes remaining",
                {
                  remaining:
                    backupCodesData.totalCount - backupCodesData.usedCount,
                  total: backupCodesData.totalCount,
                }
              )}
            </span>
          </div>
        )}

        {/* Backup Codes Grid */}
        {showCodes ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {codes.map((code, index) => (
              <code
                key={index}
                className="rounded bg-muted px-3 py-2 text-center font-mono text-sm"
              >
                {code}
              </code>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-muted/30 p-8 text-center">
            <p className="text-sm text-muted-foreground">
              {t(
                "security.twoFactor.backupCodes.hidden",
                "Codes are hidden. Click Show to reveal them."
              )}
            </p>
          </div>
        )}
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={handleCopyAll}
          disabled={!showCodes}
          className="min-h-[44px]"
        >
          {copiedCodes ? (
            <>
              <Check className="me-2 h-4 w-4 text-green-600" />
              {t("security.twoFactor.backupCodes.copied")}
            </>
          ) : (
            <>
              <Copy className="me-2 h-4 w-4" />
              {t("security.twoFactor.backupCodes.copy")}
            </>
          )}
        </Button>
        <Button
          variant="outline"
          onClick={handleDownload}
          disabled={!showCodes}
          className="min-h-[44px]"
        >
          <Download className="me-2 h-4 w-4" />
          {t("security.twoFactor.backupCodes.download")}
        </Button>

        {/* Regenerate Dialog */}
        <AlertDialog
          open={regenerateDialogOpen}
          onOpenChange={setRegenerateDialogOpen}
        >
          <AlertDialogTrigger asChild>
            <Button variant="outline" className="min-h-[44px]">
              <RefreshCw className="me-2 h-4 w-4" />
              {t("security.twoFactor.backupCodes.regenerate")}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
                {t(
                  "security.twoFactor.backupCodes.regenerate.title",
                  "Regenerate Backup Codes"
                )}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t("security.twoFactor.backupCodes.regenerate.warning")}
              </AlertDialogDescription>
            </AlertDialogHeader>

            {/* Warning */}
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                {t(
                  "security.twoFactor.backupCodes.regenerate.warningDetail",
                  "This will invalidate all your existing backup codes. Make sure to save the new codes."
                )}
              </p>
            </div>

            {/* Verification Code */}
            <div className="space-y-2">
              <Label htmlFor="regenerate-code">
                {t("security.twoFactor.enterCode")}
              </Label>
              <Input
                id="regenerate-code"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="000000"
                value={regenerateCode}
                onChange={handleRegenerateCodeChange}
                className="min-h-[44px] text-center text-2xl tracking-widest font-mono"
                maxLength={6}
                autoComplete="one-time-code"
              />
            </div>

            <AlertDialogFooter>
              <AlertDialogCancel className="min-h-[44px]">
                {t("common.cancel")}
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleRegenerate}
                disabled={
                  regenerateCode.length !== 6 ||
                  regenerateBackupCodes.isPending
                }
                className="min-h-[44px]"
              >
                {regenerateBackupCodes.isPending ? (
                  <>
                    <Loader2 className="me-2 h-4 w-4 animate-spin" />
                    {t("common.loading", "Loading...")}
                  </>
                ) : (
                  t("security.twoFactor.backupCodes.regenerate.confirm")
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardFooter>
    </Card>
  );
}

export default BackupCodes;
