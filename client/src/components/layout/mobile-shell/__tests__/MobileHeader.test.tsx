// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";

let pathname = "/dashboard/vault";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, className, ...props }: any) => (
    <a href={to} className={className} {...props}>
      {children}
    </a>
  ),
  useNavigate: () => vi.fn(),
  useRouter: () => ({ invalidate: vi.fn() }),
  useRouterState: ({ select }: any) => select({ location: { pathname, searchStr: "" } }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (k: string, fallback?: string | Record<string, unknown>) =>
      typeof fallback === "string" ? fallback : k,
    i18n: { language: "en", changeLanguage: vi.fn() },
  }),
  Trans: ({ children }: any) => children,
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}));

const workspaces = [
  { id: "ws-1", name: "Alpha", slug: "alpha", role: "owner", isDefault: true, memberCount: 2 },
  { id: "ws-2", name: "Beta", slug: "beta", role: "admin", isDefault: false, memberCount: 5 },
];
const switchWorkspace = vi.fn().mockResolvedValue(undefined);
const setDefaultWorkspace = vi.fn().mockResolvedValue(undefined);

vi.mock("@/providers/WorkspaceContext", () => ({
  useWorkspaceContext: () => ({
    workspaces,
    activeWorkspace: workspaces[0],
    activeWorkspaceId: "ws-1",
    currentUserRole: "owner",
    isLoading: false,
    error: null,
    switchWorkspace,
    setDefaultWorkspace,
    refreshWorkspaces: vi.fn(),
    isOwner: true,
    isAdminOrOwner: true,
  }),
}));

vi.mock("@/components/dashboard/workspace/CreateWorkspaceDialog", () => ({
  CreateWorkspaceDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="create-dialog">create</div> : null,
}));

vi.mock("@/utils/misc", () => ({ useSignOut: () => vi.fn() }));
vi.mock("@/services/vault-crypto", () => ({ vaultCrypto: { lock: vi.fn() } }));

import { MobileHeader } from "../MobileHeader";

const user = { id: "user-1", name: "Ada", email: "ada@example.com" } as any;

function renderHeader() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MobileHeader user={user} />
    </QueryClientProvider>,
  );
}

describe("MobileHeader", () => {
  beforeEach(() => {
    pathname = "/dashboard/vault";
    switchWorkspace.mockClear();
    setDefaultWorkspace.mockClear();
  });

  it("shows the menu button at tab roots", () => {
    renderHeader();
    expect(screen.getByLabelText("header.menu")).toBeInTheDocument();
  });

  it("shows the back button away from tab roots", () => {
    pathname = "/dashboard/settings/security";
    renderHeader();
    expect(screen.getByLabelText("header.back")).toBeInTheDocument();
  });

  it("workspace trigger opens sheet and calls switchWorkspace on selection", async () => {
    renderHeader();
    const trigger = screen.getByLabelText("Switch workspace");
    expect(trigger).toHaveAttribute("data-tour", "workspace-switcher");
    act(() => {
      fireEvent.click(trigger);
    });
    await waitFor(() => {
      expect(screen.getByText("Beta")).toBeInTheDocument();
    });
    act(() => {
      fireEvent.click(screen.getByText("Beta"));
    });
    await waitFor(() => {
      expect(switchWorkspace).toHaveBeenCalledWith("ws-2");
    });
  });

  it("workspace sheet exposes create-workspace entry that opens the dialog", async () => {
    renderHeader();
    act(() => {
      fireEvent.click(screen.getByLabelText("Switch workspace"));
    });
    await waitFor(() => {
      expect(screen.getByText("Create workspace")).toBeInTheDocument();
    });
    act(() => {
      fireEvent.click(screen.getByText("Create workspace"));
    });
    await waitFor(() => {
      expect(screen.getByTestId("create-dialog")).toBeInTheDocument();
    });
  });

  it("menu sheet renders exactly People, Settings, Lock, Sign out", async () => {
    renderHeader();
    act(() => {
      fireEvent.click(screen.getByLabelText("header.menu"));
    });
    await waitFor(() => {
      expect(screen.getByText("People")).toBeInTheDocument();
    });
    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(screen.getByText("header.lock")).toBeInTheDocument();
    expect(screen.getByText("header.signout")).toBeInTheDocument();

    // Exactly one settings link — no duplicate Account entry.
    const settingsLinks = Array.from(
      document.querySelectorAll('a[href="/dashboard/settings"]'),
    );
    expect(settingsLinks).toHaveLength(1);
  });

  it("People entry deep-links with the nav-people tour anchor", async () => {
    renderHeader();
    act(() => {
      fireEvent.click(screen.getByLabelText("header.menu"));
    });
    await waitFor(() => {
      expect(screen.getByText("People")).toBeInTheDocument();
    });
    const peopleLink = document.querySelector(
      'a[href="/dashboard/organization"]',
    );
    expect(peopleLink).not.toBeNull();
    expect(peopleLink).toHaveAttribute("data-tour", "nav-people");
  });
});
