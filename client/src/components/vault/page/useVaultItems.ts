// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * useVaultItems
 *
 * Data hook that owns the vault + item state previously scattered across
 * ~25 useState hooks in vault.tsx. Behavior-preserving move — every tRPC
 * call site is unchanged from the former monolith; only its location changed.
 */

import { useState, useEffect, useCallback } from "react";
import type { ServerItemRecord } from "@/services/vault-crypto";
import { vaultCrypto } from "@/services/vault-crypto";
import type {
  DecryptedVaultItem,
  ItemType,
} from "@/components/vault/VaultItemCard";
import { trpcQuery, trpcMutation } from "@/lib/api/trpc";
import { enqueue as enqueueOffline } from "@/sync/offlineQueue";
import { buildVaultItemIdempotencyKey } from "@/sync/useOfflineMutation";
import type { OrgVaultAccess } from "@/services/org-shared-vault";
import {
  BULK_BATCH_SIZE,
  assertValidOperationId,
  saveEncryptedBatches,
  type BulkSaveProgress,
  type BulkSaveResult,
} from "@/services/import/bulk-save";
import type { VaultRecord, ListResponse } from "./utils";

interface UseVaultItemsArgs {
  userId: string | undefined;
  activeWorkspaceId: string | null | undefined;
  isUnlocked: boolean;
  isPersonalWorkspace: boolean;
  orgVault:
    | { kind: "none"; canManage: boolean }
    | { kind: "pending" }
    | { kind: "ready"; canManage: boolean; access: OrgVaultAccess }
    | null;
  sharedAccess: OrgVaultAccess | null;
  canMutateItems: boolean;
  vaultIsOnline: boolean;
  encryptItem: (data: Record<string, unknown>) => Promise<{
    ciphertext: string;
    nonce: string;
    authTag: string;
    wrappedDataKey: string;
    wrappedDataKeyNonce: string;
    wrappedDataKeyAuthTag: string;
  }>;
  loadOrBuildIndex: (items: DecryptedVaultItem[]) => void;
  indexAddItem: (id: string, data: Record<string, unknown>) => void;
  indexRemoveItem: (id: string) => void;
  indexUpdateItem: (id: string, data: Record<string, unknown>) => void;
  onBulkDecryptFailure: () => void;
  resetSignal?: unknown;
}

/**
 * Server-side ceiling on one `batchCreate` / `batchAddItems` call. Bulk work is
 * split into sequential groups of this size by {@link saveEncryptedBatches}.
 */
export const BULK_CREATE_BATCH_SIZE = BULK_BATCH_SIZE;

export interface BulkCreateItem {
  /** Stable, non-secret key the caller uses to identify this row. */
  key: string;
  itemType: ItemType;
  /** Plaintext item data. Encrypted here; never sent or stored as-is. */
  data: Record<string, unknown>;
}

export type BulkCreateProgress = BulkSaveProgress;
export type BulkCreateResult = BulkSaveResult;

export interface BulkCreateOptions {
  /**
   * Non-secret id for this logical operation, retained by the caller across
   * retries. Batch idempotency keys are derived from it, so reusing it means a
   * retry cannot duplicate a batch the server already committed.
   */
  operationId: string;
  onProgress?: (progress: BulkCreateProgress) => void;
}

export interface UseVaultItemsResult {
  vault: VaultRecord | null;
  vaultLoading: boolean;
  vaultError: string | null;
  serverItems: ServerItemRecord[];
  decryptedItems: DecryptedVaultItem[];
  itemsLoading: boolean;
  decrypting: boolean;
  lastSyncedAt: number | null;
  nextCursor: string | undefined;
  loadingMore: boolean;
  favoriteLoadingId: string | null;
  trashCount: number;
  error: string | null;
  setError: (v: string | null) => void;
  setTrashCount: (u: (prev: number) => number) => void;
  fetchItems: (vaultId: string, cursor?: string) => Promise<void>;
  getAllDecryptedItems: () => Promise<DecryptedVaultItem[]>;
  handleCreateItem: (
    itemType: ItemType,
    data: Record<string, unknown>,
  ) => Promise<void>;
  handleBulkCreateItems: (
    items: BulkCreateItem[],
    options: BulkCreateOptions,
  ) => Promise<BulkCreateResult>;
  handleSaveItem: (
    itemId: string,
    data: Record<string, unknown>,
  ) => Promise<void>;
  handleDeleteItem: (itemId: string) => Promise<void>;
  handleToggleFavorite: (itemId: string) => Promise<void>;
  handleLoadMore: () => void;
  handleRestoreFromTrash: () => void;
}

export function useVaultItems({
  userId,
  activeWorkspaceId,
  isUnlocked,
  isPersonalWorkspace,
  orgVault,
  sharedAccess,
  canMutateItems,
  vaultIsOnline,
  encryptItem,
  loadOrBuildIndex,
  indexAddItem,
  indexRemoveItem,
  indexUpdateItem,
  onBulkDecryptFailure,
}: UseVaultItemsArgs): UseVaultItemsResult {
  const [vault, setVault] = useState<VaultRecord | null>(null);
  const [vaultLoading, setVaultLoading] = useState(true);
  const [vaultError, setVaultError] = useState<string | null>(null);

  const [serverItems, setServerItems] = useState<ServerItemRecord[]>([]);
  const [decryptedItems, setDecryptedItems] = useState<DecryptedVaultItem[]>(
    [],
  );
  const [itemsLoading, setItemsLoading] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [decrypting, setDecrypting] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [loadingMore, setLoadingMore] = useState(false);

  const [favoriteLoadingId, setFavoriteLoadingId] = useState<string | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [trashCount, setTrashCount] = useState(0);

  // Fetch vault
  useEffect(() => {
    let cancelled = false;
    if (!userId) {
      setVaultLoading(true);
      return () => {
        cancelled = true;
      };
    }
    setVault(null);
    setServerItems([]);
    setDecryptedItems([]);

    async function fetchVault() {
      setVaultLoading(true);
      setVaultError(null);
      try {
        // Scope explicitly to the workspace the UI is in. Relying on the
        // server session's active org races the WorkspaceProvider sync on a
        // fresh page load and can return a vault from the wrong org, which
        // then 404s on write (credentials.create "vault not found").
        const vaults = await trpcQuery<VaultRecord[]>("vault", "list", {
          organizationId: activeWorkspaceId ?? undefined,
        });
        if (cancelled) return;
        if (vaults.length > 0) {
          setVault(vaults[0] ?? null);
        } else {
          setVault(null);
        }
      } catch (err) {
        if (cancelled) return;
        setVaultError(
          err instanceof Error ? err.message : "Failed to load vault",
        );
      } finally {
        if (!cancelled) setVaultLoading(false);
      }
    }
    fetchVault();
    return () => {
      cancelled = true;
    };
  }, [activeWorkspaceId, userId]);

  const fetchItems = useCallback(
    async (vaultId: string, cursor?: string) => {
      const isLoadMore = !!cursor;
      if (isLoadMore) {
        setLoadingMore(true);
      } else {
        setItemsLoading(true);
      }
      setError(null);

      try {
        if (sharedAccess) {
          const items = await trpcQuery<
            Array<{
              id: string;
              itemType: string;
              ciphertext: string;
              nonce: string;
              authTag: string;
              wrappedDataKey: string;
              wrappedDataKeyNonce: string;
              wrappedDataKeyAuthTag: string;
              version: number;
              createdAt: string;
              updatedAt: string;
            }>
          >("sharedVault", "listItems", { vaultId: sharedAccess.vaultId });

          const mapped: ServerItemRecord[] = items.map((i) => ({
            id: i.id,
            vaultId: sharedAccess.vaultId,
            itemType: i.itemType,
            ciphertext: i.ciphertext,
            nonce: i.nonce,
            authTag: i.authTag,
            wrappedDataKey: i.wrappedDataKey,
            wrappedDataKeyNonce: i.wrappedDataKeyNonce,
            wrappedDataKeyAuthTag: i.wrappedDataKeyAuthTag,
            version: i.version ?? 1,
            isFavorite: false,
            deletedAt: null,
            createdAt: String(i.createdAt),
            updatedAt: String(i.updatedAt),
          }));
          setServerItems(mapped);
          setNextCursor(undefined);
          setLastSyncedAt(Date.now());
          return;
        }

        const input: Record<string, unknown> = {
          vaultId,
          limit: 50,
          organizationId: activeWorkspaceId ?? undefined,
        };
        if (cursor) input.cursor = cursor;

        const result = await trpcQuery<ListResponse>(
          "credentials",
          "list",
          input,
        );

        if (isLoadMore) {
          setServerItems((prev) => [...prev, ...result.items]);
        } else {
          setServerItems(result.items);
        }
        setNextCursor(result.nextCursor);
        setLastSyncedAt(Date.now());
      } catch (err) {
        if (
          err instanceof Error &&
          (err.message.includes("NOT_FOUND") || err.message.includes("404"))
        ) {
          setServerItems([]);
        } else {
          setError(err instanceof Error ? err.message : "Failed to load items");
        }
      } finally {
        setItemsLoading(false);
        setLoadingMore(false);
      }
    },
    [activeWorkspaceId, sharedAccess],
  );

  useEffect(() => {
    if (!vault || !isUnlocked) return;
    if (!isPersonalWorkspace && orgVault === null) return;
    if (!isPersonalWorkspace && orgVault && orgVault.kind !== "ready") {
      if (orgVault.kind === "none") {
        fetchItems(vault.id);
      } else {
        setServerItems([]);
      }
      return;
    }
    fetchItems(sharedAccess ? sharedAccess.vaultId : vault.id);
  }, [
    vault,
    isUnlocked,
    fetchItems,
    isPersonalWorkspace,
    orgVault,
    sharedAccess,
  ]);

  // Decrypt items
  useEffect(() => {
    if (!isUnlocked || serverItems.length === 0) {
      if (serverItems.length === 0 && !itemsLoading) {
        setDecryptedItems([]);
      }
      return;
    }

    let cancelled = false;

    async function decrypt() {
      setDecrypting(true);
      try {
        const results = await Promise.all(
          serverItems.map(async (item) => {
            try {
              const decrypted = sharedAccess
                ? await vaultCrypto.decryptItemWithKey(
                    {
                      ciphertext: item.ciphertext,
                      nonce: item.nonce,
                      authTag: item.authTag,
                      wrappedDataKey: item.wrappedDataKey,
                      wrappedDataKeyNonce: item.wrappedDataKeyNonce,
                      wrappedDataKeyAuthTag: item.wrappedDataKeyAuthTag,
                    },
                    sharedAccess.key,
                  )
                : await vaultCrypto.decryptServerItem(item);
              return {
                id: item.id,
                itemType: item.itemType as ItemType,
                isFavorite: item.isFavorite,
                createdAt: item.createdAt,
                updatedAt: item.updatedAt,
                decrypted,
              } satisfies DecryptedVaultItem;
            } catch (err) {
              console.error(`[Vault] Failed to decrypt item ${item.id}:`, err);
              return {
                id: item.id,
                itemType: item.itemType as ItemType,
                isFavorite: item.isFavorite,
                createdAt: item.createdAt,
                updatedAt: item.updatedAt,
                decrypted: { title: "[Decryption Error]" },
              } satisfies DecryptedVaultItem;
            }
          }),
        );
        if (!cancelled) {
          const failedCount = results.filter(
            (r) => (r.decrypted.title as string) === "[Decryption Error]",
          ).length;
          if (
            !sharedAccess &&
            failedCount > 0 &&
            failedCount === serverItems.length
          ) {
            console.error(
              "[Vault] All items failed to decrypt — forcing re-lock",
            );
            vaultCrypto.lock();
            onBulkDecryptFailure();
            return;
          }
          if (failedCount > 0 && failedCount < serverItems.length) {
            console.warn(
              `[Vault] ${failedCount}/${serverItems.length} items failed to decrypt`,
            );
          }
          setDecryptedItems(results);
          loadOrBuildIndex(results);

          if (!sharedAccess && vault && !vault.encryptedVerificationBlob) {
            try {
              const blob = await vaultCrypto.createVerificationBlob();
              await trpcMutation("vault", "update", {
                vaultId: vault.id,
                encryptedVerificationBlob: blob,
              });
              setVault((prev) =>
                prev ? { ...prev, encryptedVerificationBlob: blob } : prev,
              );
            } catch (err) {
              console.warn(
                "[Vault] Failed to backfill verification blob:",
                err,
              );
            }
          }
        }
      } finally {
        if (!cancelled) setDecrypting(false);
      }
    }

    decrypt();
    return () => {
      cancelled = true;
    };
  }, [
    serverItems,
    isUnlocked,
    loadOrBuildIndex,
    sharedAccess,
    itemsLoading,
    onBulkDecryptFailure,
    vault,
  ]);

  // Auto-purge + trash count
  useEffect(() => {
    if (!vault || !isUnlocked || sharedAccess) return;
    let cancelled = false;

    async function runAutoPurgeAndCount() {
      try {
        await trpcMutation("credentials", "autoPurge", {
          vaultId: vault!.id,
        });
      } catch {
        // silent
      }

      try {
        const result = await trpcQuery<{
          items: unknown[];
          nextCursor?: string;
        }>("credentials", "listTrash", { vaultId: vault!.id, limit: 1 });
        if (!cancelled) {
          setTrashCount(result.items.length + (result.nextCursor ? 1 : 0));
        }
      } catch {
        // silent
      }
    }

    runAutoPurgeAndCount();
    return () => {
      cancelled = true;
    };
  }, [vault, isUnlocked, sharedAccess]);

  const getAllDecryptedItems = useCallback(async () => {
    if (!vault) return [];

    const records: ServerItemRecord[] = [];

    if (sharedAccess) {
      const items = await trpcQuery<
        Array<{
          id: string;
          itemType: string;
          ciphertext: string;
          nonce: string;
          authTag: string;
          wrappedDataKey: string;
          wrappedDataKeyNonce: string;
          wrappedDataKeyAuthTag: string;
          version: number;
          createdAt: string;
          updatedAt: string;
        }>
      >("sharedVault", "listItems", { vaultId: sharedAccess.vaultId });

      records.push(
        ...items.map((item) => ({
          ...item,
          vaultId: sharedAccess.vaultId,
          itemType: item.itemType as ItemType,
          isFavorite: false,
          deletedAt: null,
          createdAt: String(item.createdAt),
          updatedAt: String(item.updatedAt),
        })),
      );
    } else {
      let cursor: string | undefined;
      do {
        const result = await trpcQuery<ListResponse>("credentials", "list", {
          vaultId: vault.id,
          limit: 100,
          organizationId: activeWorkspaceId ?? undefined,
          ...(cursor ? { cursor } : {}),
        });
        records.push(...result.items);
        cursor = result.nextCursor;
      } while (cursor);
    }

    return Promise.all(
      [...new Map(records.map((item) => [item.id, item])).values()].map(
        async (item) => ({
          id: item.id,
          itemType: item.itemType as ItemType,
          isFavorite: item.isFavorite,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
          decrypted: sharedAccess
            ? await vaultCrypto.decryptItemWithKey(
                {
                  ciphertext: item.ciphertext,
                  nonce: item.nonce,
                  authTag: item.authTag,
                  wrappedDataKey: item.wrappedDataKey,
                  wrappedDataKeyNonce: item.wrappedDataKeyNonce,
                  wrappedDataKeyAuthTag: item.wrappedDataKeyAuthTag,
                },
                sharedAccess.key,
              )
            : await vaultCrypto.decryptServerItem(item),
        }),
      ),
    );
  }, [activeWorkspaceId, sharedAccess, vault]);

  const handleCreateItem = useCallback(
    async (itemType: ItemType, data: Record<string, unknown>) => {
      if (sharedAccess) {
        if (!canMutateItems) return;
        const encrypted = await vaultCrypto.encryptItemWithKey(
          data,
          sharedAccess.key,
        );
        await trpcMutation("sharedVault", "addItem", {
          vaultId: sharedAccess.vaultId,
          itemType,
          ...encrypted,
        });
        await fetchItems(sharedAccess.vaultId);
        return;
      }

      if (!vault) return;

      const encrypted = await encryptItem(data);

      if (!vaultIsOnline) {
        const tempItemId = `pending-${
          globalThis.crypto?.randomUUID?.() ??
          `${Date.now()}-${Math.random().toString(36).slice(2)}`
        }`;
        await enqueueOffline({
          router: "credentials",
          procedure: "create",
          op: "create",
          encryptedBody: {
            vaultId: vault.id,
            itemType,
            organizationId: activeWorkspaceId ?? undefined,
            ...encrypted,
          },
          idempotencyKey: buildVaultItemIdempotencyKey({
            vaultId: vault.id,
            itemId: tempItemId,
            op: "create",
            clientRevision: 1,
          }),
        });
        indexAddItem(tempItemId, data);
        return;
      }

      const created = await trpcMutation<{ id: string }>(
        "credentials",
        "create",
        {
          vaultId: vault.id,
          itemType,
          organizationId: activeWorkspaceId ?? undefined,
          ...encrypted,
        },
      );

      if (created?.id) indexAddItem(created.id, data);
      await fetchItems(vault.id);
    },
    [
      vault,
      encryptItem,
      fetchItems,
      indexAddItem,
      sharedAccess,
      canMutateItems,
      vaultIsOnline,
      activeWorkspaceId,
    ],
  );

  /**
   * Encrypt and save many items with a bounded number of round trips.
   *
   * Items are processed in sequential groups of {@link BULK_CREATE_BATCH_SIZE}.
   * Within a group every item is encrypted in parallel through the same
   * `encryptItem` / `encryptItemWithKey` path a single create uses, then the
   * ciphertext envelopes — and nothing else — are submitted in one mutation to
   * the per-user or shared procedure. Plaintext never leaves this function.
   *
   * Each batch carries an idempotency key derived only from the caller's
   * operation id, the vault id, and the batch index, so retrying with the same
   * operation id cannot duplicate a batch the server already committed.
   *
   * The vault is refreshed once, after the whole run, and only if something
   * was saved.
   */
  const handleBulkCreateItems = useCallback(
    async (
      items: BulkCreateItem[],
      { operationId, onProgress }: BulkCreateOptions,
    ): Promise<BulkCreateResult> => {
      if (items.length === 0) return { saved: [], failed: [], failures: [] };

      // Every row failed before any encryption was attempted.
      const allFailed = (message: string): BulkCreateResult => ({
        saved: [],
        failed: items.map((entry) => entry.key),
        failures: items.map((entry, index) => ({
          key: entry.key,
          batchIndex: Math.floor(index / BULK_BATCH_SIZE),
          stage: "save" as const,
          message,
        })),
      });

      assertValidOperationId(operationId);

      const target = sharedAccess
        ? { kind: "shared" as const, vaultId: sharedAccess.vaultId }
        : vault
          ? { kind: "personal" as const, vaultId: vault.id }
          : null;

      if (!target) return allFailed("No vault available");
      if (sharedAccess && !canMutateItems) return allFailed("Read-only vault");
      // Bulk import is an online-only operation: queuing it would mean holding
      // plaintext outside the vault.
      if (!sharedAccess && !vaultIsOnline) return allFailed("Vault is offline");

      const { saved, failed, failures } = await saveEncryptedBatches(items, {
        operationId,
        vaultId: target.vaultId,
        onProgress,
        encrypt: (data) =>
          sharedAccess
            ? vaultCrypto.encryptItemWithKey(data, sharedAccess.key)
            : encryptItem(data),
        submit: ({ items: encryptedItems, idempotencyKey }) =>
          sharedAccess
            ? trpcMutation<{ created: number }>(
                "sharedVault",
                "batchAddItems",
                {
                  vaultId: target.vaultId,
                  items: encryptedItems,
                  idempotencyKey,
                },
              )
            : trpcMutation<{ created: number }>("credentials", "batchCreate", {
                vaultId: target.vaultId,
                organizationId: activeWorkspaceId ?? undefined,
                items: encryptedItems,
                idempotencyKey,
              }),
      });

      if (saved.length > 0) await fetchItems(target.vaultId);

      return { saved, failed, failures };
    },
    [
      activeWorkspaceId,
      canMutateItems,
      encryptItem,
      fetchItems,
      sharedAccess,
      vault,
      vaultIsOnline,
    ],
  );

  const handleToggleFavorite = useCallback(
    async (itemId: string) => {
      if (sharedAccess) return;
      setFavoriteLoadingId(itemId);
      try {
        await trpcMutation("credentials", "toggleFavorite", { itemId });
        setDecryptedItems((prev) =>
          prev.map((item) =>
            item.id === itemId
              ? { ...item, isFavorite: !item.isFavorite }
              : item,
          ),
        );
        setServerItems((prev) =>
          prev.map((item) =>
            item.id === itemId
              ? { ...item, isFavorite: !item.isFavorite }
              : item,
          ),
        );
      } catch {
        // silent
      } finally {
        setFavoriteLoadingId(null);
      }
    },
    [sharedAccess],
  );

  const handleSaveItem = useCallback(
    async (itemId: string, data: Record<string, unknown>) => {
      if (sharedAccess) {
        if (!canMutateItems) return;
        const encrypted = await vaultCrypto.encryptItemWithKey(
          data,
          sharedAccess.key,
        );
        await trpcMutation("sharedVault", "updateItem", {
          vaultId: sharedAccess.vaultId,
          itemId,
          ...encrypted,
        });
        await fetchItems(sharedAccess.vaultId);
        return;
      }

      const encrypted = await encryptItem(data);

      if (!vaultIsOnline && vault) {
        const existing = serverItems.find((i) => i.id === itemId);
        const clientRevision =
          ((existing?.version as number | undefined) ?? 1) + 1;
        await enqueueOffline({
          router: "credentials",
          procedure: "update",
          op: "update",
          encryptedBody: {
            itemId,
            ...encrypted,
          },
          idempotencyKey: buildVaultItemIdempotencyKey({
            vaultId: vault.id,
            itemId,
            op: "update",
            clientRevision,
          }),
        });
        indexUpdateItem(itemId, data);
        return;
      }

      await trpcMutation("credentials", "update", {
        itemId,
        ...encrypted,
      });
      indexUpdateItem(itemId, data);
      if (vault) await fetchItems(vault.id);
    },
    [
      encryptItem,
      vault,
      fetchItems,
      indexUpdateItem,
      sharedAccess,
      canMutateItems,
      vaultIsOnline,
      serverItems,
    ],
  );

  const handleDeleteItem = useCallback(
    async (itemId: string) => {
      if (sharedAccess) {
        if (!canMutateItems) return;
        await trpcMutation("sharedVault", "deleteItem", {
          vaultId: sharedAccess.vaultId,
          itemId,
        });
        setServerItems((prev) => prev.filter((i) => i.id !== itemId));
        setDecryptedItems((prev) => prev.filter((i) => i.id !== itemId));
        return;
      }

      if (!vaultIsOnline && vault) {
        await enqueueOffline({
          router: "credentials",
          procedure: "softDelete",
          op: "delete",
          encryptedBody: { itemId },
          idempotencyKey: buildVaultItemIdempotencyKey({
            vaultId: vault.id,
            itemId,
            op: "delete",
            clientRevision: 1,
          }),
        });
        indexRemoveItem(itemId);
        setServerItems((prev) => prev.filter((i) => i.id !== itemId));
        setDecryptedItems((prev) => prev.filter((i) => i.id !== itemId));
        setTrashCount((prev) => prev + 1);
        return;
      }

      await trpcMutation("credentials", "softDelete", { itemId });
      indexRemoveItem(itemId);
      setServerItems((prev) => prev.filter((i) => i.id !== itemId));
      setDecryptedItems((prev) => prev.filter((i) => i.id !== itemId));
      setTrashCount((prev) => prev + 1);
    },
    [indexRemoveItem, sharedAccess, canMutateItems, vaultIsOnline, vault],
  );

  const handleLoadMore = useCallback(() => {
    if (vault && nextCursor) {
      fetchItems(vault.id, nextCursor);
    }
  }, [vault, nextCursor, fetchItems]);

  const handleRestoreFromTrash = useCallback(() => {
    if (vault) fetchItems(vault.id);
    setTrashCount((prev) => Math.max(0, prev - 1));
  }, [vault, fetchItems]);

  return {
    vault,
    vaultLoading,
    vaultError,
    serverItems,
    decryptedItems,
    itemsLoading,
    decrypting,
    lastSyncedAt,
    nextCursor,
    loadingMore,
    favoriteLoadingId,
    trashCount,
    error,
    setError,
    setTrashCount,
    fetchItems,
    getAllDecryptedItems,
    handleCreateItem,
    handleBulkCreateItems,
    handleSaveItem,
    handleDeleteItem,
    handleToggleFavorite,
    handleLoadMore,
    handleRestoreFromTrash,
  };
}
