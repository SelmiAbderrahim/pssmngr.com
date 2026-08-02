// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * App Navbar
 *
 * Top navigation is the only desktop shell. It renders the four-destination
 * IA plus a global Generator quick-action (dialog) and the workspace switcher.
 * Mobile widths (<md) show a hamburger `Sheet` that renders `AppSidebar`.
 */

import { useState } from "react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Menu, Sparkles, LogOut, UserRound } from "lucide-react";
import { AppSidebar } from "./AppSidebar";
import { NotificationBell } from "./NotificationBell";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import { User } from "~/types";
import { useLocation, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Slash } from "lucide-react";
import { Fragment } from "react";
import { Logo } from "@/ui/logo";
import { useWatchtowerBadge } from "@/hooks/useWatchtowerBadge";
import { Badge } from "@/components/ui/badge";
import { useSignOut } from "@/utils/misc";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { primaryNavItems } from "./nav-items";
import { GeneratorPanel } from "@/components/generator/GeneratorPanel";

interface AppNavbarProps {
	user: User;
}

const BREADCRUMB_KEY_BY_SEGMENT: Record<string, string> = {
	dashboard: "navigation.dashboard",
	vault: "navigation.vault",
	watchtower: "navigation.security",
	organization: "navigation.people",
	settings: "navigation.settings",
	generator: "navigation.generator",
};

export function AppNavbar({ user }: AppNavbarProps) {
	const location = useLocation();
	const { t } = useTranslation(["common"]);
	const signOut = useSignOut();
	const { issueCount: watchtowerIssueCount } = useWatchtowerBadge();
	const [generatorOpen, setGeneratorOpen] = useState(false);

	const navItems = primaryNavItems(t, { watchtowerIssueCount });

	const pathSegments = location.pathname.split("/").filter(Boolean);
	const breadcrumbs = pathSegments
		.map((segment, index) => {
			const path = `/${pathSegments.slice(0, index + 1).join("/")}`;
			const isLast = index === pathSegments.length - 1;
			const key = BREADCRUMB_KEY_BY_SEGMENT[segment];
			// Hide long IDs entirely; keep only mapped destinations.
			if (!key) return null;
			return { path, label: t(key), isLast };
		})
		.filter((crumb): crumb is { path: string; label: string; isLast: boolean } => crumb !== null);

	return (
		<header className="sticky top-0 z-30 flex items-center border-b bg-background h-16 gap-4 ps-4 pe-4">
			{/* Mobile hamburger (below md) */}
			<Sheet>
				<SheetTrigger asChild>
					<Button
						size="icon"
						variant="outline"
						className="md:hidden min-h-[44px] min-w-[44px] shrink-0"
						aria-label={t("navigation.toggleMenu")}
					>
						<Menu className="h-5 w-5" />
						<span className="sr-only">{t("navigation.toggleMenu")}</span>
					</Button>
				</SheetTrigger>
				<SheetContent
					side="left"
					className="w-64 max-w-[85vw] p-0 data-[state=open]:!translate-x-0 sm:max-w-xs [&>button]:hidden"
				>
					<AppSidebar user={user} className="border-e-0" />
				</SheetContent>
			</Sheet>

			<Link
				to="/dashboard/vault"
				search={{ tab: "items", filter: "all", sort: "modified", q: "", create: undefined }}
				className="flex min-h-[44px] min-w-[44px] items-center gap-2 font-semibold"
			>
				<Logo className="h-7 w-7 shrink-0" />
				<span className="hidden sm:inline truncate">{t("app.name")}</span>
			</Link>

			<nav className="hidden md:flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
				{navItems.map((item) => {
					const isActive =
						location.pathname === item.path ||
						location.pathname.startsWith(`${item.path}/`);
					const Icon = item.icon;
					return (
						<Button
							key={item.path}
							variant={isActive ? "secondary" : "ghost"}
							size="sm"
							className="min-h-[44px] shrink-0 gap-2"
							asChild
						>
							<Link to={item.path} data-tour={item.tour}>
								<Icon className="h-4 w-4" />
								<span>{item.label}</span>
								{item.badge != null && (
									<Badge variant="secondary" className="ms-1 h-5 min-w-[20px] px-1.5 text-xs">
										{item.badge > 99 ? "99+" : item.badge}
									</Badge>
								)}
							</Link>
						</Button>
					);
				})}
			</nav>

			{/* Breadcrumbs on mobile only (nav drives context on desktop) */}
			<div className="md:hidden flex min-w-0 flex-1 items-center gap-3 overflow-x-auto text-sm text-muted-foreground scrollbar-thin">
				{breadcrumbs.map((crumb, index) => (
					<Fragment key={crumb.path}>
						{index > 0 && <Slash className="h-4 w-4 shrink-0 rtl:scale-x-[-1]" />}
						<Link
							to={crumb.path}
							className={`whitespace-nowrap ${
								crumb.isLast ? "font-semibold text-foreground" : "hover:text-foreground"
							}`}
						>
							{crumb.label}
						</Link>
					</Fragment>
				))}
			</div>

			<WorkspaceSwitcher className="hidden md:flex" data-tour="workspace-switcher" />

			<Button
				variant="ghost"
				size="sm"
				className="min-h-[44px] min-w-[44px] shrink-0 gap-2 px-2"
				onClick={() => setGeneratorOpen(true)}
				data-tour="generator-button"
				aria-label={t("generator.openButton", "Open password generator")}
			>
				<Sparkles className="h-4 w-4" />
				<span className="hidden sm:inline">{t("generator.openButton", "Generator")}</span>
			</Button>

			<NotificationBell />

			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="ghost"
						className="min-h-[44px] min-w-[44px] rounded-md px-2"
						aria-label={t("account.menu", "Account menu")}
					>
						<Avatar className="h-8 w-8">
							<AvatarFallback>
								{(user.name || user.email || "U")
									.split(" ")
									.map((part) => part[0])
									.join("")
									.slice(0, 2)
									.toUpperCase()}
							</AvatarFallback>
						</Avatar>
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-60">
					<DropdownMenuLabel>
						<span className="block truncate">{user.name}</span>
						<span className="block truncate text-xs font-normal text-muted-foreground">
							{user.email}
						</span>
					</DropdownMenuLabel>
					<DropdownMenuSeparator />
					<DropdownMenuItem asChild>
						<Link to="/dashboard/settings">
							<UserRound className="me-2 h-4 w-4" />
							{t("navigation.settings", "Settings")}
						</Link>
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem onClick={signOut} className="text-destructive">
						<LogOut className="me-2 h-4 w-4" />
						{t("navigation.logout", "Log out")}
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			<Dialog open={generatorOpen} onOpenChange={setGeneratorOpen}>
				<DialogContent className="sm:max-w-3xl">
					<DialogHeader>
						<DialogTitle>{t("generator.openButton", "Generator")}</DialogTitle>
					</DialogHeader>
					<GeneratorPanel />
				</DialogContent>
			</Dialog>
		</header>
	);
}
