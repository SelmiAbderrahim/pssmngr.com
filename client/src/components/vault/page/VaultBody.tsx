// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * VaultBody — renders the four tabs (items / authenticators / sharing /
 * trash) given the current tab and the resolved data + callbacks. Keeps
 * the top-level route thin.
 */

import type { DecryptedVaultItem } from "@/components/vault/VaultItemCard";
import type { ViewMode } from "@/config/layout";
import { ItemsTab } from "./ItemsTab";
import { AuthenticatorsTab } from "./AuthenticatorsTab";
import { SharingTab } from "./SharingTab";
import { TrashTab } from "./TrashTab";
import type { FilterType, SortOption, TabState, VaultRecord } from "./utils";

interface VaultBodyProps {
  tab: TabState;
  vault: VaultRecord;
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
  onSelectItem: (i: DecryptedVaultItem) => void;
  onCloseDetail: () => void;
  onToggleFavorite: (id: string) => void | Promise<void>;
  onSaveItem: (id: string, data: Record<string, unknown>) => Promise<void>;
  onDeleteItem: (id: string) => Promise<void>;
  onShareClick: (id: string) => void;
  onAddClick: () => void;
  onScanQR: () => void;
  onRestoreItem: () => void;
  onTrashItemsRemoved: (count: number | "all") => void;
  onShareAccepted: () => void;
}

export function VaultBody(props: VaultBodyProps) {
  const { tab } = props;
  if (tab === "items")
    return (
      <ItemsTab
        filteredItems={props.filteredItems}
        decryptedItems={props.decryptedItems}
        selectedItem={props.selectedItem}
        viewMode={props.viewMode}
        searchInput={props.searchInput}
        onSearchInputChange={props.onSearchInputChange}
        filter={props.filter}
        sort={props.sort}
        onFilterChange={props.onFilterChange}
        onSortChange={props.onSortChange}
        isLoading={props.isLoading}
        itemsLoading={props.itemsLoading}
        decrypting={props.decrypting}
        hasItems={props.hasItems}
        hasFilteredItems={props.hasFilteredItems}
        isOrgPending={props.isOrgPending}
        canMutateItems={props.canMutateItems}
        canUsePersonalSharing={props.canUsePersonalSharing}
        sharedAccess={props.sharedAccess}
        nextCursor={props.nextCursor}
        loadingMore={props.loadingMore}
        favoriteLoadingId={props.favoriteLoadingId}
        onLoadMore={props.onLoadMore}
        onSelectItem={props.onSelectItem}
        onCloseDetail={props.onCloseDetail}
        onToggleFavorite={props.onToggleFavorite}
        onSaveItem={props.onSaveItem}
        onDeleteItem={props.onDeleteItem}
        onShareClick={props.onShareClick}
        onAddClick={props.onAddClick}
      />
    );
  if (tab === "authenticators")
    return (
      <AuthenticatorsTab
        decryptedItems={props.decryptedItems}
        selectedItem={props.selectedItem}
        favoriteLoadingId={props.favoriteLoadingId}
        canMutateItems={props.canMutateItems}
        canUsePersonalSharing={props.canUsePersonalSharing}
        sharedAccess={props.sharedAccess}
        onSelectItem={props.onSelectItem}
        onCloseDetail={props.onCloseDetail}
        onSaveItem={props.onSaveItem}
        onDeleteItem={props.onDeleteItem}
        onToggleFavorite={props.onToggleFavorite}
        onShareClick={props.onShareClick}
        onScanQR={props.onScanQR}
      />
    );
  if (tab === "sharing")
    return <SharingTab onShareAccepted={props.onShareAccepted} />;
  return (
    <TrashTab
      vaultId={props.vault.id}
      onRestoreItem={props.onRestoreItem}
      onTrashItemsRemoved={props.onTrashItemsRemoved}
    />
  );
}
