// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * SharePersonStep
 *
 * Person-to-person share form. Extracted verbatim from the former
 * ShareDialog body. The flow uses a recipient email and
 * view-only permission, calls onShare(email, permission).
 */

import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Share2,
  Loader2,
  AlertCircle,
  Mail,
  Shield,
  Eye,
} from "lucide-react";
import type { SharePermission } from "@/types/sharing";

function getErrorMessage(
  err: unknown,
  fallback: string,
  translate: (key: string, fallback: string) => string,
): string {
  const localizeMessage = (message: string): string => {
    if (message === "Recipient has no registered device") {
      return translate(
        "sharing.errorRecipientNoDevice",
        "Recipient must sign in on a trusted device before you can share with them.",
      );
    }
    if (message === "Item not found") {
      return translate("sharing.errorItemNotFound", "Item not found.");
    }
    return message;
  };

  if (typeof err === "object" && err !== null) {
    const { code, statusCode } = err as {
      code?: unknown;
      statusCode?: unknown;
    };
    if (code === "PRECONDITION_FAILED" || statusCode === 412) {
      return translate(
        "sharing.errorRecipientUntrustedDevice",
        "Ask this person to trust one of their devices (Settings → Security → Trusted Devices) before sharing.",
      );
    }
  }

  if (err instanceof Error && err.message) return localizeMessage(err.message);
  if (typeof err === "object" && err !== null && "message" in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return localizeMessage(message);
    }
  }
  return fallback;
}

interface SharePersonStepProps {
  onShare: (
    recipientEmail: string,
    permission: SharePermission,
  ) => Promise<void>;
  onCancel: () => void;
  onBack?: () => void;
}

export function SharePersonStep({
  onShare,
  onCancel,
  onBack,
}: SharePersonStepProps) {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const permission: SharePermission = "view";
  const [isSharing, setIsSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);

      const trimmed = email.trim().toLowerCase();
      if (!trimmed) {
        setError(t("sharing.errorNoEmail", "Please enter a recipient email."));
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
        setError(
          t("sharing.errorInvalidEmail", "Please enter a valid email address."),
        );
        return;
      }

      setIsSharing(true);
      try {
        await onShare(trimmed, permission);
        onCancel();
      } catch (err) {
        setError(
          getErrorMessage(
            err,
            t("sharing.errorFailed", "Failed to share item. Please try again."),
            t,
          ),
        );
      } finally {
        setIsSharing(false);
      }
    },
    [email, onShare, onCancel, t],
  );

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-2">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="share-email" className="flex items-center gap-1.5">
          <Mail className="h-3.5 w-3.5" />
          {t("sharing.recipientEmail", "Recipient email")}
        </Label>
        <Input
          id="share-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("sharing.emailPlaceholder", "user@example.com")}
          disabled={isSharing}
          autoFocus
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <Shield className="h-3.5 w-3.5" />
          {t("sharing.permission", "Permission")}
        </div>
        <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <div className="mb-1 flex items-center gap-1.5 font-medium text-foreground">
            <Eye className="h-3.5 w-3.5" />
            {t("sharing.permissionView", "View only")}
          </div>
          <p>
            {t(
              "sharing.viewHint",
              "Recipient can view but not modify this item.",
            )}
          </p>
          <p className="mt-2">
            {t(
              "sharing.zeroKnowledgeHint",
              "Only an encrypted item key is wrapped for this recipient. The server never receives plaintext vault data.",
            )}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 pt-2">
        {onBack ? (
          <Button
            type="button"
            variant="ghost"
            onClick={onBack}
            disabled={isSharing}
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
            disabled={isSharing}
          >
            {t("common.cancel", "Cancel")}
          </Button>
          <Button type="submit" disabled={isSharing || !email.trim()}>
            {isSharing ? (
              <>
                <Loader2 className="h-4 w-4 me-2 animate-spin" />
                {t("sharing.sharing", "Sharing...")}
              </>
            ) : (
              <>
                <Share2 className="h-4 w-4 me-2" />
                {t("sharing.share", "Share")}
              </>
            )}
          </Button>
        </div>
      </div>
    </form>
  );
}
