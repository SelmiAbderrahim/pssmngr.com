// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Shield,
  UserCog,
  UserMinus,
  Users,
  ArrowRight,
} from "lucide-react";
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

export interface OrgMember {
  id: string;
  userId: string;
  role: "owner" | "admin" | "member";
  joinedAt: string;
  user: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
  };
}

interface MemberTableProps {
  members: OrgMember[];
  currentUserId: string;
  isOwner: boolean;
  isOwnerOrAdmin: boolean;
  onChangeRole: (memberId: string, role: "member" | "admin") => Promise<void>;
  onRemoveMember: (memberId: string) => Promise<void>;
  onTransferOwnership: (memberId: string) => Promise<void>;
}

function getRoleBadge(role: string, t: (key: string) => string) {
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

const PAGE_SIZE = 20;

export function MemberTable({
  members,
  currentUserId,
  isOwner,
  isOwnerOrAdmin,
  onChangeRole,
  onRemoveMember,
  onTransferOwnership,
}: MemberTableProps) {
  const { t } = useTranslation(["organization", "common"]);
  const [removeMember, setRemoveMember] = useState<OrgMember | null>(null);
  const [transferMember, setTransferMember] = useState<OrgMember | null>(null);
  const [page, setPage] = useState(0);

  const totalPages = Math.ceil(members.length / PAGE_SIZE);
  const hasPagination = members.length > PAGE_SIZE;
  const paginatedMembers = useMemo(
    () => members.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [members, page],
  );

  if (members.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Users className="h-8 w-8 mx-auto mb-2" />
        <p>{t("organization:noMembers")}</p>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-start">
                {t("organization:members.name")}
              </TableHead>
              <TableHead className="text-start hidden sm:table-cell">
                {t("organization:members.email")}
              </TableHead>
              <TableHead className="text-start">
                {t("organization:members.role")}
              </TableHead>
              <TableHead className="text-start hidden sm:table-cell">
                {t("organization:members.joined")}
              </TableHead>
              {isOwnerOrAdmin && (
                <TableHead className="text-end">
                  {t("organization:members.actions")}
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedMembers.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="text-start font-medium">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted shrink-0 text-sm font-medium">
                      {m.user.name?.charAt(0).toUpperCase() ||
                        m.user.email.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <span className="truncate block">
                        {m.user.name || m.user.email.split("@")[0]}
                        {m.userId === currentUserId && (
                          <span className="text-muted-foreground ms-1">
                            ({t("organization:members.you")})
                          </span>
                        )}
                      </span>
                      <span className="text-xs text-muted-foreground truncate block sm:hidden">
                        {m.user.email}
                      </span>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-start text-muted-foreground hidden sm:table-cell">
                  {m.user.email}
                </TableCell>
                <TableCell className="text-start">
                  {getRoleBadge(m.role, t)}
                </TableCell>
                <TableCell className="text-start text-muted-foreground hidden sm:table-cell">
                  {new Date(m.joinedAt).toLocaleDateString()}
                </TableCell>
                {isOwnerOrAdmin && (
                  <TableCell className="text-end">
                    {m.role !== "owner" && m.userId !== currentUserId && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-[44px] w-[44px] p-0"
                            aria-label={t(
                              "organization:members.actions",
                              "Member actions",
                            )}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {isOwner && (
                            <>
                              {m.role === "member" && (
                                <DropdownMenuItem
                                  onClick={() => onChangeRole(m.id, "admin")}
                                >
                                  <UserCog className="h-4 w-4 me-2" />
                                  {t("organization:members.promoteAdmin")}
                                </DropdownMenuItem>
                              )}
                              {m.role === "admin" && (
                                <DropdownMenuItem
                                  onClick={() => onChangeRole(m.id, "member")}
                                >
                                  <UserCog className="h-4 w-4 me-2" />
                                  {t("organization:members.demoteToMember")}
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                onClick={() => setTransferMember(m)}
                              >
                                <ArrowRight className="h-4 w-4 me-2 rtl:scale-x-[-1]" />
                                {t("organization:members.transferOwnership")}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                            </>
                          )}
                          <DropdownMenuItem
                            onClick={() => setRemoveMember(m)}
                            className="text-destructive focus:text-destructive"
                          >
                            <UserMinus className="h-4 w-4 me-2" />
                            {t("organization:members.remove")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {hasPagination && (
        <div className="flex items-center justify-between px-2 py-3">
          <p className="text-sm text-muted-foreground">
            {t("common:pagination.showing", {
              page: page + 1,
              totalPages,
            })}
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-[44px] w-[44px] p-0"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="h-4 w-4 rtl:scale-x-[-1]" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-[44px] w-[44px] p-0"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-4 w-4 rtl:scale-x-[-1]" />
            </Button>
          </div>
        </div>
      )}

      {/* Remove Member Confirmation */}
      <AlertDialog
        open={!!removeMember}
        onOpenChange={(open) => !open && setRemoveMember(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("organization:members.removeTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("organization:members.removeConfirm", {
                name: removeMember?.user.name || removeMember?.user.email || "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common:cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (removeMember) {
                  onRemoveMember(removeMember.id);
                  setRemoveMember(null);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("organization:members.confirmRemove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Transfer Ownership Confirmation */}
      <AlertDialog
        open={!!transferMember}
        onOpenChange={(open) => !open && setTransferMember(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("organization:dangerZone.transferConfirmTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("organization:dangerZone.transferConfirmDescription", {
                name:
                  transferMember?.user.name || transferMember?.user.email || "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common:cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (transferMember) {
                  onTransferOwnership(transferMember.id);
                  setTransferMember(null);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("organization:dangerZone.transferButton")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
