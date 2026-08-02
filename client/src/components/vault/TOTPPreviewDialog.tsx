// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * TOTP Preview Dialog
 *
 * Shows a preview of a scanned/parsed TOTP account with live code
 * generation before saving to the vault. Lets the user verify the
 * code matches their service and set a title.
 */

import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldCheck, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  generateTOTP,
  base32Decode,
  getRemainingSeconds,
  type TOTPConfig,
  type OTPAuthURI,
} from "@/services/totp-engine";

// ── Helpers ──────────────────────────────────────────────────────────

function formatCode(code: string): string {
  if (code.length <= 3) return code;
  const mid = Math.ceil(code.length / 2);
  return code.slice(0, mid) + "\u2009" + code.slice(mid);
}

// ── Component ────────────────────────────────────────────────────────

interface TOTPPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parsed: OTPAuthURI | null;
  onConfirm: (title: string, data: OTPAuthURI) => Promise<void>;
}

export function TOTPPreviewDialog({
  open,
  onOpenChange,
  parsed,
  onConfirm,
}: TOTPPreviewDialogProps) {
  const { t } = useTranslation(["common", "vault"]);
  const [code, setCode] = useState("");
  const [remaining, setRemaining] = useState(0);
  const [title, setTitle] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const period = parsed?.period || 30;

  // Reset title when dialog opens with new data
  useEffect(() => {
    if (parsed && open) {
      setTitle(parsed.issuer || parsed.account || "");
      setCode("");
    }
  }, [parsed, open]);

  // Generate live code
  useEffect(() => {
    if (!parsed?.secret || !open) return;

    let mounted = true;

    async function generate() {
      try {
        const secret = base32Decode(parsed!.secret);
        const config: Partial<TOTPConfig> & Pick<TOTPConfig, "secret"> = {
          secret,
          algorithm: (parsed!.algorithm as TOTPConfig["algorithm"]) || "SHA1",
          digits: (parsed!.digits as TOTPConfig["digits"]) || 6,
          period: parsed!.period || 30,
        };
        const result = await generateTOTP(config);
        if (mounted) setCode(result);
      } catch {
        if (mounted) setCode("");
      }
    }

    generate();
    setRemaining(getRemainingSeconds(period));

    const interval = setInterval(() => {
      const r = getRemainingSeconds(period);
      setRemaining(r);
      if (r === period || r === period - 1) generate();
    }, 1000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [parsed, period, open]);

  const handleConfirm = useCallback(async () => {
    if (!parsed || !title.trim()) return;
    setIsSaving(true);
    try {
      await onConfirm(title.trim(), parsed);
      onOpenChange(false);
    } finally {
      setIsSaving(false);
    }
  }, [parsed, title, onConfirm, onOpenChange]);

  if (!parsed) return null;

  const urgency = remaining <= 5;

  // SVG circular countdown
  const size = 48;
  const strokeWidth = 3;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - remaining / period);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            {t("totp.previewTitle", "Verify Authenticator")}
          </DialogTitle>
          <DialogDescription>
            {t(
              "totp.previewDescription",
              "Confirm the code matches what your service shows.",
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-4">
          {/* Issuer + Account */}
          <div className="text-center">
            <p className="text-sm font-medium">
              {parsed.issuer || t("vault:totp.defaultIssuer", "TOTP")}
            </p>
            {parsed.account && (
              <p className="text-xs text-muted-foreground">{parsed.account}</p>
            )}
          </div>

          {/* Live code with circular countdown */}
          <div className="flex items-center gap-4">
            <div
              className="relative flex items-center justify-center shrink-0"
              style={{ width: size, height: size }}
            >
              <svg
                width={size}
                height={size}
                className="-rotate-90"
                aria-hidden="true"
              >
                <circle
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={strokeWidth}
                  className="text-muted"
                />
                <circle
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={strokeWidth}
                  strokeDasharray={circumference}
                  strokeDashoffset={offset}
                  strokeLinecap="round"
                  className={urgency ? "text-destructive" : "text-primary"}
                />
              </svg>
              <span
                className={cn(
                  "absolute text-xs font-mono tabular-nums",
                  urgency ? "text-destructive" : "text-muted-foreground",
                )}
              >
                {remaining}
              </span>
            </div>

            <p
              className="text-3xl font-mono tracking-widest"
              aria-live="polite"
            >
              {code ? formatCode(code) : t("vault:placeholderCode", "--- ---")}
            </p>
          </div>

          {/* Title input */}
          <div className="flex flex-col gap-2 w-full">
            <Label htmlFor="totp-preview-title">
              {t("vault:itemTitle", "Title")}
            </Label>
            <Input
              id="totp-preview-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("vault.titlePlaceholder", "e.g. GitHub, Google")}
              onKeyDown={(e) => {
                if (e.key === "Enter" && title.trim()) handleConfirm();
              }}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            {t("common.cancel", "Cancel")}
          </Button>
          <Button onClick={handleConfirm} disabled={isSaving || !title.trim()}>
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 me-2 animate-spin" />
                {t("vault.encrypting", "Encrypting...")}
              </>
            ) : (
              t("totp.saveAuthenticator", "Save Authenticator")
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
