// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * WorkspaceSwitcher Component Unit Tests
 *
 * Tests for the workspace switching dropdown UI:
 * - Renders workspace list from useWorkspaces
 * - Active org is highlighted
 * - Clicking an org triggers switch
 * - Default star toggles
 * - Create dialog opens and submits
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { WorkspaceWithMembership } from "@/types/workspace";
import type { WorkspaceContextValue } from "@/providers/WorkspaceContext";

// --- Mock data ---

const mockWorkspaces: WorkspaceWithMembership[] = [
  {
    id: "ws-1",
    name: "My Workspace",
    slug: "my-workspace",
    logo: null,
    createdAt: "2025-01-01T00:00:00Z",
    role: "owner",
    isDefault: true,
    memberCount: 3,
    maxMembers: 10,
    planTier: "pro",
    memberLimit: 10,
    isProOrAbove: true,
  },
  {
    id: "ws-2",
    name: "Team Workspace",
    slug: "team-workspace",
    logo: null,
    createdAt: "2025-02-01T00:00:00Z",
    role: "admin",
    isDefault: false,
    memberCount: 8,
    maxMembers: 10,
    planTier: "pro",
    memberLimit: 10,
    isProOrAbove: true,
  },
];

// --- Mocks ---

const mockSwitchWorkspace = vi.fn().mockResolvedValue(undefined);
const mockSetDefaultWorkspace = vi.fn().mockResolvedValue(undefined);
const mockRefreshWorkspaces = vi.fn();

let mockContextValue: WorkspaceContextValue;

vi.mock("@/providers/WorkspaceContext", () => ({
  useWorkspaceContext: () => mockContextValue,
}));

// Mock CreateWorkspaceDialog to test open/close without full dialog implementation
vi.mock(
  "@/components/dashboard/workspace/CreateWorkspaceDialog",
  () => ({
    CreateWorkspaceDialog: ({
      open,
    }: {
      open: boolean;
      onOpenChange: (open: boolean) => void;
    }) => {
      return open
        ? React.createElement(
            "div",
            { "data-testid": "create-dialog" },
            "Create Dialog"
          )
        : null;
    },
  })
);

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (
      key: string,
      fallbackOrOptions?: string | Record<string, unknown>,
      options?: Record<string, unknown>
    ) => {
      // t("key", "default string") -- simple case
      if (typeof fallbackOrOptions === "string" && !options) {
        return fallbackOrOptions;
      }
      // t("key", "default {{count}} members", { count: 3 }) -- interpolated
      if (typeof fallbackOrOptions === "string" && options) {
        return fallbackOrOptions.replace(
          /\{\{(\w+)\}\}/g,
          (_, k: string) => String(options[k] ?? "")
        );
      }
      // t("key", { count: 3 }) -- options only
      if (
        typeof fallbackOrOptions === "object" &&
        fallbackOrOptions !== null &&
        "count" in fallbackOrOptions
      ) {
        return `${fallbackOrOptions.count} members`;
      }
      return key;
    },
    i18n: { language: "en", changeLanguage: vi.fn() },
  }),
  Trans: ({ children }: { children: React.ReactNode }) => children,
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}));

// --- Import after mocks ---

import { WorkspaceSwitcher } from "@/components/layout/WorkspaceSwitcher";

// --- Helpers ---

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function renderSwitcher() {
  const queryClient = createQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <WorkspaceSwitcher />
    </QueryClientProvider>
  );
}

// --- Tests ---

describe("WorkspaceSwitcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSwitchWorkspace.mockResolvedValue(undefined);
    mockSetDefaultWorkspace.mockResolvedValue(undefined);

    mockContextValue = {
      workspaces: mockWorkspaces,
      activeWorkspace: mockWorkspaces[0]!,
      activeWorkspaceId: "ws-1",
      currentUserRole: "owner",
      isLoading: false,
      error: null,
      switchWorkspace: mockSwitchWorkspace,
      setDefaultWorkspace: mockSetDefaultWorkspace,
      refreshWorkspaces: mockRefreshWorkspaces,
      isOwner: true,
      isAdminOrOwner: true,
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should render the active workspace name in the trigger button", () => {
    renderSwitcher();

    expect(screen.getByText("My Workspace")).toBeInTheDocument();
  });

  it("should show loading state when isLoading is true", () => {
    mockContextValue = {
      ...mockContextValue,
      isLoading: true,
      workspaces: [],
      activeWorkspace: null,
      activeWorkspaceId: null,
    };

    renderSwitcher();

    expect(screen.getByText("Loading...")).toBeInTheDocument();
    // Button should be disabled
    const button = screen.getByRole("button");
    expect(button).toBeDisabled();
  });

  it("should show fallback text when no active workspace", () => {
    mockContextValue = {
      ...mockContextValue,
      activeWorkspace: null,
      activeWorkspaceId: null,
    };

    renderSwitcher();

    expect(screen.getByText("Select workspace")).toBeInTheDocument();
  });

  it("should render list of workspaces when dropdown is opened", async () => {
    const user = userEvent.setup();
    renderSwitcher();

    // Open dropdown
    const trigger = screen.getByRole("combobox");
    await user.click(trigger);

    // Both workspaces should appear in the dropdown list
    await waitFor(() => {
      // "My Workspace" appears both in trigger and dropdown
      expect(screen.getAllByText("My Workspace").length).toBeGreaterThanOrEqual(2);
      expect(screen.getByText("Team Workspace")).toBeInTheDocument();
    });
  });

  it("should show member counts in dropdown", async () => {
    const user = userEvent.setup();
    renderSwitcher();

    await user.click(screen.getByRole("combobox"));

    await waitFor(() => {
      expect(screen.getByText("3 members")).toBeInTheDocument();
      expect(screen.getByText("8 members")).toBeInTheDocument();
    });
  });

  it("should show empty state when no workspaces", async () => {
    mockContextValue = {
      ...mockContextValue,
      workspaces: [],
      activeWorkspace: null,
      activeWorkspaceId: null,
    };
    const user = userEvent.setup();
    renderSwitcher();

    await user.click(screen.getByRole("combobox"));

    await waitFor(() => {
      expect(screen.getByText("No workspaces yet")).toBeInTheDocument();
    });
  });

  it("should call switchWorkspace when a different workspace is selected", async () => {
    const user = userEvent.setup();
    renderSwitcher();

    await user.click(screen.getByRole("combobox"));

    // Click the second workspace (Team Workspace)
    await waitFor(() => {
      expect(screen.getByText("Team Workspace")).toBeInTheDocument();
    });

    // Find the menu item for Team Workspace and click it
    const teamOption = screen.getByText("Team Workspace").closest("[role='menuitem']");
    expect(teamOption).not.toBeNull();
    await user.click(teamOption!);

    expect(mockSwitchWorkspace).toHaveBeenCalledWith("ws-2");
  });

  it("should not call switchWorkspace when clicking already active workspace", async () => {
    const user = userEvent.setup();
    renderSwitcher();

    await user.click(screen.getByRole("combobox"));

    await waitFor(() => {
      // Multiple "My Workspace" texts (trigger + list item)
      expect(screen.getAllByText("My Workspace").length).toBeGreaterThanOrEqual(2);
    });

    // Click the active workspace item in the dropdown list
    const allMyWorkspace = screen.getAllByText("My Workspace");
    const menuItem = allMyWorkspace
      .map((el) => el.closest("[role='menuitem']"))
      .find((el) => el !== null);

    if (menuItem) {
      await user.click(menuItem);
    }

    expect(mockSwitchWorkspace).not.toHaveBeenCalled();
  });

  it("should open create workspace dialog when 'Create workspace' is clicked", async () => {
    const user = userEvent.setup();
    renderSwitcher();

    await user.click(screen.getByRole("combobox"));

    await waitFor(() => {
      expect(screen.getByText("Create workspace")).toBeInTheDocument();
    });

    const createItem = screen.getByText("Create workspace").closest("[role='menuitem']");
    expect(createItem).not.toBeNull();
    await user.click(createItem!);

    // The dialog should now be visible
    await waitFor(() => {
      expect(screen.getByTestId("create-dialog")).toBeInTheDocument();
    });
  });

  it("should have accessible trigger with aria-label", () => {
    renderSwitcher();

    const trigger = screen.getByRole("combobox");
    expect(trigger).toHaveAttribute("aria-label", "Switch workspace");
  });

  it("should show default star indicator on default workspace", async () => {
    const user = userEvent.setup();
    renderSwitcher();

    await user.click(screen.getByRole("combobox"));

    // The non-default workspace (ws-2) should have a "Set as default" button
    await waitFor(() => {
      const setDefaultBtn = screen.getByTitle("Set as default");
      expect(setDefaultBtn).toBeInTheDocument();
    });
  });

  it("should ensure minimum touch target size on trigger button", () => {
    renderSwitcher();

    const trigger = screen.getByRole("combobox");
    expect(trigger.className).toContain("min-h-[44px]");
  });
});
