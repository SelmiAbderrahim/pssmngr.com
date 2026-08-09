// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Workspace Context Provider
 *
 * Manages active workspace state and workspace switching.
 * Maps to better-auth organization under the hood.
 *
 * Persists active workspace ID in localStorage for session continuity.
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useWorkspaces, useSetDefaultWorkspace } from "@/hooks/deployment/useWorkspace";
import { authClient } from "@/lib/auth/auth-client";
import { trpcMutation } from "@/lib/api/trpc";
import { watchtowerScan } from "@/services/watchtower-scan";
import type { WorkspaceWithMembership, WorkspaceRole } from "@/types/workspace";

const ACTIVE_WORKSPACE_KEY = "pssmngr-active-workspace";

/**
 * Workspace context value
 */
export interface WorkspaceContextValue {
  /** All workspaces user belongs to */
  workspaces: WorkspaceWithMembership[];
  /** Currently active workspace */
  activeWorkspace: WorkspaceWithMembership | null;
  /** Active workspace ID */
  activeWorkspaceId: string | null;
  /** Current user's role in active workspace */
  currentUserRole: WorkspaceRole | null;
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: Error | null;
  /** Switch to a different workspace (syncs with backend session) */
  switchWorkspace: (workspaceId: string) => Promise<void>;
  /** Set a workspace as default */
  setDefaultWorkspace: (workspaceId: string) => Promise<void>;
  /** Refresh workspace list */
  refreshWorkspaces: () => void;
  /** Check if user is owner of active workspace */
  isOwner: boolean;
  /** Check if user is admin or owner of active workspace */
  isAdminOrOwner: boolean;
}

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(
  undefined
);

interface WorkspaceProviderProps {
  children: React.ReactNode;
}

export function WorkspaceProvider({ children }: WorkspaceProviderProps) {
  const queryClient = useQueryClient();
  const lastSyncedWorkspaceRef = React.useRef<string | null>(null);
  const {
    data: workspaces = [],
    isLoading,
    error,
    refetch,
  } = useWorkspaces();

  const setDefaultMutation = useSetDefaultWorkspace();
  const syncActiveWorkspace = useCallback(async (workspaceId: string) => {
    await authClient.organization.setActive({
      organizationId: workspaceId,
    });
    await trpcMutation("organization", "setActiveWorkspace", {
      organizationId: workspaceId,
    });
  }, []);

  // Initialize from localStorage
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(
    () => {
      if (typeof window === "undefined") return null;
      return localStorage.getItem(ACTIVE_WORKSPACE_KEY);
    }
  );

  // Find active workspace from list
  const activeWorkspace = useMemo(() => {
    if (!activeWorkspaceId || workspaces.length === 0) return null;
    return workspaces.find((w) => w.id === activeWorkspaceId) || null;
  }, [workspaces, activeWorkspaceId]);

  // Get current user's role in active workspace
  const currentUserRole = useMemo<WorkspaceRole | null>(() => {
    if (!activeWorkspace) return null;
    return activeWorkspace.role || null;
  }, [activeWorkspace]);

  // Permission helpers
  const isOwner = currentUserRole === "owner";
  const isAdminOrOwner = currentUserRole === "owner" || currentUserRole === "admin";

  // Auto-select default or first workspace when list loads
  useEffect(() => {
    if (workspaces.length > 0 && !activeWorkspace) {
      // Find default workspace or use first one
      const defaultWorkspace = workspaces.find((w) => w.isDefault);
      const workspaceToSelect = defaultWorkspace || workspaces[0];

      if (workspaceToSelect) {
        // Sync with backend session
        syncActiveWorkspace(workspaceToSelect.id)
          .then(() => {
            setActiveWorkspaceId(workspaceToSelect.id);
            localStorage.setItem(ACTIVE_WORKSPACE_KEY, workspaceToSelect.id);
          })
          .catch(console.error);
      }
    }
  }, [workspaces, activeWorkspace, syncActiveWorkspace]);

  // Clear invalid workspace ID if not in list
  useEffect(() => {
    if (
      activeWorkspaceId &&
      workspaces.length > 0 &&
      !workspaces.some((w) => w.id === activeWorkspaceId)
    ) {
      // Stored workspace no longer exists, clear it
      const firstWorkspace = workspaces[0];
      if (firstWorkspace) {
        // Sync with backend session
        syncActiveWorkspace(firstWorkspace.id)
          .then(() => {
            setActiveWorkspaceId(firstWorkspace.id);
            localStorage.setItem(ACTIVE_WORKSPACE_KEY, firstWorkspace.id);
          })
          .catch(console.error);
      } else {
        setActiveWorkspaceId(null);
        localStorage.removeItem(ACTIVE_WORKSPACE_KEY);
      }
    }
  }, [activeWorkspaceId, workspaces, syncActiveWorkspace]);

  // If localStorage restored a valid workspace, also restore it in the backend
  // session. Without this, the UI label can show one workspace while tRPC
  // procedures still run against the server's previous/default organization.
  useEffect(() => {
    if (!activeWorkspaceId || !activeWorkspace) return;
    if (lastSyncedWorkspaceRef.current === activeWorkspaceId) return;

    lastSyncedWorkspaceRef.current = activeWorkspaceId;
    syncActiveWorkspace(activeWorkspaceId)
      .catch((error) => {
        lastSyncedWorkspaceRef.current = null;
        console.error("Failed to restore active workspace:", error);
      });
  }, [activeWorkspaceId, activeWorkspace, syncActiveWorkspace]);

  /**
   * Switch to a different workspace
   * Updates backend session's activeOrganizationId and invalidates queries
   */
  const switchWorkspace = useCallback(
    async (workspaceId: string) => {
      try {
        // 1. Update backend session's activeOrganizationId
        await syncActiveWorkspace(workspaceId);

        // 2. Update local state
        setActiveWorkspaceId(workspaceId);
        localStorage.setItem(ACTIVE_WORKSPACE_KEY, workspaceId);

        // 3. Invalidate all queries to refetch with new organization context
        await queryClient.invalidateQueries();

        // 4. Watchtower caches the previous org's vaultId (SPA switch, no
        // reload) — rescan against the new org or its sync 404s.
        void watchtowerScan.restartForWorkspaceChange();
      } catch (error) {
        console.error("Failed to switch workspace:", error);

        // Graceful degradation: even if the backend session sync fails, fall
        // back to updating local state so the UI reflects the user's intent,
        // then hard-reload so every query re-runs against a clean session.
        setActiveWorkspaceId(workspaceId);
        localStorage.setItem(ACTIVE_WORKSPACE_KEY, workspaceId);

        await queryClient.invalidateQueries();

        if (typeof window !== "undefined") {
          window.location.reload();
        }
      }
    },
    [queryClient, syncActiveWorkspace]
  );

  /**
   * Set a workspace as default
   */
  const setDefaultWorkspace = useCallback(
    async (workspaceId: string) => {
      await setDefaultMutation.mutateAsync(workspaceId);
      // Also switch to it
      await switchWorkspace(workspaceId);
    },
    [setDefaultMutation, switchWorkspace]
  );

  /**
   * Refresh workspace list
   */
  const refreshWorkspaces = useCallback(() => {
    refetch();
  }, [refetch]);

  const value: WorkspaceContextValue = {
    workspaces,
    activeWorkspace,
    activeWorkspaceId,
    currentUserRole,
    isLoading,
    error: error as Error | null,
    switchWorkspace,
    setDefaultWorkspace,
    refreshWorkspaces,
    isOwner,
    isAdminOrOwner,
  };

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

/**
 * Hook to access workspace context
 */
export function useWorkspaceContext(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error(
      "useWorkspaceContext must be used within WorkspaceProvider"
    );
  }
  return context;
}

/**
 * Safe hook - returns undefined instead of throwing when outside WorkspaceProvider.
 * Use ONLY in components that must be resilient to provider absence
 * (error recovery, analytics wrappers).
 */
export function useWorkspaceContextSafe(): WorkspaceContextValue | undefined {
  return useContext(WorkspaceContext);
}

/**
 * Hook to get active workspace (convenience wrapper)
 */
export function useActiveWorkspace() {
  const { activeWorkspace, isLoading, error } = useWorkspaceContext();
  return { workspace: activeWorkspace, isLoading, error };
}

export { WorkspaceContext };
