// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * OrgVaultAutoGrantProvider
 *
 * App-wide, background half of the role-driven auto-grant flow. Mounted once
 * inside the authenticated shell (below WorkspaceProvider), it runs whenever
 * the caller is a manager (owner/admin) of the active non-personal workspace
 * AND the vault is unlocked — NOT only when they open the vault tab.
 *
 * Zero-knowledge constraint: the server cannot wrap the shared vault key, so a
 * grant can only be produced here, by a manager's unlocked device. This
 * provider makes that happen automatically:
 *   - vault exists + caller can manage → wrap the key for every pending member
 *     (permission derived from each member's org role, server-authoritative);
 *   - no vault yet, but the org has other members → create it, import the
 *     manager's existing org items, then grant everyone.
 *
 * It also exposes `pendingAccessCount` — members who can't be wrapped yet
 * because they haven't enrolled a device — for the "waiting for access" badge.
 */

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useWorkspaceContext } from "@/providers/WorkspaceContext";
import { useVaultCrypto } from "@/hooks/useVaultCrypto";
import { useAuthState } from "@/providers/AuthProvider";
import {
  resolveOrgSharedVault,
  autoWrapPendingMembers,
  setupImportAndGrantOrgSharedVault,
} from "@/services/org-shared-vault";

/** Re-check cadence while a manager keeps a managed workspace open. */
const RECHECK_INTERVAL_MS = 60_000;

interface OrgVaultAutoGrantValue {
  /** Members still waiting for access (no enrolled device yet). */
  pendingAccessCount: number;
}

const OrgVaultAutoGrantContext = createContext<OrgVaultAutoGrantValue>({
  pendingAccessCount: 0,
});

/** Read the count of org members still waiting for shared-vault access. */
export function usePendingVaultAccess(): OrgVaultAutoGrantValue {
  return useContext(OrgVaultAutoGrantContext);
}

export function OrgVaultAutoGrantProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { activeWorkspaceId, activeWorkspace, isAdminOrOwner } =
    useWorkspaceContext();
  const { isUnlocked } = useVaultCrypto();
  const { user } = useAuthState();

  const [pendingAccessCount, setPendingAccessCount] = useState(0);
  // Guards against overlapping runs (interval + focus firing together).
  const runningRef = useRef(false);

  const userId = user?.id;
  const memberCount = activeWorkspace?.memberCount ?? 0;
  const workspaceName = activeWorkspace?.name;
  // Same "personal workspace" test the vault page uses.
  const isPersonalWorkspace =
    activeWorkspace === null
      ? false
      : activeWorkspace.isPersonal !== false &&
        activeWorkspace.name === "My Organization" &&
        activeWorkspace.memberCount <= 1;

  useEffect(() => {
    if (
      !isUnlocked ||
      isPersonalWorkspace ||
      !isAdminOrOwner ||
      !activeWorkspaceId ||
      !userId
    ) {
      setPendingAccessCount(0);
      return;
    }

    let cancelled = false;

    const run = async () => {
      if (runningRef.current) return;
      runningRef.current = true;
      try {
        const state = await resolveOrgSharedVault(activeWorkspaceId, userId);
        if (cancelled) return;

        if (state.kind === "ready" && state.canManage) {
          const { pending } = await autoWrapPendingMembers(
            state.access.vaultId,
            state.access.key,
          );
          if (!cancelled) setPendingAccessCount(pending);
        } else if (
          state.kind === "none" &&
          state.canManage &&
          memberCount > 1
        ) {
          // Org has members but no shared vault yet: set it up + import + grant.
          const { granted, pending } = await setupImportAndGrantOrgSharedVault(
            userId,
            workspaceName,
          );
          if (cancelled) return;
          setPendingAccessCount(pending);
          if (granted > 0) {
            toast.success(
              t(
                "vault.org.autoSetupGranted",
                "Shared vault set up — granted access to {{count}} member(s).",
                { count: granted },
              ) as string,
            );
          }
        }
      } catch (err) {
        // Plan-gated (not Pro), vault re-locked mid-run, or transient — the
        // next tick retries. Never surface to the user.
        console.warn("[OrgVaultAutoGrant] background grant skipped:", err);
      } finally {
        runningRef.current = false;
      }
    };

    void run();
    const interval = setInterval(() => void run(), RECHECK_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void run();
    };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [
    isUnlocked,
    isPersonalWorkspace,
    isAdminOrOwner,
    activeWorkspaceId,
    userId,
    memberCount,
    workspaceName,
    t,
  ]);

  return (
    <OrgVaultAutoGrantContext.Provider value={{ pendingAccessCount }}>
      {children}
    </OrgVaultAutoGrantContext.Provider>
  );
}
