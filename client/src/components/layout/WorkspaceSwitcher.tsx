// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Desktop WorkspaceSwitcher
 *
 * Dropdown wrapper around the shell-agnostic `WorkspaceList`.
 * The mobile shell renders `WorkspaceList` directly in a Sheet (see
 * `MobileHeader`) — this dropdown stays desktop-only.
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Building2, ChevronsUpDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CreateWorkspaceDialog } from "@/components/dashboard/workspace/CreateWorkspaceDialog";
import {
	useWorkspaceSwitcher,
	WorkspaceList,
} from "./workspace-switcher";

interface WorkspaceSwitcherProps {
	className?: string;
	"data-tour"?: string;
}

export function WorkspaceSwitcher({
	className,
	"data-tour": dataTour,
}: WorkspaceSwitcherProps) {
	const { t } = useTranslation("workspace");
	const {
		workspaces,
		activeWorkspace,
		isLoading,
		switching,
		settingDefaultId,
		createDialogOpen,
		setCreateDialogOpen,
		openCreateDialog,
		selectWorkspace,
		setDefault,
	} = useWorkspaceSwitcher();

	const [open, setOpen] = useState(false);

	if (isLoading) {
		return (
			<Button
				variant="outline"
				className={cn(
					"min-h-[44px] min-w-[180px] justify-between gap-2",
					className
				)}
				disabled
			>
				<div className="flex items-center gap-2">
					<Loader2 className="h-4 w-4 animate-spin" />
					<span className="text-sm">{t("loading", "Loading...")}</span>
				</div>
			</Button>
		);
	}

	return (
		<>
			<DropdownMenu open={open} onOpenChange={setOpen}>
				<DropdownMenuTrigger asChild>
					<Button
						variant="outline"
						role="combobox"
						aria-expanded={open}
						aria-label={t("switcher.label", "Switch workspace")}
						data-tour={dataTour}
						className={cn(
							"min-h-[44px] min-w-[180px] max-w-[240px] justify-between gap-2 text-start",
							className
						)}
					>
						<div className="flex items-center gap-2 truncate">
							{activeWorkspace?.logo ? (
								<img
									src={activeWorkspace.logo}
									alt=""
									className="h-5 w-5 rounded shrink-0 object-cover"
								/>
							) : (
								<Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
							)}
							<span className="truncate text-sm font-medium">
								{activeWorkspace?.name ||
									t("switcher.selectWorkspace", "Select workspace")}
							</span>
						</div>
						<ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent
					align="start"
					className="w-[260px] p-2"
					sideOffset={8}
				>
					<DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
						{t("switcher.workspaces", "Workspaces")}
					</DropdownMenuLabel>
					<DropdownMenuSeparator />
					<WorkspaceList
						workspaces={workspaces}
						activeWorkspaceId={activeWorkspace?.id ?? null}
						switching={switching}
						settingDefaultId={settingDefaultId}
						onSelect={async (workspace) => {
							const changed = await selectWorkspace(workspace);
							setOpen(false);
							return changed;
						}}
						onSetDefault={setDefault}
						onCreate={() => {
							setOpen(false);
							openCreateDialog();
						}}
						rowRole="menuitem"
					/>
				</DropdownMenuContent>
			</DropdownMenu>

			<CreateWorkspaceDialog
				open={createDialogOpen}
				onOpenChange={setCreateDialogOpen}
			/>
		</>
	);
}
