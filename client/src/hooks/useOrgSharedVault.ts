// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Resolve the active organization's shared vault (non-personal workspaces).
 *
 * Wraps `resolveOrgSharedVault` with the UX policy the vault page needs:
 *
 *  - Only runs while the vault is unlocked (the unwrap needs the device key).
 *  - Transient failures retry silently with a short backoff; the error state
 *    (which the page renders as a destructive banner) is only set after
 *    several consecutive failures.
 *  - A "vault must be unlocked" failure never becomes an error — it calls
 *    `onUnlockRequired` so the page can re-open the master-password prompt.
 *  - Once resolved to "ready", a later failed re-resolve keeps the ready
 *    state (the unwrapped key is already cached) instead of blanking it.
 *  - Until access resolves to "ready", re-checks every 20s and when the tab
 *    regains focus, so a member granted access while the page is open sees
 *    the shared items without a manual reload.
 *
 * A generation counter discards in-flight resolves after a workspace switch.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  autoWrapPendingMembers,
  resolveOrgSharedVault,
  type OrgVaultState,
} from "@/services/org-shared-vault";

/** Silent quick-retry delays; the error surfaces after the last one fails. */
const RETRY_DELAYS_MS = [1_000, 3_000];
const MAX_SILENT_FAILURES = RETRY_DELAYS_MS.length + 1;
const RECHECK_INTERVAL_MS = 20_000;

interface UseOrgSharedVaultOptions {
  activeWorkspaceId: string | null | undefined;
  isPersonalWorkspace: boolean;
  isUnlocked: boolean;
  /** Caller's user id — lets the resolver self-heal a stale needsRewrap flag. */
  userId?: string;
  /** Called instead of setting an error when the resolve failed because the vault locked. */
  onUnlockRequired?: () => void;
}

export function useOrgSharedVault({
  activeWorkspaceId,
  isPersonalWorkspace,
  isUnlocked,
  userId,
  onUnlockRequired,
}: UseOrgSharedVaultOptions) {
  const [orgVault, setOrgVaultState] = useState<OrgVaultState | null>(null);
  const [orgResolveError, setOrgResolveError] = useState<string | null>(null);

  const gen = useRef(0);
  const consecutiveFailures = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Mirror of `orgVault` readable from the async resolve without re-creating it.
  const orgVaultRef = useRef<OrgVaultState | null>(null);
  const onUnlockRequiredRef = useRef(onUnlockRequired);
  onUnlockRequiredRef.current = onUnlockRequired;

  const setOrgVault = useCallback((state: OrgVaultState | null) => {
    orgVaultRef.current = state;
    setOrgVaultState(state);
  }, []);

  const clearRetryTimer = useCallback(() => {
    if (retryTimer.current !== null) {
      clearTimeout(retryTimer.current);
      retryTimer.current = null;
    }
  }, []);

  const resolve = useCallback(
    async (fresh = false) => {
      const g = ++gen.current;
      clearRetryTimer();
      if (fresh) {
        consecutiveFailures.current = 0;
        setOrgResolveError(null);
      }
      try {
        const state = await resolveOrgSharedVault(
          activeWorkspaceId ?? undefined,
          userId,
        );
        if (g !== gen.current) return;
        consecutiveFailures.current = 0;
        setOrgResolveError(null);
        setOrgVault(state);
        // Owner/manager opening the org: wrap the shared key for any members
        // who joined but aren't in the vault yet (zero-knowledge auto-grant).
        if (state.kind === "ready" && state.canManage) {
          autoWrapPendingMembers(state.access.vaultId, state.access.key).catch(
            (e) => console.warn("[Vault] auto-wrap pending members failed:", e),
          );
        }
      } catch (err) {
        if (g !== gen.current) return;
        console.warn("[Vault] shared org vault resolve failed:", err);
        const message =
          err instanceof Error ? err.message : "Failed to check shared vault access";
        if (/must be unlocked/i.test(message)) {
          consecutiveFailures.current = 0;
          onUnlockRequiredRef.current?.();
          return;
        }
        // The shared key was already unwrapped and cached — keep serving it
        // through a transient re-check failure instead of blanking the page.
        if (orgVaultRef.current?.kind === "ready") return;
        consecutiveFailures.current += 1;
        if (consecutiveFailures.current >= MAX_SILENT_FAILURES) {
          setOrgVault(null);
          setOrgResolveError(message);
        } else {
          const delay = RETRY_DELAYS_MS[consecutiveFailures.current - 1] ?? 8_000;
          retryTimer.current = setTimeout(() => {
            retryTimer.current = null;
            void resolve();
          }, delay);
        }
      }
    },
    [activeWorkspaceId, userId, clearRetryTimer, setOrgVault],
  );

  /** Manual retry (Retry button): clears the error and starts a fresh attempt. */
  const runOrgResolve = useCallback(() => resolve(true), [resolve]);

  useEffect(() => {
    if (!isUnlocked || isPersonalWorkspace) {
      gen.current++;
      clearRetryTimer();
      consecutiveFailures.current = 0;
      setOrgVault(null);
      setOrgResolveError(null);
      return;
    }
    void resolve(true);
    return () => {
      gen.current++;
      clearRetryTimer();
    };
  }, [isUnlocked, isPersonalWorkspace, activeWorkspaceId, resolve, clearRetryTimer, setOrgVault]);

  useEffect(() => {
    if (!isUnlocked || isPersonalWorkspace || orgVault?.kind === "ready") return;
    const interval = setInterval(() => void resolve(), RECHECK_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void resolve();
    };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [isUnlocked, isPersonalWorkspace, orgVault, resolve]);

  return { orgVault, setOrgVault, orgResolveError, runOrgResolve };
}
