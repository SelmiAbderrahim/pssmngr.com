// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors

import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShieldCheck } from "lucide-react";

interface VaultLockedCardProps {
  decryptionFailed: boolean;
  onUnlock: () => void;
}

export function VaultLockedCard({ decryptionFailed, onUnlock }: VaultLockedCardProps) {
  const { t } = useTranslation();
  return (
    <Card className="rounded-lg border bg-card shadow-sm">
      <CardContent className="flex flex-col items-center justify-center py-16 text-center">
        <ShieldCheck className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-lg font-semibold mb-2">
          {t("vault.locked", "Vault Locked")}
        </h2>
        {decryptionFailed && (
          <p className="text-sm text-destructive max-w-sm mb-2">
            {t(
              "vault.decryptionFailed",
              "All items failed to decrypt. Please check your master password and secret key.",
            )}
          </p>
        )}
        <p className="text-sm text-muted-foreground max-w-sm mb-6">
          {t(
            "vault.lockedDescription",
            "Enter your master password to access your vault.",
          )}
        </p>
        <Button onClick={onUnlock} className="min-h-[44px]">
          {t("vault.unlock", "Unlock")}
        </Button>
      </CardContent>
    </Card>
  );
}

export function NoVaultCard() {
  const { t } = useTranslation();
  return (
    <Card className="rounded-lg border bg-card shadow-sm">
      <CardContent className="flex flex-col items-center justify-center py-16 text-center">
        <ShieldCheck className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-lg font-semibold mb-2">
          {t("vault.noVault", "No Vault Found")}
        </h2>
        <p className="text-sm text-muted-foreground max-w-sm">
          {t(
            "vault.noVaultDescription",
            "Your vault will be created when you complete the setup process.",
          )}
        </p>
      </CardContent>
    </Card>
  );
}
