// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * ShareFlow
 *
 * Unified share dialog with two delivery modes:
 *  - "person" (persistent share to another user, key-wrapping via server)
 *  - "link"   (ephemeral link, decryption key stays in URL fragment)
 *
 * Replaces the former ShareDialog and EphemeralShareDialog pair.
 * Behavior for each step is preserved verbatim in SharePersonStep /
 * ShareLinkStep — this component only picks between them.
 */

import { useState, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Share2, Link2, User as UserIcon } from "lucide-react";
import { SharePersonStep } from "./SharePersonStep";
import { ShareLinkStep } from "./ShareLinkStep";
import type { SharePermission } from "@/types/sharing";

type Mode = "picker" | "person" | "link";

interface ShareFlowProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemId: string;
  itemTitle: string;
  itemData: string;
  onShare: (
    recipientEmail: string,
    permission: SharePermission,
  ) => Promise<void>;
}

export function ShareFlow({
  open,
  onOpenChange,
  itemTitle,
  itemData,
  onShare,
}: ShareFlowProps) {
  const { t } = useTranslation(["common", "vault"]);
  const [mode, setMode] = useState<Mode>("picker");

  useEffect(() => {
    if (open) setMode("picker");
  }, [open]);

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);
  const back = useCallback(() => setMode("picker"), []);

  const title =
    mode === "person"
      ? t("sharing.dialogTitle", "Share Item")
      : mode === "link"
        ? t("ephemeral.dialogTitle", "Create Sharing Link")
        : t("share.mode.chooseTitle", "Share \"{{title}}\"", { title: itemTitle });

  const description =
    mode === "person"
      ? t("sharing.dialogDescription", 'Share "{{title}}" with another user.', {
          title: itemTitle,
        })
      : mode === "link"
        ? t(
            "ephemeral.dialogDescription",
            'Create a one-time link to share "{{title}}". The decryption key stays in the URL and never reaches the server.',
            { title: itemTitle },
          )
        : t(
            "share.mode.chooseDescription",
            "Pick how you'd like to share this item.",
          );

  const icon =
    mode === "link" ? (
      <Link2 className="h-5 w-5" />
    ) : (
      <Share2 className="h-5 w-5" />
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {icon}
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {mode === "picker" && (
          <div className="flex flex-col gap-3 mt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setMode("person")}
              className="flex items-start gap-3 h-auto py-4 px-4 text-start"
              data-testid="share-mode-person"
            >
              <UserIcon className="h-5 w-5 mt-0.5 shrink-0" />
              <span className="flex flex-col gap-1">
                <span className="font-medium">
                  {t("share.mode.person.title", "To a person")}
                </span>
                <span className="text-xs text-muted-foreground whitespace-normal">
                  {t(
                    "sharingCenter.personDescription",
                    "Share an item with someone — they get access, you keep control.",
                  )}
                </span>
              </span>
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setMode("link")}
              className="flex items-start gap-3 h-auto py-4 px-4 text-start"
              data-testid="share-mode-link"
            >
              <Link2 className="h-5 w-5 mt-0.5 shrink-0" />
              <span className="flex flex-col gap-1">
                <span className="font-medium">
                  {t("share.mode.link.title", "As a link")}
                </span>
                <span className="text-xs text-muted-foreground whitespace-normal">
                  {t(
                    "sharingCenter.linkDescription",
                    "Create an expiring link — the key travels in the link, never through our servers.",
                  )}
                </span>
              </span>
            </Button>
            <div className="flex items-center justify-end pt-2">
              <Button variant="ghost" onClick={close}>
                {t("common.cancel", "Cancel")}
              </Button>
            </div>
          </div>
        )}

        {mode === "person" && (
          <SharePersonStep onShare={onShare} onCancel={close} onBack={back} />
        )}

        {mode === "link" && (
          <ShareLinkStep
            itemTitle={itemTitle}
            itemData={itemData}
            onCancel={close}
            onBack={back}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
