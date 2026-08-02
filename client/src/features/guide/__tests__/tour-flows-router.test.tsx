// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Runtime walk of every guided tour against a REAL TanStack Router.
 * The other suites mock the router (GuideWidget.test mocks the panel and
 * overlay entirely), so navigate()/location integration was never covered —
 * this suite starts each tour from the panel and clicks through every step.
 */

import { render, screen, fireEvent, waitFor, within, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// tests/setup.ts globally mocks the router (useRouterState ignores `select`,
// useNavigate is a no-op) — undo that so this suite exercises the real thing.
vi.unmock("@tanstack/react-router");

vi.mock("@/lib/api/trpc", () => ({
  trpcQuery: vi.fn().mockResolvedValue(true),
  trpcMutation: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/providers/AuthProvider", () => ({
  useAuthState: () => ({ status: "authenticated", user: { id: "u1" } }),
}));

import { GuideProvider, useGuide } from "../GuideProvider";
import { GuidePanel } from "../components/GuidePanel";
import { TourOverlay } from "../components/TourOverlay";
import { parseStepRoute } from "../lib/stepRoute";
import { GUIDE_TOURS } from "../tours";

const OpenPanelProbe = () => {
  const { dispatch } = useGuide();
  return (
    <button
      type="button"
      data-testid="open-panel"
      onClick={() => dispatch({ type: "openPanel" })}
    >
      open
    </button>
  );
};

const Layout = () => (
  <div>
    {/* layout-level anchors present on every page, like the real navbar */}
    <div data-tour="workspace-switcher" />
    <div data-tour="generator-button" />
    <div data-tour="nav-vault" />
    <div data-tour="nav-security" />
    <div data-tour="nav-people" />
    <div data-tour="nav-settings" />
    <Outlet />
    <OpenPanelProbe />
    <GuidePanel />
    <TourOverlay />
  </div>
);

const buildRouter = () => {
  const rootRoute = createRootRoute({ component: Layout });
  const page = (path: string, anchors: string[]) =>
    createRoute({
      getParentRoute: () => rootRoute,
      path,
      validateSearch: (search: Record<string, unknown>) => ({
        tab: (search.tab as string) || "items",
      }),
      component: () => (
        <div>
          {anchors.map((a) => (
            <div key={a} data-tour={a} />
          ))}
        </div>
      ),
    });

  const routeTree = rootRoute.addChildren([
    page("/dashboard", []),
    page("/dashboard/vault", ["vault-add-item", "vault-search", "vault-share"]),
    page("/dashboard/watchtower", []),
    page("/dashboard/settings", [
      "settings-security",
      "unlock-remember",
      "settings-data",
      "recovery-kit-download",
    ]),
    page("/dashboard/organization", []),
  ]);

  return createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ["/dashboard"] }),
  });
};

const FORWARD_LABELS = [
  "overlay.next",
  "overlay.takeMeThere",
  "overlay.done",
  "overlay.skipStep",
];

const overlayGone = () =>
  !document.querySelector('[data-testid="guide-overlay"]') &&
  !document.querySelector('[data-testid="guide-spotlight"]');

describe("guided tours against a real router", () => {
  beforeEach(() => {
    window.localStorage.clear();
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => {
    cleanup();
  });

  it.each(GUIDE_TOURS.map((tour) => [tour.id, tour] as const))(
    "tour %s starts and walks every step without crashing",
    async (_id, tour) => {
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      const router = buildRouter();
      render(
        <QueryClientProvider client={client}>
          <GuideProvider>
            <RouterProvider router={router} />
          </GuideProvider>
        </QueryClientProvider>,
      );

      fireEvent.click(await screen.findByTestId("open-panel"));
      const item = await screen.findByTestId(`guide-tour-${tour.id}`);
      fireEvent.click(within(item).getByRole("button"));

      // Overlay must appear for step 1.
      await waitFor(() => {
        expect(
          document.querySelector('[role="dialog"][aria-modal="true"]'),
        ).toBeTruthy();
      });

      // Click through every step; the forward button label depends on
      // anchor state (found → next/done, missing → skipStep/done).
      for (let i = 0; i < tour.steps.length; i++) {
        await waitFor(() => {
          const btn = screen
            .getAllByRole("button")
            .find((b) => FORWARD_LABELS.includes(b.textContent ?? ""));
          expect(btn).toBeTruthy();
        });
        const forward = screen
          .getAllByRole("button")
          .find((b) => FORWARD_LABELS.includes(b.textContent ?? ""))!;
        fireEvent.click(forward);
      }

      await waitFor(() => expect(overlayGone()).toBe(true));
    },
  );

  it("every step route resolves to a real route match", async () => {
    const router = buildRouter();
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <GuideProvider>
          <RouterProvider router={router} />
        </GuideProvider>
      </QueryClientProvider>,
    );
    await screen.findByTestId("open-panel");

    const routes = [
      ...new Set(
        GUIDE_TOURS.flatMap((tour) =>
          tour.steps.map((step) => step.route).filter(Boolean),
        ),
      ),
    ] as string[];

    for (const route of routes) {
      await router.navigate(parseStepRoute(route) as never);
      const [expectedPath, expectedQuery] = route.split("?");
      await waitFor(() => {
        const { location } = router.state;
        expect(location.pathname).toBe(expectedPath);
        // route search params must survive navigation (defaults may be added)
        for (const [key, value] of new URLSearchParams(expectedQuery ?? "")) {
          expect(
            (location.search as Record<string, unknown>)[key],
          ).toBe(value);
        }
        expect(
          router.state.matches.some((m) => m.status === "error"),
        ).toBe(false);
      });
    }
  });
});
