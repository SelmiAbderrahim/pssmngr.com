// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * ItemsTab
 *
 * The main items list: search toolbar, filter/sort selects, item cards,
 * detail panel. Extracted verbatim from the monolith's items-tab JSX
 * from the route-level composition.
 */

import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Link } from "@tanstack/react-router";
import { Plus, Search, ShieldCheck, Loader2 } from "lucide-react";
import { VaultItemListView } from "@/components/vault/VaultItemListView";
import { ItemDetailView } from "@/components/vault/ItemDetailView";
import { ProtectionExplainer } from "@/components/security/ProtectionExplainer";
import type { DecryptedVaultItem } from "@/components/vault/VaultItemCard";
import type { ViewMode } from "@/config/layout";
import type { FilterType, SortOption } from "./utils";

interface ItemsTabProps {
  filteredItems: DecryptedVaultItem[];
  decryptedItems: DecryptedVaultItem[];
  selectedItem: DecryptedVaultItem | null;
  viewMode: ViewMode;
  searchInput: string;
  onSearchInputChange: (v: string) => void;
  filter: FilterType;
  sort: SortOption;
  onFilterChange: (v: FilterType) => void;
  onSortChange: (v: SortOption) => void;
  isLoading: boolean;
  itemsLoading: boolean;
  decrypting: boolean;
  hasItems: boolean;
  hasFilteredItems: boolean;
  isOrgPending: boolean;
  canMutateItems: boolean;
  canUsePersonalSharing: boolean;
  sharedAccess: boolean;
  nextCursor: string | undefined;
  loadingMore: boolean;
  favoriteLoadingId: string | null;
  onLoadMore: () => void;
  onSelectItem: (item: DecryptedVaultItem) => void;
  onCloseDetail: () => void;
  onToggleFavorite: (id: string) => void | Promise<void>;
  onSaveItem: (itemId: string, data: Record<string, unknown>) => Promise<void>;
  onDeleteItem: (itemId: string) => Promise<void>;
  onShareClick: (itemId: string) => void;
  onAddClick: () => void;
  itemFilterTypes?: ReadonlyArray<{ value: FilterType; label: string }>;
}

const DEFAULT_FILTER_TYPES: ReadonlyArray<{
  value: FilterType;
  label: string;
}> = [{ value: "all" as FilterType, label: "" }];

export function ItemsTab(props: ItemsTabProps) {
  const {
    filteredItems,
    selectedItem,
    viewMode,
    searchInput,
    onSearchInputChange,
    filter,
    sort,
    onFilterChange,
    onSortChange,
    isLoading,
    itemsLoading,
    decrypting,
    hasItems,
    hasFilteredItems,
    isOrgPending,
    canMutateItems,
    canUsePersonalSharing,
    sharedAccess,
    nextCursor,
    loadingMore,
    favoriteLoadingId,
    onLoadMore,
    onSelectItem,
    onCloseDetail,
    onToggleFavorite,
    onSaveItem,
    onDeleteItem,
    onShareClick,
    onAddClick,
  } = props;
  const { t } = useTranslation();

  const handleShareClick = useCallback(
    (itemId: string) => onShareClick(itemId),
    [onShareClick],
  );
  // Unused param workaround for the legacy split share callback removed.
  void DEFAULT_FILTER_TYPES;

  return (
    <div className={selectedItem ? "flex gap-4" : ""}>
      {/* data-tour="vault-share": always-present list-level anchor for the
          vault-basics/sharing tour steps. The actual Share
          trigger lives in ItemDetailView (also anchored) but only mounts once
          an item is selected — the tour needs a stable target on the plain
          list view. querySelector resolves first-in-DOM, which is this one. */}
      <div
        data-tour="vault-share"
        className={
          selectedItem ? "hidden lg:block lg:w-1/3 lg:min-w-[280px]" : "w-full"
        }
      >
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => onSearchInputChange(e.target.value)}
              placeholder={t("vault.search", "Search vault...")}
              className="ps-9"
              data-tour="vault-search"
            />
          </div>

          {!selectedItem && (
            <Select
              value={filter}
              onValueChange={(v) => onFilterChange(v as FilterType)}
            >
              <SelectTrigger
                className="w-full sm:w-[140px]"
                aria-label={t("vault.filterLabel", "Filter by item type")}
              >
                <SelectValue placeholder={t("vault.filterAll", "All types")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {t("vault.filterAll", "All types")}
                </SelectItem>
                <SelectItem value="login">
                  {t("vault.filterLogin", "Logins")}
                </SelectItem>
                <SelectItem value="card">
                  {t("vault.filterCard", "Cards")}
                </SelectItem>
                <SelectItem value="note">
                  {t("vault.filterNote", "Notes")}
                </SelectItem>
                <SelectItem value="identity">
                  {t("vault.filterIdentity", "Identities")}
                </SelectItem>
                <SelectItem value="passkey">
                  {t("vault.filterPasskey", "Passkeys")}
                </SelectItem>
                <SelectItem value="totp">
                  {t("vault.filterTotp", "TOTP")}
                </SelectItem>
                <SelectItem value="file">
                  {t("vault.filterFile", "Files")}
                </SelectItem>
              </SelectContent>
            </Select>
          )}

          {!selectedItem && (
            <Select
              value={sort}
              onValueChange={(v) => onSortChange(v as SortOption)}
            >
              <SelectTrigger
                className="w-full sm:w-[160px]"
                aria-label={t("vault.sortLabel", "Sort vault items")}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="modified">
                  {t("vault.sortModified", "Last modified")}
                </SelectItem>
                <SelectItem value="created">
                  {t("vault.sortCreated", "Date created")}
                </SelectItem>
                <SelectItem value="name">
                  {t("vault.sortName", "Name")}
                </SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>

        {(itemsLoading || decrypting) && !hasItems && (
          <div
            className={
              selectedItem
                ? "flex flex-col gap-3"
                : "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
            }
          >
            {Array.from({ length: selectedItem ? 4 : 6 }).map((_, i) => (
              <Skeleton key={i} className="h-[72px] rounded-lg" />
            ))}
          </div>
        )}

        {!isLoading && !hasItems && !isOrgPending && (
          <Card
            className="rounded-lg border bg-card shadow-sm"
            data-testid="vault-empty-state"
          >
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <ShieldCheck className="h-12 w-12 text-muted-foreground mb-4" />
              <h2 className="text-lg font-semibold mb-2">
                {t(
                  "vault.empty",
                  "Your vault is empty — and only you can fill it.",
                )}
              </h2>
              <p className="text-sm text-muted-foreground max-w-sm mb-6">
                {t(
                  "vault.emptyDescription",
                  "Items are encrypted with keys that never leave your devices.",
                )}
              </p>
              {canMutateItems && (
                <div className="flex flex-col items-center gap-3">
                  <Button
                    onClick={onAddClick}
                    className="min-h-[44px]"
                    data-tour="vault-add-item"
                  >
                    <Plus className="h-4 w-4 me-2" />
                    {t("vault.addFirstItem", "Add your first item")}
                  </Button>
                  <Link
                    to="/dashboard/settings/import-export"
                    search={{ tab: "import" } as never}
                    className="text-sm text-muted-foreground underline-offset-4 hover:underline"
                  >
                    {t(
                      "vault.emptyImport",
                      "Import from another password manager",
                    )}
                  </Link>
                </div>
              )}
              <div className="mt-8 w-full max-w-md text-start">
                <ProtectionExplainer variant="compact" />
              </div>
            </CardContent>
          </Card>
        )}

        {!isLoading && hasItems && !hasFilteredItems && (
          <Card className="rounded-lg border bg-card shadow-sm">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Search className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">
                {t("vault.noResults", "No items match your search or filter.")}
              </p>
            </CardContent>
          </Card>
        )}

        {hasFilteredItems && (
          <>
            <VaultItemListView
              items={filteredItems}
              viewMode={viewMode}
              narrow={!!selectedItem}
              onSelect={onSelectItem}
              onToggleFavorite={onToggleFavorite}
              favoriteLoadingId={favoriteLoadingId}
              showFavorite={!sharedAccess}
            />

            {nextCursor && (
              <div className="flex justify-center mt-6">
                <Button
                  variant="outline"
                  onClick={onLoadMore}
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
          </>
        )}
      </div>

      {selectedItem && (
        <div className="flex-1 min-w-0 lg:border-s rounded-lg border bg-card shadow-sm min-h-[400px]">
          <ItemDetailView
            key={selectedItem.id}
            item={selectedItem}
            onClose={onCloseDetail}
            onSave={onSaveItem}
            onDelete={onDeleteItem}
            onToggleFavorite={onToggleFavorite}
            onShareClick={canUsePersonalSharing ? handleShareClick : undefined}
            onEphemeralShareClick={
              canUsePersonalSharing ? handleShareClick : undefined
            }
            isFavoriteLoading={favoriteLoadingId === selectedItem.id}
            canEdit={canMutateItems}
            canDelete={canMutateItems}
            showFavorite={!sharedAccess}
          />
        </div>
      )}
    </div>
  );
}
