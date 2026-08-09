// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Navigation parity — the desktop shell (AppSidebar / hamburger) and mobile
 * shell (BottomNav + MobileHeader sheet) must expose the identical
 * destination set, and that set must equal `APP_DESTINATIONS`. Written first
 * (TDD) per R2.
 */
import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { APP_DESTINATIONS } from "../navigation";

// --- mocks -----------------------------------------------------------------

vi.mock("@tanstack/react-router", () => ({
	Link: ({ to, children, className, ...props }: any) =>
		React.createElement(
			"a",
			{ href: typeof to === "string" ? to : String(to), className, ...props },
			children,
		),
	useLocation: () => ({ pathname: "/dashboard/vault" }),
	useNavigate: () => vi.fn(),
	useRouter: () => ({ invalidate: vi.fn() }),
	useRouterState: ({ select }: any) =>
		select({ location: { pathname: "/dashboard/vault", searchStr: "" } }),
}));

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (k: string, fallback?: string | Record<string, unknown>) =>
			typeof fallback === "string" ? fallback : k,
		i18n: { language: "en", changeLanguage: vi.fn() },
	}),
	Trans: ({ children }: any) => children,
	initReactI18next: { type: "3rdParty", init: vi.fn() },
}));

vi.mock("@/utils/misc", async (importOriginal) => {
	const actual = (await importOriginal()) as Record<string, unknown>;
	return { ...actual, useSignOut: () => vi.fn() };
});
vi.mock("@/services/vault-crypto", () => ({ vaultCrypto: { lock: vi.fn() } }));
vi.mock("@/hooks/useWatchtowerBadge", () => ({
	useWatchtowerBadge: () => ({ issueCount: 0 }),
}));
vi.mock("@/lib/config", () => ({ features: { payments: false } }));
vi.mock("@/components/generator/GeneratorPanel", () => ({
	GeneratorPanel: () => React.createElement("div", null, "GeneratorPanel"),
}));

const workspaceCtx = {
	workspaces: [
		{
			id: "ws-1",
			name: "My Workspace",
			slug: "my-workspace",
			logo: null,
			role: "owner",
			isDefault: true,
			memberCount: 3,
		},
	],
	activeWorkspace: {
		id: "ws-1",
		name: "My Workspace",
		slug: "my-workspace",
		logo: null,
		role: "owner",
		isDefault: true,
		memberCount: 3,
	},
	activeWorkspaceId: "ws-1",
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
	useWorkspaceContext: () => workspaceCtx,
}));
vi.mock("@/components/dashboard/workspace/CreateWorkspaceDialog", () => ({
	CreateWorkspaceDialog: ({ open }: { open: boolean }) =>
		open ? React.createElement("div", { "data-testid": "create-dialog" }) : null,
}));

const user = { id: "u-1", name: "Ada", email: "ada@example.com" } as any;

function withProviders(node: React.ReactElement) {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	return React.createElement(QueryClientProvider, { client }, node);
}

// --- helpers ---------------------------------------------------------------

async function renderDesktopNavPaths(): Promise<string[]> {
	const { AppSidebar } = await import("../AppSidebar");
	const { unmount } = render(withProviders(React.createElement(AppSidebar, { user })));
	const nav = screen.getByRole("navigation", { hidden: true }) || document.querySelector("nav");
	const anchors = Array.from(document.querySelectorAll("nav a"));
	const paths = anchors
		.map((a) => a.getAttribute("href"))
		.filter((p): p is string => !!p && p.startsWith("/dashboard/"))
		.filter((p) => APP_DESTINATIONS.some((d) => d.path === p));
	unmount();
	void nav;
	return Array.from(new Set(paths));
}

async function renderMobileNavPaths(): Promise<string[]> {
	const { BottomNav } = await import("../mobile-shell/BottomNav");
	const { MobileHeader } = await import("../mobile-shell/MobileHeader");
	const { unmount } = render(
		withProviders(
			React.createElement(
				React.Fragment,
				null,
				React.createElement(BottomNav, null),
				React.createElement(MobileHeader, { user }),
			),
		),
	);
	// Open the header sheet so sheet destinations are in the DOM.
	act(() => {
		fireEvent.click(screen.getByLabelText("header.menu"));
	});
	const anchors = Array.from(document.querySelectorAll("a"));
	const paths = anchors
		.map((a) => a.getAttribute("href"))
		.filter((p): p is string => !!p && p.startsWith("/dashboard/"))
		.filter((p) => APP_DESTINATIONS.some((d) => d.path === p));
	unmount();
	return Array.from(new Set(paths));
}

// --- tests -----------------------------------------------------------------

describe("navigation parity", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("desktop and mobile expose the identical destination set", async () => {
		const desktopPaths = await renderDesktopNavPaths();
		const mobilePaths = await renderMobileNavPaths();
		expect(new Set(mobilePaths)).toEqual(new Set(desktopPaths));
		expect(new Set(desktopPaths)).toEqual(
			new Set(APP_DESTINATIONS.map((d) => d.path)),
		);
	});

	it("APP_DESTINATIONS is the single source of truth", () => {
		expect(APP_DESTINATIONS.map((d) => d.path)).toEqual([
			"/dashboard/vault",
			"/dashboard/watchtower",
			"/dashboard/organization",
			"/dashboard/settings",
		]);
	});

	it("every destination has a tour anchor + mobile slot", () => {
		for (const d of APP_DESTINATIONS) {
			expect(d.tour).toMatch(/^nav-/);
			expect(["bottomnav", "sheet"]).toContain(d.mobile);
		}
	});
});
