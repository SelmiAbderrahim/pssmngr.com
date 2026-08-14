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

/**
 * Ephemeral exact-duplicate fingerprint.
 *
 * The returned string contains the item's plaintext in canonical form, so it
 * is exactly as sensitive as the item itself. It exists only to make
 * duplicate checks O(n) via a `Set` inside one render pass, and must never be
 * logged, persisted, transmitted, sent to analytics, placed in a test id or
 * ARIA label, or used to derive an idempotency key.
 */
export function exactItemFingerprint(content: VaultItemContent): string {
  return `${content.itemType}\u0000${JSON.stringify(canonicalize(content.data))}`;
}

export function areExactDuplicateItems(
  left: VaultItemContent,
  right: VaultItemContent,
): boolean {
  return exactItemFingerprint(left) === exactItemFingerprint(right);
}

export function findExactVaultDuplicates(
  candidate: VaultItemContent,
  existingItems: DecryptedVaultItem[],
): DecryptedVaultItem[] {
  const target = exactItemFingerprint(candidate);
  return existingItems.filter(
    (item) =>
      exactItemFingerprint({
        itemType: item.itemType,
        data: item.decrypted,
      }) === target,
  );
}
