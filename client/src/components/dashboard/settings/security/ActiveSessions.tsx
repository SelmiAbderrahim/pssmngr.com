// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Active Sessions Component
 *
 * Display and manage active sessions with:
 * - Current session indicator
 * - Device and location info
 * - Individual session revocation
 * - Revoke all sessions
 *
 * @module components/dashboard/settings/security/ActiveSessions
 */

import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Monitor,
  Smartphone,
  Tablet,
  HelpCircle,
  MapPin,
  Clock,
  Trash2,
  Loader2,
  ShieldCheck,
  LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  useSessions,
  useRevokeSession,
  useRevokeAllSessions,
} from "@/hooks/deployment/useSecurity";
import type { Session } from "@/types/security";

// =============================================================================
// Types
// =============================================================================

interface ActiveSessionsProps {
  /** Optional className */
  className?: string;
}

// =============================================================================
// Helper Components
// =============================================================================

function DeviceIcon({ device }: { device: Session["device"] }) {
  switch (device?.type) {
    case "mobile":
      return <Smartphone className="h-4 w-4" />;
    case "tablet":
      return <Tablet className="h-4 w-4" />;
    case "desktop":
      return <Monitor className="h-4 w-4" />;
    default:
      return <HelpCircle className="h-4 w-4" />;
  }
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type TFn = (key: string, options?: Record<string, unknown>) => string;

function formatRelativeTime(dateString: string, t: TFn): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return t("common:time.now");
  if (diffMins === 1) return t("common:time.minuteAgo");
  if (diffMins < 60) return t("common:time.minutesAgo", { count: diffMins });
  if (diffHours === 1) return t("common:time.hourAgo");
  if (diffHours < 24) return t("common:time.hoursAgo", { count: diffHours });
  if (diffDays === 1) return t("common:time.dayAgo");
  if (diffDays < 7) return t("common:time.daysAgo", { count: diffDays });
  return formatDate(dateString);
}

// =============================================================================
// Component
// =============================================================================

export function ActiveSessions({ className }: ActiveSessionsProps) {
  const { t } = useTranslation(["settings", "common"]);

  // State
  const [revokeSessionId, setRevokeSessionId] = useState<string | null>(null);
  const [revokeAllDialogOpen, setRevokeAllDialogOpen] = useState(false);

  // Queries and mutations
  const { data: sessionsData, isLoading } = useSessions();
  const revokeSession = useRevokeSession();
  const revokeAllSessions = useRevokeAllSessions();

  const sessions = sessionsData?.sessions || [];
  const currentSession = sessions.find((s) => s.isCurrent);
  const otherSessions = sessions.filter((s) => !s.isCurrent);

  // Handlers
  const handleRevokeSession = useCallback(
    async (sessionId: string) => {
      const result = await revokeSession.mutateAsync(sessionId);
      if (result.success) {
        toast.success(t("security.sessions.revoke.success"));
        setRevokeSessionId(null);
      } else {
        toast.error(result.error || t("security.sessions.revoke.error"));
      }
    },
    [revokeSession, t]
  );

  const handleRevokeAllSessions = useCallback(async () => {
    const result = await revokeAllSessions.mutateAsync();
    if (result.success) {
      toast.success(t("security.sessions.revokeAll.success"));
      setRevokeAllDialogOpen(false);
    } else {
      toast.error(result.error || t("security.sessions.revoke.error"));
    }
  }, [revokeAllSessions, t]);

  // Loading state
  if (isLoading) {
    return (
      <Card className={cn("w-full", className)}>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-60" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("w-full", className)}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">
              {t("security.sessions.title")}
            </CardTitle>
          </div>
          {otherSessions.length > 0 && (
            <AlertDialog
              open={revokeAllDialogOpen}
              onOpenChange={setRevokeAllDialogOpen}
            >
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="min-h-[44px]"
                >
                  <LogOut className="me-2 h-4 w-4" />
                  {t("security.sessions.revokeAll")}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {t("security.sessions.revokeAll.confirm.title")}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {t("security.sessions.revokeAll.confirm.description")}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="min-h-[44px]">
                    {t("common.cancel")}
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleRevokeAllSessions}
                    disabled={revokeAllSessions.isPending}
                    className="min-h-[44px] bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {revokeAllSessions.isPending ? (
                      <>
                        <Loader2 className="me-2 h-4 w-4 animate-spin" />
                        {t("common.loading", "Loading...")}
                      </>
                    ) : (
                      t("security.sessions.revokeAll")
                    )}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
        <CardDescription>{t("security.sessions.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Current Session */}
        {currentSession && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">
              {t("security.sessions.current")}
            </h4>
            <div className="rounded-lg border border-primary/50 bg-primary/5 p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className="mt-1 text-primary">
                    <DeviceIcon device={currentSession.device} />
                  </div>
                  <div>
                    <p className="font-medium">
                      {currentSession.device?.browser || t("security.sessions.unknownBrowser", "Unknown Browser")}{" "}
                      {currentSession.device?.os
                        ? t("security.sessions.onOs", { os: currentSession.device.os })
                        : ""}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {currentSession.ipAddress}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {t("security.sessions.signedIn")}{" "}
                        {formatRelativeTime(currentSession.createdAt, t)}
                      </span>
                    </div>
                  </div>
                </div>
                <Badge variant="secondary" className="text-xs">
                  {t("security.sessions.current")}
                </Badge>
              </div>
            </div>
          </div>
        )}

        {/* Other Sessions */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">
            {t("security.sessions.other")}
          </h4>
          {otherSessions.length === 0 ? (
            <div className="rounded-lg border border-border bg-muted/30 p-4 text-center">
              <p className="text-sm text-muted-foreground">
                {t("security.sessions.noOther")}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-start">
                      {t("security.sessions.device")}
                    </TableHead>
                    <TableHead className="text-start">
                      {t("security.sessions.location")}
                    </TableHead>
                    <TableHead className="text-end">
                      {t("security.sessions.lastActive")}
                    </TableHead>
                    <TableHead className="text-end w-[100px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {otherSessions.map((session) => (
                    <TableRow key={session.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <DeviceIcon device={session.device} />
                          <span className="text-sm">
                            {session.device?.browser || t("security.sessions.unknown", "Unknown")}{" "}
                            {session.device?.os ? `(${session.device.os})` : ""}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {session.ipAddress}
                        </span>
                      </TableCell>
                      <TableCell className="text-end">
                        <span className="text-sm text-muted-foreground">
                          {formatRelativeTime(session.lastActiveAt, t)}
                        </span>
                      </TableCell>
                      <TableCell className="text-end">
                        <AlertDialog
                          open={revokeSessionId === session.id}
                          onOpenChange={(open) =>
                            setRevokeSessionId(open ? session.id : null)
                          }
                        >
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="min-h-[44px] min-w-[44px] text-destructive hover:bg-destructive/10 hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                              <span className="sr-only">
                                {t("security.sessions.revoke")}
                              </span>
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                {t("security.sessions.revoke.confirm.title")}
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                {t(
                                  "security.sessions.revoke.confirm.description"
                                )}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel className="min-h-[44px]">
                                {t("common.cancel")}
                              </AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() =>
                                  handleRevokeSession(session.id)
                                }
                                disabled={revokeSession.isPending}
                                className="min-h-[44px] bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                {revokeSession.isPending ? (
                                  <>
                                    <Loader2 className="me-2 h-4 w-4 animate-spin" />
                                    {t("common.loading", "Loading...")}
                                  </>
                                ) : (
                                  t(
                                    "security.sessions.revoke.confirm.button"
                                  )
                                )}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default ActiveSessions;
