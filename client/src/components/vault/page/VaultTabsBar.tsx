// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors

import { useTranslation } from "react-i18next";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShieldCheck, Timer, Share2, Trash2 } from "lucide-react";
import type { TabState } from "./utils";

interface VaultTabsBarProps {
  tab: TabState;
  trashCount: number;
  onTabChange: (v: TabState) => void;
}

export function VaultTabsBar({ tab, trashCount, onTabChange }: VaultTabsBarProps) {
  const { t } = useTranslation();
  return (
    <Tabs
      value={tab}
      onValueChange={(v) => onTabChange(v as TabState)}
      className="mb-4 w-full"
    >
      <TabsList className="w-full">
        <TabsTrigger value="items" className="flex-1 gap-1.5" aria-label={t("vault.items", "Items")}>
          <ShieldCheck className="h-4 w-4 shrink-0" />
          <span className="hidden sm:inline">{t("vault.items", "Items")}</span>
        </TabsTrigger>
        <TabsTrigger value="authenticators" className="flex-1 gap-1.5" aria-label={t("vault.authenticators", "Authenticators")}>
          <Timer className="h-4 w-4 shrink-0" />
          <span className="hidden sm:inline">{t("vault.authenticators", "Authenticators")}</span>
        </TabsTrigger>
        <TabsTrigger value="sharing" className="flex-1 gap-1.5" aria-label={t("vault.sharing", "Sharing")}>
          <Share2 className="h-4 w-4 shrink-0" />
          <span className="hidden sm:inline">{t("vault.sharing", "Sharing")}</span>
        </TabsTrigger>
        <TabsTrigger value="trash" className="flex-1 gap-1.5" aria-label={t("vault.trash", "Trash")}>
          <Trash2 className="h-4 w-4 shrink-0" />
          <span className="hidden sm:inline">{t("vault.trash", "Trash")}</span>
          {trashCount > 0 && (
            <span className="ms-1 text-xs bg-muted-foreground/20 rounded-md px-1.5 py-0.5">
              {trashCount}
            </span>
          )}
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
