// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors

import { Loader2, Mail, UserPlus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { isApiError } from "@/lib/api/client";
import { translateServerError } from "@/lib/translateServerError";

interface OrgInviteMemberDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onInvite: (email: string, role: "member" | "admin") => Promise<void>;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function OrgInviteMemberDialog({
	open,
	onOpenChange,
	onInvite,
}: OrgInviteMemberDialogProps) {
	const { t } = useTranslation(["organization", "common"]);
	const [email, setEmail] = useState("");
	const [role, setRole] = useState<"member" | "admin">("member");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	function reset() {
		setEmail("");
		setRole("member");
		setError(null);
		setIsSubmitting(false);
	}

	function handleOpenChange(nextOpen: boolean) {
		if (!nextOpen) reset();
		onOpenChange(nextOpen);
	}

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError(null);

		const trimmed = email.trim().toLowerCase();
		if (!trimmed || !EMAIL_REGEX.test(trimmed)) {
			setError(t("organization:invite.invalidEmail"));
			return;
		}

		setIsSubmitting(true);
		try {
			await onInvite(trimmed, role);
			handleOpenChange(false);
		} catch (err) {
			const message = isApiError(err)
				? err.message
				: err instanceof Error
					? err.message
					: t("organization:invite.error");
			setError(translateServerError(message));
		} finally {
			setIsSubmitting(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<UserPlus className="h-5 w-5" />
						{t("organization:invite.title")}
					</DialogTitle>
					<DialogDescription>
						{t("organization:invite.description")}
					</DialogDescription>
				</DialogHeader>

				<form onSubmit={handleSubmit} className="space-y-4">
					{error && (
						<Alert variant="destructive">
							<AlertDescription>{error}</AlertDescription>
						</Alert>
					)}

					<div className="space-y-2">
						<Label htmlFor="org-invite-email">
							{t("organization:invite.emailLabel")}
						</Label>
						<div className="relative">
							<Mail className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
							<Input
								id="org-invite-email"
								type="email"
								placeholder={t("organization:invite.emailPlaceholder")}
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								className="ps-9"
								autoFocus
								disabled={isSubmitting}
							/>
						</div>
					</div>

					<div className="space-y-2">
						<Label htmlFor="org-invite-role">
							{t("organization:invite.roleLabel")}
						</Label>
						<Select
							value={role}
							onValueChange={(v) => setRole(v as "member" | "admin")}
							disabled={isSubmitting}
						>
							<SelectTrigger id="org-invite-role">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="member">
									{t("organization:role.member")}
								</SelectItem>
								<SelectItem value="admin">
									{t("organization:role.admin")}
								</SelectItem>
							</SelectContent>
						</Select>
						<p className="text-xs text-muted-foreground">
							{role === "admin"
								? t("organization:invite.adminHint")
								: t("organization:invite.memberHint")}
						</p>
					</div>

					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => handleOpenChange(false)}
							disabled={isSubmitting}
						>
							{t("common:cancel")}
						</Button>
						<Button type="submit" disabled={isSubmitting}>
							{isSubmitting && (
								<Loader2 className="h-4 w-4 me-1 animate-spin" />
							)}
							{t("organization:invite.send")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
