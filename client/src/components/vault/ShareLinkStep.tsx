// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * ShareLinkStep
 *
 * Ephemeral link creation body. Extracted verbatim from the former
 * EphemeralShareDialog body. The key remains in the URL fragment
 * only — never sent to the transport.
 */

import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Link2,
  Loader2,
  AlertCircle,
  Clock,
  Lock,
  Copy,
  Check,
  Globe,
} from "lucide-react";
import { trpcMutation } from "@/lib/api/trpc";
import { copySensitiveText } from "@/lib/clipboard";
import { config } from "@/lib/config";
import type { EphemeralExpiry } from "@/types/sharing";

function getShareBaseUrl() {
  if (typeof window !== "undefined" && window.location.origin) {
    return window.location.origin.replace(/\/$/, "");
  }
  return config.siteUrl.replace(/\/$/, "");
}

interface ShareLinkStepProps {
  itemTitle: string;
  itemData: string;
  onCancel: () => void;
  onBack?: () => void;
}

type Step = "configure" | "result";

export function ShareLinkStep({
  itemTitle,
  itemData,
  onCancel,
  onBack,
}: ShareLinkStepProps) {
  const { t } = useTranslation(["common", "vault"]);

  const [expiresIn, setExpiresIn] = useState<EphemeralExpiry>("24h");
  const [passphrase, setPassphrase] = useState("");
  const [maxAccesses, setMaxAccesses] = useState(1);
  const [ipRestriction, setIpRestriction] = useState("");
  const [label] = useState("");

  const [step, setStep] = useState<Step>("configure");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedLink, setGeneratedLink] = useState("");
  const [copied, setCopied] = useState(false);

  const handleCreate = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setIsCreating(true);

      try {
        const mod = (await import("@pssmngr/crypto")) as unknown as {
          encryptForEphemeralShare: (data: string, pass?: string) => Promise<{
            encryptedBlob: string;
            nonce: string;
            authTag: string;
            linkKey: string;
            passphraseSalt: string | null;
          }>;
        };
        const { encryptForEphemeralShare } = mod;

        const hasPass = passphrase.length > 0;
        const encrypted = await encryptForEphemeralShare(
          itemData,
          hasPass ? passphrase : undefined,
        );

        const result = await trpcMutation<{ id: string; expiresAt: string }>(
          "sharing",
          "createEphemeralLink",
          {
            encryptedBlob: encrypted.encryptedBlob,
            nonce: encrypted.nonce,
            authTag: encrypted.authTag,
            hasPassphrase: hasPass,
            passphraseSalt: encrypted.passphraseSalt,
            expiresIn,
            maxAccesses,
            ipRestriction: ipRestriction.trim() || null,
            label: label.trim() || itemTitle,
          },
        );

        const baseUrl = getShareBaseUrl();
        const link = `${baseUrl}/share/${result.id}#${encrypted.linkKey}`;
        setGeneratedLink(link);
        setStep("result");
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : typeof err === "object" && err !== null && "message" in err
              ? String((err as { message: string }).message)
              : t("ephemeral.createError", "Failed to create link");
        setError(message);
      } finally {
        setIsCreating(false);
      }
    },
    [
      itemData,
      itemTitle,
      passphrase,
      expiresIn,
      maxAccesses,
      ipRestriction,
      label,
      t,
    ],
  );

  const handleCopy = useCallback(async () => {
    // SECURITY (Round 4, fix #31): the URL #fragment IS the decryption key,
    // so schedule the 30s clipboard auto-wipe like other secrets.
    await copySensitiveText(generatedLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [generatedLink]);

  const expiryLabels: Record<EphemeralExpiry, string> = {
    "1h": t("ephemeral.expiry1h", "1 hour"),
    "24h": t("ephemeral.expiry24h", "24 hours"),
    "7d": t("ephemeral.expiry7d", "7 days"),
  };

  if (step === "result") {
    return (
      <div className="flex flex-col gap-4 mt-2">
        <div className="flex flex-col gap-2">
          <Label>{t("ephemeral.yourLink", "Your sharing link")}</Label>
          <div className="flex items-center gap-2">
            <Input
              readOnly
              value={generatedLink}
              className="font-mono text-xs"
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={handleCopy}
              className="flex-shrink-0"
            >
              {copied ? (
                <Check className="h-4 w-4 text-green-600" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        <div className="text-sm text-muted-foreground space-y-1">
          <p>
            {t("ephemeral.infoExpiry", "Expires: {{expiry}}", {
              expiry: expiryLabels[expiresIn],
            })}
          </p>
          <p>
            {t("ephemeral.infoAccesses", "Max accesses: {{count}}", {
              count: maxAccesses,
            })}
          </p>
          {passphrase && (
            <p>{t("ephemeral.infoPassphrase", "Passphrase protected")}</p>
          )}
        </div>

        {passphrase && (
          <Alert>
            <Lock className="h-4 w-4" />
            <AlertDescription>
              {t(
                "ephemeral.passphraseReminder",
                "Share the passphrase separately (e.g. via a different channel). The recipient will need it to decrypt.",
              )}
            </AlertDescription>
          </Alert>
        )}

        <div className="flex items-center justify-end pt-2">
          <Button onClick={onCancel}>{t("common.done", "Done")}</Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleCreate} className="flex flex-col gap-4 mt-2">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="ephemeral-expiry" className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" />
          {t("ephemeral.expiry", "Link expires after")}
        </Label>
        <Select
          value={expiresIn}
          onValueChange={(v) => setExpiresIn(v as EphemeralExpiry)}
          disabled={isCreating}
        >
          <SelectTrigger id="ephemeral-expiry">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1h">{expiryLabels["1h"]}</SelectItem>
            <SelectItem value="24h">{expiryLabels["24h"]}</SelectItem>
            <SelectItem value="7d">{expiryLabels["7d"]}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <Label
          htmlFor="ephemeral-passphrase"
          className="flex items-center gap-1.5"
        >
          <Lock className="h-3.5 w-3.5" />
          {t("ephemeral.passphrase", "Passphrase (optional)")}
        </Label>
        <Input
          id="ephemeral-passphrase"
          type="password"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          placeholder={t(
            "ephemeral.passphrasePlaceholder",
            "Additional protection...",
          )}
          disabled={isCreating}
        />
        <p className="text-xs text-muted-foreground">
          {t(
            "ephemeral.passphraseHint",
            "If set, the recipient must enter this passphrase to decrypt.",
          )}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="ephemeral-max-accesses">
          {t("ephemeral.maxAccesses", "Max accesses")}
        </Label>
        <Input
          id="ephemeral-max-accesses"
          type="number"
          min={1}
          max={100}
          value={maxAccesses}
          onChange={(e) =>
            setMaxAccesses(Math.max(1, Math.min(100, Number(e.target.value))))
          }
          disabled={isCreating}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="ephemeral-ip" className="flex items-center gap-1.5">
          <Globe className="h-3.5 w-3.5" />
          {t("ephemeral.ipRestriction", "IP restriction (optional)")}
        </Label>
        <Input
          id="ephemeral-ip"
          type="text"
          value={ipRestriction}
          onChange={(e) => setIpRestriction(e.target.value)}
          placeholder={t("ephemeral.ipPlaceholder", "e.g. 203.0.113.50")}
          disabled={isCreating}
        />
      </div>

      <div className="flex items-center justify-between gap-2 pt-2">
        {onBack ? (
          <Button
            type="button"
            variant="ghost"
            onClick={onBack}
            disabled={isCreating}
          >
            {t("common.back", "Back")}
          </Button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isCreating}
          >
            {t("common.cancel", "Cancel")}
          </Button>
          <Button type="submit" disabled={isCreating}>
            {isCreating ? (
              <>
                <Loader2 className="h-4 w-4 me-2 animate-spin" />
                {t("ephemeral.creating", "Creating...")}
              </>
            ) : (
              <>
                <Link2 className="h-4 w-4 me-2" />
                {t("ephemeral.createLink", "Create Link")}
              </>
            )}
          </Button>
        </div>
      </div>
    </form>
  );
}
