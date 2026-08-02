// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Single source of truth for the four primary destinations.
 *
 * Both desktop shell (`AppNavbar` + `AppSidebar` hamburger sheet) and mobile
 * shell (`BottomNav` + `MobileHeader` sheet) render from `APP_DESTINATIONS`.
 * A parity test locks the two shells to this list so they can never drift.
 *
 * Add a destination: append one entry with `path`, `labelKey`, `icon`, `tour`
 * anchor, and a `mobile` slot (`"bottomnav"` or `"sheet"`).
 */
import {
	KeyRound,
	ShieldAlert,
	UsersRound,
	Settings,
	type LucideIcon,
} from "lucide-react";

export type AppDestinationPath =
	| "/dashboard/vault"
	| "/dashboard/watchtower"
	| "/dashboard/organization"
	| "/dashboard/settings";

export type AppDestinationTour =
	| "nav-vault"
	| "nav-security"
	| "nav-people"
	| "nav-settings";

export interface AppDestination {
	path: AppDestinationPath;
	labelKey: string;
	icon: LucideIcon;
	tour: AppDestinationTour;
	mobile: "bottomnav" | "sheet";
	badgeSource?: "watchtower";
}

export const APP_DESTINATIONS: readonly AppDestination[] = [
	{
		path: "/dashboard/vault",
		labelKey: "navigation.vault",
		icon: KeyRound,
		tour: "nav-vault",
		mobile: "bottomnav",
	},
	{
		path: "/dashboard/watchtower",
		labelKey: "navigation.security",
		icon: ShieldAlert,
		tour: "nav-security",
		mobile: "bottomnav",
		badgeSource: "watchtower",
	},
	{
		path: "/dashboard/organization",
		labelKey: "navigation.people",
		icon: UsersRound,
		tour: "nav-people",
		mobile: "sheet",
	},
	{
		path: "/dashboard/settings",
		labelKey: "navigation.settings",
		icon: Settings,
		tour: "nav-settings",
		mobile: "bottomnav",
	},
] as const;

export const APP_DESTINATION_PATHS: readonly AppDestinationPath[] =
	APP_DESTINATIONS.map((d) => d.path);
