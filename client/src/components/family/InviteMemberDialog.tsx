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

interface InviteMemberDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onInvite: (email: string, role: "member" | "admin") => Promise<void>;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getSubmitErrorMessage(error: unknown, fallback: string): string {
	if (isApiError(error)) return error.message;
	if (error instanceof Error) return error.message;
	if (typeof error === "object" && error !== null && "message" in error) {
		const message = (error as { message?: unknown }).message;
		if (typeof message === "string" && message.trim()) return message;
	}
	return fallback;
}

export function InviteMemberDialog({
	open,
	onOpenChange,
	onInvite,
}: InviteMemberDialogProps) {
	const { t } = useTranslation("common");
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
			setError(
				t("family.invite.invalidEmail", "Please enter a valid email address."),
			);
			return;
		}

		setIsSubmitting(true);
		try {
			await onInvite(trimmed, role);
			handleOpenChange(false);
		} catch (err) {
			setError(
				getSubmitErrorMessage(
					err,
					t("family.invite.error", "Failed to send invitation."),
				),
			);
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
						{t("family.invite.title", "Invite Family Member")}
					</DialogTitle>
					<DialogDescription>
						{t(
							"family.invite.description",
							"Send an invitation to join your family.",
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
						<Label htmlFor="invite-email">
							{t("family.invite.emailLabel", "Email address")}
						</Label>
						<div className="relative">
							<Mail className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
							<Input
								id="invite-email"
								type="email"
								placeholder={t(
									"family.invite.emailPlaceholder",
									"member@example.com",
								)}
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								className="ps-9"
								autoFocus
								disabled={isSubmitting}
							/>
						</div>
					</div>

					<div className="space-y-2">
						<Label htmlFor="invite-role">
							{t("family.invite.roleLabel", "Role")}
						</Label>
						<Select
							value={role}
							onValueChange={(v) => setRole(v as "member" | "admin")}
							disabled={isSubmitting}
						>
							<SelectTrigger id="invite-role">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="member">
									{t("family.roles.member", "Member")}
								</SelectItem>
								<SelectItem value="admin">
									{t("family.roles.admin", "Admin")}
								</SelectItem>
							</SelectContent>
						</Select>
						<p className="text-xs text-muted-foreground">
							{role === "admin"
								? t(
										"family.invite.adminHint",
										"Admins can manage shared vaults and members.",
									)
								: t(
										"family.invite.memberHint",
										"Members can access shared vaults and their own private vault.",
									)}
						</p>
					</div>

					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => handleOpenChange(false)}
							disabled={isSubmitting}
						>
							{t("actions.cancel", "Cancel")}
						</Button>
						<Button type="submit" disabled={isSubmitting}>
							{isSubmitting && (
								<Loader2 className="h-4 w-4 me-1 animate-spin" />
							)}
							{t("family.invite.send", "Send Invitation")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
