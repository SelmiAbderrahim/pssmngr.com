// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Root route.
 *
 * This is a self-hosted application with no public marketing surface, so `/`
 * is purely a dispatcher: authenticated visitors land on the dashboard,
 * everyone else on the login page. The session is checked against the server
 * (rather than trusting a cached client session) so a stale session cannot
 * bounce the user into the authenticated shell and straight back out.
 */

import { createFileRoute, redirect } from "@tanstack/react-router";
import { getSession } from "@/lib/auth/auth-client";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    let hasSession = false;
    try {
      const session = await getSession();
      hasSession = Boolean(session?.data?.user);
    } catch {
      // Server unreachable or session invalid — treat as logged out.
      hasSession = false;
    }

    if (hasSession) {
      throw redirect({ to: "/dashboard" });
    }

    throw redirect({
      to: "/login",
      search: { invitation: undefined, redirect: undefined },
    });
  },
});
