// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { useTranslation } from "react-i18next";
import { FolderLock, Plus, Users, ChevronRight, Shield } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { SharedVault } from "@/types/family";

interface SharedVaultBrowserProps {
  vaults: SharedVault[];
  isOrganizer: boolean;
  isLoading: boolean;
  onCreateClick: () => void;
  onVaultSelect: (vaultId: string) => void;
}

function formatDate(dateStr: string, locale: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" });
}

function permissionLabel(permission: SharedVault["permission"], t: (key: string, fallback: string) => string) {
  if (permission === "manage") return t("family.sharedVaults.permissions.manage", "Manage");
  if (permission === "share") return t("family.sharedVaults.permissions.share", "Share");
  if (permission === "edit") return t("family.sharedVaults.permissions.edit", "Edit");
  return t("family.sharedVaults.permissions.view", "View");
}

export function SharedVaultBrowser({
  vaults,
  isOrganizer,
  isLoading,
  onCreateClick,
  onVaultSelect,
}: SharedVaultBrowserProps) {
  const { t, i18n } = useTranslation("common");

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-36" />
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-lg border">
              <Skeleton className="h-9 w-9 rounded-lg" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg font-semibold">
          {t("family.sharedVaults.title", "Shared Vaults")}
        </CardTitle>
        {isOrganizer && (
          <Button size="sm" onClick={onCreateClick}>
            <Plus className="h-4 w-4 me-1" />
            {t("family.sharedVaults.create", "Create Vault")}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {vaults.length === 0 ? (
          <div className="text-center py-8">
            <FolderLock className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">
              {t("family.sharedVaults.empty", "No shared vaults yet.")}
            </p>
            <p className="mx-auto mt-2 max-w-sm text-xs text-muted-foreground">
              {t(
                "family.sharedVaults.emptyHint",
                "Create a vault, grant only the members who need it, and rotate access when someone leaves.",
              )}
            </p>
            {isOrganizer && (
              <Button variant="outline" size="sm" className="mt-3" onClick={onCreateClick}>
                <Plus className="h-4 w-4 me-1" />
                {t("family.sharedVaults.createFirst", "Create your first shared vault")}
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {vaults.map((vault) => (
              <button
                key={vault.id}
                onClick={() => onVaultSelect(vault.id)}
                className="flex w-full items-center gap-3 rounded-lg border p-3 text-start hover:bg-muted/50 transition-colors duration-150"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                  <FolderLock className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{vault.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("family.sharedVaults.createdOn", "Created {{date}}", {
                      date: formatDate(vault.createdAt, i18n.language),
                    })}
                  </p>
                </div>
                <Badge variant="outline" className="gap-1 shrink-0 hidden sm:flex">
                  <Shield className="h-3 w-3" />
                  {permissionLabel(vault.permission, t)}
                </Badge>
                <Badge variant="outline" className="gap-1 shrink-0">
                  <Users className="h-3 w-3" />
                  {t("family.sharedVaults.memberCount", "{{count}} members", {
                    count: vault.memberCount,
                  })}
                </Badge>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 rtl:scale-x-[-1]" />
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
