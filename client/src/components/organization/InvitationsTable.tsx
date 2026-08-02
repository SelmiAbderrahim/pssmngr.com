// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { useTranslation } from "react-i18next";
import { Mail, X, RotateCw, UserCog, Shield } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface OrgInvitation {
  id: string;
  email: string;
  role: string | null;
  status: string;
  expiresAt: string;
  inviterId: string;
  createdAt?: string;
}

interface InvitationsTableProps {
  invitations: OrgInvitation[];
  isOwnerOrAdmin: boolean;
  onCancelInvitation: (invitationId: string) => Promise<void>;
  onResendInvitation?: (invitationId: string) => Promise<void>;
}

function getStatusBadge(
  status: string,
  isExpired: boolean,
  t: (key: string) => string,
) {
  if (isExpired) {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        {t("organization:invitations.expired")}
      </Badge>
    );
  }
  if (status === "accepted") {
    return (
      <Badge
        variant="secondary"
        className="bg-green-50 text-green-900 border-green-200 dark:bg-green-900/20 dark:text-green-300"
      >
        {t("organization:invitations.accepted")}
      </Badge>
    );
  }
  if (status === "cancelled") {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        {t("organization:invitations.cancelled")}
      </Badge>
    );
  }
  return (
    <Badge
      variant="secondary"
      className="bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300"
    >
      {t("organization:invitations.pending")}
    </Badge>
  );
}

function getRoleBadge(role: string | null, t: (key: string) => string) {
  switch (role) {
    case "owner":
      return (
        <Badge variant="default" className="gap-1">
          <Shield className="h-3 w-3" />
          {t("organization:role.owner")}
        </Badge>
      );
    case "admin":
      return (
        <Badge variant="secondary" className="gap-1">
          <UserCog className="h-3 w-3" />
          {t("organization:role.admin")}
        </Badge>
      );
    default:
      return <Badge variant="outline">{t("organization:role.member")}</Badge>;
  }
}

export function InvitationsTable({
  invitations,
  isOwnerOrAdmin,
  onCancelInvitation,
  onResendInvitation,
}: InvitationsTableProps) {
  const { t } = useTranslation(["organization", "common"]);

  if (invitations.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Mail className="h-8 w-8 mx-auto mb-2" />
        <p>{t("organization:noInvitations")}</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-start">
              {t("organization:invitations.email")}
            </TableHead>
            <TableHead className="text-start">
              {t("organization:invitations.role")}
            </TableHead>
            <TableHead className="text-start">
              {t("organization:invitations.status")}
            </TableHead>
            <TableHead className="text-start hidden sm:table-cell">
              {t("organization:invitations.sent")}
            </TableHead>
            <TableHead className="text-start hidden sm:table-cell">
              {t("organization:invitations.expires")}
            </TableHead>
            {isOwnerOrAdmin && (
              <TableHead className="text-end">
                {t("organization:invitations.actions")}
              </TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {invitations.map((inv) => {
            const isExpired = new Date(inv.expiresAt) < new Date();
            const isPending = inv.status === "pending" && !isExpired;
            return (
              <TableRow key={inv.id}>
                <TableCell className="text-start font-medium">
                  {inv.email}
                </TableCell>
                <TableCell className="text-start">
                  {getRoleBadge(inv.role, t)}
                </TableCell>
                <TableCell className="text-start">
                  {getStatusBadge(inv.status, isExpired, t)}
                </TableCell>
                <TableCell className="text-start text-muted-foreground hidden sm:table-cell">
                  {inv.createdAt
                    ? new Date(inv.createdAt).toLocaleDateString()
                    : "—"}
                </TableCell>
                <TableCell className="text-start text-muted-foreground hidden sm:table-cell">
                  {new Date(inv.expiresAt).toLocaleDateString()}
                </TableCell>
                {isOwnerOrAdmin && (
                  <TableCell className="text-end">
                    <div className="flex items-center justify-end gap-1">
                      {isPending && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-[44px] w-[44px] p-0 text-destructive hover:text-destructive"
                                onClick={() => onCancelInvitation(inv.id)}
                                aria-label={t(
                                  "organization:invitations.cancel",
                                )}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              {t("organization:invitations.cancel")}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      {isExpired && onResendInvitation && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-[44px] w-[44px] p-0"
                                onClick={() => onResendInvitation(inv.id)}
                                aria-label={t(
                                  "organization:invitations.resend",
                                )}
                              >
                                <RotateCw className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              {t("organization:invitations.resend")}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
