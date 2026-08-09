// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { Outlet } from "@tanstack/react-router";

import { OfflineBanner } from "@/components/offline";
import { PendingInvitationsBanner } from "@/components/organization/PendingInvitationsBanner";
import type { User } from "~/types";
import { BottomNav } from "./BottomNav";
import { MobileHeader } from "./MobileHeader";

interface MobileShellProps {
  user: User;
}

export function MobileShell({ user }: MobileShellProps) {
  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-background pt-safe-t pb-safe-b ps-safe-s pe-safe-e">
      <MobileHeader user={user} />
      <div className="relative z-20">
        <OfflineBanner className="static z-auto" />
        <PendingInvitationsBanner className="mx-3 mt-2" />
      </div>
      <main
        id="main-content"
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 pb-24 pt-3"
      >
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
