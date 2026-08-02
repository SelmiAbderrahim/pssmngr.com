// Copyright (c) 2026 Password Manager contributors
/**
 * Dashboard Layout Route
 *
 * Wraps all dashboard child routes with MainLayout,
 * providing sidebar, navbar, and footer.
 */

import { createFileRoute } from "@tanstack/react-router";
import { useAuthState } from "@/providers/AuthProvider";
import { MainLayout } from "@/components/layout/MainLayout";
import { MobileShell } from "@/components/layout/mobile-shell";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { GuideProvider, GuideWidget } from "@/features/guide";

export const Route = createFileRoute("/_app/_auth/dashboard")({
  component: DashboardLayout,
});

function DashboardLayout() {
  const { user } = useAuthState();
  const isMobileShell = useMediaQuery("(max-width: 768px)");

  // _auth.tsx guarantees user is authenticated before rendering children
  if (!user) return null;

  // Mount GuideWidget once alongside whichever responsive shell is active.
  return (
    <GuideProvider>
      {isMobileShell ? (
        <MobileShell user={user as any} />
      ) : (
        <MainLayout user={user as any} />
      )}
      <GuideWidget />
    </GuideProvider>
  );
}
