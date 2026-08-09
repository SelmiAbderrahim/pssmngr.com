// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * PendingInvitationsBanner Component
 *
 * Queries the user's pending organization invitations and displays
 * them as dismissible cards with accept/decline actions.
 * Renders nothing when there are no pending invitations.
 *
 * Placed at the top of the dashboard layout (MainLayout) so it
 * is visible across all dashboard pages.
 */

import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Building2, Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { trpcQuery, trpcMutation } from "@/lib/api/trpc";
import { isApiError } from "@/lib/api/client";
import { useWorkspaceContext } from "@/providers/WorkspaceContext";

// ── Types ──────────────────────────────────────────────────────────

interface PendingInvitation {
  id: string;
  email: string;
  role: "owner" | "admin" | "member" | null;
  status: string;
  expiresAt: string;
  organization: {
    id: string;
    name: string;
    logo: string | null;
    isFamily?: boolean;
  };
}

interface AcceptResult {
  organization: {
    id: string;
    name: string;
    logo: string | null;
    isFamily?: boolean;
  };
}

// ── Component ──────────────────────────────────────────────────────

interface PendingInvitationsBannerProps {
  className?: string;
}

export function PendingInvitationsBanner({
  className,
}: PendingInvitationsBannerProps) {
  const { t } = useTranslation(["organization", "common"]);
  const { switchWorkspace, refreshWorkspaces } = useWorkspaceContext();

  const [invitations, setInvitations] = useState<PendingInvitation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [decliningId, setDecliningId] = useState<string | null>(null);

  // ── Fetch pending invitations ──────────────────────────────────

  const fetchInvitations = useCallback(async () => {
    try {
      const data = await trpcQuery<PendingInvitation[]>(
        "organization",
        "getMyPendingInvitations",
      );
      setInvitations(data);
    } catch {
      // Non-critical: silently fail, banner just won't show
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInvitations();
  }, [fetchInvitations]);

  // ── Accept ─────────────────────────────────────────────────────

  const handleAccept = useCallback(
    async (invitationId: string) => {
      setAcceptingId(invitationId);
      try {
        const result = await trpcMutation<AcceptResult>(
          "organization",
          "acceptInvitation",
          { invitationId },
        );
        const acceptedInvitation = invitations.find(
          (inv) => inv.id === invitationId,
        );
        const isFamily =
          result.organization.isFamily ??
          acceptedInvitation?.organization.isFamily ??
          false;
        if (!isFamily) {
          await switchWorkspace(result.organization.id);
        }
        refreshWorkspaces();
        setInvitations((prev) => prev.filter((inv) => inv.id !== invitationId));
        toast.success(
          t("organization:invitation.accepted", {
            defaultValue:
              "Invitation accepted! You've joined the organization.",
          }),
        );
      } catch (err) {
        const message = isApiError(err)
          ? err.message
          : err instanceof Error
            ? err.message
            : t("common:error");
        toast.error(message);
      } finally {
        setAcceptingId(null);
      }
    },
    [t],
  );

  // ── Decline ────────────────────────────────────────────────────

  const handleDecline = useCallback(
    async (invitationId: string) => {
      setDecliningId(invitationId);
      try {
        await trpcMutation<{ success: boolean }>(
          "organization",
          "declineInvitation",
          { invitationId },
        );
        // Remove from local state
        setInvitations((prev) => prev.filter((inv) => inv.id !== invitationId));
        toast.success(
          t("organization:invitation.declined", {
            defaultValue: "Invitation declined.",
          }),
        );
      } catch (err) {
        const message = isApiError(err)
          ? err.message
          : err instanceof Error
            ? err.message
            : t("common:error");
        toast.error(message);
      } finally {
        setDecliningId(null);
      }
    },
    [t],
  );

  // ── Loading skeleton ───────────────────────────────────────────

  if (isLoading) {
    return null; // Don't show skeleton for banner — it should appear only if needed
  }

  // ── Nothing to show ────────────────────────────────────────────

  if (invitations.length === 0) {
    return null;
  }

  // ── Render invitations ─────────────────────────────────────────

  return (
    <div className={className} data-testid="pending-invitations-banner">
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          {t("organization:invitation.pendingTitle", {
            defaultValue: "Pending Invitations",
          })}
        </h2>

        {invitations.map((invitation) => {
          const isAccepting = acceptingId === invitation.id;
          const isDeclining = decliningId === invitation.id;
          const isBusy = isAccepting || isDeclining;
          const expiresDate = new Date(invitation.expiresAt).toLocaleDateString();

          return (
            <Card
              key={invitation.id}
              className="rounded-lg border bg-card shadow-sm"
              data-testid={`invitation-card-${invitation.id}`}
            >
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  {/* Invitation info */}
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted flex-shrink-0">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {t("organization:invitation.pendingMessage", {
                          orgName: invitation.organization.name,
                          defaultValue: `You've been invited to join {{orgName}}`,
                        })}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {t("organization:invitation.expiresAt", {
                          date: expiresDate,
                          defaultValue: "Expires {{date}}",
                        })}
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDecline(invitation.id)}
                      disabled={isBusy}
                      className="min-h-[44px] min-w-[44px]"
                      aria-label={t("organization:invitation.decline", {
                        defaultValue: "Decline",
                      })}
                    >
                      {isDeclining ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <X className="h-4 w-4 me-1" />
                          <span className="hidden sm:inline">
                            {t("organization:invitation.decline", {
                              defaultValue: "Decline",
                            })}
                          </span>
                        </>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => handleAccept(invitation.id)}
                      disabled={isBusy}
                      className="min-h-[44px] min-w-[44px]"
                      aria-label={t("organization:invitation.accept", {
                        defaultValue: "Accept",
                      })}
                    >
                      {isAccepting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Check className="h-4 w-4 me-1" />
                          <span className="hidden sm:inline">
                            {t("organization:invitation.accept", {
                              defaultValue: "Accept",
                            })}
                          </span>
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

export default PendingInvitationsBanner;
