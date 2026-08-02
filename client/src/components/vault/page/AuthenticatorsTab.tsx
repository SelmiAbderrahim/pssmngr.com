// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * AuthenticatorsTab — TOTP list + detail split view.
 * JSX moved verbatim from vault.tsx.
 */

import { TOTPListView } from "@/components/vault/TOTPListView";
import { ItemDetailView } from "@/components/vault/ItemDetailView";
import type { DecryptedVaultItem } from "@/components/vault/VaultItemCard";

interface AuthenticatorsTabProps {
  decryptedItems: DecryptedVaultItem[];
  selectedItem: DecryptedVaultItem | null;
  favoriteLoadingId: string | null;
  canMutateItems: boolean;
  canUsePersonalSharing: boolean;
  sharedAccess: boolean;
  onSelectItem: (item: DecryptedVaultItem) => void;
  onCloseDetail: () => void;
  onSaveItem: (
    itemId: string,
    data: Record<string, unknown>,
  ) => Promise<void>;
  onDeleteItem: (itemId: string) => Promise<void>;
  onToggleFavorite: (id: string) => void | Promise<void>;
  onShareClick: (itemId: string) => void;
  onScanQR: () => void;
}

export function AuthenticatorsTab({
  decryptedItems,
  selectedItem,
  favoriteLoadingId,
  canMutateItems,
  canUsePersonalSharing,
  sharedAccess,
  onSelectItem,
  onCloseDetail,
  onSaveItem,
  onDeleteItem,
  onToggleFavorite,
  onShareClick,
  onScanQR,
}: AuthenticatorsTabProps) {
  return (
    <div className={selectedItem ? "flex gap-4" : ""}>
      <div
        className={
          selectedItem
            ? "hidden lg:block lg:w-1/3 lg:min-w-[280px]"
            : "w-full"
        }
      >
        <TOTPListView
          items={decryptedItems}
          onSelect={onSelectItem}
          onScanQR={onScanQR}
        />
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
            onShareClick={canUsePersonalSharing ? onShareClick : undefined}
            onEphemeralShareClick={
              canUsePersonalSharing ? onShareClick : undefined
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
