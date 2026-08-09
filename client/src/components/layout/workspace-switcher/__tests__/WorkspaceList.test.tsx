// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (k: string, fallback?: string | Record<string, unknown>, opts?: Record<string, unknown>) => {
			if (typeof fallback === "string") {
				if (opts && typeof opts === "object") {
					return fallback.replace(/\{\{(\w+)\}\}/g, (_, key) => String((opts as any)[key] ?? ""));
				}
				return fallback;
			}
			return k;
		},
	}),
}));

import { WorkspaceList } from "../WorkspaceList";

const workspaces = [
	{ id: "a", name: "Alpha", slug: "alpha", role: "owner", isDefault: true, memberCount: 3 } as any,
	{ id: "b", name: "Beta", slug: "beta", role: "admin", isDefault: false, memberCount: 7 } as any,
];

describe("WorkspaceList", () => {
	const onSelect = vi.fn();
	const onSetDefault = vi.fn();
	const onCreate = vi.fn();

	beforeEach(() => {
		vi.clearAllMocks();
	});

	function renderList(overrides?: Partial<React.ComponentProps<typeof WorkspaceList>>) {
		return render(
			<WorkspaceList
				workspaces={workspaces}
				activeWorkspaceId="a"
				switching={false}
				settingDefaultId={null}
				onSelect={onSelect}
				onSetDefault={onSetDefault}
				onCreate={onCreate}
				rowRole="button"
				{...overrides}
			/>,
		);
	}

	it("renders rows with member counts and the active check", () => {
		renderList();
		expect(screen.getByText("Alpha")).toBeInTheDocument();
		expect(screen.getByText("Beta")).toBeInTheDocument();
		expect(screen.getByText("3 members")).toBeInTheDocument();
		expect(screen.getByText("7 members")).toBeInTheDocument();
	});

	it("selecting the active row is a no-op via onSelect", () => {
		renderList();
		fireEvent.click(screen.getByText("Alpha"));
		expect(onSelect).toHaveBeenCalledWith(workspaces[0]);
	});

	it("selecting a non-active row invokes onSelect", () => {
		renderList();
		fireEvent.click(screen.getByText("Beta"));
		expect(onSelect).toHaveBeenCalledWith(workspaces[1]);
	});

	it("keyboard Enter on a row triggers onSelect", () => {
		renderList();
		const row = screen.getByText("Beta").closest('[role="button"]')!;
		fireEvent.keyDown(row, { key: "Enter" });
		expect(onSelect).toHaveBeenCalledWith(workspaces[1]);
	});

	it("keyboard Space on the create row triggers onCreate", () => {
		renderList();
		const create = screen.getByText("Create workspace").closest('[role="button"]')!;
		fireEvent.keyDown(create, { key: " " });
		expect(onCreate).toHaveBeenCalled();
	});

	it("set-as-default button is only shown on non-default, non-active rows", () => {
		renderList();
		// Alpha is default+active — no button. Beta is not-default/not-active — button visible.
		expect(screen.getAllByLabelText("Set as default")).toHaveLength(1);
	});

	it("clicking set-as-default calls onSetDefault without triggering row select", () => {
		renderList();
		fireEvent.click(screen.getByLabelText("Set as default"));
		expect(onSetDefault).toHaveBeenCalledWith("b");
		expect(onSelect).not.toHaveBeenCalled();
	});

	it("empty state renders when workspaces is []", () => {
		renderList({ workspaces: [] });
		expect(screen.getByText("No workspaces yet")).toBeInTheDocument();
	});

	it("clicking Create workspace fires onCreate", () => {
		renderList();
		fireEvent.click(screen.getByText("Create workspace"));
		expect(onCreate).toHaveBeenCalled();
	});

	it("every row meets the 44px touch target", () => {
		renderList();
		const rows = document.querySelectorAll('[role="button"]');
		for (const row of Array.from(rows)) {
			expect(row.className).toContain("min-h-11");
			expect(row.className).toContain("min-w-11");
		}
	});

	it("switching state disables select interaction", () => {
		renderList({ switching: true });
		fireEvent.click(screen.getByText("Beta"));
		expect(onSelect).not.toHaveBeenCalled();
	});
});
