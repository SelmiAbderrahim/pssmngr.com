// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Presentational workspace list. Rendered by both the desktop dropdown and
 * the mobile bottom-sheet. Row: name + member count + active check + optional
 * "set as default" star. Final row triggers the create-workspace dialog.
 */
import { useTranslation } from "react-i18next";
import { Check, Loader2, Plus, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { WorkspaceWithMembership } from "@/types/workspace";

export interface WorkspaceListProps {
	workspaces: WorkspaceWithMembership[];
	activeWorkspaceId: string | null;
	switching: boolean;
	settingDefaultId: string | null;
	onSelect: (workspace: WorkspaceWithMembership) => void;
	onSetDefault: (workspaceId: string) => void;
	onCreate: () => void;
	rowRole?: "menuitem" | "button";
}

export function WorkspaceList({
	workspaces,
	activeWorkspaceId,
	switching,
	settingDefaultId,
	onSelect,
	onSetDefault,
	onCreate,
	rowRole = "button",
}: WorkspaceListProps) {
	const { t } = useTranslation("workspace");

	return (
		<div role="list" className="flex flex-col">
			{workspaces.length === 0 ? (
				<div className="px-2 py-4 text-center text-sm text-muted-foreground">
					{t("switcher.noWorkspaces", "No workspaces yet")}
				</div>
			) : (
				workspaces.map((workspace) => {
					const isActive = workspace.id === activeWorkspaceId;
					const showSetDefault = !workspace.isDefault && !isActive;
					return (
						<div
							key={workspace.id}
							role={rowRole}
							tabIndex={rowRole === "button" ? 0 : undefined}
							aria-current={isActive ? "true" : undefined}
							aria-disabled={switching || undefined}
							onClick={() => !switching && onSelect(workspace)}
							onKeyDown={(e) => {
								if (rowRole !== "button") return;
								if (e.key === "Enter" || e.key === " ") {
									e.preventDefault();
									if (!switching) onSelect(workspace);
								}
							}}
							className={cn(
								"flex min-h-11 min-w-11 cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-start",
								"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
								"hover:bg-muted",
								switching && "cursor-not-allowed opacity-60"
							)}
						>
							<div className="flex h-8 w-8 items-center justify-center rounded bg-primary/10 text-primary shrink-0">
								{workspace.logo ? (
									<img
										src={workspace.logo}
										alt=""
										className="h-6 w-6 rounded object-cover"
									/>
								) : (
									<span className="text-sm font-medium">
										{workspace.name.charAt(0).toUpperCase()}
									</span>
								)}
							</div>
							<div className="min-w-0 flex-1">
								<div className="flex items-center gap-1">
									<span className="truncate text-sm">{workspace.name}</span>
									{workspace.isDefault && (
										<Star
											className="h-3 w-3 shrink-0 fill-yellow-400 text-yellow-400"
											aria-label={t("switcher.default", "Default")}
										/>
									)}
								</div>
								{workspace.memberCount !== undefined && (
									<span className="text-xs text-muted-foreground">
										{t("switcher.memberCount", "{{count}} members", {
											count: workspace.memberCount,
										})}
									</span>
								)}
							</div>
							{isActive && (
								<Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
							)}
							{showSetDefault && (
								<Button
									variant="ghost"
									size="icon"
									className="h-11 w-11 shrink-0"
									onClick={(e) => {
										e.stopPropagation();
										onSetDefault(workspace.id);
									}}
									disabled={settingDefaultId === workspace.id}
									title={t("switcher.setDefault", "Set as default")}
									aria-label={t("switcher.setDefault", "Set as default")}
								>
									{settingDefaultId === workspace.id ? (
										<Loader2 className="h-4 w-4 animate-spin" />
									) : (
										<Star className="h-4 w-4" />
									)}
								</Button>
							)}
						</div>
					);
				})
			)}

			<div
				role={rowRole}
				tabIndex={rowRole === "button" ? 0 : undefined}
				onClick={onCreate}
				onKeyDown={(e) => {
					if (rowRole !== "button") return;
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						onCreate();
					}
				}}
				className={cn(
					"mt-1 flex min-h-11 min-w-11 cursor-pointer items-center gap-2 rounded-md border-t px-2 py-2 text-sm",
					"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
					"hover:bg-muted"
				)}
			>
				<Plus className="h-4 w-4 me-2" aria-hidden="true" />
				{t("create.trigger", "Create workspace")}
			</div>
		</div>
	);
}
