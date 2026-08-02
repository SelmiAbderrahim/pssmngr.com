// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Composition root — mounted ONCE in `routes/_app/_auth/dashboard.tsx`.
 * Gates every child on `authenticated && enabled` so `enabled === false`
 * renders NOTHING (no launcher, no observers, no listeners).
 */

import { useAuthState } from "@/providers/AuthProvider";
import { useGuide } from "../GuideProvider";
import { GuideLauncher } from "./GuideLauncher";
import { GuidePanel } from "./GuidePanel";
import { TourOverlay } from "./TourOverlay";

export const GuideWidget = () => {
  const { status } = useAuthState();
  const { state } = useGuide();
  if (status !== "authenticated" || !state.enabled) return null;
  return (
    <>
      <GuideLauncher />
      <GuidePanel />
      <TourOverlay />
    </>
  );
};
