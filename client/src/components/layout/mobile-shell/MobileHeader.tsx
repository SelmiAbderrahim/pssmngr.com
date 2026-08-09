// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { useMemo, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  ChevronDown,
  ChevronLeft,
  LockKeyhole,
  LogOut,
  Menu,
  Settings,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { CreateWorkspaceDialog } from "@/components/dashboard/workspace/CreateWorkspaceDialog";
import {
  useWorkspaceSwitcher,
  WorkspaceList,
} from "@/components/layout/workspace-switcher";
import { APP_DESTINATIONS } from "@/components/layout/navigation";
import { useSignOut } from "@/utils/misc";
import { vaultCrypto } from "@/services/vault-crypto";
import type { User } from "~/types";

const TAB_ROOTS = new Set([
  "/dashboard",
  "/dashboard/vault",
  "/dashboard/generator",
  "/dashboard/watchtower",
  "/dashboard/organization",
  "/dashboard/settings",
]);

const SHEET_DESTINATION_ICON: Record<string, LucideIcon> = {
  "/dashboard/organization": UsersRound,
  "/dashboard/settings": Settings,
};

const LABEL_FALLBACK: Record<string, string> = {
  "navigation.people": "People",
  "navigation.settings": "Settings",
};

interface MobileHeaderProps {
  user: User;
}

export function MobileHeader({ user }: MobileHeaderProps) {
  const { t } = useTranslation("mobile");
  const { t: tCommon } = useTranslation("common");
  const { t: tWorkspace } = useTranslation("workspace");
  const navigate = useNavigate();
  const signOut = useSignOut();
  const [menuOpen, setMenuOpen] = useState(false);
  const [workspaceSheetOpen, setWorkspaceSheetOpen] = useState(false);
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const {
    workspaces,
    activeWorkspace,
    switching,
    settingDefaultId,
    createDialogOpen,
    setCreateDialogOpen,
    openCreateDialog,
    selectWorkspace,
    setDefault,
  } = useWorkspaceSwitcher();

  const title = useMemo(
    () =>
      getScreenTitle(
        pathname,
        (key, fallback) => String(t(key, fallback)),
        (key, fallback) => String(tCommon(key, fallback)),
      ),
    [pathname, t, tCommon],
  );
  const isTabRoot = TAB_ROOTS.has(pathname);

  const sheetDestinations = APP_DESTINATIONS.filter(
    (d) => d.mobile === "sheet" || d.path === "/dashboard/settings",
  );

  const workspaceLabel =
    activeWorkspace?.name ||
    String(tWorkspace("switcher.selectWorkspace", "Select workspace"));

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-border bg-card ps-safe-s pe-safe-e">
        <div className="flex h-14 items-center gap-2 px-3">
          {isTabRoot ? (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="min-h-11 min-w-11"
              aria-label={String(t("header.menu"))}
              onClick={() => setMenuOpen(true)}
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </Button>
          ) : (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="min-h-11 min-w-11"
              aria-label={String(t("header.back"))}
              onClick={() => window.history.back()}
            >
              <ChevronLeft className="h-5 w-5 rtl:scale-x-[-1]" aria-hidden="true" />
            </Button>
          )}

          <Button
            type="button"
            variant="ghost"
            data-tour="workspace-switcher"
            aria-label={String(tWorkspace("switcher.label", "Switch workspace"))}
            aria-haspopup="dialog"
            aria-expanded={workspaceSheetOpen}
            onClick={() => setWorkspaceSheetOpen(true)}
            className="flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1 px-2 text-center"
          >
            <div className="min-w-0">
              <p className="truncate text-xs text-muted-foreground">{title}</p>
              <p className="flex items-center justify-center gap-1 truncate text-sm font-semibold text-foreground">
                <span className="truncate">{workspaceLabel}</span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden="true" />
              </p>
            </div>
          </Button>

          <div className="min-h-11 min-w-11" aria-hidden="true" />
        </div>
      </header>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="start" className="w-80 max-w-[85vw] p-0">
          <SheetHeader className="border-b px-4 py-4 text-start">
            <SheetTitle>{t("header.menu")}</SheetTitle>
          </SheetHeader>
          <div className="space-y-1 p-3">
            <div className="mb-3 rounded-lg border bg-card p-3">
              <p className="truncate text-sm font-medium">{user.name || user.email}</p>
              <p className="truncate text-xs text-muted-foreground">{user.email}</p>
            </div>
            {sheetDestinations.map((d) => {
              const Icon = SHEET_DESTINATION_ICON[d.path] ?? d.icon;
              return (
                <Button
                  key={d.path}
                  variant="ghost"
                  className="min-h-11 min-w-11 w-full justify-start gap-3"
                  asChild
                >
                  <Link
                    to={d.path}
                    data-tour={d.tour}
                    onClick={() => setMenuOpen(false)}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    {tCommon(d.labelKey, LABEL_FALLBACK[d.labelKey] ?? d.labelKey)}
                  </Link>
                </Button>
              );
            })}
            <Button
              type="button"
              variant="ghost"
              className="min-h-11 min-w-11 w-full justify-start gap-3"
              onClick={() => {
                vaultCrypto.lock();
                setMenuOpen(false);
                void navigate({
                  to: "/dashboard/vault",
                  search: {
                    tab: "items",
                    filter: "all",
                    sort: "modified",
                    q: "",
                    create: undefined,
                  },
                });
              }}
            >
              <LockKeyhole className="h-4 w-4" aria-hidden="true" />
              {t("header.lock")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="min-h-11 min-w-11 w-full justify-start gap-3 text-destructive hover:text-destructive"
              onClick={() => {
                setMenuOpen(false);
                void signOut();
              }}
            >
              <LogOut className="h-4 w-4 rtl:scale-x-[-1]" aria-hidden="true" />
              {t("header.signout")}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={workspaceSheetOpen} onOpenChange={setWorkspaceSheetOpen}>
        <SheetContent side="bottom" className="rounded-t-lg pb-safe-b ps-safe-s pe-safe-e">
          <SheetHeader className="text-start">
            <SheetTitle>{tWorkspace("switch.title", "Switch Organization")}</SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            <WorkspaceList
              workspaces={workspaces}
              activeWorkspaceId={activeWorkspace?.id ?? null}
              switching={switching}
              settingDefaultId={settingDefaultId}
              onSelect={async (workspace) => {
                await selectWorkspace(workspace);
                setWorkspaceSheetOpen(false);
              }}
              onSetDefault={setDefault}
              onCreate={() => {
                setWorkspaceSheetOpen(false);
                openCreateDialog();
              }}
              rowRole="button"
            />
          </div>
        </SheetContent>
      </Sheet>

      <CreateWorkspaceDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />
    </>
  );
}

function getScreenTitle(
  pathname: string,
  t: (key: string, fallback: string) => string,
  tCommon: (key: string, fallback: string) => string,
) {
  if (pathname.startsWith("/dashboard/generator")) {
    return t("bottom_nav.generator", "Password Generator");
  }
  if (pathname.startsWith("/dashboard/watchtower")) {
    return t("bottom_nav.security", "Security");
  }
  if (pathname.startsWith("/dashboard/settings/security")) {
    return tCommon("navigation.security", "Security");
  }
  if (pathname.startsWith("/dashboard/settings")) {
    return t("bottom_nav.settings", "Settings");
  }
  if (pathname.startsWith("/dashboard/organization")) {
    return tCommon("navigation.people", "People");
  }
  if (pathname.startsWith("/dashboard/vault") || pathname === "/dashboard") {
    return t("bottom_nav.vault", "Vault");
  }
  return tCommon("navigation.dashboard", "Dashboard");
}
