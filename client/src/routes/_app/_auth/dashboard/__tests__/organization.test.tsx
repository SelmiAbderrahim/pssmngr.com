// Copyright (c) 2026 Password Manager contributors
/**
 * Organization Page Tests
 *
 * Covers:
 * - All tabs render their supported organization content
 * - Tab state persists in URL via navigate
 * - Loading and error states displayed correctly
 * - No-organization empty state
 * - Invite button visibility based on role
 * - Header displays org name and member count
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

// ── Mocks (before imports) ──────────────────────────────────────────

const mockTrpcQuery = vi.fn();
const mockTrpcMutation = vi.fn();
vi.mock("@/lib/api/trpc", () => ({
  trpcQuery: (...args: unknown[]) => mockTrpcQuery(...args),
  trpcMutation: (...args: unknown[]) => mockTrpcMutation(...args),
}));

vi.mock("@/lib/api/client", () => ({
  isApiError: (err: unknown) =>
    typeof err === "object" && err !== null && "message" in err,
}));


let mockSearchTab = "members";
const mockNavigate = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: (_path: string) => (options: Record<string, unknown>) => ({
    ...options,
    useSearch: () => ({ tab: mockSearchTab }),
  }),
  useNavigate: () => mockNavigate,
  Link: ({
    to,
    children,
    className,
    ...rest
  }: {
    to: string;
    children: React.ReactNode;
    className?: string;
    [key: string]: unknown;
  }) => React.createElement("a", { href: to, className, ...rest }, children),
}));

let mockActiveWorkspaceId: string | null = "org-1";
let mockIsWorkspaceLoading = false;
let mockWorkspaces: Array<{ id: string }> = [{ id: "org-1" }, { id: "org-2" }];
const mockSwitchWorkspace = vi.fn().mockResolvedValue(undefined);
const mockRefreshWorkspaces = vi.fn();

vi.mock("@/providers/WorkspaceContext", () => ({
  useWorkspaceContext: () => ({
    activeWorkspaceId: mockActiveWorkspaceId,
    isLoading: mockIsWorkspaceLoading,
    workspaces: mockWorkspaces,
    switchWorkspace: mockSwitchWorkspace,
    refreshWorkspaces: mockRefreshWorkspaces,
  }),
}));

// Mock child components to isolate page logic
vi.mock("@/components/organization/InviteMemberDialog", () => ({
  OrgInviteMemberDialog: ({ open }: { open: boolean }) =>
    open
      ? React.createElement(
          "div",
          { "data-testid": "invite-dialog" },
          "Invite Dialog",
        )
      : null,
}));


vi.mock("@/components/organization/MemberTable", () => ({
  MemberTable: () =>
    React.createElement(
      "div",
      { "data-testid": "member-table" },
      "Member Table",
    ),
}));

vi.mock("@/components/organization/InvitationsTable", () => ({
  InvitationsTable: () =>
    React.createElement(
      "div",
      { "data-testid": "invitations-table" },
      "Invitations Table",
    ),
}));

vi.mock("@/components/organization/OrgSettingsForm", () => ({
  OrgSettingsForm: () =>
    React.createElement(
      "div",
      { "data-testid": "org-settings-form" },
      "Settings Form",
    ),
}));

vi.mock("@/components/organization/DangerZone", () => ({
  DangerZone: (props: {
    onDeleteOrganization: () => Promise<void>;
    onLeaveOrganization: () => Promise<void>;
    onTransferOwnership: (memberId: string) => Promise<void>;
  }) =>
    React.createElement(
      "div",
      { "data-testid": "danger-zone" },
      "Danger Zone",
      React.createElement(
        "button",
        {
          onClick: () => {
            props.onDeleteOrganization().catch(() => {});
          },
        },
        "trigger-delete-org",
      ),
    ),
}));

// CreateWorkspaceDialog (rendered in the no-organization empty state) internally
// uses useCreateOrganization -> useQueryClient, which would require a
// QueryClientProvider wrapper. Mock it to isolate the page logic.
vi.mock("@/components/dashboard/workspace/CreateWorkspaceDialog", () => ({
  CreateWorkspaceDialog: ({ open }: { open: boolean }) =>
    open
      ? React.createElement(
          "div",
          { "data-testid": "create-workspace-dialog" },
          "Create Workspace Dialog",
        )
      : null,
}));

// FamilyPanel is mounted inside the Family tab. It has its
// own network calls + dialogs, so mock it to isolate the org page.
vi.mock("@/components/family/FamilyPanel", () => ({
  FamilyPanel: () =>
    React.createElement(
      "div",
      { "data-testid": "family-panel" },
      "Family Panel",
    ),
}));

// Import after mocks
import { Route } from "../organization";

const OrganizationPage = (
  Route as unknown as { component: React.ComponentType }
).component;

// ── Helpers ─────────────────────────────────────────────────────────

const ORG_DETAILS = {
  id: "org-1",
  name: "Acme Corp",
  slug: "acme-corp",
  logo: null,
  createdAt: "2024-01-01T00:00:00.000Z",
  memberCount: 5,
  maxMembers: 10,
  role: "owner" as const,
};

const MEMBERS = [
  {
    id: "mem-1",
    userId: "user-1",
    role: "owner",
    joinedAt: "2024-01-01T00:00:00.000Z",
    user: {
      id: "user-1",
      name: "Owner User",
      email: "owner@acme.com",
      image: null,
    },
  },
  {
    id: "mem-2",
    userId: "user-2",
    role: "member",
    joinedAt: "2024-02-01T00:00:00.000Z",
    user: {
      id: "user-2",
      name: "Regular User",
      email: "regular@acme.com",
      image: null,
    },
  },
];

const INVITATIONS = [
  {
    id: "inv-1",
    email: "invited@acme.com",
    role: "member",
    status: "pending",
    expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    inviterId: "user-1",
  },
];

function setupDefaultMocks() {
  mockTrpcQuery.mockImplementation(
    (router: string, procedure: string, _input?: unknown) => {
      if (router === "user" && procedure === "get") {
        return Promise.resolve({ id: "user-1" });
      }
      if (router === "organization" && procedure === "getMyOrganization") {
        return Promise.resolve(ORG_DETAILS);
      }
      if (router === "organization" && procedure === "listMembers") {
        return Promise.resolve({ members: MEMBERS, total: 2 });
      }
      if (router === "organization" && procedure === "listInvitations") {
        return Promise.resolve(INVITATIONS);
      }
      return Promise.resolve(null);
    },
  );
  mockTrpcMutation.mockResolvedValue(undefined);
}

// ── Tests ───────────────────────────────────────────────────────────

describe("OrganizationPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchTab = "members";
    mockActiveWorkspaceId = "org-1";
    mockIsWorkspaceLoading = false;
    mockWorkspaces = [{ id: "org-1" }, { id: "org-2" }];
    setupDefaultMocks();
  });

  describe("loading state", () => {
    it("renders skeleton while workspace is loading", () => {
      mockIsWorkspaceLoading = true;
      const { container } = render(<OrganizationPage />);

      // Skeleton elements are rendered (pulse-animated divs)
      const skeletons = container.querySelectorAll('[class*="animate-pulse"]');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it("renders skeleton while org data is loading", () => {
      // Make trpcQuery hang (never resolve)
      mockTrpcQuery.mockImplementation(() => new Promise(() => {}));
      const { container } = render(<OrganizationPage />);

      const skeletons = container.querySelectorAll('[class*="animate-pulse"]');
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  describe("no organization state", () => {
    it("renders no-org message when no workspace is active", async () => {
      mockActiveWorkspaceId = null;
      render(<OrganizationPage />);

      await waitFor(() => {
        expect(
          screen.getByText("organization:noOrganization"),
        ).toBeInTheDocument();
      });
    });

    it("renders no-org message when API returns null", async () => {
      mockTrpcQuery.mockImplementation(
        (router: string, procedure: string) => {
          if (router === "user" && procedure === "get") {
            return Promise.resolve({ id: "user-1" });
          }
          if (
            router === "organization" &&
            procedure === "getMyOrganization"
          ) {
            return Promise.resolve(null);
          }
          return Promise.resolve(null);
        },
      );

      render(<OrganizationPage />);

      await waitFor(() => {
        expect(
          screen.getByText("organization:noOrganization"),
        ).toBeInTheDocument();
      });
    });
  });

  describe("error state", () => {
    it("renders error alert when fetch fails", async () => {
      mockTrpcQuery.mockImplementation(
        (router: string, procedure: string) => {
          if (router === "user" && procedure === "get") {
            return Promise.resolve({ id: "user-1" });
          }
          if (
            router === "organization" &&
            procedure === "getMyOrganization"
          ) {
            return Promise.reject(new Error("Network error"));
          }
          return Promise.resolve(null);
        },
      );

      render(<OrganizationPage />);

      await waitFor(() => {
        expect(screen.getByText("Network error")).toBeInTheDocument();
      });
    });
  });

  describe("header", () => {
    it("renders org name in header", async () => {
      render(<OrganizationPage />);

      await waitFor(() => {
        expect(screen.getByText("Acme Corp")).toBeInTheDocument();
      });
    });

    it("renders slug in subheader", async () => {
      render(<OrganizationPage />);

      await waitFor(() => {
        expect(
          screen.getByText("organization:slug"),
        ).toBeInTheDocument();
      });
    });

    it("renders member count", async () => {
      render(<OrganizationPage />);

      await waitFor(() => {
        expect(
	          screen.getByText("organization:memberCount"),
        ).toBeInTheDocument();
      });
    });

    it("renders invite button for owner", async () => {
      render(<OrganizationPage />);

      await waitFor(() => {
        expect(
          screen.getByText("organization:inviteMember"),
        ).toBeInTheDocument();
      });
    });

    it("does not render invite button for regular member", async () => {
      mockTrpcQuery.mockImplementation(
        (router: string, procedure: string) => {
          if (router === "user" && procedure === "get") {
            return Promise.resolve({ id: "user-2" });
          }
          if (
            router === "organization" &&
            procedure === "getMyOrganization"
          ) {
            return Promise.resolve({ ...ORG_DETAILS, role: "member" });
          }
          if (router === "organization" && procedure === "listMembers") {
            return Promise.resolve({ members: MEMBERS, total: 2 });
          }
          if (
            router === "organization" &&
            procedure === "listInvitations"
          ) {
            return Promise.resolve(INVITATIONS);
          }
          return Promise.resolve(null);
        },
      );

      render(<OrganizationPage />);

      await waitFor(() => {
        expect(screen.getByText("Acme Corp")).toBeInTheDocument();
      });

      expect(
        screen.queryByText("organization:inviteMember"),
      ).not.toBeInTheDocument();
    });
  });

  describe("tab list", () => {
    it("shows all organization tabs", async () => {
      render(<OrganizationPage />);

      await waitFor(() => {
        expect(
          screen.getByText("organization:tabs.members"),
        ).toBeInTheDocument();
        expect(
          screen.getByText("organization:tabs.invitations"),
        ).toBeInTheDocument();
        expect(
          screen.getByText("organization:tabs.family"),
        ).toBeInTheDocument();
        expect(
          screen.getByText("organization:tabs.settings"),
        ).toBeInTheDocument();
      });
    });
  });

  describe("tabs", () => {
    it("renders members tab content by default", async () => {
      mockSearchTab = "members";
      render(<OrganizationPage />);

      await waitFor(() => {
        expect(screen.getByTestId("member-table")).toBeInTheDocument();
      });
    });

    it("renders invitations tab content when selected", async () => {
      mockSearchTab = "invitations";
      render(<OrganizationPage />);

      await waitFor(() => {
        expect(
          screen.getByTestId("invitations-table"),
        ).toBeInTheDocument();
      });
    });

    it("renders settings tab content when selected", async () => {
      mockSearchTab = "settings";
      render(<OrganizationPage />);

      await waitFor(() => {
        expect(
          screen.getByTestId("org-settings-form"),
        ).toBeInTheDocument();
        expect(screen.getByTestId("danger-zone")).toBeInTheDocument();
      });
    });

    it("mounts the FamilyPanel when tab=family", async () => {
      mockSearchTab = "family";
      render(<OrganizationPage />);

      await waitFor(() => {
        expect(screen.getByTestId("family-panel")).toBeInTheDocument();
      });
    });

    it("navigates with replace when switching tabs", async () => {
      const user = userEvent.setup();
      render(<OrganizationPage />);

      await waitFor(() => {
        expect(
          screen.getByText("organization:tabs.settings"),
        ).toBeInTheDocument();
      });

      const settingsTab = screen.getByText("organization:tabs.settings");
      await user.click(settingsTab);

      expect(mockNavigate).toHaveBeenCalledWith(
        expect.objectContaining({
          search: { tab: "settings" },
          replace: true,
        }),
      );
    });
  });

  describe("danger zone — delete organization wiring", () => {
    it("calls the deleteOrganization mutation and navigates to /dashboard on success", async () => {
      const user = userEvent.setup();
      mockSearchTab = "settings";
      render(<OrganizationPage />);

      await waitFor(() => {
        expect(screen.getByTestId("danger-zone")).toBeInTheDocument();
      });

      await user.click(screen.getByText("trigger-delete-org"));

      await waitFor(() => {
        expect(mockTrpcMutation).toHaveBeenCalledWith(
          "organization",
          "deleteOrganization",
          { organizationId: "org-1" },
        );
      });
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith({
          to: "/dashboard",
          replace: true,
        });
      });
    });

    it("does not navigate away when the deleteOrganization mutation fails", async () => {
      const user = userEvent.setup();
      mockSearchTab = "settings";
      mockTrpcMutation.mockImplementation(
        (router: string, procedure: string) => {
          if (router === "organization" && procedure === "deleteOrganization") {
            return Promise.reject(new Error("Delete failed"));
          }
          return Promise.resolve(undefined);
        },
      );
      render(<OrganizationPage />);

      await waitFor(() => {
        expect(screen.getByTestId("danger-zone")).toBeInTheDocument();
      });

      await user.click(screen.getByText("trigger-delete-org"));

      await waitFor(() => {
        expect(mockTrpcMutation).toHaveBeenCalledWith(
          "organization",
          "deleteOrganization",
          { organizationId: "org-1" },
        );
      });
      expect(mockNavigate).not.toHaveBeenCalledWith(
        expect.objectContaining({ to: "/dashboard" }),
      );
    });

    it("switches to another workspace before navigating away, so /dashboard never loads the deleted org's vault", async () => {
      const user = userEvent.setup();
      mockSearchTab = "settings";
      mockWorkspaces = [{ id: "org-1" }, { id: "org-2" }];
      render(<OrganizationPage />);

      await waitFor(() => {
        expect(screen.getByTestId("danger-zone")).toBeInTheDocument();
      });

      await user.click(screen.getByText("trigger-delete-org"));

      await waitFor(() => {
        expect(mockSwitchWorkspace).toHaveBeenCalledWith("org-2");
      });
      expect(mockRefreshWorkspaces).toHaveBeenCalled();
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith({
          to: "/dashboard",
          replace: true,
        });
      });

      // switchWorkspace must resolve before navigating, not just be fired.
      const switchOrder = mockSwitchWorkspace.mock.invocationCallOrder[0]!;
      const navigateOrder = mockNavigate.mock.invocationCallOrder[0]!;
      expect(switchOrder).toBeLessThan(navigateOrder);
    });

    it("does not switch workspaces when the deleted org was the only one, but still refreshes the list", async () => {
      const user = userEvent.setup();
      mockSearchTab = "settings";
      mockWorkspaces = [{ id: "org-1" }];
      render(<OrganizationPage />);

      await waitFor(() => {
        expect(screen.getByTestId("danger-zone")).toBeInTheDocument();
      });

      await user.click(screen.getByText("trigger-delete-org"));

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith({
          to: "/dashboard",
          replace: true,
        });
      });
      expect(mockSwitchWorkspace).not.toHaveBeenCalled();
      expect(mockRefreshWorkspaces).toHaveBeenCalled();
    });
  });

  describe("invite dialog", () => {
    it("opens invite dialog when invite button is clicked", async () => {
      const user = userEvent.setup();
      render(<OrganizationPage />);

      await waitFor(() => {
        expect(
          screen.getByText("organization:inviteMember"),
        ).toBeInTheDocument();
      });

      await user.click(screen.getByText("organization:inviteMember"));

      expect(screen.getByTestId("invite-dialog")).toBeInTheDocument();
    });
  });
});
