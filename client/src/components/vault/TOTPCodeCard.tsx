// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * TOTP Code Card
 *
 * Displays a TOTP authenticator item with live rotating code,
 * SVG circular countdown timer, and copy-to-clipboard functionality.
 * Used in the authenticators tab of the vault page.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { copySensitiveText } from "@/lib/clipboard";
import { toast } from "sonner";
import {
  generateTOTP,
  base32Decode,
  getRemainingSeconds,
  type TOTPConfig,
} from "@/services/totp-engine";
import type { DecryptedVaultItem } from "./VaultItemCard";

// ── Helpers ──────────────────────────────────────────────────────────

/** Format a TOTP code with a thin space in the middle (e.g. "123 456"). */
function formatCode(code: string): string {
  if (code.length <= 3) return code;
  const mid = Math.ceil(code.length / 2);
  return code.slice(0, mid) + "\u2009" + code.slice(mid);
}

// ── Circular Countdown ──────────────────────────────────────────────

interface CircularCountdownProps {
  remaining: number;
  period: number;
  size?: number;
}

function CircularCountdown({ remaining, period, size = 36 }: CircularCountdownProps) {
  const { t } = useTranslation("vault");
  const strokeWidth = 2.5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - remaining / period);
  const urgency = remaining <= 5;

  return (
    <div
      className="relative flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
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
          "absolute text-[10px] font-mono tabular-nums",
          urgency ? "text-destructive" : "text-muted-foreground",
        )}
        aria-label={t("vault:totp.secondsRemaining", "{{remaining}} seconds remaining", { remaining })}
      >
        {remaining}
      </span>
    </div>
  );
}

// ── Component ────────────────────────────────────────────────────────

interface TOTPCodeCardProps {
  item: DecryptedVaultItem;
  onSelect: (item: DecryptedVaultItem) => void;
}

export function TOTPCodeCard({ item, onSelect }: TOTPCodeCardProps) {
  const { t } = useTranslation(["common", "vault"]);
  const d = item.decrypted;
  const secret = (d.secret as string) || "";
  const period = (d.period as number) || 30;

  const [code, setCode] = useState("");
  const [remaining, setRemaining] = useState(0);
  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!secret) return;

    let mounted = true;

    async function generate() {
      try {
        const key = base32Decode(secret);
        const config: Partial<TOTPConfig> & Pick<TOTPConfig, "secret"> = {
          secret: key,
          algorithm: ((d.algorithm as string) || "SHA1") as TOTPConfig["algorithm"],
          digits: ((d.digits as number) || 6) as TOTPConfig["digits"],
          period,
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
  }, [secret, d.algorithm, d.digits, period]);

  // SECURITY (Round 4, fix #31): the 30s clipboard auto-wipe lives in
  // @/lib/clipboard (module-level timer) so it survives unmount; only
  // the cosmetic "Copied!" indicator timer is cleared here.
  useEffect(() => {
    return () => {
      clearTimeout(copiedTimerRef.current);
    };
  }, []);

  const handleCopy = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!code) return;
      try {
        // Copies and schedules the 30s clipboard auto-wipe (survives unmount)
        await copySensitiveText(code);
        setCopied(true);
        clearTimeout(copiedTimerRef.current);
        copiedTimerRef.current = setTimeout(() => setCopied(false), 2000);
        toast.success(t("vault.codeCopied", "Code copied"), { duration: 2000 });
      } catch {
        toast.error(t("vault.copyFailed", "Failed to copy"));
      }
    },
    [code, t],
  );

  const label = (d.issuer as string) || (d.title as string) || t("vault:totp.defaultIssuer", "TOTP");
  const account = (d.account as string) || "";

  return (
    <Card
      className="rounded-lg border bg-card text-card-foreground shadow-sm hover:bg-muted/50 transition-colors duration-150 cursor-pointer"
      onClick={() => onSelect(item)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(item);
        }
      }}
    >
      <div className="flex items-center gap-3 p-4">
        <CircularCountdown remaining={remaining} period={period} />

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{label}</p>
          {account && (
            <p className="text-xs text-muted-foreground truncate">{account}</p>
          )}
          <p
            className="text-xl font-mono tracking-widest mt-1"
            aria-live="polite"
          >
            {code ? formatCode(code) : t("vault:placeholderCode", "--- ---")}
          </p>
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 shrink-0"
          onClick={handleCopy}
          aria-label={t("vault.copyCode", "Copy code")}
        >
          {copied ? (
            <Check className="h-4 w-4 text-green-600" />
          ) : (
            <Copy className="h-4 w-4 text-muted-foreground" />
          )}
        </Button>
      </div>
    </Card>
  );
}

