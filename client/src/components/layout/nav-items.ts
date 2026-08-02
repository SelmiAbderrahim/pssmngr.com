// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Primary nav item list — thin adapter over `navigation.ts`.
 *
 * `navigation.ts` (`APP_DESTINATIONS`) is the single source of truth. This
 * module resolves i18n labels and attaches the watchtower badge for shells
 * that render the full 4-destination IA (desktop navbar + hamburger sheet).
 */

import type { TFunction } from "i18next";
import type { LucideIcon } from "lucide-react";
import {
	APP_DESTINATIONS,
	type AppDestinationPath,
	type AppDestinationTour,
} from "./navigation";

export type PrimaryNavTourAnchor = AppDestinationTour;

export interface PrimaryNavItem {
	path: AppDestinationPath;
	label: string;
	icon: LucideIcon;
	tour: PrimaryNavTourAnchor;
	badge?: number;
}

export interface PrimaryNavOptions {
	watchtowerIssueCount?: number;
}

const LABEL_FALLBACK: Record<string, string> = {
	"navigation.vault": "Vault",
	"navigation.security": "Security",
	"navigation.people": "People",
	"navigation.settings": "Settings",
};

export function primaryNavItems(
	t: TFunction,
	options: PrimaryNavOptions = {}
): PrimaryNavItem[] {
	const { watchtowerIssueCount = 0 } = options;
	return APP_DESTINATIONS.map((d) => {
		const item: PrimaryNavItem = {
			path: d.path,
			label: t(d.labelKey, LABEL_FALLBACK[d.labelKey] ?? d.labelKey),
			icon: d.icon,
			tour: d.tour,
		};
		if (d.badgeSource === "watchtower" && watchtowerIssueCount > 0) {
			item.badge = watchtowerIssueCount;
		}
		return item;
	});
}
