// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * useOrgSharedVaultActions — encapsulates the setup + grant flows for a
 * workspace's shared vault. Verbatim move of the handler bodies from the
 * old monolith.
 */

import { useCallback, useState } from "react";
import type { TFunction } from "i18next";
import {
  setupOrgSharedVault,
  autoWrapPendingMembers,
  importPersonalItemsIntoSharedVault,
  type OrgVaultAccess,
} from "@/services/org-shared-vault";
import { orgVaultErrorMessage, type VaultRecord } from "./utils";

interface UseArgs {
  userId: string | undefined;
  vault: VaultRecord | null;
  activeWorkspaceName: string | undefined;
  orgVault:
    | { kind: "none"; canManage: boolean }
    | { kind: "pending" }
    | { kind: "ready"; canManage: boolean; access: OrgVaultAccess }
    | null;
  setOrgVault: (v: {
    kind: "ready";
    canManage: boolean;
    access: OrgVaultAccess;
  }) => void;
  setError: (v: string | null) => void;
  t: TFunction;
}

export function useOrgSharedVaultActions({
  userId,
  vault,
  activeWorkspaceName,
  orgVault,
  setOrgVault,
  setError,
  t,
}: UseArgs) {
  const [orgSetupBusy, setOrgSetupBusy] = useState(false);
  const [orgGrantMessage, setOrgGrantMessage] = useState<string | null>(null);

  const handleSetupSharedVault = useCallback(async () => {
    if (!userId) return;
    setOrgSetupBusy(true);
    setError(null);
    try {
      const access = await setupOrgSharedVault(userId, activeWorkspaceName);
      if (vault) {
        try {
          await importPersonalItemsIntoSharedVault(
            vault.id,
            access.vaultId,
            access.key,
          );
        } catch (e) {
          console.error("[Vault] import into shared vault failed:", e);
        }
      }
      try {
        const result = await autoWrapPendingMembers(access.vaultId, access.key);
        if (result.pending > 0) {
          setOrgGrantMessage(
            t(
              "vault.org.pendingMembers",
              "{{count}} member(s) still need to sign in on a device before access can be granted.",
              { count: result.pending },
            ) as string,
          );
        }
      } catch (e) {
        console.error("[Vault] auto-wrap after setup failed:", e);
      }
      setOrgVault({ kind: "ready", canManage: true, access });
    } catch (err) {
      setError(
        orgVaultErrorMessage(
          err,
          t as unknown as (k: string, f: string) => string,
          "Failed to set up the organization vault",
        ),
      );
    } finally {
      setOrgSetupBusy(false);
    }
  }, [userId, vault, activeWorkspaceName, t, setError, setOrgVault]);

  const handleGrantPendingMembers = useCallback(async () => {
    if (orgVault?.kind !== "ready") return;
    setOrgSetupBusy(true);
    setOrgGrantMessage(null);
    setError(null);
    try {
      const result = await autoWrapPendingMembers(
        orgVault.access.vaultId,
        orgVault.access.key,
      );
      setOrgGrantMessage(
        (result.granted > 0
          ? t(
              "vault.org.grantedMembers",
              "Granted access to {{count}} member(s).",
              { count: result.granted },
            )
          : result.pending > 0
            ? t(
                "vault.org.pendingMembers",
                "{{count}} member(s) still need to sign in on a device before access can be granted.",
                { count: result.pending },
              )
            : t(
                "vault.org.noPendingMembers",
                "All organization members already have access. Members may need to refresh their vault to see the shared items.",
              )) as string,
      );
    } catch (err) {
      setError(
        orgVaultErrorMessage(
          err,
          t as unknown as (k: string, f: string) => string,
          t(
            "vault.org.grantError",
            "Failed to grant shared vault access.",
          ) as string,
        ),
      );
    } finally {
      setOrgSetupBusy(false);
    }
  }, [orgVault, t, setError]);

  return {
    orgSetupBusy,
    orgGrantMessage,
    handleSetupSharedVault,
    handleGrantPendingMembers,
  };
}
