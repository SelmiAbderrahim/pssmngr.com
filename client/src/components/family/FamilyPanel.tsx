// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * FamilyPanel
 *
 * Route-agnostic Family management UI. Extracted from
 * `routes/_app/_auth/dashboard/family.tsx` so the
 * `/dashboard/organization?tab=family` tab can mount it without pulling in
 * TanStack Route search hooks.
 *
 * Zero-knowledge shared-vault setup and role-driven key grants live on the
 * Vault page (`OrgVaultBanner` and `OrgVaultAutoGrantProvider`). This panel
 * contains member and invitation management, recovery settings, and a
 * read-only per-member access summary.
 */

import {
	FolderLock,
	Loader2,
	Plus,
	Settings,
	ShieldCheck,
	Users,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FamilyMemberList } from "@/components/family/FamilyMemberList";
import { FamilySettingsPanel } from "@/components/family/FamilySettingsPanel";
import { InviteMemberDialog } from "@/components/family/InviteMemberDialog";
import { RecoveryPanel } from "@/components/family/RecoveryPanel";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { isApiError } from "@/lib/api/client";
import { trpcMutation, trpcQuery } from "@/lib/api/trpc";
import type {
	FamilyDetails,
	FamilyInvitation,
	FamilyMember,
	FamilyRole,
	RecoveryRequest,
	SharedVault,
} from "@/types/family";

export type FamilyPanelTab = "members" | "vaults" | "recovery" | "settings";

interface FamilyPanelProps {
	initialTab?: FamilyPanelTab;
}

interface CreateFamilyFormState {
	name: string;
	isCreating: boolean;
	error: string | null;
}

type MemberAccessSummary = {
	vaultCount: number;
	manageCount: number;
	editCount: number;
	shareCount: number;
	viewCount: number;
};

export function FamilyPanel({ initialTab = "members" }: FamilyPanelProps) {
	const { t } = useTranslation("common");
	const [tab, setTab] = useState<FamilyPanelTab>(initialTab);

	const [family, setFamily] = useState<FamilyDetails | null>(null);
	const [members, setMembers] = useState<FamilyMember[]>([]);
	const [invitations, setInvitations] = useState<FamilyInvitation[]>([]);
	const [sharedVaults, setSharedVaults] = useState<SharedVault[]>([]);
	const [recoveryRequests, setRecoveryRequests] = useState<RecoveryRequest[]>(
		[],
	);
	const [memberRecoveryStatus, setMemberRecoveryStatus] =
		useState<RecoveryRequest | null>(null);

	const [isLoading, setIsLoading] = useState(true);
	const [noFamily, setNoFamily] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [actionMessage, setActionMessage] = useState<string | null>(null);
	const [currentUserId, setCurrentUserId] = useState<string>("");
	const [inviteDialogOpen, setInviteDialogOpen] = useState(false);

	const [createForm, setCreateForm] = useState<CreateFamilyFormState>({
		name: "",
		isCreating: false,
		error: null,
	});

	const isOrganizer =
		family?.role === "owner" ||
		members.some((m) => m.userId === currentUserId && m.role === "owner");

	function getErrorMessage(err: unknown, fallback: string) {
		if (isApiError(err)) return err.message;
		if (err instanceof Error) return err.message;
		if (typeof err === "object" && err !== null && "message" in err) {
			const message = (err as { message?: unknown }).message;
			if (typeof message === "string" && message.trim()) return message;
		}
		return fallback;
	}

	function invitationLink(invitationId: string) {
		return `${window.location.origin}/invitation?token=${encodeURIComponent(invitationId)}`;
	}

	const handleTabChange = useCallback((newTab: string) => {
		setTab(newTab as FamilyPanelTab);
	}, []);

	useEffect(() => {
		trpcQuery<{ id?: string; userId?: string; user?: { id?: string } }>(
			"user",
			"get",
		)
			.then((u) => setCurrentUserId(u.id || u.userId || u.user?.id || ""))
			.catch(() => {});
	}, []);

	const fetchFamily = useCallback(async () => {
		setIsLoading(true);
		setError(null);
		try {
			const data = await trpcQuery<FamilyDetails>("family", "get");
			setFamily(data);
			setNoFamily(false);
		} catch (err) {
			if (isApiError(err) && err.code === "NOT_FOUND") {
				setNoFamily(true);
			} else {
				setError(
					isApiError(err)
						? err.message
						: err instanceof Error
							? err.message
							: t("family.loadError", "Failed to load family."),
				);
			}
		} finally {
			setIsLoading(false);
		}
	}, [t]);

	const fetchMembers = useCallback(async () => {
		try {
			const data = await trpcQuery<FamilyMember[]>("family", "listMembers");
			if (data.length === 0) {
				setNoFamily(true);
			} else {
				setMembers(data);
			}
		} catch {
			// Non-critical, member list may fail if no family
		}
	}, []);

	const fetchInvitations = useCallback(async () => {
		if (!isOrganizer) {
			setInvitations([]);
			return;
		}
		try {
			const data = await trpcQuery<FamilyInvitation[]>(
				"family",
				"listInvitations",
			);
			setInvitations(data);
		} catch {
			// Non-critical
		}
	}, [isOrganizer]);

	const fetchSharedVaults = useCallback(async () => {
		try {
			const data = await trpcQuery<SharedVault[]>("sharedVault", "list");
			setSharedVaults(data);
		} catch {
			// Non-critical
		}
	}, []);

	const fetchRecovery = useCallback(async () => {
		try {
			if (isOrganizer) {
				const data = await trpcQuery<RecoveryRequest[]>(
					"family",
					"listRecoveryRequests",
				);
				setRecoveryRequests(data);
			} else {
				const data = await trpcQuery<RecoveryRequest | null>(
					"family",
					"getRecoveryStatus",
				);
				setMemberRecoveryStatus(data);
			}
		} catch {
			// Non-critical
		}
	}, [isOrganizer]);

	useEffect(() => {
		fetchFamily();
	}, [fetchFamily]);

	useEffect(() => {
		if (family) {
			fetchMembers();
			fetchSharedVaults();
		}
	}, [family, fetchMembers, fetchSharedVaults]);

	useEffect(() => {
		if (family) {
			fetchInvitations();
		}
	}, [family, fetchInvitations]);

	useEffect(() => {
		if (family && currentUserId) {
			fetchRecovery();
		}
	}, [family, currentUserId, fetchRecovery]);

	async function handleInvite(email: string, role: "member" | "admin") {
		await trpcMutation("family", "inviteMember", { email, role });
		await Promise.all([fetchMembers(), fetchInvitations()]);
		setActionMessage(t("family.invite.sent", "Invitation sent."));
	}

	async function handleCopyInvitation(invitationId: string) {
		try {
			await navigator.clipboard.writeText(invitationLink(invitationId));
			setActionMessage(
				t("family.invite.linkCopied", "Invitation link copied."),
			);
		} catch {
			setActionMessage(
				t("family.invite.copyError", "Failed to copy invitation link."),
			);
		}
	}

	async function handleResendInvitation(invitationId: string) {
		try {
			const result = await trpcMutation<{ inviteLink?: string }>(
				"family",
				"resendInvitation",
				{ invitationId },
			);
			let copied = false;
			try {
				await navigator.clipboard.writeText(
					result.inviteLink || invitationLink(invitationId),
				);
				copied = true;
			} catch {
				copied = false;
			}
			await fetchInvitations();
			setActionMessage(
				copied
					? t("family.invite.resent", "Invitation resent and link copied.")
					: t(
							"family.invite.resentWithoutCopy",
							"Invitation resent. Copy the link manually if needed.",
						),
			);
		} catch (err) {
			setActionMessage(
				getErrorMessage(
					err,
					t("family.invite.resendError", "Failed to resend invitation."),
				),
			);
		}
	}

	async function handleCancelInvitation(invitationId: string) {
		try {
			await trpcMutation("family", "cancelInvitation", { invitationId });
			await fetchInvitations();
			setActionMessage(t("family.invite.cancelled", "Invitation cancelled."));
		} catch (err) {
			setActionMessage(
				getErrorMessage(
					err,
					t("family.invite.cancelError", "Failed to cancel invitation."),
				),
			);
		}
	}

	async function handleRemoveMember(memberId: string) {
		await trpcMutation("family", "removeMember", { memberId });
		await Promise.all([fetchMembers(), fetchSharedVaults()]);
	}

	async function handleChangeRole(memberId: string, role: FamilyRole) {
		await trpcMutation("family", "setRole", { memberId, role });
		await fetchMembers();
	}

	async function handleUpdateName(name: string) {
		await trpcMutation("family", "updateSettings", { name });
		await fetchFamily();
		setActionMessage(t("family.settings.saved", "Settings saved."));
	}

	async function handleLeaveFamily() {
		await trpcMutation("family", "leave", {});
		setFamily(null);
		setNoFamily(true);
	}

	async function handleRequestRecovery() {
		await trpcMutation("family", "requestRecovery", {});
		await fetchRecovery();
	}

	async function handleApproveRecovery(requestId: string) {
		await trpcMutation("family", "approveRecovery", { requestId });
		await fetchRecovery();
	}

	async function handleRejectRecovery(requestId: string) {
		await trpcMutation("family", "rejectRecovery", { requestId });
		await fetchRecovery();
	}

	async function handleCreateFamily(e: React.FormEvent) {
		e.preventDefault();
		const trimmed = createForm.name.trim();
		if (!trimmed) {
			setCreateForm((s) => ({
				...s,
				error: t("family.create.nameRequired", "Please enter a family name."),
			}));
			return;
		}
		setCreateForm((s) => ({ ...s, isCreating: true, error: null }));
		try {
			await trpcMutation("family", "create", { name: trimmed });
			setCreateForm({ name: "", isCreating: false, error: null });
			await fetchFamily();
		} catch (err) {
			setCreateForm((s) => ({
				...s,
				isCreating: false,
				error: isApiError(err)
					? err.message
					: err instanceof Error
						? err.message
						: t("family.create.error", "Failed to create family."),
			}));
		}
	}


	if (isLoading) {
		return (
			<div>
				<div className="h-64 bg-muted rounded-lg animate-pulse" />
			</div>
		);
	}

	if (error && !family) {
		return (
			<Alert variant="destructive">
				<AlertDescription>{error}</AlertDescription>
			</Alert>
		);
	}

	if (noFamily) {
		return (
			<div className="max-w-md mx-auto text-center py-12">
				<Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
				<h2 className="text-lg font-semibold mb-2">
					{t("family.create.title", "Create a Family")}
				</h2>
				<p className="text-sm text-muted-foreground mb-6">
					{t(
						"family.create.description",
						"Start a family to share vaults and enable delegated recovery for up to 6 members.",
					)}
				</p>
				<form onSubmit={handleCreateFamily} className="space-y-4">
					{createForm.error && (
						<Alert variant="destructive">
							<AlertDescription>{createForm.error}</AlertDescription>
						</Alert>
					)}
					<input
						type="text"
						value={createForm.name}
						onChange={(e) =>
							setCreateForm((s) => ({ ...s, name: e.target.value }))
						}
						placeholder={t("family.create.namePlaceholder", "Family name")}
						className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
						maxLength={64}
						disabled={createForm.isCreating}
					/>
					<Button type="submit" disabled={createForm.isCreating}>
						{createForm.isCreating && (
							<Loader2 className="h-4 w-4 me-1 animate-spin" />
						)}
						<Plus className="h-4 w-4 me-1" />
						{t("family.create.action", "Create Family")}
					</Button>
				</form>
			</div>
		);
	}

	const memberAccessSummaries = sharedVaults.reduce<
		Record<string, MemberAccessSummary>
	>((acc, vault) => {
		for (const vaultMember of vault.members ?? []) {
			const summary = acc[vaultMember.userId] ?? {
				vaultCount: 0,
				manageCount: 0,
				editCount: 0,
				shareCount: 0,
				viewCount: 0,
			};
			summary.vaultCount += 1;
			if (vaultMember.permission === "manage") summary.manageCount += 1;
			if (vaultMember.permission === "share") summary.shareCount += 1;
			if (vaultMember.permission === "edit") summary.editCount += 1;
			if (vaultMember.permission === "view") summary.viewCount += 1;
			acc[vaultMember.userId] = summary;
		}
		return acc;
	}, {});

	return (
		<div>
			{actionMessage && (
				<Alert className="mb-6">
					<AlertDescription>{actionMessage}</AlertDescription>
				</Alert>
			)}

			<Tabs value={tab} onValueChange={handleTabChange}>
				<TabsList className="mb-6">
					<TabsTrigger value="members" className="gap-1.5">
						<Users className="h-4 w-4" />
						<span className="hidden sm:inline">
							{t("family.tabs.members", "Members")}
						</span>
					</TabsTrigger>
					<TabsTrigger value="vaults" className="gap-1.5">
						<FolderLock className="h-4 w-4" />
						<span className="hidden sm:inline">
							{t("family.tabs.vaults", "Shared Vaults")}
						</span>
					</TabsTrigger>
					<TabsTrigger value="recovery" className="gap-1.5">
						<ShieldCheck className="h-4 w-4" />
						<span className="hidden sm:inline">
							{t("family.tabs.recovery", "Recovery")}
						</span>
					</TabsTrigger>
					<TabsTrigger value="settings" className="gap-1.5">
						<Settings className="h-4 w-4" />
						<span className="hidden sm:inline">
							{t("family.tabs.settings", "Settings")}
						</span>
					</TabsTrigger>
				</TabsList>

				<TabsContent value="members">
					<FamilyMemberList
						members={members}
						invitations={invitations}
						accessSummaries={memberAccessSummaries}
						currentUserId={currentUserId}
						isOrganizer={isOrganizer}
						isLoading={false}
						onRemoveMember={handleRemoveMember}
						onChangeRole={handleChangeRole}
						onInviteClick={() => setInviteDialogOpen(true)}
						onCopyInvitation={handleCopyInvitation}
						onResendInvitation={handleResendInvitation}
						onCancelInvitation={handleCancelInvitation}
					/>
				</TabsContent>

				<TabsContent value="vaults">
					<Card>
						<CardHeader>
							<CardTitle className="text-lg font-semibold">
								{t("family.tabs.vaults", "Shared Vaults")}
							</CardTitle>
						</CardHeader>
						<CardContent className="space-y-3 text-sm text-muted-foreground">
							<p>
								{t(
									"family.sharedVaults.autoGrantExplainer",
									"Shared-vault access is now granted automatically from each member's role — owners and admins get read/write, members get read-only — as soon as they sign in on a device. No manual key wrapping needed.",
								)}
							</p>
							<p>
								{t(
									"family.sharedVaults.manageFromVault",
									"To set up the shared vault or import your existing items, open the Vault page.",
								)}
							</p>
							<Button asChild variant="outline" size="sm">
								<a href="/dashboard/vault">
									<FolderLock className="h-4 w-4 me-1" />
									{t("family.sharedVaults.openVault", "Open Vault")}
								</a>
							</Button>
						</CardContent>
					</Card>
				</TabsContent>

				<TabsContent value="recovery">
					<RecoveryPanel
						isOrganizer={isOrganizer}
						requests={recoveryRequests}
						memberRecoveryStatus={memberRecoveryStatus}
						isLoading={false}
						onRequestRecovery={handleRequestRecovery}
						onApproveRecovery={handleApproveRecovery}
						onRejectRecovery={handleRejectRecovery}
					/>
				</TabsContent>

				<TabsContent value="settings">
					<FamilySettingsPanel
						familyName={family?.name || ""}
						isOrganizer={isOrganizer}
						isLoading={false}
						onUpdateName={handleUpdateName}
						onLeaveFamily={handleLeaveFamily}
					/>
				</TabsContent>
			</Tabs>

			<InviteMemberDialog
				open={inviteDialogOpen}
				onOpenChange={setInviteDialogOpen}
				onInvite={handleInvite}
			/>
		</div>
	);
}
