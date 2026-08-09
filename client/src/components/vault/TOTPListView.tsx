// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * TOTP List View
 *
 * Displays all TOTP authenticator items as cards with live rotating codes.
 * Used in the "Authenticators" tab of the vault page.
 */

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShieldCheck, ScanLine } from "lucide-react";
import { TOTPCodeCard } from "./TOTPCodeCard";
import type { DecryptedVaultItem } from "./VaultItemCard";

interface TOTPListViewProps {
  items: DecryptedVaultItem[];
  onSelect: (item: DecryptedVaultItem) => void;
  onScanQR: () => void;
}

export function TOTPListView({ items, onSelect, onScanQR }: TOTPListViewProps) {
  const { t } = useTranslation();

  const totpItems = useMemo(
    () => items.filter((item) => item.itemType === "totp"),
    [items],
  );

  if (totpItems.length === 0) {
    return (
      <Card className="rounded-lg border bg-card shadow-sm">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <ShieldCheck className="h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-lg font-semibold mb-2">
            {t("totp.noAuthenticators", "No Authenticators")}
          </h2>
          <p className="text-sm text-muted-foreground max-w-sm mb-6">
            {t(
              "totp.noAuthenticatorsDescription",
              "Add a TOTP authenticator by scanning a QR code or entering a secret key.",
            )}
          </p>
          <Button onClick={onScanQR} className="min-h-[44px]">
            <ScanLine className="h-4 w-4 me-2" />
            {t("totp.scanQRCode", "Scan QR Code")}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {totpItems.map((item) => (
        <TOTPCodeCard key={item.id} item={item} onSelect={onSelect} />
      ))}
    </div>
  );
}
