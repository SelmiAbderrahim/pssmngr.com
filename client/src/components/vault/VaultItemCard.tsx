// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Vault Item Card
 *
 * Displays a single decrypted vault item in the vault list.
 * Shows icon by type, title, subtitle, favorite toggle, and last modified.
 */

import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Key, Star, Loader2, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ITEM_ICONS,
  ITEM_TYPE_COLORS,
  getTitle,
  getSubtitle,
  formatDate,
  type DecryptedVaultItem,
} from "./vaultItemDisplay";

export type { ItemType, DecryptedVaultItem } from "./vaultItemDisplay";

/** Plaintext TOTP data encrypted within the standard item blob. */
export interface TOTPItemData {
  issuer: string;
  account: string;
  secret: string;        // Base32 secret
  algorithm: string;     // SHA1 | SHA256 | SHA512
  digits: number;        // 6 | 8
  period: number;        // seconds (default 30)
}

/** Plaintext passkey credential data encrypted within the standard item blob. */
export interface PasskeyItemData {
  credentialId: string;
  rpId: string;
  userHandle: string;
  publicKey: string;     // Base64-encoded public key
  transports: string[];  // e.g. ["internal", "hybrid"]
  createdAt: string;     // ISO 8601 timestamp
}

interface VaultItemCardProps {
  item: DecryptedVaultItem;
  onSelect: (item: DecryptedVaultItem) => void;
  onToggleFavorite: (itemId: string) => void;
  isFavoriteLoading?: boolean;
  showFavorite?: boolean;
}

export function VaultItemCard({
  item,
  onSelect,
  onToggleFavorite,
  isFavoriteLoading,
  showFavorite = true,
}: VaultItemCardProps) {
  const { t } = useTranslation(["common", "vault"]);
  const Icon = ITEM_ICONS[item.itemType] || Key;
  const title = getTitle(item, t("vault:untitled", "Untitled"));
  const subtitle = getSubtitle(item);
  const colorClass = ITEM_TYPE_COLORS[item.itemType] || ITEM_TYPE_COLORS.login;

  const handleFavoriteClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onToggleFavorite(item.id);
    },
    [item.id, onToggleFavorite],
  );

  return (
    <Card
      className="rounded-lg border bg-card text-card-foreground shadow-sm hover:bg-muted/50 transition-colors duration-150 cursor-pointer"
      onClick={() => onSelect(item)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(item);
        }
      }}
    >
      <div className="flex items-center gap-3 p-4">
        {/* Icon */}
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
            colorClass,
          )}
        >
          <Icon className="h-5 w-5" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{title}</p>
          {subtitle && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {subtitle}
            </p>
          )}
        </div>

        {/* Meta */}
        <div className="flex items-center gap-1 shrink-0">
          {item.isShared && (
            <Users className="h-3.5 w-3.5 text-muted-foreground" aria-label={t("sharing.shared", "Shared")} />
          )}
          <span className="text-xs text-muted-foreground hidden sm:block">
            {formatDate(item.updatedAt, t)}
          </span>
          {showFavorite && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={handleFavoriteClick}
              disabled={isFavoriteLoading}
              aria-label={
                item.isFavorite
                  ? t("vault.unfavorite", "Remove from favorites")
                  : t("vault.favorite", "Add to favorites")
              }
            >
              {isFavoriteLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Star
                  className={cn(
                    "h-4 w-4",
                    item.isFavorite
                      ? "fill-yellow-400 text-yellow-400"
                      : "text-muted-foreground",
                  )}
                />
              )}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
