// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Vault item display helpers
 *
 * Shared by all vault list views (grid / table / list) so item titles,
 * subtitles, icons, colors, and date formatting stay consistent.
 */

import {
  Key,
  CreditCard,
  StickyNote,
  User,
  Fingerprint,
  ShieldCheck,
  File,
} from "lucide-react";

export type ItemType =
  | "login"
  | "passkey"
  | "identity"
  | "card"
  | "note"
  | "totp"
  | "file";

export interface DecryptedVaultItem {
  id: string;
  itemType: ItemType;
  isFavorite: boolean;
  isShared?: boolean;
  createdAt: string;
  updatedAt: string;
  decrypted: Record<string, unknown>;
}

export const ITEM_ICONS: Record<ItemType, React.ElementType> = {
  login: Key,
  passkey: Fingerprint,
  identity: User,
  card: CreditCard,
  note: StickyNote,
  totp: ShieldCheck,
  file: File,
};

export const ITEM_TYPE_COLORS: Record<ItemType, string> = {
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

type TFn = (
  key: string,
  fallback: string,
  opts?: Record<string, unknown>
) => string;

export function getTitle(item: DecryptedVaultItem, fallback: string): string {
  const d = item.decrypted;
  return (d.title as string) || (d.name as string) || fallback;
}

export function getSubtitle(item: DecryptedVaultItem): string {
  const d = item.decrypted;
  switch (item.itemType) {
    case "login":
      return (d.username as string) || (d.email as string) || "";
    case "card": {
      const num = (d.number as string) || "";
      return num ? `**** ${num.slice(-4)}` : "";
    }
    case "identity":
      return (d.email as string) || (d.fullName as string) || "";
    case "totp":
      return (d.issuer as string) || (d.account as string) || "";
    case "passkey":
      return (d.rpId as string) || "";
    case "note":
      return ((d.content as string) || "").slice(0, 50);
    default:
      return "";
  }
}

export function formatDate(dateStr: string, t: TFn): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return t("vault:time.today", "Today");
  if (diffDays === 1) return t("vault:time.yesterday", "Yesterday");
  if (diffDays < 7)
    return t("vault:time.daysAgo", "{{count}}d ago", { count: diffDays });
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
