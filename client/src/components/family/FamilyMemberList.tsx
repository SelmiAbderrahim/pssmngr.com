// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Crown, Shield, User, MoreVertical, UserMinus, ArrowUpDown, Loader2, Copy, RefreshCw, X, FolderLock, Activity } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import type { FamilyInvitation, FamilyMember, FamilyRole } from "@/types/family";

interface FamilyMemberListProps {
  members: FamilyMember[];
  invitations?: FamilyInvitation[];
  accessSummaries?: Record<string, {
    vaultCount: number;
    manageCount: number;
    editCount: number;
    shareCount: number;
    viewCount: number;
  }>;
  currentUserId: string;
  isOrganizer: boolean;
  isLoading: boolean;
  onRemoveMember: (memberId: string) => Promise<void>;
  onChangeRole: (memberId: string, role: FamilyRole) => Promise<void>;
  onInviteClick: () => void;
  onCopyInvitation?: (invitationId: string) => Promise<void>;
  onResendInvitation?: (invitationId: string) => Promise<void>;
  onCancelInvitation?: (invitationId: string) => Promise<void>;
}

type FamilyMemberWithUser = FamilyMember & {
  user?: {
    name?: string | null;
    email?: string | null;
  } | null;
};

const ROLE_CONFIG: Record<FamilyRole, { icon: typeof Crown; label: string; className: string }> = {
  owner: {
    icon: Crown,
    label: "Organizer",
    className: "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800",
  },
  admin: {
    icon: Shield,
    label: "Admin",
    className: "bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800",
  },
  member: {
    icon: User,
    label: "Member",
    className: "bg-muted text-muted-foreground border-border",
  },
};

function formatDate(dateStr: string, locale: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" });
}

function getMemberIdentity(member: FamilyMemberWithUser, unknownLabel: string) {
  const email = member.email || member.user?.email || "";
  const displayName = member.name || member.user?.name || email || unknownLabel;
  return {
    email,
    displayName,
    initial: (displayName || email || "?").charAt(0).toUpperCase(),
  };
}

export function FamilyMemberList({
  members,
  invitations = [],
  accessSummaries = {},
  currentUserId,
  isOrganizer,
  isLoading,
  onRemoveMember,
  onChangeRole,
  onInviteClick,
  onCopyInvitation = async () => {},
  onResendInvitation = async () => {},
  onCancelInvitation = async () => {},
}: FamilyMemberListProps) {
  const { t, i18n } = useTranslation("common");
  const [confirmRemove, setConfirmRemove] = useState<FamilyMember | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [invitationActionLoadingId, setInvitationActionLoadingId] = useState<string | null>(null);

  const pendingInvitations = invitations.filter((invitation) => invitation.status === "pending");
  const usedSlots = members.length + pendingInvitations.length;

  async function handleRemove() {
    if (!confirmRemove) return;
    setActionLoadingId(confirmRemove.id);
    try {
      await onRemoveMember(confirmRemove.id);
    } finally {
      setActionLoadingId(null);
      setConfirmRemove(null);
    }
  }

  async function handleRoleChange(memberId: string, role: FamilyRole) {
    setActionLoadingId(memberId);
    try {
      await onChangeRole(memberId, role);
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleInvitationAction(
    invitationId: string,
    action: "copy" | "resend" | "cancel"
  ) {
    const loadingId = `${action}:${invitationId}`;
    setInvitationActionLoadingId(loadingId);
    try {
      if (action === "copy") await onCopyInvitation(invitationId);
      if (action === "resend") await onResendInvitation(invitationId);
      if (action === "cancel") await onCancelInvitation(invitationId);
    } finally {
      setInvitationActionLoadingId(null);
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-3">
              <Skeleton className="h-9 w-9 rounded-md" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-40" />
              </div>
              <Skeleton className="h-5 w-16 rounded-md" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg font-semibold">
            {t("family.members.title", "Members")} ({usedSlots})
          </CardTitle>
          {isOrganizer && (
            <Button size="sm" onClick={onInviteClick}>
              {t("family.members.invite", "Invite Member")}
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <div className="divide-y divide-border">
            {members.map((member) => {
              const roleConfig = ROLE_CONFIG[member.role];
              const RoleIcon = roleConfig.icon;
              const isCurrentUser = member.userId === currentUserId;
              const canManage = isOrganizer && !isCurrentUser && member.role !== "owner";
              const identity = getMemberIdentity(member as FamilyMemberWithUser, t("family.unknownMember", "Unknown member"));
              const access = accessSummaries[member.userId] ?? {
                vaultCount: 0,
                manageCount: 0,
                editCount: 0,
                shareCount: 0,
                viewCount: 0,
              };
              const accessParts = [
                access.manageCount > 0
                  ? t("family.members.accessManage", "{{count}} manage", { count: access.manageCount })
                  : null,
                access.shareCount > 0
                  ? t("family.members.accessShare", "{{count}} share", { count: access.shareCount })
                  : null,
                access.editCount > 0
                  ? t("family.members.accessEdit", "{{count}} edit", { count: access.editCount })
                  : null,
                access.viewCount > 0
                  ? t("family.members.accessView", "{{count}} view", { count: access.viewCount })
                  : null,
              ].filter(Boolean);

              return (
                <div
                  key={member.id}
                  className="flex items-start gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted shrink-0 text-sm font-medium">
                    {identity.initial}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {identity.displayName}
                      {isCurrentUser && (
                        <span className="text-muted-foreground ms-1 font-normal">
                          ({t("family.members.you", "you")})
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{identity.email}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <FolderLock className="h-3 w-3" />
                        {access.vaultCount > 0
                          ? t("family.members.accessSummary", "{{count}} shared vaults", {
                              count: access.vaultCount,
                            })
                          : t("family.members.noSharedVaultAccess", "No shared vault access")}
                      </span>
                      {accessParts.length > 0 && (
                        <span>{accessParts.join(" · ")}</span>
                      )}
                      <span className="inline-flex items-center gap-1">
                        <Activity className="h-3 w-3" />
                        {t("family.members.lastActionJoined", "Joined {{date}}", {
                          date: formatDate(member.joinedAt, i18n.language),
                        })}
                      </span>
                    </div>
                  </div>
                  <Badge variant="outline" className={`gap-1 shrink-0 ${roleConfig.className}`}>
                    <RoleIcon className="h-3 w-3" />
                    {t(`family.roles.${member.role}`, roleConfig.label)}
                  </Badge>
                  {canManage && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 shrink-0"
                          disabled={actionLoadingId === member.id}
                        >
                          {actionLoadingId === member.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <MoreVertical className="h-4 w-4" />
                          )}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {member.role === "member" && (
                          <DropdownMenuItem onClick={() => handleRoleChange(member.id, "admin")}>
                            <ArrowUpDown className="h-4 w-4 me-2" />
                            {t("family.members.promoteAdmin", "Promote to Admin")}
                          </DropdownMenuItem>
                        )}
                        {member.role === "admin" && (
                          <DropdownMenuItem onClick={() => handleRoleChange(member.id, "member")}>
                            <ArrowUpDown className="h-4 w-4 me-2" />
                            {t("family.members.demoteToMember", "Demote to Member")}
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => setConfirmRemove(member)}
                          className="text-destructive focus:text-destructive"
                        >
                          <UserMinus className="h-4 w-4 me-2" />
                          {t("family.members.remove", "Remove Member")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              );
            })}
          </div>

          {isOrganizer && invitations.length > 0 && (
            <div className="mt-5 border-t pt-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">
                    {t("family.invitations.title", "Invitations")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("family.invitations.pendingCount", "{{count}} pending", {
                      count: pendingInvitations.length,
                    })}
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                {invitations.map((invitation) => {
                  const roleLabel = invitation.role
                    ? t(`family.roles.${invitation.role}`, invitation.role)
                    : t("family.roles.member", "Member");
                  const statusLabel = t(
                    `family.invitations.status.${invitation.status}`,
                    invitation.status
                  );
                  const canCancel = invitation.status === "pending";
                  const canResend = invitation.status === "pending" || invitation.status === "expired";

                  return (
                    <div
                      key={invitation.id}
                      className="rounded-md border px-3 py-3"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{invitation.email}</p>
                          <p className="text-xs text-muted-foreground">
                            {roleLabel} · {t("family.invitations.expires", "Expires")}{" "}
                            {formatDate(invitation.expiresAt, i18n.language)}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className="shrink-0">
                            {statusLabel}
                          </Badge>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleInvitationAction(invitation.id, "copy")}
                            disabled={invitationActionLoadingId === `copy:${invitation.id}`}
                          >
                            {invitationActionLoadingId === `copy:${invitation.id}` ? (
                              <Loader2 className="h-4 w-4 me-1 animate-spin" />
                            ) : (
                              <Copy className="h-4 w-4 me-1" />
                            )}
                            {t("family.invitations.copyLink", "Copy link")}
                          </Button>
                          {canResend && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => handleInvitationAction(invitation.id, "resend")}
                              disabled={invitationActionLoadingId === `resend:${invitation.id}`}
                            >
                              {invitationActionLoadingId === `resend:${invitation.id}` ? (
                                <Loader2 className="h-4 w-4 me-1 animate-spin" />
                              ) : (
                                <RefreshCw className="h-4 w-4 me-1" />
                              )}
                              {t("family.invitations.resend", "Resend")}
                            </Button>
                          )}
                          {canCancel && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => handleInvitationAction(invitation.id, "cancel")}
                              disabled={invitationActionLoadingId === `cancel:${invitation.id}`}
                            >
                              {invitationActionLoadingId === `cancel:${invitation.id}` ? (
                                <Loader2 className="h-4 w-4 me-1 animate-spin" />
                              ) : (
                                <X className="h-4 w-4 me-1" />
                              )}
                              {t("family.invitations.cancel", "Cancel")}
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!confirmRemove} onOpenChange={() => setConfirmRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("family.members.removeTitle", "Remove Member")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "family.members.removeDescription",
                "Are you sure you want to remove {{name}} from the family? They will lose access to all shared vaults.",
                { name: confirmRemove ? getMemberIdentity(confirmRemove as FamilyMemberWithUser, t("family.unknownMember", "Unknown member")).displayName : "" }
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("actions.cancel", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemove}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {actionLoadingId ? (
                <Loader2 className="h-4 w-4 me-1 animate-spin" />
              ) : null}
              {t("family.members.confirmRemove", "Remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
