// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors

import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Plus, ScanLine } from "lucide-react";
import { LastSyncedLabel } from "@/components/offline";

interface VaultHeaderProps {
  lastSyncedAt: number | null;
  showActions: boolean;
  showQRAction: boolean;
  onScanQR: () => void;
  onAdd: () => void;
}

export function VaultHeader({
  lastSyncedAt,
  showActions,
  showQRAction,
  onScanQR,
  onAdd,
}: VaultHeaderProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("pages.vault.title", "Vault")}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("pages.vault.description", "Everything you save is encrypted on this device before it goes anywhere.")}
        </p>
        {lastSyncedAt !== null && (
          <LastSyncedLabel dataUpdatedAt={lastSyncedAt} className="mt-1" />
        )}
      </div>
      {showActions && (
        <div className="flex items-center gap-2">
          {showQRAction && (
            <Button
              variant="outline"
              onClick={onScanQR}
              className="min-h-[44px]"
            >
              <ScanLine className="h-4 w-4 me-2" />
              {t("totp.scanQR", "Scan QR")}
            </Button>
          )}
          <Button
            onClick={onAdd}
            className="min-h-[44px]"
            data-tour="vault-add-item"
          >
            <Plus className="h-4 w-4 me-2" />
            {t("vault.addItem", "Add item")}
          </Button>
        </div>
      )}
    </div>
  );
}
