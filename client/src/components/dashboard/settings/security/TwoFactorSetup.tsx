// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Two-Factor Authentication Setup Component
 *
 * Step-by-step wizard for enabling 2FA with:
 * - QR code display
 * - Manual entry option
 * - Code verification
 * - Backup codes display
 *
 * @module components/dashboard/settings/security/TwoFactorSetup
 */

import * as React from "react";
import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Smartphone,
  QrCode,
  CheckCircle2,
  Copy,
  Check,
  Loader2,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { copySensitiveText } from "@/lib/clipboard";
import { toast } from "sonner";
import { useEnable2FA, useVerify2FA } from "@/hooks/deployment/useSecurity";
import type { TwoFactorSetup as TwoFactorSetupType } from "@/types/security";

// =============================================================================
// Types
// =============================================================================

interface TwoFactorSetupProps {
  /** Callback when setup is complete */
  onComplete?: (backupCodes: string[]) => void;
  /** Callback to cancel setup */
  onCancel?: () => void;
  /** Optional className */
  className?: string;
}

type SetupStep = "intro" | "scan" | "verify" | "complete";

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Extract the secret key from a TOTP URI
 * URI format: otpauth://totp/LABEL?secret=SECRET&issuer=ISSUER
 */
function extractSecretFromUri(uri: string): string {
  try {
    const url = new URL(uri);
    return url.searchParams.get("secret") || uri;
  } catch {
    // If parsing fails, return the original string
    return uri;
  }
}

// =============================================================================
// Component
// =============================================================================

export function TwoFactorSetup({
  onComplete,
  onCancel,
  className,
}: TwoFactorSetupProps) {
  const { t } = useTranslation("settings");

  // State
  const [step, setStep] = useState<SetupStep>("intro");
  const [setupData, setSetupData] = useState<TwoFactorSetupType | null>(null);
  const [verificationCode, setVerificationCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [copiedCodes, setCopiedCodes] = useState(false);

  // Mutations
  const enable2FA = useEnable2FA();
  const verify2FA = useVerify2FA();

  // Handlers
  const handleStartSetup = useCallback(async () => {
    const result = await enable2FA.mutateAsync();
    if (result.success && result.setup) {
      setSetupData(result.setup);
      setStep("scan");
    } else {
      toast.error(result.error || t("security.twoFactor.setupError"));
    }
  }, [enable2FA, t]);

  const handleVerify = useCallback(async () => {
    if (verificationCode.length !== 6) {
      toast.error(t("security.twoFactor.invalidCode"));
      return;
    }

    const result = await verify2FA.mutateAsync(verificationCode);
    if (result.success) {
      if (result.backupCodes) {
        setBackupCodes(result.backupCodes);
      } else if (setupData?.backupCodes) {
        setBackupCodes(setupData.backupCodes);
      }
      setStep("complete");
      toast.success(t("security.twoFactor.enabledSuccess"));
    } else {
      toast.error(result.error || t("security.twoFactor.verificationFailed"));
    }
  }, [verificationCode, verify2FA, setupData, t]);

  const handleCopySecret = useCallback(async () => {
    if (!setupData?.secret) return;
    const secretKey = extractSecretFromUri(setupData.secret);
    // SECURITY (Round 4, fix #31): schedules a 30s clipboard auto-wipe
    await copySensitiveText(secretKey);
    setCopiedSecret(true);
    toast.success(t("security.twoFactor.keyCopied"));
    setTimeout(() => setCopiedSecret(false), 2000);
  }, [setupData?.secret, t]);

  const handleCopyBackupCodes = useCallback(async () => {
    const codesText = backupCodes.join("\n");
    // SECURITY (Round 4, fix #31): schedules a 30s clipboard auto-wipe
    await copySensitiveText(codesText);
    setCopiedCodes(true);
    toast.success(t("security.twoFactor.codesCopied"));
    setTimeout(() => setCopiedCodes(false), 2000);
  }, [backupCodes, t]);

  const handleComplete = useCallback(() => {
    onComplete?.(backupCodes);
  }, [onComplete, backupCodes]);

  const handleCodeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value.replace(/\D/g, "").slice(0, 6);
      setVerificationCode(value);
    },
    []
  );

  // Render steps
  const renderIntroStep = () => (
    <Card className={cn("w-full", className)}>
      <CardHeader>
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <CardTitle>{t("security.twoFactor.setupTitle")}</CardTitle>
        </div>
        <CardDescription>
          {t("security.twoFactor.setupDescription")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border border-border bg-muted/30 p-4">
          <h4 className="mb-2 font-medium">
            {t("security.twoFactor.setup.step1.title", "Step 1: Install Authenticator App")}
          </h4>
          <p className="text-sm text-muted-foreground">
            {t(
              "security.twoFactor.setup.step1.description",
              "Download and install an authenticator app like Google Authenticator, Authy, or 1Password"
            )}
          </p>
        </div>
        <div className="flex items-center gap-4 rounded-lg border border-border bg-muted/30 p-4">
          <Smartphone className="h-10 w-10 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">
              {t("security.twoFactor.info", "Why enable 2FA?")}
            </p>
            <p className="text-sm text-muted-foreground">
              {t(
                "security.twoFactor.infoDetail",
                "Two-factor authentication adds an extra layer of security by requiring a code from your authenticator app."
              )}
            </p>
          </div>
        </div>
      </CardContent>
      <CardFooter className="flex justify-between">
        {onCancel && (
          <Button variant="outline" onClick={onCancel} className="min-h-[44px]">
            {t("common.cancel")}
          </Button>
        )}
        <Button
          onClick={handleStartSetup}
          disabled={enable2FA.isPending}
          className="min-h-[44px] ms-auto"
        >
          {enable2FA.isPending ? (
            <>
              <Loader2 className="me-2 h-4 w-4 animate-spin" />
              {t("common.loading", "Loading...")}
            </>
          ) : (
            <>
              {t("security.twoFactor.continue")}
              <ArrowRight className="ms-2 h-4 w-4" />
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
  );

  const renderScanStep = () => (
    <Card className={cn("w-full", className)}>
      <CardHeader>
        <div className="flex items-center gap-2">
          <QrCode className="h-5 w-5 text-primary" />
          <CardTitle>
            {t("security.twoFactor.setup.step2.title", "Step 2: Scan QR Code")}
          </CardTitle>
        </div>
        <CardDescription>
          {t(
            "security.twoFactor.setup.step2.description",
            "Open your authenticator app and scan this QR code"
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* QR Code */}
        <div className="flex justify-center">
          <div className="rounded-lg border border-border bg-white p-4">
            {setupData?.qrCodeUrl ? (
              <QRCodeSVG
                value={setupData.qrCodeUrl}
                size={192}
                level="M"
                includeMargin={false}
              />
            ) : (
              <div className="flex h-48 w-48 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>
        </div>

        {/* Manual Entry */}
        <div className="rounded-lg border border-border bg-muted/30 p-4">
          <p className="mb-2 text-sm font-medium">
            {t("security.twoFactor.manualEntry")}
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded bg-background px-3 py-2 font-mono text-sm break-all">
              {setupData?.secret ? extractSecretFromUri(setupData.secret) : "..."}
            </code>
            <Button
              variant="outline"
              size="icon"
              onClick={handleCopySecret}
              className="min-h-[44px] min-w-[44px]"
              aria-label={t("security.twoFactor.copySecretAriaLabel")}
            >
              {copiedSecret ? (
                <Check className="h-4 w-4 text-green-600" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </CardContent>
      <CardFooter className="flex justify-between">
        <Button
          variant="outline"
          onClick={() => setStep("intro")}
          className="min-h-[44px]"
        >
          <ArrowLeft className="me-2 h-4 w-4" />
          {t("common.back")}
        </Button>
        <Button onClick={() => setStep("verify")} className="min-h-[44px]">
          {t("security.twoFactor.continue")}
          <ArrowRight className="ms-2 h-4 w-4" />
        </Button>
      </CardFooter>
    </Card>
  );

  const renderVerifyStep = () => (
    <Card className={cn("w-full", className)}>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-primary" />
          <CardTitle>
            {t("security.twoFactor.setup.step3.title", "Step 3: Verify Code")}
          </CardTitle>
        </div>
        <CardDescription>
          {t(
            "security.twoFactor.setup.step3.description",
            "Enter the 6-digit code from your authenticator app"
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="verification-code">
            {t("security.twoFactor.enterCode")}
          </Label>
          <Input
            id="verification-code"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="000000"
            value={verificationCode}
            onChange={handleCodeChange}
            className="min-h-[44px] text-center text-2xl tracking-widest font-mono"
            maxLength={6}
            autoComplete="one-time-code"
            autoFocus
          />
        </div>
      </CardContent>
      <CardFooter className="flex justify-between">
        <Button
          variant="outline"
          onClick={() => setStep("scan")}
          className="min-h-[44px]"
        >
          <ArrowLeft className="me-2 h-4 w-4" />
          {t("common.back")}
        </Button>
        <Button
          onClick={handleVerify}
          disabled={verificationCode.length !== 6 || verify2FA.isPending}
          className="min-h-[44px]"
        >
          {verify2FA.isPending ? (
            <>
              <Loader2 className="me-2 h-4 w-4 animate-spin" />
              {t("security.twoFactor.setup.verifying", "Verifying...")}
            </>
          ) : (
            t("security.twoFactor.verify")
          )}
        </Button>
      </CardFooter>
    </Card>
  );

  const renderCompleteStep = () => (
    <Card className={cn("w-full", className)}>
      <CardHeader>
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-green-600" />
          <CardTitle>
            {t("security.twoFactor.backupCodesTitle", "Backup Codes")}
          </CardTitle>
        </div>
        <CardDescription>
          {t(
            "security.twoFactor.backupCodesDescription",
            "Use these codes if you lose access to your authenticator app. Each code can only be used once."
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Warning */}
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
          <p className="text-sm text-amber-800 dark:text-amber-200">
            {t(
              "security.twoFactor.backupCodes.warning",
              "Save these backup codes in a safe place. If you lose access to your authenticator app, you can use these codes to sign in."
            )}
          </p>
        </div>

        {/* Backup Codes Grid */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
          {backupCodes.map((code, index) => (
            <code
              key={index}
              className="rounded bg-muted px-3 py-2 text-center font-mono text-sm"
            >
              {code}
            </code>
          ))}
        </div>

        {/* Copy Button */}
        <Button
          variant="outline"
          onClick={handleCopyBackupCodes}
          className="w-full min-h-[44px]"
        >
          {copiedCodes ? (
            <>
              <Check className="me-2 h-4 w-4 text-green-600" />
              {t("security.twoFactor.backupCodes.copied")}
            </>
          ) : (
            <>
              <Copy className="me-2 h-4 w-4" />
              {t("security.twoFactor.copyAllCodes")}
            </>
          )}
        </Button>
      </CardContent>
      <CardFooter>
        <Button onClick={handleComplete} className="min-h-[44px] w-full">
          {t("security.twoFactor.done")}
        </Button>
      </CardFooter>
    </Card>
  );

  // Render based on step
  switch (step) {
    case "intro":
      return renderIntroStep();
    case "scan":
      return renderScanStep();
    case "verify":
      return renderVerifyStep();
    case "complete":
      return renderCompleteStep();
    default:
      return null;
  }
}

export default TwoFactorSetup;
