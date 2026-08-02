// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Copy, Printer, ShieldAlert, Check, Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { copySensitiveText } from "@/lib/clipboard";

export interface RecoveryKitProps {
  secretKeyBase32: string;
  email: string;
  onConfirm: () => void;
}

export function RecoveryKit({
  secretKeyBase32,
  email,
  onConfirm,
}: RecoveryKitProps) {
  const { t } = useTranslation("auth");
  const [confirmed, setConfirmed] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  const handleCopy = React.useCallback(async () => {
    try {
      // SECURITY (Round 4, fix #31): schedules a 30s clipboard auto-wipe
      await copySensitiveText(secretKeyBase32);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select text for manual copy
      const el = document.getElementById("recovery-secret-key");
      if (el) {
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    }
  }, [secretKeyBase32]);

  const handlePrint = React.useCallback(() => {
    window.print();
  }, []);

  const handleDownload = React.useCallback(() => {
    const content =
      `Password Manager — Recovery Kit\n` +
      `================================\n\n` +
      `Email:      ${email}\n` +
      `Secret Key: ${secretKeyBase32}\n\n` +
      `Keep this file offline. Without your Secret Key + master password,\n` +
      `your vault cannot be recovered — not even by us.\n`;
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "pssmngr-recovery-kit.txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }, [email, secretKeyBase32]);

  return (
    <div className="w-full max-w-md mx-auto space-y-6">
      {/* Warning */}
      <div className="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950/30">
        <ShieldAlert className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
        <div className="space-y-1 text-start">
          <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
            {t(
              "register.recoveryKit.warning",
              "Save your Secret Key now. You won't see it again.",
            )}
          </p>
          <p className="text-sm text-amber-800 dark:text-amber-300">
            {t(
              "register.recoveryKit.zeroKnowledge",
              "We use zero-knowledge encryption. Without this key, your vault cannot be recovered — not even by us.",
            )}
          </p>
        </div>
      </div>

      {/* Secret Key Display */}
      <div className="space-y-2">
        <Label className="text-start block text-sm font-medium">
          {t("register.recoveryKit.secretKeyLabel", "Your Secret Key")}
        </Label>
        <div className="rounded-md border bg-muted/50 p-4">
          <code
            id="recovery-secret-key"
            className="block text-center text-lg font-mono tracking-wider break-all select-all"
          >
            {secretKeyBase32}
          </code>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={handleCopy}
          >
            {copied ? (
              <Check className="h-4 w-4 me-1.5" />
            ) : (
              <Copy className="h-4 w-4 me-1.5" />
            )}
            {copied
              ? t("common.copied", "Copied")
              : t("common.copy", "Copy")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={handlePrint}
          >
            <Printer className="h-4 w-4 me-1.5" />
            {t("common.print", "Print")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={handleDownload}
            data-tour="recovery-kit-download"
          >
            <Download className="h-4 w-4 me-1.5" />
            {t("register.recoveryKit.download", "Download")}
          </Button>
        </div>
      </div>

      {/* Confirmation Checkbox */}
      <div className="flex items-start gap-2 pt-2">
        <Checkbox
          id="recovery-confirm"
          checked={confirmed}
          onCheckedChange={(checked) => setConfirmed(checked === true)}
        />
        <Label
          htmlFor="recovery-confirm"
          className="text-sm font-normal leading-tight cursor-pointer text-start"
        >
          {t(
            "register.recoveryKit.confirmSaved",
            "I have saved my Secret Key in a safe place. I understand that without it, my vault cannot be recovered.",
          )}
        </Label>
      </div>

      <Button
        type="button"
        className="w-full h-11"
        disabled={!confirmed}
        onClick={onConfirm}
      >
        {t("register.recoveryKit.continue", "Continue to Dashboard")}
      </Button>
    </div>
  );
}
