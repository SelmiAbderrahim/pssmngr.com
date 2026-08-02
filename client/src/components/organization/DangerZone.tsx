// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import type { OrgMember } from "./MemberTable";

interface DangerZoneProps {
  orgName: string;
  orgId: string;
  isOwner: boolean;
  currentUserId: string;
  members: OrgMember[];
  onTransferOwnership: (memberId: string) => Promise<void>;
  onDeleteOrganization: () => Promise<void>;
  onLeaveOrganization: () => Promise<void>;
}

export function DangerZone({
  orgName,
  isOwner,
  currentUserId,
  members,
  onTransferOwnership,
  onDeleteOrganization,
  onLeaveOrganization,
}: DangerZoneProps) {
  const { t } = useTranslation(["organization", "common"]);

  // Transfer ownership state
  const [transferTarget, setTransferTarget] = useState("");
  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [isTransferring, setIsTransferring] = useState(false);

  // Delete organization state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  // Leave organization state
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  const transferableMembers = members.filter(
    (m) => m.userId !== currentUserId && m.role !== "owner",
  );

  const selectedTransferMember = transferableMembers.find(
    (m) => m.id === transferTarget,
  );

  async function handleTransfer() {
    if (!transferTarget) return;
    setIsTransferring(true);
    try {
      await onTransferOwnership(transferTarget);
      setShowTransferDialog(false);
      setTransferTarget("");
    } finally {
      setIsTransferring(false);
    }
  }

  async function handleDelete() {
    setIsDeleting(true);
    try {
      await onDeleteOrganization();
      setShowDeleteDialog(false);
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleLeave() {
    setIsLeaving(true);
    try {
      await onLeaveOrganization();
      setShowLeaveDialog(false);
    } finally {
      setIsLeaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <Separator />

      <div>
        <h3 className="text-lg font-semibold text-destructive flex items-center gap-2">
          <AlertTriangle className="h-5 w-5" />
          {t("organization:dangerZone.title")}
        </h3>
      </div>

      {/* Transfer Ownership - Owner only */}
      {isOwner && (
        <div className="flex flex-col gap-4 rounded-lg border border-destructive/30 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            <h4 className="font-medium">
              {t("organization:dangerZone.transferOwnership")}
            </h4>
            <p className="text-sm text-muted-foreground mt-1">
              {t("organization:dangerZone.transferDescription")}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Select value={transferTarget} onValueChange={setTransferTarget}>
              <SelectTrigger className="w-[200px]">
                <SelectValue
                  placeholder={t("organization:dangerZone.selectMember")}
                />
              </SelectTrigger>
              <SelectContent>
                {transferableMembers.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.user.name || m.user.email.split("@")[0]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="destructive"
              disabled={!transferTarget}
              onClick={() => setShowTransferDialog(true)}
              className="min-h-[44px] min-w-[44px]"
            >
              {t("organization:dangerZone.transferButton")}
            </Button>
          </div>
        </div>
      )}

      {/* Delete Organization - Owner only */}
      {isOwner && (
        <div className="flex flex-col gap-4 rounded-lg border border-destructive/30 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            <h4 className="font-medium">
              {t("organization:dangerZone.deleteOrg")}
            </h4>
            <p className="text-sm text-muted-foreground mt-1">
              {t("organization:dangerZone.deleteDescription")}
            </p>
          </div>
          <Button
            variant="destructive"
            onClick={() => setShowDeleteDialog(true)}
            className="min-h-[44px] min-w-[44px] shrink-0"
          >
            {t("organization:dangerZone.deleteButton")}
          </Button>
        </div>
      )}

      {/* Leave Organization - Non-owners */}
      {!isOwner && (
        <div className="flex flex-col gap-4 rounded-lg border border-destructive/30 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            <h4 className="font-medium">
              {t("organization:dangerZone.leaveOrg")}
            </h4>
            <p className="text-sm text-muted-foreground mt-1">
              {t("organization:dangerZone.leaveDescription")}
            </p>
          </div>
          <Button
            variant="destructive"
            onClick={() => setShowLeaveDialog(true)}
            className="min-h-[44px] min-w-[44px] shrink-0"
          >
            {t("organization:dangerZone.leaveButton")}
          </Button>
        </div>
      )}

      {/* Transfer Ownership Confirmation */}
      <AlertDialog
        open={showTransferDialog}
        onOpenChange={setShowTransferDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("organization:dangerZone.transferConfirmTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("organization:dangerZone.transferConfirmDescription", {
                name:
                  selectedTransferMember?.user.name ||
                  selectedTransferMember?.user.email ||
                  "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common:cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleTransfer}
              disabled={isTransferring}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isTransferring && (
                <Loader2 className="h-4 w-4 me-1 animate-spin" />
              )}
              {t("organization:dangerZone.transferButton")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Organization Confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={(open) => {
        setShowDeleteDialog(open);
        if (!open) setDeleteConfirmText("");
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("organization:dangerZone.deleteConfirmTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("organization:dangerZone.deleteConfirmDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="delete-confirm-input">
              {t("organization:dangerZone.deleteConfirm", { name: orgName })}
            </Label>
            <Input
              id="delete-confirm-input"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder={orgName}
              autoComplete="off"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common:cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteConfirmText !== orgName || isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting && (
                <Loader2 className="h-4 w-4 me-1 animate-spin" />
              )}
              {t("organization:dangerZone.deleteButton")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Leave Organization Confirmation */}
      <AlertDialog open={showLeaveDialog} onOpenChange={setShowLeaveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("organization:dangerZone.leaveConfirmTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("organization:dangerZone.leaveConfirmDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common:cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleLeave}
              disabled={isLeaving}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isLeaving && (
                <Loader2 className="h-4 w-4 me-1 animate-spin" />
              )}
              {t("organization:dangerZone.leaveButton")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
