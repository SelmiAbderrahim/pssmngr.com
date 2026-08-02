// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ShieldAlert, XCircle, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { CountdownTimer } from "./CountdownTimer";
import type { EmergencyAccessRequest } from "@/types/emergency";

interface RequestBannerProps {
  /** Incoming requests where the current user is the vault owner */
  requests: EmergencyAccessRequest[];
  isLoading: boolean;
  onDeny: (requestId: string) => Promise<void>;
  onRefresh: () => void;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getInitials(name: string | null, email: string): string {
  if (name) {
    return name
      .split(" ")
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }
  return (email[0] ?? "?").toUpperCase();
}

const STATUS_STYLES: Record<string, string> = {
  pending:
    "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800",
  denied:
    "bg-red-50 text-red-800 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800",
  approved:
    "bg-green-50 text-green-800 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800",
  expired:
    "bg-muted text-muted-foreground border-border",
};

export function RequestBanner({
  requests,
  isLoading,
  onDeny,
  onRefresh,
}: RequestBannerProps) {
  const { t } = useTranslation(["emergency", "common"]);
  const [denyingId, setDenyingId] = useState<string | null>(null);
  const [confirmDenyId, setConfirmDenyId] = useState<string | null>(null);

  async function handleConfirmDeny() {
    if (!confirmDenyId) return;
    setDenyingId(confirmDenyId);
    try {
      await onDeny(confirmDenyId);
    } finally {
      setDenyingId(null);
      setConfirmDenyId(null);
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64 mt-1" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  const pendingRequests = requests.filter((r) => r.status === "pending");
  const pastRequests = requests.filter((r) => r.status !== "pending");
  const requestToDeny = requests.find((r) => r.id === confirmDenyId);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <ShieldAlert className="h-5 w-5" />
            {t("requests.title", "Access Requests")}
          </CardTitle>
          <CardDescription>
            {t(
              "emergency.requests.description",
              "People requesting emergency access to your vault."
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {requests.length === 0 ? (
            <div className="text-center py-6">
              <ShieldAlert className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">
                {t("requests.empty", "No access requests.")}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {pendingRequests.length > 0 && (
                <div className="space-y-2">
                  {pendingRequests.map((req) => (
                    <div
                      key={req.id}
                      className="rounded-lg border border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-900/10 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <Avatar className="h-9 w-9 shrink-0">
                            <AvatarImage
                              src={req.contact.image ?? undefined}
                            />
                            <AvatarFallback className="text-xs">
                              {getInitials(
                                req.contact.name,
                                req.contact.email
                              )}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">
                              {req.contact.name || req.contact.email}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {t("requests.requestedOn", "Requested {{date}}", {
                                date: formatDate(req.requestedAt),
                              })}
                            </p>
                          </div>
                        </div>
                        <CountdownTimer
                          expiresAt={req.expiresAt}
                          onExpired={onRefresh}
                        />
                      </div>
                      <div className="flex items-center justify-between mt-3">
                        <p className="text-xs text-muted-foreground">
                          {t(
                            "emergency.requests.autoGrantWarning",
                            "Access will be granted automatically when the timer expires."
                          )}
                        </p>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => setConfirmDenyId(req.id)}
                          disabled={denyingId === req.id}
                        >
                          {denyingId === req.id ? (
                            <Loader2 className="h-4 w-4 me-1 animate-spin" />
                          ) : (
                            <XCircle className="h-4 w-4 me-1" />
                          )}
                          {t("requests.deny", "Deny")}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {pastRequests.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">
                    {t("requests.past", "Past Requests")}
                  </p>
                  {pastRequests.map((req) => (
                    <div
                      key={req.id}
                      className="rounded-lg border p-3 opacity-70"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 min-w-0">
                          <Avatar className="h-8 w-8 shrink-0">
                            <AvatarImage
                              src={req.contact.image ?? undefined}
                            />
                            <AvatarFallback className="text-xs">
                              {getInitials(
                                req.contact.name,
                                req.contact.email
                              )}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="text-sm truncate">
                              {req.contact.name || req.contact.email}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatDate(req.requestedAt)}
                            </p>
                          </div>
                        </div>
                        <Badge
                          variant="outline"
                          className={
                            STATUS_STYLES[req.status] || ""
                          }
                        >
                          {t(
                            `emergency.requests.status.${req.status}`,
                            req.status
                          )}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={!!confirmDenyId}
        onOpenChange={() => setConfirmDenyId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("requests.denyTitle", "Deny Access Request")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "emergency.requests.denyDescription",
                "Deny {{name}}'s request? They will not be able to request again for 24 hours.",
                {
                  name:
                    requestToDeny?.contact.name ||
                    requestToDeny?.contact.email ||
                    "",
                }
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t("common:actions.cancel", "Cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDeny}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {denyingId && (
                <Loader2 className="h-4 w-4 me-1 animate-spin" />
              )}
              {t("requests.confirmDeny", "Deny Access")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
