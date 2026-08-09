// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors

import { useMemo } from "react";
import type { DecryptedVaultItem } from "@/components/vault/VaultItemCard";
import type { FilterType, SortOption } from "./utils";

interface UseFilteredItemsArgs {
  decryptedItems: DecryptedVaultItem[];
  filter: FilterType;
  sort: SortOption;
  q: string;
  searchIndexReady: boolean;
  searchIndex: (q: string) => string[];
}

export function useFilteredItems({
  decryptedItems,
  filter,
  sort,
  q,
  searchIndexReady,
  searchIndex,
}: UseFilteredItemsArgs): DecryptedVaultItem[] {
  return useMemo(() => {
    let out = [...decryptedItems];
    if (filter !== "all") out = out.filter((i) => i.itemType === filter);
    if (q.trim()) {
      if (searchIndexReady) {
        const matchIds = new Set(searchIndex(q));
        out = out.filter((i) => matchIds.has(i.id));
      } else {
        const query = q.toLowerCase().trim();
        out = out.filter((i) => {
          const d = i.decrypted;
          const searchable = [
            d.title,
            d.name,
            d.username,
            d.email,
            d.url,
            d.fullName,
            d.content,
            d.notes,
          ]
            .filter(Boolean)
            .map((v) => String(v).toLowerCase());
          return searchable.some((s) => s.includes(query));
        });
      }
    }
    out.sort((a, b) => {
      if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
      switch (sort) {
        case "name": {
          const aName = String(a.decrypted.title || a.decrypted.name || "");
          const bName = String(b.decrypted.title || b.decrypted.name || "");
          return aName.localeCompare(bName);
        }
        case "created":
          return (
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
        case "modified":
        default:
          return (
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
          );
      }
    });
    return out;
  }, [decryptedItems, filter, sort, q, searchIndexReady, searchIndex]);
}
