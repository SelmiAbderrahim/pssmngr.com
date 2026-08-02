// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ShieldCheck,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CountdownTimer } from "./CountdownTimer";
import type { EmergencyAccessRequest, EmergencyOwner } from "@/types/emergency";

interface RequestTimelineProps {
  /** Outgoing requests where the current user is the contact */
  requests: EmergencyAccessRequest[];
  emergencyOwners: EmergencyOwner[];
  isLoading: boolean;
  onRequestAccess: (trustedContactId: string) => Promise<void>;
  onRefresh: () => void;
}

const STATUS_CONFIG: Record<
  string,
  { icon: typeof Clock; label: string; className: string }
> = {
  pending: {
    icon: Clock,
    label: "Waiting",
    className:
      "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800",
  },
  denied: {
    icon: XCircle,
    label: "Denied",
    className:
      "bg-red-50 text-red-800 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800",
  },
  approved: {
    icon: CheckCircle,
    label: "Granted",
    className:
      "bg-green-50 text-green-800 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800",
  },
  expired: {
    icon: AlertTriangle,
    label: "Expired",
    className: "bg-muted text-muted-foreground border-border",
  },
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function RequestTimeline({
  requests,
  emergencyOwners,
  isLoading,
  onRequestAccess,
  onRefresh,
}: RequestTimelineProps) {
  const { t } = useTranslation("emergency");
  const [requestingOwnerId, setRequestingOwnerId] = useState<string | null>(
    null
  );

  async function handleRequest(ownerId: string) {
    setRequestingOwnerId(ownerId);
    try {
      await onRequestAccess(ownerId);
    } finally {
      setRequestingOwnerId(null);
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

  const ownersWithoutRequest = emergencyOwners.filter(
    (relationship) =>
      !requests.some((request) => request.owner.id === relationship.owner.id),
  );

  if (requests.length === 0 && ownersWithoutRequest.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            {t("timeline.title", "My Access Requests")}
          </CardTitle>
          <CardDescription>
            {t(
              "timeline.description",
              "Emergency access requests you have made."
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6">
            <ShieldCheck className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">
              {t(
                "timeline.empty",
                "You haven't made any emergency access requests."
              )}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" />
          {t("timeline.title", "My Access Requests")}
        </CardTitle>
        <CardDescription>
          {t(
            "timeline.description",
            "Emergency access requests you have made."
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {ownersWithoutRequest.map((relationship) => (
            <div
              key={relationship.trustedContactId}
              className="rounded-lg border p-4 flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">
                  {relationship.owner.name || relationship.owner.email}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t("timeline.waitingPeriod", "{{count}} day waiting period", {
                    count: relationship.waitingPeriodDays,
                  })}
                </p>
              </div>
              <Button
                size="sm"
                onClick={() => handleRequest(relationship.trustedContactId)}
                disabled={requestingOwnerId === relationship.trustedContactId}
              >
                {requestingOwnerId === relationship.trustedContactId && (
                  <Loader2 className="h-4 w-4 me-1 animate-spin" />
                )}
                {t("timeline.requestAccess", "Request Access")}
              </Button>
            </div>
          ))}
          {requests.map((req) => {
            const config = STATUS_CONFIG[req.status] ?? STATUS_CONFIG.expired;
            const StatusIcon = config!.icon;

            return (
              <div key={req.id} className="rounded-lg border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {req.owner.name || req.owner.email}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t("timeline.requestedOn", "Requested {{date}}", {
                        date: formatDate(req.requestedAt),
                      })}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={`gap-1 shrink-0 ${config!.className}`}
                  >
                    <StatusIcon className="h-3 w-3" />
                    {t(
                      `timeline.status.${req.status}`,
                      config!.label
                    )}
                  </Badge>
                </div>

                {/* Pending: show countdown */}
                {req.status === "pending" && (
                  <div className="mt-3 flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      {t(
                        "timeline.waitingHint",
                        "The owner can deny this request during the waiting period."
                      )}
                    </p>
                    <CountdownTimer
                      expiresAt={req.expiresAt}
                      onExpired={onRefresh}
                    />
                  </div>
                )}

                {/* Denied: show re-request option */}
                {req.status === "denied" && (
                  <div className="mt-3">
                    <p className="text-xs text-muted-foreground mb-2">
                      {t(
                        "timeline.deniedHint",
                        "Your request was denied. You can try again after the cooldown period."
                      )}
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleRequest(req.trustedContactId)}
                      disabled={requestingOwnerId === req.trustedContactId}
                    >
                      {requestingOwnerId === req.trustedContactId && (
                        <Loader2 className="h-4 w-4 me-1 animate-spin" />
                      )}
                      {t("timeline.requestAgain", "Request Again")}
                    </Button>
                  </div>
                )}

                {/* Approved: the signed recovery envelope is ready */}
                {req.status === "approved" && (
                  <div className="mt-3">
                    <p className="text-xs text-muted-foreground">
                      {t(
                        "timeline.grantedHint",
                        "Access was approved and the encrypted recovery envelope is ready."
                      )}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
