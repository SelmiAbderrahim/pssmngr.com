// Copyright (c) 2026 Password Manager contributors

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Building2, Mail, Settings, Users, UsersRound } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CreateWorkspaceDialog } from "@/components/dashboard/workspace/CreateWorkspaceDialog";
import { FamilyPanel } from "@/components/family/FamilyPanel";
import { DangerZone } from "@/components/organization/DangerZone";
import type { OrgInvitation } from "@/components/organization/InvitationsTable";
import { InvitationsTable } from "@/components/organization/InvitationsTable";
import { OrgInviteMemberDialog } from "@/components/organization/InviteMemberDialog";
import type { OrgMember } from "@/components/organization/MemberTable";
import { MemberTable } from "@/components/organization/MemberTable";
import { OrgSettingsForm } from "@/components/organization/OrgSettingsForm";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { isApiError } from "@/lib/api/client";
import { trpcMutation, trpcQuery } from "@/lib/api/trpc";
import { usePendingVaultAccess } from "@/providers/OrgVaultAutoGrantProvider";
import { useWorkspaceContext } from "@/providers/WorkspaceContext";

type OrgTabState = "members" | "invitations" | "family" | "settings";

const VALID_TABS: OrgTabState[] = [
  "members",
  "invitations",
  "family",
  "settings",
];

export const Route = createFileRoute("/_app/_auth/dashboard/organization")({
  component: OrganizationPage,
  validateSearch: (search: Record<string, unknown>) => ({
    tab: VALID_TABS.includes(search.tab as OrgTabState)
      ? (search.tab as OrgTabState)
      : "members",
  }),
});

interface OrgDetails {
  id: string;
  name: string;
  slug: string | null;
  logo: string | null;
  createdAt: string;
  memberCount: number;
  maxMembers: number;
  role: "owner" | "admin" | "member";
}

function OrganizationPage() {
  const { t } = useTranslation(["organization", "common", "workspace"]);
  const navigate = useNavigate();
  const { tab } = Route.useSearch();
  const {
    activeWorkspaceId,
    isLoading: isWorkspaceLoading,
    workspaces,
    switchWorkspace,
    refreshWorkspaces,
  } = useWorkspaceContext();

  // Data state
  const [org, setOrg] = useState<OrgDetails | null>(null);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [invitations, setInvitations] = useState<OrgInvitation[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");

  // UI state
  const [isLoading, setIsLoading] = useState(true);
  const [noOrg, setNoOrg] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const isOwnerOrAdmin = org
    ? org.role === "owner" || org.role === "admin"
    : false;
  const isOwner = org?.role === "owner";
  const { pendingAccessCount } = usePendingVaultAccess();

  const handleTabChange = useCallback(
    (newTab: string) => {
      navigate({
        to: "/dashboard/organization",
        search: { tab: newTab as OrgTabState },
        replace: true,
      });
    },
    [navigate],
  );

  // Fetch current user
  useEffect(() => {
    trpcQuery<{ id: string }>("user", "get")
      .then((u) => setCurrentUserId(u.id))
      .catch(() => {});
  }, []);

  // Fetch organization (requires activeWorkspaceId)
  const fetchOrg = useCallback(async () => {
    if (!activeWorkspaceId) {
      setNoOrg(true);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const data = await trpcQuery<OrgDetails | null>(
        "organization",
        "getMyOrganization",
        { organizationId: activeWorkspaceId },
      );
      if (!data) {
        setNoOrg(true);
      } else {
        setOrg(data);
        setNoOrg(false);
      }
    } catch (err) {
      setError(
        isApiError(err)
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to load organization.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [activeWorkspaceId]);

  const fetchMembers = useCallback(async () => {
    if (!activeWorkspaceId) return;
    try {
      const data = await trpcQuery<{ members: OrgMember[]; total: number }>(
        "organization",
        "listMembers",
        { organizationId: activeWorkspaceId, limit: 50, offset: 0 },
      );
      setMembers(data.members);
    } catch {
      // Non-critical
    }
  }, [activeWorkspaceId]);

  const fetchInvitations = useCallback(async () => {
    if (!activeWorkspaceId) return;
    try {
      const data = await trpcQuery<OrgInvitation[]>(
        "organization",
        "listInvitations",
        { organizationId: activeWorkspaceId },
      );
      setInvitations(data);
    } catch {
      // Non-critical
    }
  }, [activeWorkspaceId]);

  useEffect(() => {
    if (!isWorkspaceLoading) {
      fetchOrg();
    }
  }, [fetchOrg, isWorkspaceLoading]);

  useEffect(() => {
    if (org) {
      fetchMembers();
      fetchInvitations();
    }
  }, [org, fetchMembers, fetchInvitations]);

  // Actions
  async function handleInvite(email: string, role: "member" | "admin") {
    if (!activeWorkspaceId) return;
    await trpcMutation("organization", "inviteMember", {
      organizationId: activeWorkspaceId,
      email,
      role,
    });
    fetchMembers();
    fetchInvitations();
  }

  async function handleRemoveMember(memberId: string) {
    if (!activeWorkspaceId) return;
    await trpcMutation("organization", "removeMember", {
      organizationId: activeWorkspaceId,
      memberId,
    });
    fetchMembers();
  }

  async function handleChangeRole(memberId: string, role: "member" | "admin") {
    if (!activeWorkspaceId) return;
    await trpcMutation("organization", "updateMemberRole", {
      organizationId: activeWorkspaceId,
      memberId,
      role,
    });
    fetchMembers();
  }

  async function handleTransferOwnership(memberId: string) {
    if (!activeWorkspaceId) return;
    await trpcMutation("organization", "transferOwnership", {
      organizationId: activeWorkspaceId,
      newOwnerId: memberId,
    });
    fetchOrg();
    fetchMembers();
  }

  async function handleCancelInvitation(invitationId: string) {
    if (!activeWorkspaceId) return;
    await trpcMutation("organization", "cancelInvitation", {
      organizationId: activeWorkspaceId,
      invitationId,
    });
    fetchInvitations();
  }

  async function handleResendInvitation(invitationId: string) {
    if (!activeWorkspaceId) return;
    await trpcMutation("organization", "resendInvitation", {
      organizationId: activeWorkspaceId,
      invitationId,
    });
    fetchInvitations();
  }

  async function handleDeleteOrganization() {
    if (!activeWorkspaceId) return;
    await trpcMutation("organization", "deleteOrganization", {
      organizationId: activeWorkspaceId,
    });

    // The deleted org is still in `workspaces` (pre-refetch); switch away
    // from it before navigating so /dashboard never loads the vault against
    // a dead organizationId.
    const nextWorkspace = workspaces.find((w) => w.id !== activeWorkspaceId);
    if (nextWorkspace) {
      await switchWorkspace(nextWorkspace.id);
    }
    refreshWorkspaces();

    navigate({ to: "/dashboard", replace: true });
  }

  async function handleLeaveOrganization() {
    if (!activeWorkspaceId) return;
    await trpcMutation("organization", "leaveOrganization", {
      organizationId: activeWorkspaceId,
    });
    navigate({ to: "/dashboard", replace: true });
  }

  async function handleSaveSettings(name: string, slug: string) {
    if (!activeWorkspaceId) return;
    const input: Record<string, string> = {
      organizationId: activeWorkspaceId,
    };
    if (name && name !== org?.name) input.name = name;
    if (slug && slug !== (org?.slug || "")) input.slug = slug;
    if (Object.keys(input).length > 1) {
      await trpcMutation("organization", "updateOrganization", input);
      refreshWorkspaces();
      fetchOrg();
    }
  }

  // Loading skeleton
  if (isLoading || isWorkspaceLoading) {
    return (
      <div className="container mx-auto p-4 sm:p-6">
        <div className="mb-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-4 w-72 mt-2" />
            </div>
            <Skeleton className="h-8 w-32" />
          </div>
        </div>
        <Skeleton className="h-10 w-full max-w-md mb-6" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // Error state (no org loaded)
  if (error && !org) {
    return (
      <div className="container mx-auto p-4 sm:p-6">
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  // No organization state
  if (noOrg) {
    return (
      <div className="container mx-auto p-4 sm:p-6">
        <div className="mb-8">
          {/* Header copy from common:pages.people.* */}
          <h1 className="text-2xl font-semibold">
            {t("common:pages.people.title")}
          </h1>
          <p className="text-muted-foreground mt-1">
            {t("common:pages.people.description")}
          </p>
        </div>
        <div className="max-w-md mx-auto text-center py-12">
          <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-lg font-semibold mb-2">
            {t("organization:noOrganization")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("organization:noOrganizationDescription")}
          </p>
          <Button
            className="mt-6 min-h-[44px]"
            onClick={() => setCreateDialogOpen(true)}
          >
            {t("workspace:create.title", "Create Organization")}
          </Button>
        </div>
        <CreateWorkspaceDialog
          open={createDialogOpen}
          onOpenChange={setCreateDialogOpen}
        />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 sm:p-6">
      {/* Page Header */}
      <div className="mb-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold">
                {org?.name || t("common:pages.people.title")}
              </h1>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {org?.slug && (
                <span className="me-3">
                  {t("organization:slug", { slug: org.slug })}
                </span>
              )}
              {t("organization:memberCount", { count: members.length })}
            </p>
          </div>
          {isOwnerOrAdmin && (
            <Button
              size="sm"
              onClick={() => setInviteDialogOpen(true)}
              className="min-h-[44px] self-start"
            >
              <Mail className="h-4 w-4 me-1" />
              {t("organization:inviteMember")}
            </Button>
          )}
        </div>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Tabs value={tab} onValueChange={handleTabChange}>
        <TabsList className="mb-6">
          <TabsTrigger value="members" className="gap-1.5 min-h-[44px]">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">
              {t("organization:tabs.members")}
            </span>
            {isOwnerOrAdmin && pendingAccessCount > 0 && (
              <Badge
                variant="secondary"
                className="ms-1 px-1.5"
                aria-label={t(
                  "organization:members.waitingForAccessBadge",
                  "{{count}} waiting for access",
                  { count: pendingAccessCount },
                )}
              >
                {pendingAccessCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="invitations" className="gap-1.5 min-h-[44px]">
            <Mail className="h-4 w-4" />
            <span className="hidden sm:inline">
              {t("organization:tabs.invitations")}
            </span>
          </TabsTrigger>
          <TabsTrigger value="family" className="gap-1.5 min-h-[44px]">
            <UsersRound className="h-4 w-4" />
            <span className="hidden sm:inline">
              {t("organization:tabs.family", "Family")}
            </span>
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-1.5 min-h-[44px]">
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">
              {t("organization:tabs.settings")}
            </span>
          </TabsTrigger>
        </TabsList>

        {/* Members Tab */}
        <TabsContent value="members">
          {isOwnerOrAdmin && pendingAccessCount > 0 && (
            <Alert className="mb-4">
              <AlertDescription>
                {t(
                  "organization:members.waitingForAccess",
                  "{{count}} member(s) are waiting for shared-vault access. They'll be granted automatically once they sign in on a device — no action needed.",
                  { count: pendingAccessCount },
                )}
              </AlertDescription>
            </Alert>
          )}
          <MemberTable
            members={members}
            currentUserId={currentUserId}
            isOwner={isOwner ?? false}
            isOwnerOrAdmin={isOwnerOrAdmin}
            onChangeRole={handleChangeRole}
            onRemoveMember={handleRemoveMember}
            onTransferOwnership={handleTransferOwnership}
          />
        </TabsContent>

        {/* Invitations Tab */}
        <TabsContent value="invitations">
          <InvitationsTable
            invitations={invitations}
            isOwnerOrAdmin={isOwnerOrAdmin}
            onCancelInvitation={handleCancelInvitation}
            onResendInvitation={handleResendInvitation}
          />
        </TabsContent>

        {/* Family Tab — hosts the previously standalone /dashboard/family */}
        <TabsContent value="family">
          <FamilyPanel />
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings">
          <div className="space-y-6">
            <OrgSettingsForm
              orgName={org?.name || ""}
              orgSlug={org?.slug || ""}
              isOwnerOrAdmin={isOwnerOrAdmin}
              onSave={handleSaveSettings}
            />

            {/* Danger Zone */}
            {org && (
              <DangerZone
                orgName={org.name}
                orgId={org.id}
                isOwner={isOwner ?? false}
                currentUserId={currentUserId}
                members={members}
                onTransferOwnership={handleTransferOwnership}
                onDeleteOrganization={handleDeleteOrganization}
                onLeaveOrganization={handleLeaveOrganization}
              />
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Invite Dialog */}
      <OrgInviteMemberDialog
        open={inviteDialogOpen}
        onOpenChange={setInviteDialogOpen}
        onInvite={handleInvite}
      />
    </div>
  );
}
