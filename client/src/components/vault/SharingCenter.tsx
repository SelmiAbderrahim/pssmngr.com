// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * SharingCenter
 *
 * Merges the former PendingSharesInbox + SentSharesList into a single
 * inbox with two sections: "Received" (accept/decline) and
 * "Sent" (status, revoke). Both sections share a single refresh signal
 * driven by the pssmngr:shares-changed window event.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import {
  Check,
  X,
  Loader2,
  Inbox,
  Send,
  AlertCircle,
  Eye,
  Pencil,
  Users,
  UserX,
  Key,
  CreditCard,
  StickyNote,
  User,
  Fingerprint,
  ShieldCheck,
  File,
  Clock,
  CheckCircle,
  XCircle,
  Ban,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { trpcQuery, trpcMutation } from "@/lib/api/trpc";
import type { ShareRecord, ShareStatus } from "@/types/sharing";
import { decryptReceivedShare } from "@/services/sharing-crypto";
import { ItemDetailView } from "./ItemDetailView";
import type { DecryptedVaultItem, ItemType } from "./VaultItemCard";

const ITEM_ICONS: Record<string, React.ElementType> = {
  login: Key,
  passkey: Fingerprint,
  identity: User,
  card: CreditCard,
  note: StickyNote,
  totp: ShieldCheck,
  file: File,
};

const ITEM_TYPE_COLORS: Record<string, string> = {
  login: "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300",
  passkey:
    "bg-violet-50 text-violet-700 dark:bg-violet-900/20 dark:text-violet-300",
  identity:
    "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300",
  card: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300",
  note: "bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-300",
  totp: "bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-300",
  file: "bg-slate-50 text-slate-700 dark:bg-slate-900/20 dark:text-slate-300",
};

function useStatusConfig() {
  const { t } = useTranslation(["common", "vault"]);
  return {
    pending: {
      icon: Clock,
      label: t("sharing.status.pending", "Pending"),
      className:
        "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-300 dark:border-yellow-800",
    },
    accepted: {
      icon: CheckCircle,
      label: t("sharing.status.accepted", "Accepted"),
      className:
        "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800",
    },
    declined: {
      icon: XCircle,
      label: t("sharing.status.declined", "Declined"),
      className:
        "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800",
    },
    revoked: {
      icon: Ban,
      label: t("sharing.status.revoked", "Revoked"),
      className: "bg-muted text-muted-foreground border-border",
    },
  } satisfies Record<
    ShareStatus,
    { icon: React.ElementType; label: string; className: string }
  >;
}

function usePermissionConfig() {
  const { t } = useTranslation(["common", "vault"]);
  return {
    view: {
      icon: Eye,
      label: t("sharing.viewOnly", "View"),
      hint: t(
        "sharing.pendingViewHint",
        "You can view this item after accepting.",
      ),
    },
    edit: {
      icon: Pencil,
      label: t("sharing.canEdit", "Edit"),
      hint: t(
        "sharing.pendingEditHint",
        "You can view and edit this item after accepting.",
      ),
    },
    share: {
      icon: Users,
      label: t("sharing.canShare", "Share"),
      hint: t(
        "sharing.pendingShareHint",
        "You can view, edit, and re-share this item after accepting.",
      ),
    },
  };
}

function formatRelativeDate(
  dateStr: string,
  t: (key: string, fallback: string, opts?: Record<string, unknown>) => string,
): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return t("vault:time.today", "Today");
  if (diffDays === 1) return t("vault:time.yesterday", "Yesterday");
  if (diffDays < 7)
    return t("vault:time.daysAgo", "{{count}}d ago", { count: diffDays });
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

interface SharingCenterProps {
  onShareAccepted?: () => void;
}

export function SharingCenter({ onShareAccepted }: SharingCenterProps) {
  const { t } = useTranslation(["common", "vault"]);
  const PERMISSION_CONFIG = usePermissionConfig();
  const STATUS_CONFIG = useStatusConfig();

  const [received, setReceived] = useState<ShareRecord[]>([]);
  const [sent, setSent] = useState<ShareRecord[]>([]);
  const [receivedLoading, setReceivedLoading] = useState(true);
  const [sentLoading, setSentLoading] = useState(true);
  const [receivedError, setReceivedError] = useState<string | null>(null);
  const [sentError, setSentError] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);
  const [viewingShareId, setViewingShareId] = useState<string | null>(null);
  const [selectedReceivedItem, setSelectedReceivedItem] =
    useState<DecryptedVaultItem | null>(null);
  const [receivedDecryptError, setReceivedDecryptError] = useState<
    string | null
  >(null);

  // Keep the latest `t` in a ref so fetchAll has stable identity — otherwise
  // the useTranslation() mock (and, less critically, real i18next) hands us a
  // fresh `t` per render and the fetchAll → useEffect cycle re-runs forever.
  const tRef = useRef(t);
  tRef.current = t;

  const fetchAll = useCallback(async () => {
    setReceivedLoading(true);
    setSentLoading(true);
    setReceivedError(null);
    setSentError(null);
    try {
      const [receivedResult, sentResult] = await Promise.allSettled([
        trpcQuery<ShareRecord[]>("sharing", "listReceivedShares"),
        trpcQuery<ShareRecord[]>("sharing", "listSentShares"),
      ]);

      if (receivedResult.status === "fulfilled") {
        setReceived(receivedResult.value);
      } else {
        const err = receivedResult.reason;
        setReceivedError(
          err instanceof Error
            ? err.message
            : tRef.current(
                "vault:sharing.loadReceivedError",
                "Failed to load shared items",
              ),
        );
      }

      if (sentResult.status === "fulfilled") {
        setSent(sentResult.value);
      } else {
        const err = sentResult.reason;
        setSentError(
          err instanceof Error
            ? err.message
            : tRef.current("vault:sharing.loadSentError", "Failed to load sent shares"),
        );
      }
    } finally {
      setReceivedLoading(false);
      setSentLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    window.addEventListener("pssmngr:shares-changed", fetchAll);
    return () =>
      window.removeEventListener("pssmngr:shares-changed", fetchAll);
  }, [fetchAll]);

  const handleAccept = useCallback(
    async (shareId: string) => {
      setActionLoadingId(shareId);
      try {
        await trpcMutation("sharing", "acceptShare", { shareId });
        setReceived((prev) =>
          prev.map((share) =>
            share.id === shareId ? { ...share, status: "accepted" } : share,
          ),
        );
        window.dispatchEvent(new CustomEvent("pssmngr:shares-changed"));
        onShareAccepted?.();
      } catch {
        // silent
      } finally {
        setActionLoadingId(null);
      }
    },
    [onShareAccepted],
  );

  const handleDecline = useCallback(async (shareId: string) => {
    setActionLoadingId(shareId);
    try {
      await trpcMutation("sharing", "declineShare", { shareId });
      setReceived((prev) => prev.filter((s) => s.id !== shareId));
      window.dispatchEvent(new CustomEvent("pssmngr:shares-changed"));
    } catch {
      // silent
    } finally {
      setActionLoadingId(null);
    }
  }, []);

  const handleViewReceived = useCallback(
    async (share: ShareRecord) => {
      setViewingShareId(share.id);
      setReceivedDecryptError(null);
      try {
        const result = await decryptReceivedShare(share.id);
        const item: DecryptedVaultItem = {
          id: result.item.id,
          itemType: result.item.itemType as ItemType,
          isFavorite: false,
          isShared: true,
          createdAt: result.item.createdAt,
          updatedAt: result.item.updatedAt,
          decrypted: result.decrypted,
        };
        setSelectedReceivedItem(item);
        const title =
          (result.decrypted.title as string | undefined) ||
          (result.decrypted.name as string | undefined);
        if (title) {
          setReceived((current) =>
            current.map((entry) =>
              entry.id === share.id ? { ...entry, itemTitle: title } : entry,
            ),
          );
        }
      } catch (error) {
        setReceivedDecryptError(
          error instanceof Error
            ? error.message
            : t("vault:sharing.decryptError", "Failed to decrypt shared item"),
        );
      } finally {
        setViewingShareId(null);
      }
    },
    [t],
  );

  const handleRevoke = useCallback(async () => {
    if (!revokeId) return;
    setIsRevoking(true);
    try {
      await trpcMutation("sharing", "revokeShare", { shareId: revokeId });
      setSent((prev) =>
        prev.map((s) =>
          s.id === revokeId ? { ...s, status: "revoked" as ShareStatus } : s,
        ),
      );
      window.dispatchEvent(new CustomEvent("pssmngr:shares-changed"));
    } catch {
      // silent
    } finally {
      setIsRevoking(false);
      setRevokeId(null);
    }
  }, [revokeId]);

  const revokeTarget = revokeId
    ? sent.find((s) => s.id === revokeId)
    : null;

  const accessByItem = sent.reduce<Record<string, ShareRecord[]>>(
    (acc, share) => {
      if (share.status !== "pending" && share.status !== "accepted") return acc;
      acc[share.itemId] = [...(acc[share.itemId] ?? []), share];
      return acc;
    },
    {},
  );

  return (
    // data-tour="vault-share": the sharing tour's second step runs on
    // /dashboard/vault?tab=sharing, where the items-view anchors are
    // unmounted — this keeps the target resolvable on the Sharing tab.
    <div className="flex flex-col gap-6" data-tour="vault-share">
      {/* Received */}
      <section>
        <h2 className="text-lg font-semibold mb-3">
          {t("sharing.received", "Received")}
        </h2>
        {receivedLoading ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-[72px] rounded-lg" />
            ))}
          </div>
        ) : receivedError ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{receivedError}</AlertDescription>
          </Alert>
        ) : received.length === 0 ? (
          <Card className="rounded-lg border bg-card shadow-sm">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Inbox className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-sm font-medium">
                {t("sharing.noReceived", "No pending shares")}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {t(
                  "sharing.noReceivedHint",
                  "Items shared with you will appear here.",
                )}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {received.map((share) => {
              const Icon = ITEM_ICONS[share.itemType] || Key;
              const colorClass =
                ITEM_TYPE_COLORS[share.itemType] || ITEM_TYPE_COLORS.login;
              const isActionLoading = actionLoadingId === share.id;
              const permissionConfig =
                PERMISSION_CONFIG[share.permission] ?? PERMISSION_CONFIG.view;
              const PermissionIcon = permissionConfig.icon;

              return (
                <Card
                  key={share.id}
                  className="rounded-lg border bg-card text-card-foreground shadow-sm"
                >
                  <div className="flex items-center gap-3 p-4">
                    <div
                      className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                        colorClass,
                      )}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {share.itemTitle ||
                          t("sharing.encryptedItem", "Encrypted shared item")}
                      </p>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {t("sharing.from", "From {{name}}", {
                          name: share.senderName || share.senderEmail,
                        })}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {permissionConfig.hint}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge
                        variant="outline"
                        className="text-xs gap-1 hidden sm:flex"
                      >
                        <PermissionIcon className="h-3 w-3" />
                        {permissionConfig.label}
                      </Badge>
                      <span className="text-xs text-muted-foreground hidden sm:block">
                        {formatRelativeDate(share.createdAt, t)}
                      </span>
                      {share.status === "pending" ? (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1"
                            onClick={() => handleAccept(share.id)}
                            disabled={isActionLoading}
                          >
                            {isActionLoading ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Check className="h-3.5 w-3.5" />
                            )}
                            <span className="hidden sm:inline">
                              {t("sharing.accept", "Accept")}
                            </span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => handleDecline(share.id)}
                            disabled={isActionLoading}
                            aria-label={t("sharing.decline", "Decline")}
                          >
                            <X className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1"
                          onClick={() => handleViewReceived(share)}
                          disabled={viewingShareId === share.id}
                        >
                          {viewingShareId === share.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Eye className="h-3.5 w-3.5" />
                          )}
                          {t("sharing.viewItem", "View")}
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
        {receivedDecryptError && (
          <Alert variant="destructive" className="mt-3">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{receivedDecryptError}</AlertDescription>
          </Alert>
        )}
        {selectedReceivedItem && (
          <div className="mt-4 rounded-lg border bg-card shadow-sm">
            <ItemDetailView
              item={selectedReceivedItem}
              onClose={() => setSelectedReceivedItem(null)}
              onSave={async () => {}}
              onDelete={async () => {}}
              onToggleFavorite={() => {}}
              canEdit={false}
              canDelete={false}
              showFavorite={false}
            />
          </div>
        )}
      </section>

      {/* Sent */}
      <section>
        <h2 className="text-lg font-semibold mb-3">
          {t("sharing.sent", "Sent")}
        </h2>
        {sentLoading ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-[72px] rounded-lg" />
            ))}
          </div>
        ) : sentError ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{sentError}</AlertDescription>
          </Alert>
        ) : sent.length === 0 ? (
          <Card className="rounded-lg border bg-card shadow-sm">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Send className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-sm font-medium">
                {t("sharing.noSent", "No shared items")}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {t(
                  "sharing.noSentHint",
                  "Items you share will appear here.",
                )}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {sent.map((share) => {
              const Icon = ITEM_ICONS[share.itemType] || Key;
              const colorClass =
                ITEM_TYPE_COLORS[share.itemType] || ITEM_TYPE_COLORS.login;
              const statusConfig =
                STATUS_CONFIG[share.status] ?? STATUS_CONFIG.pending;
              const StatusIcon = statusConfig.icon;
              const canRevoke =
                share.status === "pending" || share.status === "accepted";
              const permissionConfig =
                PERMISSION_CONFIG[share.permission] ?? PERMISSION_CONFIG.view;
              const PermissionIcon = permissionConfig.icon;
              const itemAccess = accessByItem[share.itemId] ?? [];
              const accessSummary = itemAccess
                .map((access) =>
                  t(
                    "sharing.accessSummaryEntry",
                    "{{name}} ({{permission}})",
                    {
                      name: access.recipientName || access.recipientEmail,
                      permission: (
                        PERMISSION_CONFIG[access.permission] ??
                        PERMISSION_CONFIG.view
                      ).label,
                    },
                  ),
                )
                .join(", ");

              return (
                <Card
                  key={share.id}
                  className="rounded-lg border bg-card text-card-foreground shadow-sm"
                >
                  <div className="flex items-center gap-3 p-4">
                    <div
                      className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                        colorClass,
                      )}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {share.itemTitle ||
                          t("sharing.encryptedItem", "Encrypted shared item")}
                      </p>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {t("sharing.to", "To {{name}}", {
                          name: share.recipientName || share.recipientEmail,
                        })}
                      </p>
                      {accessSummary && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t(
                            "sharing.whoCanAccess",
                            "Who can access this: {{summary}}",
                            { summary: accessSummary },
                          )}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge
                        variant="outline"
                        className="text-xs gap-1 hidden sm:flex"
                      >
                        <PermissionIcon className="h-3 w-3" />
                        {permissionConfig.label}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-xs gap-1",
                          statusConfig.className,
                        )}
                      >
                        <StatusIcon className="h-3 w-3" />
                        {t(`sharing.status.${share.status}`, statusConfig.label)}
                      </Badge>
                      <span className="text-xs text-muted-foreground hidden sm:block">
                        {formatRelativeDate(share.createdAt, t)}
                      </span>
                      {canRevoke && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 gap-1 text-destructive hover:text-destructive"
                          onClick={() => setRevokeId(share.id)}
                        >
                          <UserX className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">
                            {t("sharing.revoke", "Revoke")}
                          </span>
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <AlertDialog
        open={!!revokeId}
        onOpenChange={(open) => {
          if (!open) setRevokeId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("sharing.revokeTitle", "Revoke access?")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "sharing.revokeDescription",
                '{{name}} will no longer be able to access "{{title}}". This action cannot be undone.',
                {
                  name:
                    revokeTarget?.recipientName ||
                    revokeTarget?.recipientEmail ||
                    "",
                  title:
                    revokeTarget?.itemTitle ||
                    t("sharing.encryptedItem", "Encrypted shared item"),
                },
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRevoking}>
              {t("common.cancel", "Cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRevoke}
              disabled={isRevoking}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isRevoking ? (
                <>
                  <Loader2 className="h-4 w-4 me-2 animate-spin" />
                  {t("sharing.revoking", "Revoking...")}
                </>
              ) : (
                t("sharing.revokeConfirm", "Revoke access")
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
