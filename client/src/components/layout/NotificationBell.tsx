// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { useState, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Bell, Check, CheckCheck, Loader2, Trash2 } from "lucide-react";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { trpcQuery, trpcMutation } from "@/lib/api/trpc";

interface Notification {
	notificationId: string;
	userId: string;
	category: "security" | "sharing" | "system";
	title: string;
	message: string;
	read: boolean;
	createdAt: string;
}

interface NotificationsResponse {
	notifications: Notification[];
	total: number;
}

export function NotificationBell() {
	const { t } = useTranslation("settings");
	const [open, setOpen] = useState(false);
	const [unreadCount, setUnreadCount] = useState(0);
	const [notifications, setNotifications] = useState<Notification[]>([]);
	const [loading, setLoading] = useState(false);

	const fetchUnreadCount = useCallback(async () => {
		try {
			const result = await trpcQuery<{ count: number }>(
				"notification",
				"getUnreadCount",
			);
			setUnreadCount(result.count);
		} catch {
			// Silently fail — bell just won't show a count
		}
	}, []);

	const fetchNotifications = useCallback(async () => {
		setLoading(true);
		try {
			const result = await trpcQuery<NotificationsResponse>(
				"notification",
				"list",
				{ limit: 10, offset: 0 },
			);
			setNotifications(result.notifications);
		} catch {
			// Silently fail
		} finally {
			setLoading(false);
		}
	}, []);

	// Poll unread count every 60s
	useEffect(() => {
		fetchUnreadCount();
		const interval = setInterval(fetchUnreadCount, 60_000);
		return () => clearInterval(interval);
	}, [fetchUnreadCount]);

	// Fetch full list when popover opens
	useEffect(() => {
		if (open) {
			fetchNotifications();
		}
	}, [open, fetchNotifications]);

	const handleMarkAsRead = useCallback(
		async (notificationId: string) => {
			try {
				await trpcMutation("notification", "markAsRead", { notificationId });
				setNotifications((prev) =>
					prev.map((n) =>
						n.notificationId === notificationId ? { ...n, read: true } : n,
					),
				);
				setUnreadCount((prev) => Math.max(0, prev - 1));
			} catch {
				// Silently fail
			}
		},
		[],
	);

	const handleMarkAllAsRead = useCallback(async () => {
		try {
			await trpcMutation("notification", "markAllAsRead");
			setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
			setUnreadCount(0);
		} catch {
			// Silently fail
		}
	}, []);

	const handleDelete = useCallback(
		async (notificationId: string) => {
			try {
				await trpcMutation("notification", "delete", { notificationId });
				const removed = notifications.find(
					(n) => n.notificationId === notificationId,
				);
				setNotifications((prev) =>
					prev.filter((n) => n.notificationId !== notificationId),
				);
				if (removed && !removed.read) {
					setUnreadCount((prev) => Math.max(0, prev - 1));
				}
			} catch {
				// Silently fail
			}
		},
		[notifications],
	);

	const categoryIcon = (category: Notification["category"]) => {
		switch (category) {
			case "security":
				return "text-red-600 dark:text-red-400";
			case "sharing":
				return "text-blue-600 dark:text-blue-400";
			case "system":
				return "text-muted-foreground";
		}
	};

	const timeAgo = (dateStr: string) => {
		const diff = Date.now() - new Date(dateStr).getTime();
		const minutes = Math.floor(diff / 60_000);
		if (minutes < 1) return "now";
		if (minutes < 60) return `${minutes}m`;
		const hours = Math.floor(minutes / 60);
		if (hours < 24) return `${hours}h`;
		const days = Math.floor(hours / 24);
		return `${days}d`;
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					variant="ghost"
					size="sm"
					className="relative min-h-[44px] min-w-[44px] shrink-0"
					aria-label={
						unreadCount > 0
							? t("notifications.bell.withUnread", { count: unreadCount })
							: t("notifications.bell.noUnread")
					}
				>
					<Bell className="h-4 w-4" />
					{unreadCount > 0 && (
						<Badge
							variant="destructive"
							className="absolute -top-1 -end-1 h-5 min-w-[20px] rounded-md px-1 text-[10px] font-medium"
						>
							{unreadCount > 99 ? "99+" : unreadCount}
						</Badge>
					)}
				</Button>
			</PopoverTrigger>
			<PopoverContent
				align="end"
				className="w-80 p-0"
				sideOffset={8}
			>
				<div className="flex items-center justify-between border-b px-4 py-3">
					<h4 className="text-sm font-semibold">
						{t("notifications.title")}
					</h4>
					{unreadCount > 0 && (
						<Button
							variant="ghost"
							size="sm"
							className="h-auto px-2 py-1 text-xs"
							onClick={handleMarkAllAsRead}
						>
							<CheckCheck className="h-3 w-3 me-1" />
							{t("notifications.markAllAsRead")}
						</Button>
					)}
				</div>

				<ScrollArea className="max-h-80">
					{loading ? (
						<div className="flex items-center justify-center py-8">
							<Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
						</div>
					) : notifications.length === 0 ? (
						<div className="px-4 py-8 text-center">
							<Bell className="mx-auto h-8 w-8 text-muted-foreground/50 mb-2" />
							<p className="text-sm font-medium text-muted-foreground">
								{t("notifications.empty.title")}
							</p>
							<p className="text-xs text-muted-foreground/70 mt-1">
								{t("notifications.empty.description")}
							</p>
						</div>
					) : (
						<div>
							{notifications.map((n) => (
								<div
									key={n.notificationId}
									className={`flex items-start gap-3 px-4 py-3 border-b last:border-b-0 transition-colors duration-150 ${
										!n.read ? "bg-muted/30" : ""
									}`}
								>
									<div
										className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${
											!n.read ? "bg-primary" : "bg-transparent"
										}`}
									/>
									<div className="flex-1 min-w-0">
										<p
											className={`text-sm leading-tight ${
												!n.read ? "font-medium" : ""
											}`}
										>
											<span className={categoryIcon(n.category)}>
												{n.title}
											</span>
										</p>
										<p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
											{n.message}
										</p>
										<p className="text-[10px] text-muted-foreground/60 mt-1">
											{timeAgo(n.createdAt)}
										</p>
									</div>
									<div className="flex shrink-0 gap-0.5">
										{!n.read && (
											<Button
												variant="ghost"
												size="icon"
												className="h-7 w-7"
												onClick={() => handleMarkAsRead(n.notificationId)}
												aria-label={t("notifications.markAsRead")}
											>
												<Check className="h-3.5 w-3.5" />
											</Button>
										)}
										<Button
											variant="ghost"
											size="icon"
											className="h-7 w-7 text-muted-foreground hover:text-destructive"
											onClick={() => handleDelete(n.notificationId)}
											aria-label={t("notifications.delete")}
										>
											<Trash2 className="h-3.5 w-3.5" />
										</Button>
									</div>
								</div>
							))}
						</div>
					)}
				</ScrollArea>
			</PopoverContent>
		</Popover>
	);
}
