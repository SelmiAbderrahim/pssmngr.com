// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import type {
  DecryptedVaultItem,
  ItemType,
} from "@/components/vault/VaultItemCard";

export interface VaultItemContent {
  itemType: ItemType;
  data: Record<string, unknown>;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(
        ([, entry]) => entry !== undefined && entry !== null && entry !== "",
      )
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => [key, canonicalize(entry)]),
  );
}

export function areExactDuplicateItems(
  left: VaultItemContent,
  right: VaultItemContent,
): boolean {
  return (
    left.itemType === right.itemType &&
    JSON.stringify(canonicalize(left.data)) ===
      JSON.stringify(canonicalize(right.data))
  );
}

export function findExactVaultDuplicates(
  candidate: VaultItemContent,
  existingItems: DecryptedVaultItem[],
): DecryptedVaultItem[] {
  return existingItems.filter((item) =>
    areExactDuplicateItems(candidate, {
      itemType: item.itemType,
      data: item.decrypted,
    }),
  );
}
