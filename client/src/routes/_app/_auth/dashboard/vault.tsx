// Copyright (c) 2026 Password Manager contributors
/**
 * Vault Page (thin route).
 *
 * validateSearch + ActiveDialog state machine + composition. Data lives
 * in useVaultItems; tabs are extracted feature components; dialogs run
 * through a single discriminated union. See components/vault/page/README.md.
 */

import { useState, useEffect, useCallback } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { useVaultCrypto } from "@/hooks/useVaultCrypto";
import { useSearchIndex } from "@/hooks/useSearchIndex";
import type { ItemType } from "@/components/vault/VaultItemCard";
import { useLayoutTemplate } from "@/providers/LayoutTemplateProvider";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import type { OTPAuthURI } from "@/services/totp-engine";
import { useWorkspaceContext } from "@/providers/WorkspaceContext";
import { useAuthState } from "@/providers/AuthProvider";
import { useOrgSharedVault } from "@/hooks/useOrgSharedVault";
import { useVaultItems } from "@/components/vault/page/useVaultItems";
import { useFilteredItems } from "@/components/vault/page/useFilteredItems";
import { useOrgSharedVaultActions } from "@/components/vault/page/useOrgSharedVaultActions";
import { useShareItemHandler } from "@/components/vault/page/useShareItemHandler";
import { VaultDialogs } from "@/components/vault/page/VaultDialogs";
import { VaultBody } from "@/components/vault/page/VaultBody";
import { OrgVaultBanner } from "@/components/vault/page/OrgVaultBanner";
import { VaultHeader } from "@/components/vault/page/VaultHeader";
import { VaultTabsBar } from "@/components/vault/page/VaultTabsBar";
import {
  VaultLockedCard,
  NoVaultCard,
} from "@/components/vault/page/VaultLockedCard";
import {
  isCreateType,
  SHARED_PERMISSION_LEVEL,
  type TabState,
  type FilterType,
  type SortOption,
  type CreateType,
} from "@/components/vault/page/utils";
import type { ActiveDialog } from "@/components/vault/page/types";

export const Route = createFileRoute("/_app/_auth/dashboard/vault")({
  component: VaultPage,
  validateSearch: (search: Record<string, unknown>) => ({
    tab: (search.tab as TabState) || "items",
    filter: (search.filter as FilterType) || "all",
    sort: (search.sort as SortOption) || "modified",
    q: (search.q as string) || "",
    create: isCreateType(search.create) ? search.create : undefined,
  }),
});

function VaultPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { tab, filter, sort, q, create } = Route.useSearch();
  const { isUnlocked, encryptItem } = useVaultCrypto();
  const { isOnline: vaultIsOnline } = useOnlineStatus();
  const { activeWorkspaceId, activeWorkspace } = useWorkspaceContext();
  const { user } = useAuthState();
  const { templateConfig } = useLayoutTemplate();
  const isPersonalWorkspace =
    activeWorkspace === null
      ? false
      : activeWorkspace.isPersonal !== false &&
        activeWorkspace.name === "My Organization" &&
        activeWorkspace.memberCount <= 1;

  const [dialog, setDialog] = useState<ActiveDialog>({ kind: "none" });
  const [dismissedPrompt, setDismissedPrompt] = useState(false);
  const [decryptionFailed, setDecryptionFailed] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState(q);

  const { orgVault, setOrgVault, orgResolveError, runOrgResolve } =
    useOrgSharedVault({
      activeWorkspaceId,
      isPersonalWorkspace,
      isUnlocked,
      userId: user?.id,
      onUnlockRequired: () => {
        setDismissedPrompt(false);
        setDialog({ kind: "unlock" });
      },
    });

  const sharedAccess = orgVault?.kind === "ready" ? orgVault.access : null;
  const sharedLevel = sharedAccess
    ? SHARED_PERMISSION_LEVEL[sharedAccess.permission]
    : null;
  const canMutateItems =
    !sharedAccess || (sharedLevel ?? 0) >= SHARED_PERMISSION_LEVEL.edit;
  const canUsePersonalSharing = !sharedAccess;
  const usesPerUserVault = isPersonalWorkspace || orgVault?.kind === "none";
  const isOrgPending = !isPersonalWorkspace && orgVault?.kind === "pending";

  const onBulkDecryptFailure = useCallback(() => {
    setDecryptionFailed(true);
    setDismissedPrompt(true);
  }, []);
  const searchIndexHandle = useSearchIndex(null, isUnlocked);
  const {
    vault,
    vaultLoading,
    vaultError,
    serverItems,
    decryptedItems,
    itemsLoading,
    decrypting,
    lastSyncedAt,
    nextCursor,
    loadingMore,
    favoriteLoadingId,
    trashCount,
    error,
    setError,
    fetchItems,
    getAllDecryptedItems,
    handleCreateItem,
    handleSaveItem,
    handleDeleteItem,
    handleToggleFavorite,
    handleLoadMore,
    handleRestoreFromTrash,
  } = useVaultItems({
    userId: user?.id,
    activeWorkspaceId,
    isUnlocked,
    isPersonalWorkspace,
    orgVault,
    sharedAccess,
    canMutateItems,
    vaultIsOnline,
    encryptItem,
    loadOrBuildIndex: searchIndexHandle.loadOrBuildIndex,
    indexAddItem: searchIndexHandle.addItem,
    indexRemoveItem: searchIndexHandle.removeItem,
    indexUpdateItem: searchIndexHandle.updateItem,
    onBulkDecryptFailure,
  });

  const realIndex = useSearchIndex(vault?.id ?? null, isUnlocked);
  const filteredItems = useFilteredItems({
    decryptedItems,
    filter,
    sort,
    q,
    searchIndexReady: realIndex.isReady,
    searchIndex: realIndex.search,
  });

  const orgActions = useOrgSharedVaultActions({
    userId: user?.id,
    vault,
    activeWorkspaceName: activeWorkspace?.name,
    orgVault,
    setOrgVault,
    setError,
    t,
  });

  useEffect(() => {
    if (
      vault &&
      !isUnlocked &&
      !vaultLoading &&
      !dismissedPrompt &&
      dialog.kind === "none"
    ) {
      setDialog({ kind: "unlock" });
    }
  }, [vault, isUnlocked, vaultLoading, dismissedPrompt, dialog.kind]);
  useEffect(() => {
    if (isUnlocked) setDismissedPrompt(false);
  }, [isUnlocked]);
  useEffect(() => {
    if (create && canMutateItems && dialog.kind === "none") {
      setDialog({ kind: "createItem", itemType: create });
    }
  }, [canMutateItems, create, dialog.kind]);

  const updateSearch = useCallback(
    (
      updates: Partial<{
        tab: TabState;
        filter: FilterType;
        sort: SortOption;
        q: string;
        create?: CreateType;
      }>,
    ) => {
      void navigate({
        to: "/dashboard/vault",
        search: { tab, filter, sort, q, create, ...updates },
        replace: true,
      });
    },
    [navigate, tab, filter, sort, q, create],
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== q) updateSearch({ q: searchInput });
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, q, updateSearch]);

  const handleShareItem = useShareItemHandler(dialog, serverItems);

  const handleWrappedCreate = useCallback(
    async (itemType: ItemType, data: Record<string, unknown>) => {
      await handleCreateItem(itemType, data);
      if (create) updateSearch({ create: undefined });
    },
    [handleCreateItem, create, updateSearch],
  );

  const handleQRResult = useCallback(
    (parsed: OTPAuthURI) => setDialog({ kind: "totpPreview", uri: parsed }),
    [],
  );
  const handleTOTPConfirm = useCallback(
    async (title: string, data: OTPAuthURI) => {
      await handleCreateItem("totp", {
        title,
        issuer: data.issuer,
        account: data.account,
        secret: data.secret,
        algorithm: data.algorithm,
        digits: data.digits,
        period: data.period,
      });
    },
    [handleCreateItem],
  );
  const handleUnlock = useCallback(() => {
    setDialog({ kind: "none" });
    setDismissedPrompt(true);
    setDecryptionFailed(false);
  }, []);
  const handleRecovery = useCallback(() => {
    setDecryptionFailed(false);
    if (vault) fetchItems(vault.id);
  }, [vault, fetchItems]);

  const selectedItem = selectedItemId
    ? (decryptedItems.find((i) => i.id === selectedItemId) ?? null)
    : null;
  const closeDetail = () => setSelectedItemId(null);
  const deleteAndClose = async (id: string) => {
    await handleDeleteItem(id);
    closeDetail();
  };

  return (
    <div className="container mx-auto p-4 sm:p-6">
      <VaultHeader
        lastSyncedAt={lastSyncedAt}
        showActions={
          !!(
            isUnlocked &&
            vault &&
            (usesPerUserVault || sharedAccess) &&
            canMutateItems
          )
        }
        showQRAction={tab === "authenticators"}
        onScanQR={() => setDialog({ kind: "qrScanner" })}
        onAdd={() => setDialog({ kind: "createItem" })}
      />

      {(error || vaultError) && (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error || vaultError}</AlertDescription>
        </Alert>
      )}

      <OrgVaultBanner
        isPersonalWorkspace={isPersonalWorkspace}
        isUnlocked={isUnlocked}
        orgVault={orgVault}
        orgResolveError={orgResolveError}
        orgSetupBusy={orgActions.orgSetupBusy}
        orgGrantMessage={orgActions.orgGrantMessage}
        onRunOrgResolve={() => void runOrgResolve()}
        onSetupSharedVault={orgActions.handleSetupSharedVault}
        onGrantPendingMembers={orgActions.handleGrantPendingMembers}
      />

      {vaultLoading && (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-10 w-full" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-[72px] rounded-lg" />
            ))}
          </div>
        </div>
      )}

      {!vaultLoading && !vault && !vaultError && <NoVaultCard />}

      {vault && isUnlocked && !vaultLoading && (
        <>
          <VaultTabsBar
            tab={tab}
            trashCount={trashCount}
            onTabChange={(v) => {
              setSelectedItemId(null);
              updateSearch({ tab: v });
            }}
          />
          <VaultBody
            tab={tab}
            vault={vault}
            filteredItems={filteredItems}
            decryptedItems={decryptedItems}
            selectedItem={selectedItem}
            viewMode={templateConfig.viewMode}
            searchInput={searchInput}
            onSearchInputChange={setSearchInput}
            filter={filter}
            sort={sort}
            onFilterChange={(v) => updateSearch({ filter: v })}
            onSortChange={(v) => updateSearch({ sort: v })}
            isLoading={vaultLoading || itemsLoading || decrypting}
            itemsLoading={itemsLoading}
            decrypting={decrypting}
            hasItems={decryptedItems.length > 0}
            hasFilteredItems={filteredItems.length > 0}
            isOrgPending={!!isOrgPending}
            canMutateItems={canMutateItems}
            canUsePersonalSharing={canUsePersonalSharing}
            sharedAccess={!!sharedAccess}
            nextCursor={nextCursor}
            loadingMore={loadingMore}
            favoriteLoadingId={favoriteLoadingId}
            onLoadMore={handleLoadMore}
            onSelectItem={(i) => setSelectedItemId(i.id)}
            onCloseDetail={closeDetail}
            onToggleFavorite={handleToggleFavorite}
            onSaveItem={handleSaveItem}
            onDeleteItem={deleteAndClose}
            onShareClick={(id) => setDialog({ kind: "share", itemId: id })}
            onAddClick={() => setDialog({ kind: "createItem" })}
            onScanQR={() => setDialog({ kind: "qrScanner" })}
            onRestoreItem={handleRestoreFromTrash}
            onShareAccepted={() => {
              if (vault) fetchItems(vault.id);
            }}
          />
        </>
      )}

      {vault && !isUnlocked && !vaultLoading && (
        <VaultLockedCard
          decryptionFailed={decryptionFailed}
          onUnlock={() => {
            setDismissedPrompt(false);
            setDialog({ kind: "unlock" });
          }}
        />
      )}

      <VaultDialogs
        dialog={dialog}
        setDialog={setDialog}
        canMutateItems={canMutateItems}
        vault={vault}
        serverItems={serverItems}
        decryptedItems={decryptedItems}
        onCreateItem={handleWrappedCreate}
        getExistingItems={getAllDecryptedItems}
        onQRResult={handleQRResult}
        onTOTPConfirm={handleTOTPConfirm}
        onShareItem={handleShareItem}
        onUnlock={handleUnlock}
        onRecovery={handleRecovery}
        decryptionFailed={decryptionFailed}
        t={t as (k: string, f: string) => string}
      />
    </div>
  );
}
