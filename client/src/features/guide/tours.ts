// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Guided-tour registry.
 * All `target` values MUST match a placed `data-tour` anchor — see the
 * anchor-integrity test in `__tests__/anchor-integrity.test.ts`.
 */

import type { TourDefinition } from "./types";

export const GUIDE_TOURS: TourDefinition[] = [
  {
    id: "first-run",
    titleKey: "guide:tours.firstRun.title",
    descriptionKey: "guide:tours.firstRun.description",
    routePrefix: "/dashboard/vault",
    steps: [
      {
        route: "/dashboard/vault",
        target: "vault-add-item",
        titleKey: "guide:tours.firstRun.steps.add.title",
        bodyKey: "guide:tours.firstRun.steps.add.body",
        placement: "bottom",
      },
      {
        route: "/dashboard/vault",
        target: "vault-search",
        titleKey: "guide:tours.firstRun.steps.search.title",
        bodyKey: "guide:tours.firstRun.steps.search.body",
        placement: "bottom",
      },
      {
        target: "generator-button",
        titleKey: "guide:tours.firstRun.steps.generator.title",
        bodyKey: "guide:tours.firstRun.steps.generator.body",
        placement: "bottom",
      },
      {
        target: "workspace-switcher",
        titleKey: "guide:tours.firstRun.steps.workspace.title",
        bodyKey: "guide:tours.firstRun.steps.workspace.body",
        placement: "bottom",
      },
      {
        target: "nav-settings",
        titleKey: "guide:tours.firstRun.steps.settings.title",
        bodyKey: "guide:tours.firstRun.steps.settings.body",
        placement: "end",
      },
    ],
  },
  {
    id: "vault-basics",
    titleKey: "guide:tours.vaultBasics.title",
    descriptionKey: "guide:tours.vaultBasics.description",
    routePrefix: "/dashboard/vault",
    steps: [
      {
        route: "/dashboard/vault",
        target: "vault-add-item",
        titleKey: "guide:tours.vaultBasics.steps.add.title",
        bodyKey: "guide:tours.vaultBasics.steps.add.body",
        placement: "bottom",
      },
      {
        route: "/dashboard/vault",
        target: "vault-search",
        titleKey: "guide:tours.vaultBasics.steps.search.title",
        bodyKey: "guide:tours.vaultBasics.steps.search.body",
        placement: "bottom",
      },
      {
        route: "/dashboard/vault",
        target: "vault-share",
        titleKey: "guide:tours.vaultBasics.steps.share.title",
        bodyKey: "guide:tours.vaultBasics.steps.share.body",
        placement: "top",
      },
    ],
  },
  {
    id: "sharing",
    titleKey: "guide:tours.sharing.title",
    descriptionKey: "guide:tours.sharing.description",
    routePrefix: "/dashboard/vault",
    steps: [
      {
        route: "/dashboard/vault",
        target: "vault-share",
        titleKey: "guide:tours.sharing.steps.entry.title",
        bodyKey: "guide:tours.sharing.steps.entry.body",
        placement: "top",
      },
      {
        route: "/dashboard/vault?tab=sharing",
        target: "vault-share",
        titleKey: "guide:tours.sharing.steps.center.title",
        bodyKey: "guide:tours.sharing.steps.center.body",
        placement: "bottom",
      },
    ],
  },
  {
    id: "security-checkup",
    titleKey: "guide:tours.securityCheckup.title",
    descriptionKey: "guide:tours.securityCheckup.description",
    routePrefix: "/dashboard/watchtower",
    steps: [
      {
        route: "/dashboard/watchtower",
        target: "nav-security",
        titleKey: "guide:tours.securityCheckup.steps.nav.title",
        bodyKey: "guide:tours.securityCheckup.steps.nav.body",
        placement: "end",
      },
      {
        route: "/dashboard/settings?tab=security",
        target: "settings-security",
        titleKey: "guide:tours.securityCheckup.steps.card.title",
        bodyKey: "guide:tours.securityCheckup.steps.card.body",
        placement: "bottom",
      },
      {
        route: "/dashboard/settings?tab=security",
        target: "unlock-remember",
        titleKey: "guide:tours.securityCheckup.steps.remember.title",
        bodyKey: "guide:tours.securityCheckup.steps.remember.body",
        placement: "top",
      },
    ],
  },
  {
    id: "workspaces",
    titleKey: "guide:tours.workspaces.title",
    descriptionKey: "guide:tours.workspaces.description",
    routePrefix: "/dashboard/organization",
    steps: [
      {
        target: "workspace-switcher",
        titleKey: "guide:tours.workspaces.steps.switcher.title",
        bodyKey: "guide:tours.workspaces.steps.switcher.body",
        placement: "bottom",
      },
      {
        route: "/dashboard/organization",
        target: "nav-people",
        titleKey: "guide:tours.workspaces.steps.people.title",
        bodyKey: "guide:tours.workspaces.steps.people.body",
        placement: "end",
      },
    ],
  },
  {
    id: "protect-your-account",
    titleKey: "guide:tours.protectAccount.title",
    descriptionKey: "guide:tours.protectAccount.description",
    routePrefix: "/dashboard/settings",
    steps: [
      {
        route: "/dashboard/settings?tab=data",
        target: "settings-data",
        titleKey: "guide:tours.protectAccount.steps.data.title",
        bodyKey: "guide:tours.protectAccount.steps.data.body",
        placement: "bottom",
      },
      {
        route: "/dashboard/settings?tab=security",
        target: "unlock-remember",
        titleKey: "guide:tours.protectAccount.steps.remember.title",
        bodyKey: "guide:tours.protectAccount.steps.remember.body",
        placement: "top",
      },
      {
        // Only rendered during onboarding — degrades gracefully via `missing`.
        route: "/dashboard/settings?tab=data",
        target: "recovery-kit-download",
        titleKey: "guide:tours.protectAccount.steps.recovery.title",
        bodyKey: "guide:tours.protectAccount.steps.recovery.body",
        placement: "top",
      },
    ],
  },
];

export const findTour = (id: string | null): TourDefinition | null => {
  if (!id) return null;
  return GUIDE_TOURS.find((tour) => tour.id === id) ?? null;
};

/**
 * Panel ordering: tours for the current page first, then other uncompleted
 * tours, completed tours sink to the bottom. Stable within each group.
 */
export const sortToursForRoute = (
  pathname: string,
  completed: readonly string[],
): TourDefinition[] => {
  const rank = (tour: TourDefinition): number => {
    const here = pathname.startsWith(tour.routePrefix) ? 0 : 1;
    const done = completed.includes(tour.id) ? 2 : 0;
    return here + done;
  };
  return [...GUIDE_TOURS].sort((a, b) => rank(a) - rank(b));
};
