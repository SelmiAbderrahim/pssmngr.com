// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * App Sidebar
 *
 * Rendered inside the mobile hamburger `Sheet` in `AppNavbar` (top navigation
 * is the desktop shell). Displays the four primary destinations:
 * Vault / Security / People / Settings. Generator is a global button in the
 * navbar, not a nav destination.
 */

import { Link, useLocation } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
	LogOut,
	Moon,
	Sun,
	Languages,
	Shield,
	type LucideIcon,
} from "lucide-react";
import { Logo } from "@/ui/logo";
import { useTranslation } from "react-i18next";
import { useSignOut } from "@/utils/misc";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
	DropdownMenuSub,
	DropdownMenuSubTrigger,
	DropdownMenuSubContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import { useTheme, themes } from "@/ui/theme-switcher";
import { languages, changeLanguage, getCurrentLanguage, SupportedLanguage } from "@/i18n";
import { User } from "~/types";
import { Badge } from "@/components/ui/badge";
import { useWatchtowerBadge } from "@/hooks/useWatchtowerBadge";
import { primaryNavItems, type PrimaryNavItem } from "./nav-items";

interface AppSidebarProps {
	user: User;
	className?: string;
}

export function AppSidebar({ user, className }: AppSidebarProps) {
	const location = useLocation();
	const { t } = useTranslation("common");
	const signOut = useSignOut();
	const [currentTheme, setCurrentTheme] = useTheme();
	const currentLang = getCurrentLanguage();
	const { issueCount: watchtowerIssueCount } = useWatchtowerBadge();

	const navItems: PrimaryNavItem[] = primaryNavItems(t, {
		watchtowerIssueCount,
	});

	return (
		<div className={cn("flex h-full flex-col border-e bg-card w-64 lg:w-72", className)}>
			<div className="flex h-14 items-center border-b px-6">
				<Link
					to="/dashboard/vault"
					search={{ tab: "items", filter: "all", sort: "modified", q: "", create: undefined }}
					className="flex min-h-[44px] items-center gap-2 font-semibold"
				>
					<Logo className="h-6 w-6 shrink-0" />
					<span className="truncate">{t("app.name")}</span>
				</Link>
			</div>

			<div className="flex-1 overflow-auto py-4">
				<nav className="grid items-start text-sm font-medium gap-1 px-4">
					{navItems.map((item) => {
						const Icon: LucideIcon = item.icon;
						const isActive =
							location.pathname === item.path ||
							location.pathname.startsWith(`${item.path}/`);
						return (
							<Link
								key={item.path}
								to={item.path}
								data-tour={item.tour}
								className={cn(
									"flex min-h-[44px] items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:text-primary",
									isActive ? "bg-muted text-primary" : "text-muted-foreground"
								)}
							>
								<Icon className="h-4 w-4 shrink-0" />
								<span className="truncate">{item.label}</span>
								{item.badge != null && (
									<Badge variant="secondary" className="ms-auto h-5 min-w-[20px] px-1.5 text-xs">
										{item.badge > 99 ? "99+" : item.badge}
									</Badge>
								)}
							</Link>
						);
					})}
				</nav>
			</div>

			<div className="border-t p-4">
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="ghost" className="min-h-[44px] w-full justify-start px-2 py-2">
							<div className="flex items-center gap-3">
								<div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted shrink-0 text-sm font-medium">
									{user.name?.charAt(0).toUpperCase() || user.email?.charAt(0).toUpperCase()}
								</div>
								<div className="flex-1 overflow-hidden text-start">
									<p className="truncate text-sm font-medium">
										{user.name || (user as { username?: string }).username || t("actions.user.fallbackName", "User")}
									</p>
									<p className="truncate text-xs text-muted-foreground">{user.email}</p>
								</div>
							</div>
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent className="w-56" align="end" side="top" forceMount>
						<DropdownMenuLabel className="font-normal">
							<div className="flex flex-col space-y-1">
								<p className="text-sm font-medium leading-none">
									{user.name || (user as { username?: string }).username}
								</p>
								<p className="text-xs leading-none text-muted-foreground">{user.email}</p>
							</div>
						</DropdownMenuLabel>
						<DropdownMenuSeparator />

						<DropdownMenuSub>
							<DropdownMenuSubTrigger>
								<Sun className="me-2 h-4 w-4 rotate-0 scale-100 opacity-100 transition-[opacity,transform] dark:-rotate-90 dark:scale-0 dark:opacity-0" />
								<Moon className="absolute me-2 h-4 w-4 rotate-90 scale-0 opacity-0 transition-[opacity,transform] dark:rotate-0 dark:scale-100 dark:opacity-100" />
								<span>{t("theme.title", "Theme")}</span>
							</DropdownMenuSubTrigger>
							<DropdownMenuSubContent>
								<DropdownMenuRadioGroup
									value={currentTheme}
									onValueChange={(val) => setCurrentTheme(val as (typeof themes)[number])}
								>
									{themes.map((theme) => (
										<DropdownMenuRadioItem key={theme} value={theme}>
											{t(`theme.${theme}`, theme)}
										</DropdownMenuRadioItem>
									))}
								</DropdownMenuRadioGroup>
							</DropdownMenuSubContent>
						</DropdownMenuSub>

						<DropdownMenuSub>
							<DropdownMenuSubTrigger>
								<Languages className="me-2 h-4 w-4" />
								<span>{t("language.select", "Language")}</span>
							</DropdownMenuSubTrigger>
							<DropdownMenuSubContent>
								<DropdownMenuRadioGroup
									value={currentLang}
									onValueChange={(val) => changeLanguage(val as SupportedLanguage)}
								>
									{Object.entries(languages).map(([code, info]) => (
										<DropdownMenuRadioItem key={code} value={code}>
											<span className="me-2 text-lg">{info.flag}</span>
											{info.name}
										</DropdownMenuRadioItem>
									))}
								</DropdownMenuRadioGroup>
							</DropdownMenuSubContent>
						</DropdownMenuSub>

						<DropdownMenuSeparator />

						<DropdownMenuItem asChild>
							<Link to="/dashboard/settings/security" className="cursor-pointer">
								<Shield className="me-2 h-4 w-4" />
								<span>{t("navigation.security", "Security")}</span>
							</Link>
						</DropdownMenuItem>

						<DropdownMenuItem onClick={() => signOut()} className="cursor-pointer text-destructive focus:text-destructive">
							<LogOut className="me-2 h-4 w-4" />
							<span>{t("navigation.logout", "Log out")}</span>
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</div>
	);
}
