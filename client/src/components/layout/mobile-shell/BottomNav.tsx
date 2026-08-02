// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  CreditCard,
  KeyRound,
  Plus,
  Share2,
  StickyNote,
  UserRound,
  WandSparkles,
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
import { cn } from "@/lib/utils";
import type { ItemType } from "@/components/vault/VaultItemCard";
import { GeneratorPanel } from "@/components/generator/GeneratorPanel";
import { APP_DESTINATIONS } from "@/components/layout/navigation";

type QuickAddType = Extract<ItemType, "login" | "note" | "card" | "identity">;

interface NavTab {
  id: string;
  to: string;
  search?: Record<string, unknown>;
  labelKey: string;
  icon: LucideIcon;
  tour?: string;
  match: (pathname: string, search: string) => boolean;
}

const LABEL_FALLBACK: Record<string, string> = {
  "navigation.vault": "Vault",
  "navigation.security": "Security",
  "navigation.settings": "Settings",
};

const DEST_BY_PATH = new Map(APP_DESTINATIONS.map((d) => [d.path, d] as const));

function bottomNavTabs(): NavTab[] {
  const vault = DEST_BY_PATH.get("/dashboard/vault")!;
  const security = DEST_BY_PATH.get("/dashboard/watchtower")!;
  const settings = DEST_BY_PATH.get("/dashboard/settings")!;
  return [
    {
      id: "vault",
      to: vault.path,
      labelKey: vault.labelKey,
      icon: vault.icon,
      tour: vault.tour,
      match: (p, s) =>
        (p === "/dashboard" || p.startsWith("/dashboard/vault")) &&
        !s.includes("tab=sharing"),
    },
    {
      id: "security",
      to: security.path,
      labelKey: security.labelKey,
      icon: security.icon,
      tour: security.tour,
      match: (p) => p.startsWith("/dashboard/watchtower"),
    },
    // Sharing deep-links into the vault sharing tab and lands
    // on SharingCenter with zero changes here — the URL is the contract.
    {
      id: "sharing",
      to: "/dashboard/vault",
      search: {
        tab: "sharing",
        filter: "all",
        sort: "modified",
        q: "",
        create: undefined,
      },
      labelKey: "bottom_nav.sharing",
      icon: Share2,
      match: (p, s) =>
        p.startsWith("/dashboard/vault") && s.includes("tab=sharing"),
    },
    {
      id: "settings",
      to: settings.path,
      labelKey: settings.labelKey,
      icon: settings.icon,
      tour: settings.tour,
      match: (p) => p.startsWith("/dashboard/settings"),
    },
  ];
}

const QUICK_ADD_TYPES: Array<{
  type: QuickAddType;
  labelKey: string;
  icon: LucideIcon;
}> = [
  { type: "login", labelKey: "quick_add.login", icon: KeyRound },
  { type: "note", labelKey: "quick_add.secure_note", icon: StickyNote },
  { type: "card", labelKey: "quick_add.card", icon: CreditCard },
  { type: "identity", labelKey: "quick_add.identity", icon: UserRound },
];

function useVisualViewportBottomOffset(open: boolean) {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    if (!open || typeof window === "undefined" || !window.visualViewport) {
      setOffset(0);
      return;
    }

    const viewport = window.visualViewport;
    const update = () => {
      const keyboardOffset = Math.max(
        0,
        window.innerHeight - viewport.height - viewport.offsetTop,
      );
      setOffset(keyboardOffset);
    };

    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, [open]);

  return offset;
}

export function BottomNav() {
  const { t } = useTranslation("mobile");
  const { t: tCommon } = useTranslation("common");
  const navigate = useNavigate();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const search = useRouterState({
    select: (state) => state.location.searchStr ?? "",
  });
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [generatorOpen, setGeneratorOpen] = useState(false);
  const keyboardOffset = useVisualViewportBottomOffset(quickAddOpen);

  const tabs = useMemo(() => bottomNavTabs(), []);

  const openCreateFlow = useCallback(
    (type: QuickAddType) => {
      setQuickAddOpen(false);
      void navigate({
        to: "/dashboard/vault",
        search: {
          tab: "items",
          filter: "all",
          sort: "modified",
          q: "",
          create: type,
        },
      });
    },
    [navigate],
  );

  const label = useCallback(
    (key: string) => {
      if (key.startsWith("navigation.")) {
        return String(tCommon(key, LABEL_FALLBACK[key] ?? key));
      }
      return String(t(key));
    },
    [t, tCommon],
  );

  return (
    <>
      <nav
        aria-label={String(t("bottom_nav.label", "Primary mobile navigation"))}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card px-3 pb-safe-b ps-safe-s pe-safe-e"
      >
        <div className="mx-auto grid h-16 max-w-lg grid-cols-[1fr_1fr_64px_1fr_1fr] items-center gap-1">
          {tabs.slice(0, 2).map((tab) => (
            <BottomNavTab
              key={tab.id}
              tab={tab}
              active={tab.match(pathname, search)}
              label={label(tab.labelKey)}
            />
          ))}

          <Button
            type="button"
            size="icon"
            className="mx-auto h-12 w-12 min-h-11 min-w-11 rounded-md shadow-sm"
            aria-label={String(t("bottom_nav.quick_add"))}
            data-tour="generator-button"
            onClick={() => setQuickAddOpen(true)}
          >
            <Plus className="h-5 w-5" aria-hidden="true" />
          </Button>

          {tabs.slice(2).map((tab) => (
            <BottomNavTab
              key={tab.id}
              tab={tab}
              active={tab.match(pathname, search)}
              label={label(tab.labelKey)}
            />
          ))}
        </div>
      </nav>

      <Sheet open={quickAddOpen} onOpenChange={setQuickAddOpen}>
        <SheetContent
          side="bottom"
          className="rounded-t-lg pb-safe-b ps-safe-s pe-safe-e"
          style={{ transform: keyboardOffset ? `translateY(-${keyboardOffset}px)` : undefined }}
        >
          <SheetHeader className="text-start">
            <SheetTitle>{t("quick_add.title")}</SheetTitle>
          </SheetHeader>
          <div className="mt-6 grid gap-3">
            {QUICK_ADD_TYPES.map((item) => {
              const Icon = item.icon;
              return (
                <Button
                  key={item.type}
                  type="button"
                  variant="outline"
                  className="h-12 min-h-11 min-w-11 justify-start gap-3"
                  onClick={() => openCreateFlow(item.type)}
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
                  {t(item.labelKey)}
                </Button>
              );
            })}
            <Button
              type="button"
              variant="outline"
              className="h-12 min-h-11 min-w-11 justify-start gap-3"
              onClick={() => {
                setQuickAddOpen(false);
                setGeneratorOpen(true);
              }}
            >
              <WandSparkles className="h-5 w-5" aria-hidden="true" />
              {t("quick_add.generator", "Generate password")}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={generatorOpen} onOpenChange={setGeneratorOpen}>
        <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto rounded-t-lg pb-safe-b ps-safe-s pe-safe-e">
          <SheetHeader className="text-start">
            <SheetTitle>{t("bottom_nav.generator", "Password Generator")}</SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            <GeneratorPanel />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function BottomNavTab({
  tab,
  active,
  label,
}: {
  tab: NavTab;
  active: boolean;
  label: string;
}) {
  const Icon = tab.icon;

  return (
    <Link
      to={tab.to}
      search={tab.search as never}
      aria-current={active ? "page" : undefined}
      data-tour={tab.tour}
      className={cn(
        "flex min-h-11 min-w-11 flex-col items-center justify-center gap-1 rounded-md px-1 text-[11px] font-medium transition-colors duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "text-primary"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
      )}
    >
      <Icon className="h-5 w-5" aria-hidden="true" />
      <span className="max-w-full truncate">{label}</span>
    </Link>
  );
}
