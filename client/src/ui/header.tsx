// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { useRouter } from "@tanstack/react-router";

type RouteContext = {
  headerTitle?: string;
  headerDescription?: string;
};

export function Header() {
  const router = useRouter();

  // Get the last match's context, or use empty defaults
  const lastMatch = router.state.matches.slice(-1)[0];
  const routeContext = (lastMatch?.context ?? {}) as RouteContext;
  const headerTitle = routeContext.headerTitle ?? "";
  const headerDescription = routeContext.headerDescription ?? "";

  return (
    <header className="z-10 flex w-full flex-col border-b border-border bg-card px-6">
      <div className="mx-auto flex w-full max-w-screen-xl items-center justify-between py-12">
        <div className="flex flex-col items-start gap-2">
          <h1 className="text-3xl font-medium text-primary/80">
            {headerTitle}
          </h1>
          <p className="text-base font-normal text-primary/60">
            {headerDescription}
          </p>
        </div>
      </div>
    </header>
  );
}
