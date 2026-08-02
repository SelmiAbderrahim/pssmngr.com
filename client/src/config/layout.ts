// Copyright (c) 2026 Password Manager contributors
/**
 * Layout Configuration
 *
 * View-mode presets for vault list and card layouts. Top navigation is the
 * only desktop shell.
 *
 * @module config/layout
 */

/**
 * View mode options for lists/grids
 */
export type ViewMode = "grid" | "table" | "list" | "compact-cards";

export const layoutConfig = {
	defaultViewMode: (import.meta.env.VITE_DEFAULT_VIEW_MODE || "table") as ViewMode,
} as const;

export const viewModeLabels: Record<ViewMode, string> = {
	grid: "Grid View",
	table: "Table View",
	list: "List View",
	"compact-cards": "Compact Cards",
};

export const viewModes: ViewMode[] = ["grid", "table", "list", "compact-cards"];
