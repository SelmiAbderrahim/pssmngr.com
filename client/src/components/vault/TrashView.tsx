// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Trash View
 *
 * Lists soft-deleted vault items with restore, permanent delete,
 * and empty trash actions. All data is decrypted client-side.
 */

import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
  Key,
  CreditCard,
  StickyNote,
  User,
  Fingerprint,
  ShieldCheck,
  File,
  Trash2,
  Undo2,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { trpcQuery, trpcMutation } from "@/lib/api/trpc";
import { vaultCrypto } from "@/services/vault-crypto";
import type { ServerItemRecord } from "@/services/vault-crypto";
import type { DecryptedVaultItem, ItemType } from "./VaultItemCard";

// ── Constants ────────────────────────────────────────────────────────

const ITEM_ICONS: Record<ItemType, React.ElementType> = {
  login: Key,
  passkey: Fingerprint,
  identity: User,
  card: CreditCard,
  note: StickyNote,
  totp: ShieldCheck,
  file: File,
};

const ITEM_TYPE_COLORS: Record<ItemType, string> = {
  login: "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300",
  passkey: "bg-violet-50 text-violet-700 dark:bg-violet-900/20 dark:text-violet-300",
  identity: "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300",
  card: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300",
  note: "bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-300",
  totp: "bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-300",
  file: "bg-slate-50 text-slate-700 dark:bg-slate-900/20 dark:text-slate-300",
};

const AUTO_PURGE_DAYS = 30;
const WARN_DAYS = 25;

// ── Helpers ──────────────────────────────────────────────────────────

function getTitle(d: Record<string, unknown>, fallback: string): string {
  return (d.title as string) || (d.name as string) || fallback;
}

function daysUntilPurge(deletedAt: string): number {
  const deleted = new Date(deletedAt).getTime();
  const purgeAt = deleted + AUTO_PURGE_DAYS * 24 * 60 * 60 * 1000;
  return Math.max(0, Math.ceil((purgeAt - Date.now()) / (1000 * 60 * 60 * 24)));
}

function formatDeletedDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ── Types ────────────────────────────────────────────────────────────

interface TrashItem extends DecryptedVaultItem {
  deletedAt: string;
}

interface TrashListResponse {
  items: (ServerItemRecord & { deletedAt: string })[];
  nextCursor?: string;
}

interface TrashViewProps {
  vaultId: string;
  onRestoreItem?: () => void;
}

// ── Component ────────────────────────────────────────────────────────

export function TrashView({ vaultId, onRestoreItem }: TrashViewProps) {
  const { t } = useTranslation(["common", "vault"]);

  const [items, setItems] = useState<TrashItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [loadingMore, setLoadingMore] = useState(false);

  // Action states
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [emptyingTrash, setEmptyingTrash] = useState(false);

  // Dialogs
  const [showDeleteDialog, setShowDeleteDialog] = useState<string | null>(null);
  const [showEmptyDialog, setShowEmptyDialog] = useState(false);

  // ── Fetch trash items ──────────────────────────────────────────────

  const fetchTrash = useCallback(
    async (cursor?: string) => {
      const isLoadMore = !!cursor;
      if (isLoadMore) {
        setLoadingMore(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      try {
        const input: Record<string, unknown> = { vaultId, limit: 50 };
        if (cursor) input.cursor = cursor;

        const result = await trpcQuery<TrashListResponse>(
          "credentials",
          "listTrash",
          input,
        );

        // Decrypt items
        const decrypted = await Promise.all(
          result.items.map(async (serverItem) => {
            try {
              const data = await vaultCrypto.decryptServerItem(serverItem);
              return {
                id: serverItem.id,
                itemType: serverItem.itemType as ItemType,
                isFavorite: serverItem.isFavorite,
                createdAt: serverItem.createdAt,
                updatedAt: serverItem.updatedAt,
                deletedAt: serverItem.deletedAt,
                decrypted: data,
              } satisfies TrashItem;
            } catch (err) {
              console.error(`[Trash] Failed to decrypt item ${serverItem.id}:`, err);
              return {
                id: serverItem.id,
                itemType: serverItem.itemType as ItemType,
                isFavorite: serverItem.isFavorite,
                createdAt: serverItem.createdAt,
                updatedAt: serverItem.updatedAt,
                deletedAt: serverItem.deletedAt,
                decrypted: { title: t("vault:decryptionError", "[Decryption Error]"), _decryptFailed: true },
              } satisfies TrashItem;
            }
          }),
        );

        // Detect bulk failure — all items failed means systemic issue
        const failedCount = decrypted.filter(
          (r) => r.decrypted._decryptFailed === true,
        ).length;
        if (failedCount > 0 && failedCount === result.items.length) {
          console.error("[Trash] All items failed to decrypt — forcing re-lock");
          vaultCrypto.lock();
          return;
        }

        if (isLoadMore) {
          setItems((prev) => [...prev, ...decrypted]);
        } else {
          setItems(decrypted);
        }
        setNextCursor(result.nextCursor);
      } catch (err) {
        if (err instanceof Error && (err.message.includes("NOT_FOUND") || err.message.includes("404"))) {
          setItems([]);
        } else {
          setError(
            err instanceof Error ? err.message : t("vault:loadTrashError", "Failed to load trash"),
          );
        }
      } finally {
        setIsLoading(false);
        setLoadingMore(false);
      }
    },
    [vaultId],
  );

  useEffect(() => {
    fetchTrash();
  }, [fetchTrash]);

  // ── Actions ────────────────────────────────────────────────────────

  const handleRestore = useCallback(
    async (itemId: string) => {
      setRestoringId(itemId);
      try {
        await trpcMutation("credentials", "restore", { itemId });
        setItems((prev) => prev.filter((i) => i.id !== itemId));
        toast.success(t("vault.restored", "Item restored"));
        onRestoreItem?.();
      } catch {
        toast.error(t("vault.restoreFailed", "Failed to restore item"));
      } finally {
        setRestoringId(null);
      }
    },
    [t, onRestoreItem],
  );

  const handlePermanentDelete = useCallback(
    async (itemId: string) => {
      setDeletingId(itemId);
      try {
        await trpcMutation("credentials", "permanentDelete", { itemId });
        setItems((prev) => prev.filter((i) => i.id !== itemId));
        toast.success(t("vault.permanentlyDeleted", "Item permanently deleted"));
      } catch {
        toast.error(
          t("vault.permanentDeleteFailed", "Failed to permanently delete item"),
        );
      } finally {
        setDeletingId(null);
        setShowDeleteDialog(null);
      }
    },
    [t],
  );

  const handleEmptyTrash = useCallback(async () => {
    setEmptyingTrash(true);
    try {
      await trpcMutation("credentials", "emptyTrash", { vaultId });
      setItems([]);
      setNextCursor(undefined);
      toast.success(t("vault.trashEmptied", "Trash emptied"));
    } catch {
      toast.error(t("vault.emptyTrashFailed", "Failed to empty trash"));
    } finally {
      setEmptyingTrash(false);
      setShowEmptyDialog(false);
    }
  }, [vaultId, t]);

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Trash2 className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">
            {t("vault.trash", "Trash")}
          </h2>
          {items.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {items.length}
            </Badge>
          )}
        </div>
        {items.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowEmptyDialog(true)}
            disabled={emptyingTrash}
            className="text-destructive hover:text-destructive"
          >
            {emptyingTrash ? (
              <Loader2 className="h-4 w-4 me-1 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4 me-1" />
            )}
            {t("vault.emptyTrash", "Empty Trash")}
          </Button>
        )}
      </div>

      <p className="text-sm text-muted-foreground mb-4">
        {t(
          "vault.trashDescription",
          "Items in trash are automatically deleted after 30 days.",
        )}
      </p>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm mb-4">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[72px] rounded-lg" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && items.length === 0 && !error && (
        <Card className="rounded-lg border bg-card shadow-sm">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Trash2 className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-sm font-medium mb-1">
              {t("vault.trashEmpty", "Trash is empty")}
            </p>
            <p className="text-xs text-muted-foreground">
              {t(
                "vault.trashEmptyDescription",
                "Deleted items will appear here for 30 days before being permanently removed.",
              )}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Trash items */}
      {items.length > 0 && (
        <div className="flex flex-col gap-2">
          {items.map((trashItem) => {
            const Icon = ITEM_ICONS[trashItem.itemType] || Key;
            const colorClass =
              ITEM_TYPE_COLORS[trashItem.itemType] || ITEM_TYPE_COLORS.login;
            const title = getTitle(trashItem.decrypted, t("vault:untitled", "Untitled"));
            const remaining = daysUntilPurge(trashItem.deletedAt);
            const isWarn = remaining <= (AUTO_PURGE_DAYS - WARN_DAYS);

            return (
              <Card
                key={trashItem.id}
                className="rounded-lg border bg-card text-card-foreground shadow-sm"
              >
                <div className="flex items-center gap-3 p-4">
                  {/* Icon */}
                  <div
                    className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg opacity-60",
                      colorClass,
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate text-muted-foreground">
                      {title}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground">
                        {t("vault.deletedOn", "Deleted {{date}}", {
                          date: formatDeletedDate(trashItem.deletedAt),
                        })}
                      </span>
                      {isWarn && (
                        <Badge
                          variant="outline"
                          className="text-xs bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800"
                        >
                          {remaining === 0
                            ? t("vault.purgeToday", "Purging today")
                            : t("vault.daysLeft", "{{count}}d left", {
                                count: remaining,
                              })}
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1 text-xs"
                      onClick={() => handleRestore(trashItem.id)}
                      disabled={restoringId === trashItem.id}
                      aria-label={t("vault.restore", "Restore")}
                    >
                      {restoringId === trashItem.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Undo2 className="h-3.5 w-3.5" />
                      )}
                      <span className="hidden sm:inline">
                        {t("vault.restore", "Restore")}
                      </span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1 text-xs text-destructive hover:text-destructive"
                      onClick={() => setShowDeleteDialog(trashItem.id)}
                      disabled={deletingId === trashItem.id}
                      aria-label={t(
                        "vault.permanentDelete",
                        "Permanently delete",
                      )}
                    >
                      {deletingId === trashItem.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                      <span className="hidden sm:inline">
                        {t("vault.permanentDeleteShort", "Delete")}
                      </span>
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}

          {/* Load more */}
          {nextCursor && (
            <div className="flex justify-center mt-4">
              <Button
                variant="outline"
                onClick={() => fetchTrash(nextCursor)}
                disabled={loadingMore}
                className="min-h-[44px]"
              >
                {loadingMore ? (
                  <>
                    <Loader2 className="h-4 w-4 me-2 animate-spin" />
                    {t("vault.loading", "Loading...")}
                  </>
                ) : (
                  t("vault.loadMore", "Load more")
                )}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Permanent delete confirmation */}
      <AlertDialog
        open={!!showDeleteDialog}
        onOpenChange={(open) => {
          if (!open) setShowDeleteDialog(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("vault.permanentDeleteTitle", "Permanently Delete")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "vault.permanentDeleteDescription",
                "This item will be permanently deleted. This action cannot be undone.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!deletingId}>
              {t("common.cancel", "Cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (showDeleteDialog) handlePermanentDelete(showDeleteDialog);
              }}
              disabled={!!deletingId}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingId ? (
                <>
                  <Loader2 className="h-4 w-4 me-1 animate-spin" />
                  {t("vault.deleting", "Deleting...")}
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 me-1" />
                  {t("vault.permanentDelete", "Permanently Delete")}
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Empty trash confirmation */}
      <AlertDialog open={showEmptyDialog} onOpenChange={setShowEmptyDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("vault.emptyTrashTitle", "Empty Trash")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "vault.emptyTrashDescription",
                "All {{count}} items in trash will be permanently deleted. This action cannot be undone.",
                { count: items.length },
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={emptyingTrash}>
              {t("common.cancel", "Cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleEmptyTrash}
              disabled={emptyingTrash}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {emptyingTrash ? (
                <>
                  <Loader2 className="h-4 w-4 me-1 animate-spin" />
                  {t("vault.emptying", "Emptying...")}
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 me-1" />
                  {t("vault.emptyTrashConfirm", "Empty Trash")}
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
