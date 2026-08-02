// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * CreateWorkspaceDialog Component
 *
 * Dialog for creating a new organization/workspace.
 * Auto-generates a URL slug from the name.
 * On success: switches to the new org, closes dialog, shows toast.
 *
 * @module components/dashboard/workspace/CreateWorkspaceDialog
 */

import { Building2, Loader2 } from "lucide-react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreateOrganization } from "@/hooks/deployment/useWorkspace";
import { useWorkspaceContext } from "@/providers/WorkspaceContext";

interface CreateWorkspaceDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

/**
 * Generate a URL-friendly slug from a name string.
 * Converts to lowercase, replaces non-alphanumeric chars with hyphens,
 * collapses consecutive hyphens, and trims leading/trailing hyphens.
 */
function generateSlug(name: string): string {
	return name
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

export function CreateWorkspaceDialog({
	open,
	onOpenChange,
}: CreateWorkspaceDialogProps) {
	const { t } = useTranslation("workspace");
	const createOrganization = useCreateOrganization();
	const { switchWorkspace } = useWorkspaceContext();

	const [name, setName] = useState("");
	const [slug, setSlug] = useState("");
	const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const reset = useCallback(() => {
		setName("");
		setSlug("");
		setSlugManuallyEdited(false);
		setError(null);
	}, []);

	const handleOpenChange = useCallback(
		(nextOpen: boolean) => {
			if (!nextOpen) reset();
			onOpenChange(nextOpen);
		},
		[onOpenChange, reset],
	);

	const handleNameChange = useCallback(
		(value: string) => {
			setName(value);
			if (!slugManuallyEdited) {
				setSlug(generateSlug(value));
			}
		},
		[slugManuallyEdited],
	);

	const handleSlugChange = useCallback((value: string) => {
		setSlugManuallyEdited(true);
		setSlug(generateSlug(value));
	}, []);

	const handleSubmit = useCallback(
		async (e: React.FormEvent) => {
			e.preventDefault();
			setError(null);

			const trimmedName = name.trim();
			if (!trimmedName) {
				setError(t("create.nameRequired", "Organization name is required"));
				return;
			}

			try {
				const result = await createOrganization.mutateAsync({
					name: trimmedName,
					slug: slug || undefined,
				});

				// Switch to the newly created organization
				if (result?.id) {
					await switchWorkspace(result.id);
				}

				toast.success(t("create.success", "Organization created successfully"));
				handleOpenChange(false);
			} catch (err: unknown) {
				const message =
					err instanceof Error
						? err.message
						: typeof err === "object" && err !== null && "message" in err
							? String((err as { message: unknown }).message)
							: t("create.error", "Failed to create organization");
				setError(message);
			}
		},
		[
			name,
			slug,
			createOrganization,
			switchWorkspace,
			handleOpenChange,
			t,
		],
	);

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Building2 className="h-5 w-5" />
						{t("create.title", "Create Organization")}
					</DialogTitle>
					<DialogDescription>
						{t(
							"create.description",
							"Create a new organization to manage your team.",
						)}
					</DialogDescription>
				</DialogHeader>

				<form onSubmit={handleSubmit} className="space-y-4">
					{error && (
						<Alert variant="destructive">
							<AlertDescription>{error}</AlertDescription>
						</Alert>
					)}

					<div className="space-y-2">
						<Label htmlFor="workspace-name">
							{t("create.nameLabel", "Organization Name")}
						</Label>
						<Input
							id="workspace-name"
							type="text"
							placeholder={t("create.namePlaceholder", "My Organization")}
							value={name}
							onChange={(e) => handleNameChange(e.target.value)}
							autoFocus
							disabled={createOrganization.isPending}
							autoComplete="off"
						/>
					</div>

					<div className="space-y-2">
						<Label htmlFor="workspace-slug">
							{t("create.slugLabel", "URL Slug")}
						</Label>
						<Input
							id="workspace-slug"
							type="text"
							placeholder={t("create.slugPlaceholder", "my-organization")}
							value={slug}
							onChange={(e) => handleSlugChange(e.target.value)}
							disabled={createOrganization.isPending}
							autoComplete="off"
						/>
						<p className="text-xs text-muted-foreground">
							{t(
								"create.slugHint",
								"Auto-generated from name. Edit to customize.",
							)}
						</p>
					</div>

					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => handleOpenChange(false)}
							disabled={createOrganization.isPending}
						>
							{t("create.cancel", "Cancel")}
						</Button>
						<Button
							type="submit"
							disabled={createOrganization.isPending || !name.trim()}
						>
							{createOrganization.isPending && (
								<Loader2 className="h-4 w-4 me-1 animate-spin" />
							)}
							{t("create.submit", "Create")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
