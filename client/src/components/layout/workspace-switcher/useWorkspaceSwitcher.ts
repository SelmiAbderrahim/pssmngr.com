// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Hook wrapping `WorkspaceContext` + create-workspace dialog state.
 * Shared by desktop `WorkspaceSwitcher` dropdown and mobile header sheet.
 */
import { useCallback, useState } from "react";
import { useWorkspaceContext } from "@/providers/WorkspaceContext";
import type { WorkspaceWithMembership } from "@/types/workspace";

export interface UseWorkspaceSwitcherResult {
	workspaces: WorkspaceWithMembership[];
	activeWorkspace: WorkspaceWithMembership | null;
	isLoading: boolean;
	switching: boolean;
	settingDefaultId: string | null;
	createDialogOpen: boolean;
	openCreateDialog: () => void;
	setCreateDialogOpen: (open: boolean) => void;
	selectWorkspace: (workspace: WorkspaceWithMembership) => Promise<boolean>;
	setDefault: (workspaceId: string) => Promise<void>;
}

export function useWorkspaceSwitcher(): UseWorkspaceSwitcherResult {
	const {
		workspaces,
		activeWorkspace,
		switchWorkspace,
		setDefaultWorkspace,
		isLoading,
	} = useWorkspaceContext();

	const [switching, setSwitching] = useState(false);
	const [settingDefaultId, setSettingDefaultId] = useState<string | null>(null);
	const [createDialogOpen, setCreateDialogOpen] = useState(false);

	const selectWorkspace = useCallback(
		async (workspace: WorkspaceWithMembership) => {
			if (workspace.id === activeWorkspace?.id) return false;
			setSwitching(true);
			try {
				// Switching workspaces remounts all authed routes via WorkspaceKeyedOutlet (keyed on
				// activeWorkspaceId); current tab/scroll position is intentionally lost.
				await switchWorkspace(workspace.id);
				return true;
			} finally {
				setSwitching(false);
			}
		},
		[activeWorkspace?.id, switchWorkspace]
	);

	const setDefault = useCallback(
		async (workspaceId: string) => {
			setSettingDefaultId(workspaceId);
			try {
				await setDefaultWorkspace(workspaceId);
			} finally {
				setSettingDefaultId(null);
			}
		},
		[setDefaultWorkspace]
	);

	const openCreateDialog = useCallback(() => setCreateDialogOpen(true), []);

	return {
		workspaces,
		activeWorkspace,
		isLoading,
		switching,
		settingDefaultId,
		createDialogOpen,
		openCreateDialog,
		setCreateDialogOpen,
		selectWorkspace,
		setDefault,
	};
}
