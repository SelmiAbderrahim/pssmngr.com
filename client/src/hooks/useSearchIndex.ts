// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * React hook for the client-side encrypted search index.
 *
 * Lifecycle:
 *  1. On vault unlock → try to load encrypted index from server, decrypt, deserialize
 *  2. If no saved index → build from scratch by indexing all decrypted items
 *  3. On item create/update/delete → incrementally update index
 *  4. Debounced sync: serialize → encrypt → push to server
 *  5. On vault lock → clear index from memory
 */

import { useState, useCallback, useRef, useEffect } from "react";
import {
  SearchIndex,
  extractSearchableFields,
} from "@/services/search-index";
import { vaultCrypto } from "@/services/vault-crypto";
import { trpcQuery, trpcMutation } from "@/lib/api/trpc";
import type { DecryptedVaultItem } from "@/components/vault/VaultItemCard";

const SYNC_DEBOUNCE_MS = 2_000;

interface VaultRecord {
  id: string;
  encryptedSearchIndex?: string | null;
}

export function useSearchIndex(
  vaultId: string | null,
  isUnlocked: boolean,
) {
  const indexRef = useRef<SearchIndex | null>(null);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isReady, setIsReady] = useState(false);

  // ── Sync to server (debounced) ──────────────────────────────

  const scheduleSyncToServer = useCallback(() => {
    if (!vaultId || !indexRef.current) return;

    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);

    syncTimerRef.current = setTimeout(async () => {
      const idx = indexRef.current;
      if (!idx || !vaultId || !vaultCrypto.isUnlocked()) return;

      try {
        const serialized = idx.serialize();
        const encrypted = await vaultCrypto.encryptBlob(serialized);
        await trpcMutation("vault", "updateSearchIndex", {
          vaultId,
          encryptedSearchIndex: encrypted,
        });
      } catch {
        // Silent fail — index will be rebuilt on next unlock if sync fails
      }
    }, SYNC_DEBOUNCE_MS);
  }, [vaultId]);

  // ── Load or build index ─────────────────────────────────────

  const loadOrBuildIndex = useCallback(
    async (items: DecryptedVaultItem[]) => {
      if (!vaultId || !vaultCrypto.isUnlocked()) return;

      let loaded = false;

      // Try loading saved encrypted index from server
      try {
        const vaultData = await trpcQuery<VaultRecord>("vault", "get", {
          vaultId,
        });

        if (vaultData.encryptedSearchIndex) {
          const decrypted = await vaultCrypto.decryptBlob(
            vaultData.encryptedSearchIndex,
          );
          indexRef.current = SearchIndex.deserialize(decrypted);
          loaded = true;
        }
      } catch {
        // Failed to load — will rebuild
      }

      // Build from scratch if no saved index or load failed
      if (!loaded) {
        const idx = new SearchIndex();
        for (const item of items) {
          const fields = extractSearchableFields(item.decrypted);
          idx.addItem(item.id, fields);
        }
        indexRef.current = idx;
        // Sync newly built index to server
        scheduleSyncToServer();
      }

      setIsReady(true);
    },
    [vaultId, scheduleSyncToServer],
  );

  // ── Incremental updates ─────────────────────────────────────

  const addItem = useCallback(
    (itemId: string, decrypted: Record<string, unknown>) => {
      if (!indexRef.current) return;
      const fields = extractSearchableFields(decrypted);
      indexRef.current.addItem(itemId, fields);
      scheduleSyncToServer();
    },
    [scheduleSyncToServer],
  );

  const removeItem = useCallback(
    (itemId: string) => {
      if (!indexRef.current) return;
      indexRef.current.removeItem(itemId);
      scheduleSyncToServer();
    },
    [scheduleSyncToServer],
  );

  const updateItem = useCallback(
    (itemId: string, decrypted: Record<string, unknown>) => {
      if (!indexRef.current) return;
      const fields = extractSearchableFields(decrypted);
      indexRef.current.addItem(itemId, fields); // addItem handles remove-then-add
      scheduleSyncToServer();
    },
    [scheduleSyncToServer],
  );

  // ── Search ──────────────────────────────────────────────────

  const search = useCallback((query: string): string[] => {
    if (!indexRef.current) return [];
    return indexRef.current.search(query);
  }, []);

  // ── Cleanup on lock / unmount ───────────────────────────────

  useEffect(() => {
    if (!isUnlocked) {
      indexRef.current?.clear();
      indexRef.current = null;
      setIsReady(false);
      if (syncTimerRef.current) {
        clearTimeout(syncTimerRef.current);
        syncTimerRef.current = null;
      }
    }
  }, [isUnlocked]);

  useEffect(() => {
    return () => {
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    };
  }, []);

  return {
    isReady,
    loadOrBuildIndex,
    search,
    addItem,
    removeItem,
    updateItem,
  } as const;
}
