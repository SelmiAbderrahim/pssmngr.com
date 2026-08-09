// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Vault Item List View
 *
 * Renders the vault item list in the presentation chosen by the active layout
 * template's viewMode: grid (cards), table (dense rows), or list (full-width
 * detail rows). When the detail pane is open (`narrow`) the list always falls
 * back to stacked cards, since a table/list doesn't fit a ~280px column.
 */

import { useTranslation } from "react-i18next";
import { Star, Loader2, Users, Key } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { VaultItemCard } from "./VaultItemCard";
import {
  ITEM_ICONS,
  ITEM_TYPE_COLORS,
  getTitle,
  getSubtitle,
  formatDate,
  type DecryptedVaultItem,
} from "./vaultItemDisplay";
import type { ViewMode } from "@/config/layout";

interface RowHandlers {
  onSelect: (item: DecryptedVaultItem) => void;
  onToggleFavorite: (itemId: string) => void;
  favoriteLoadingId?: string | null;
  showFavorite?: boolean;
}

interface VaultItemListViewProps extends RowHandlers {
  items: DecryptedVaultItem[];
  viewMode: ViewMode;
  /** True when the detail pane is open (narrow column) → force stacked cards. */
  narrow?: boolean;
}

function FavoriteButton({
  item,
  onToggleFavorite,
  isLoading,
}: {
  item: DecryptedVaultItem;
  onToggleFavorite: (itemId: string) => void;
  isLoading?: boolean;
}) {
  const { t } = useTranslation(["common", "vault"]);
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-8 w-8 p-0"
      disabled={isLoading}
      onClick={(e) => {
        e.stopPropagation();
        onToggleFavorite(item.id);
      }}
      aria-label={
        item.isFavorite
          ? t("vault.unfavorite", "Remove from favorites")
          : t("vault.favorite", "Add to favorites")
      }
    >
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Star
          className={cn(
            "h-4 w-4",
            item.isFavorite
              ? "fill-yellow-400 text-yellow-400"
              : "text-muted-foreground"
          )}
        />
      )}
    </Button>
  );
}

function onRowKey(
  e: React.KeyboardEvent,
  item: DecryptedVaultItem,
  onSelect: (item: DecryptedVaultItem) => void
) {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    onSelect(item);
  }
}

function GridView({
  items,
  ...handlers
}: { items: DecryptedVaultItem[] } & RowHandlers) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[var(--tpl-gap)]">
      {items.map((item) => (
        <VaultItemCard
          key={item.id}
          item={item}
          onSelect={handlers.onSelect}
          onToggleFavorite={handlers.onToggleFavorite}
          isFavoriteLoading={handlers.favoriteLoadingId === item.id}
          showFavorite={handlers.showFavorite}
        />
      ))}
    </div>
  );
}

function StackedView({
  items,
  ...handlers
}: { items: DecryptedVaultItem[] } & RowHandlers) {
  return (
    <div className="flex flex-col gap-2">
      {items.map((item) => (
        <VaultItemCard
          key={item.id}
          item={item}
          onSelect={handlers.onSelect}
          onToggleFavorite={handlers.onToggleFavorite}
          isFavoriteLoading={handlers.favoriteLoadingId === item.id}
          showFavorite={handlers.showFavorite}
        />
      ))}
    </div>
  );
}

function TableView({
  items,
  onSelect,
  onToggleFavorite,
  favoriteLoadingId,
  showFavorite = true,
}: { items: DecryptedVaultItem[] } & RowHandlers) {
  const { t } = useTranslation(["common", "vault"]);
  return (
    <div className="rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12" />
            <TableHead>{t("vault.table.name", "Name")}</TableHead>
            <TableHead className="hidden sm:table-cell">
              {t("vault.table.details", "Details")}
            </TableHead>
            <TableHead className="hidden md:table-cell">
              {t("vault.table.modified", "Modified")}
            </TableHead>
            {showFavorite && <TableHead className="w-12" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => {
            const Icon = ITEM_ICONS[item.itemType] || Key;
            const title = getTitle(item, t("vault:untitled", "Untitled"));
            const subtitle = getSubtitle(item);
            return (
              <TableRow
                key={item.id}
                role="button"
                tabIndex={0}
                className="cursor-pointer"
                onClick={() => onSelect(item)}
                onKeyDown={(e) => onRowKey(e, item, onSelect)}
              >
                <TableCell className="py-2">
                  <div
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-md",
                      ITEM_TYPE_COLORS[item.itemType] || ITEM_TYPE_COLORS.login
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                </TableCell>
                <TableCell className="py-2 font-medium">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate">{title}</span>
                    {item.isShared && (
                      <Users
                        className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                        aria-label={t("sharing.shared", "Shared")}
                      />
                    )}
                  </span>
                </TableCell>
                <TableCell className="hidden sm:table-cell py-2 text-muted-foreground truncate">
                  {subtitle}
                </TableCell>
                <TableCell className="hidden md:table-cell py-2 text-muted-foreground">
                  {formatDate(item.updatedAt, t)}
                </TableCell>
                {showFavorite && (
                  <TableCell className="py-2">
                    <FavoriteButton
                      item={item}
                      onToggleFavorite={onToggleFavorite}
                      isLoading={favoriteLoadingId === item.id}
                    />
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function ListView({
  items,
  onSelect,
  onToggleFavorite,
  favoriteLoadingId,
  showFavorite = true,
}: { items: DecryptedVaultItem[] } & RowHandlers) {
  const { t } = useTranslation(["common", "vault"]);
  return (
    <div className="flex flex-col divide-y rounded-lg border bg-card">
      {items.map((item) => {
        const Icon = ITEM_ICONS[item.itemType] || Key;
        const title = getTitle(item, t("vault:untitled", "Untitled"));
        const subtitle = getSubtitle(item);
        return (
          <div
            key={item.id}
            role="button"
            tabIndex={0}
            className="flex items-center gap-4 px-4 py-[var(--tpl-gap)] cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => onSelect(item)}
            onKeyDown={(e) => onRowKey(e, item, onSelect)}
          >
            <div
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                ITEM_TYPE_COLORS[item.itemType] || ITEM_TYPE_COLORS.login
              )}
            >
              <Icon className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate flex items-center gap-1.5">
                {title}
                {item.isShared && (
                  <Users
                    className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                    aria-label={t("sharing.shared", "Shared")}
                  />
                )}
              </p>
              {subtitle && (
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {subtitle}
                </p>
              )}
            </div>
            <span className="text-xs text-muted-foreground hidden sm:block shrink-0">
              {formatDate(item.updatedAt, t)}
            </span>
            {showFavorite && (
              <FavoriteButton
                item={item}
                onToggleFavorite={onToggleFavorite}
                isLoading={favoriteLoadingId === item.id}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function VaultItemListView({
  items,
  viewMode,
  narrow,
  ...handlers
}: VaultItemListViewProps) {
  if (narrow) return <StackedView items={items} {...handlers} />;

  switch (viewMode) {
    case "table":
      return <TableView items={items} {...handlers} />;
    case "list":
      return <ListView items={items} {...handlers} />;
    case "grid":
    case "compact-cards":
    default:
      return <GridView items={items} {...handlers} />;
  }
}

export default VaultItemListView;
