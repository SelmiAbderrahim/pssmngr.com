// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { MobileShell } from "../MobileShell";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, className, ...props }: any) => (
    <a href={to} className={className} {...props}>
      {children}
    </a>
  ),
  Outlet: () => <div data-testid="mobile-outlet">Outlet</div>,
  useNavigate: () => vi.fn(),
  useRouter: () => ({ invalidate: vi.fn() }),
  useRouterState: ({ select }: any) => select({ location: { pathname: "/dashboard/vault" } }),
}));

vi.mock("@/components/offline", () => ({
  OfflineBanner: ({ className }: { className?: string }) => (
    <div data-testid="offline-banner" className={className} />
  ),
}));

vi.mock("@/components/organization/PendingInvitationsBanner", () => ({
  PendingInvitationsBanner: ({ className }: { className?: string }) => (
    <div data-testid="pending-invitations" className={className} />
  ),
}));


vi.mock("@/providers/WorkspaceContext", () => ({
  useWorkspaceContext: () => ({
    workspaces: [],
    activeWorkspace: null,
    activeWorkspaceId: null,
    currentUserRole: null,
    isLoading: false,
    error: null,
    switchWorkspace: vi.fn(),
    setDefaultWorkspace: vi.fn(),
    refreshWorkspaces: vi.fn(),
    isOwner: false,
    isAdminOrOwner: false,
  }),
}));

vi.mock("@/components/dashboard/workspace/CreateWorkspaceDialog", () => ({
  CreateWorkspaceDialog: () => null,
}));

vi.mock("@/components/generator/GeneratorPanel", () => ({
  GeneratorPanel: () => <div data-testid="generator-panel" />,
}));

describe("MobileShell", () => {
  it("renders header, outlet, bottom nav, offline banner, and safe-area classes", () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <MobileShell user={{ id: "1", name: "Ada", email: "ada@example.com" } as any} />
      </QueryClientProvider>,
    );

    expect(screen.getByTestId("mobile-outlet")).toBeInTheDocument();
    expect(screen.getByTestId("offline-banner")).toBeInTheDocument();
    expect(screen.getByLabelText("bottom_nav.quick_add")).toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass("pt-safe-t", "pb-safe-b", "ps-safe-s", "pe-safe-e");
  });
});
