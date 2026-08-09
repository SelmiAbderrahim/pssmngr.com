// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const ctx = {
	workspaces: [
		{ id: "a", name: "Alpha", slug: "alpha", role: "owner", isDefault: true, memberCount: 3 } as any,
		{ id: "b", name: "Beta", slug: "beta", role: "admin", isDefault: false, memberCount: 5 } as any,
	],
	activeWorkspace: { id: "a", name: "Alpha", slug: "alpha", role: "owner", isDefault: true, memberCount: 3 } as any,
	activeWorkspaceId: "a",
	currentUserRole: "owner",
	isLoading: false,
	error: null,
	switchWorkspace: vi.fn().mockResolvedValue(undefined),
	setDefaultWorkspace: vi.fn().mockResolvedValue(undefined),
	refreshWorkspaces: vi.fn(),
	isOwner: true,
	isAdminOrOwner: true,
};

vi.mock("@/providers/WorkspaceContext", () => ({
	useWorkspaceContext: () => ctx,
}));

import { useWorkspaceSwitcher } from "../useWorkspaceSwitcher";

describe("useWorkspaceSwitcher", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns workspaces + activeWorkspace from context", () => {
		const { result } = renderHook(() => useWorkspaceSwitcher());
		expect(result.current.workspaces).toHaveLength(2);
		expect(result.current.activeWorkspace?.id).toBe("a");
	});

	it("selectWorkspace on the active workspace is a no-op and returns false", async () => {
		const { result } = renderHook(() => useWorkspaceSwitcher());
		let changed: boolean | undefined;
		await act(async () => {
			changed = await result.current.selectWorkspace(ctx.workspaces[0]);
		});
		expect(changed).toBe(false);
		expect(ctx.switchWorkspace).not.toHaveBeenCalled();
	});

	it("selectWorkspace on a different workspace calls switchWorkspace and returns true", async () => {
		const { result } = renderHook(() => useWorkspaceSwitcher());
		let changed: boolean | undefined;
		await act(async () => {
			changed = await result.current.selectWorkspace(ctx.workspaces[1]);
		});
		expect(changed).toBe(true);
		expect(ctx.switchWorkspace).toHaveBeenCalledWith("b");
	});

	it("setDefault calls context.setDefaultWorkspace and clears settingDefaultId", async () => {
		const { result } = renderHook(() => useWorkspaceSwitcher());
		await act(async () => {
			await result.current.setDefault("b");
		});
		expect(ctx.setDefaultWorkspace).toHaveBeenCalledWith("b");
		expect(result.current.settingDefaultId).toBeNull();
	});

	it("openCreateDialog toggles createDialogOpen", () => {
		const { result } = renderHook(() => useWorkspaceSwitcher());
		expect(result.current.createDialogOpen).toBe(false);
		act(() => result.current.openCreateDialog());
		expect(result.current.createDialogOpen).toBe(true);
		act(() => result.current.setCreateDialogOpen(false));
		expect(result.current.createDialogOpen).toBe(false);
	});
});
