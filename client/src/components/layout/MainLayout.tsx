// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Main Layout Component
 *
 * Top-navigation desktop shell.
 * The mobile hamburger sheet renders `AppSidebar` for narrow widths.
 */

import { AppNavbar } from "./AppNavbar";
import { AppFooter } from "./AppFooter";
import { OfflineBanner } from "@/components/offline";
import { PendingInvitationsBanner } from "@/components/organization/PendingInvitationsBanner";
import { User } from "~/types";
import { Outlet } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

interface MainLayoutProps {
  user: User;
}

export function MainLayout({ user }: MainLayoutProps) {
  const { t } = useTranslation("common");

  return (
    <div className="flex h-screen w-full bg-muted/40">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:start-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:text-foreground focus:shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
      >
        {t("a11y.skipToContent")}
      </a>

      <div className="flex flex-col h-full w-full">
        <AppNavbar user={user} />

        <OfflineBanner className="static z-auto mx-4 mt-2 rounded-lg border" />

        <PendingInvitationsBanner className="mx-4 mt-2" />

        <main id="main-content" className="flex-1 px-4 min-h-0 overflow-auto">
          <Outlet />
        </main>

        <AppFooter />
      </div>
    </div>
  );
}
