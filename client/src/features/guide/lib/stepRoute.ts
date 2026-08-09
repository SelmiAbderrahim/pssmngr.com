// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Tour step routes are plain strings ("/dashboard/vault?tab=sharing").
 * TanStack Router does not accept query strings inside `to` (the "?..."
 * ends up concatenated into the search values), so split them into
 * navigate() options and match them against the parsed location.
 */

export interface StepNavigation {
  to: string;
  search?: Record<string, string>;
}

export const parseStepRoute = (route: string): StepNavigation => {
  const [to = route, query] = route.split("?");
  if (!query) return { to };
  return { to, search: Object.fromEntries(new URLSearchParams(query)) };
};

/** True when the current location satisfies the step route (its pathname
 * matches and every search param the step asks for is present — extra
 * params added by route defaults are ignored). */
export const onStepRoute = (
  route: string,
  pathname: string,
  search: Record<string, unknown>,
): boolean => {
  const spec = parseStepRoute(route);
  return (
    pathname === spec.to &&
    Object.entries(spec.search ?? {}).every(
      ([key, value]) => String(search[key]) === value,
    )
  );
};
