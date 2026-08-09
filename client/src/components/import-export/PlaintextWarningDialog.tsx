// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Plaintext Export Warning Dialog
 *
 * Shows a security warning before allowing plaintext CSV/JSON export.
 * Requires explicit confirmation since exported data contains passwords in cleartext.
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Loader2 } from "lucide-react";
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
import type { PlaintextExportFormat } from "@/types/export";

interface PlaintextWarningDialogProps {
  format: PlaintextExportFormat;
  trigger: React.ReactNode;
  onConfirm: () => Promise<void>;
}

export function PlaintextWarningDialog({
  format,
  trigger,
  onConfirm,
}: PlaintextWarningDialogProps) {
  const { t } = useTranslation("common");
  const [open, setOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const formatLabel = format.toUpperCase();

  async function handleConfirm() {
    setIsExporting(true);
    try {
      await onConfirm();
      setOpen(false);
    } catch {
      // Error handled by caller
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
            <AlertDialogTitle>
              {t("importExport.export.warning.title", "Export as {{format}}?", {
                format: formatLabel,
              })}
            </AlertDialogTitle>
          </div>
          <AlertDialogDescription className="space-y-2">
            <span className="block">
              {t(
                "importExport.export.warning.description",
                "This will export all your vault items as an unencrypted {{format}} file. Your passwords will be visible in plaintext.",
                { format: formatLabel }
              )}
            </span>
            <span className="block font-medium text-foreground">
              {t(
                "importExport.export.warning.caution",
                "Anyone with access to this file can read your passwords. Delete the file after use."
              )}
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isExporting}>
            {t("importExport.export.warning.cancel", "Cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              handleConfirm();
            }}
            disabled={isExporting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isExporting ? (
              <>
                <Loader2 className="h-4 w-4 me-1 animate-spin" />
                {t("importExport.export.warning.exporting", "Exporting...")}
              </>
            ) : (
              t("importExport.export.warning.confirm", "Export {{format}}", {
                format: formatLabel,
              })
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
