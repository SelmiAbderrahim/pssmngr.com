// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ShieldCheck, ShieldAlert, Clock, CheckCircle, XCircle, Loader2, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import type { RecoveryRequest, RecoveryStatus } from "@/types/family";

interface RecoveryPanelProps {
  isOrganizer: boolean;
  requests: RecoveryRequest[];
  memberRecoveryStatus: RecoveryRequest | null;
  isLoading: boolean;
  onRequestRecovery: () => Promise<void>;
  onApproveRecovery: (requestId: string) => Promise<void>;
  onRejectRecovery: (requestId: string) => Promise<void>;
}

const STATUS_CONFIG: Record<RecoveryStatus, { icon: typeof Clock; label: string; className: string }> = {
  pending: {
    icon: Clock,
    label: "Pending",
    className: "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800",
  },
  approved: {
    icon: CheckCircle,
    label: "Approved",
    className: "bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800",
  },
  completing: {
    icon: Loader2,
    label: "Completing",
    className: "bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800",
  },
  completed: {
    icon: CheckCircle,
    label: "Completed",
    className: "bg-green-50 text-green-800 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800",
  },
  rejected: {
    icon: XCircle,
    label: "Rejected",
    className: "bg-red-50 text-red-800 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800",
  },
  expired: {
    icon: AlertTriangle,
    label: "Expired",
    className: "bg-muted text-muted-foreground border-border",
  },
};

function formatDate(dateStr: string, locale: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function recoveryTimeline(
  request: RecoveryRequest,
  t: (key: string, fallback: string) => string,
) {
  const approved = ["approved", "completing", "completed"].includes(request.status);
  const completed = request.status === "completed";
  const denied = request.status === "rejected" || request.status === "expired";

  return [
    {
      key: "trustedContact",
      label: t("family.recovery.timeline.trustedContact", "Trusted contact requested"),
      state: "done" as const,
    },
    {
      key: "waitingPeriod",
      label: t("family.recovery.timeline.waitingPeriod", "Waiting period and organizer review"),
      state: request.status === "pending" ? "current" as const : "done" as const,
    },
    {
      key: "approval",
      label: denied
        ? t("family.recovery.timeline.denied", "Approval denied or expired")
        : t("family.recovery.timeline.approval", "Approval granted"),
      state: denied ? "blocked" as const : approved ? "done" as const : "upcoming" as const,
    },
    {
      key: "finalAccess",
      label: t("family.recovery.timeline.finalAccess", "Final access after new keys are confirmed"),
      state: completed
        ? "done" as const
        : request.status === "completing"
          ? "current" as const
          : denied
            ? "blocked" as const
            : "upcoming" as const,
    },
  ];
}

function RecoveryTimeline({ request }: { request: RecoveryRequest }) {
  const { t } = useTranslation("common");
  const steps = recoveryTimeline(request, t);

  return (
    <ol className="mt-3 grid gap-2 text-xs">
      {steps.map((step) => {
        const stateClass =
          step.state === "done"
            ? "border-green-200 bg-green-50 text-green-900 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300"
            : step.state === "current"
              ? "border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300"
              : step.state === "blocked"
                ? "border-red-200 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300"
                : "border-border bg-muted/40 text-muted-foreground";

        return (
          <li key={step.key} className={`rounded-md border px-3 py-2 ${stateClass}`}>
            {step.label}
          </li>
        );
      })}
    </ol>
  );
}

export function RecoveryPanel({
  isOrganizer,
  requests,
  memberRecoveryStatus,
  isLoading,
  onRequestRecovery,
  onApproveRecovery,
  onRejectRecovery,
}: RecoveryPanelProps) {
  const { t, i18n } = useTranslation("common");
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [isRequesting, setIsRequesting] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ id: string; action: "approve" | "reject" } | null>(null);

  async function handleRequestRecovery() {
    setIsRequesting(true);
    try {
      await onRequestRecovery();
    } finally {
      setIsRequesting(false);
    }
  }

  async function handleConfirmAction() {
    if (!confirmAction) return;
    const action = confirmAction;
    setConfirmAction(null);
    setActionLoadingId(action.id);
    try {
      if (action.action === "approve") {
        await onApproveRecovery(action.id);
      } else {
        await onRejectRecovery(action.id);
      }
    } finally {
      setActionLoadingId(null);
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-64 mt-1" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  // Member view: show own recovery status
  if (!isOrganizer) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            {t("family.recovery.title", "Account Recovery")}
          </CardTitle>
          <CardDescription>
            {t("family.recovery.memberDescription", "Request your family organizer to help recover your account if you lose access.")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {memberRecoveryStatus ? (
            <div className="rounded-lg border p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">
                    {t("family.recovery.yourRequest", "Your recovery request")}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t("family.recovery.requested", "Requested")} {formatDate(memberRecoveryStatus.requestedAt, i18n.language)}
                  </p>
                </div>
                {(() => {
                  const config = STATUS_CONFIG[memberRecoveryStatus.status];
                  const StatusIcon = config.icon;
                  return (
                    <Badge variant="outline" className={`gap-1 ${config.className}`}>
                      <StatusIcon className={`h-3 w-3 ${memberRecoveryStatus.status === "completing" ? "animate-spin" : ""}`} />
                      {t(`family.recovery.status.${memberRecoveryStatus.status}`, config.label)}
                    </Badge>
                  );
                })()}
              </div>
              {memberRecoveryStatus.status === "approved" && (
                <p className="text-sm text-muted-foreground mt-3">
                  {t("family.recovery.approvedHint", "Your recovery has been approved. Follow the prompts to set up new keys.")}
                </p>
              )}
              {memberRecoveryStatus.status === "expired" && (
                <p className="text-sm text-muted-foreground mt-3">
                  {t("family.recovery.expiredHint", "This request expired. Submit a new recovery request if you still need help.")}
                </p>
              )}
              {memberRecoveryStatus.status === "rejected" && (
                <p className="text-sm text-muted-foreground mt-3">
                  {t("family.recovery.rejectedHint", "This request was denied. You can submit a new request if your situation changed.")}
                </p>
              )}
              {memberRecoveryStatus.status === "completed" && (
                <p className="text-sm text-muted-foreground mt-3">
                  {t("family.recovery.completedHint", "Recovery is complete. Your shared-vault access uses the new wrapped keys.")}
                </p>
              )}
              <RecoveryTimeline request={memberRecoveryStatus} />
              {memberRecoveryStatus.expiresAt && (
                <p className="text-xs text-muted-foreground mt-2">
                  {t("family.recovery.expires", "Expires")} {formatDate(memberRecoveryStatus.expiresAt, i18n.language)}
                </p>
              )}
            </div>
          ) : (
            <div className="text-center py-6">
              <ShieldAlert className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground mb-4">
                {t("family.recovery.noActiveRequest", "No active recovery request.")}
              </p>
              <Button onClick={handleRequestRecovery} disabled={isRequesting}>
                {isRequesting && <Loader2 className="h-4 w-4 me-1 animate-spin" />}
                {t("family.recovery.requestRecovery", "Request Recovery")}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // Organizer view: manage recovery requests
  const pendingRequests = requests.filter((r) => r.status === "pending" || r.status === "approved" || r.status === "completing");
  const pastRequests = requests.filter((r) => r.status === "completed" || r.status === "rejected" || r.status === "expired");

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            {t("family.recovery.title", "Account Recovery")}
          </CardTitle>
          <CardDescription>
            {t("family.recovery.organizerDescription", "Review and manage recovery requests from family members.")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pendingRequests.length === 0 && pastRequests.length === 0 ? (
            <div className="text-center py-6">
              <ShieldCheck className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">
                {t("family.recovery.noRequests", "No recovery requests.")}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {pendingRequests.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">
                    {t("family.recovery.activeRequests", "Active Requests")}
                  </p>
                  {pendingRequests.map((req) => {
                    const config = STATUS_CONFIG[req.status];
                    const StatusIcon = config.icon;
                    return (
                      <div key={req.id} className="rounded-lg border p-4">
                        <div className="flex items-center justify-between">
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">
                              {req.requesterName || req.requesterEmail || req.requesterId}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {formatDate(req.requestedAt, i18n.language)}
                            </p>
                          </div>
                          <Badge variant="outline" className={`gap-1 shrink-0 ${config.className}`}>
                            <StatusIcon className={`h-3 w-3 ${req.status === "completing" ? "animate-spin" : ""}`} />
                            {t(`family.recovery.status.${req.status}`, config.label)}
                          </Badge>
                        </div>
                        {req.status === "pending" && (
                          <div className="flex gap-2 mt-3">
                            <Button
                              size="sm"
                              onClick={() => setConfirmAction({ id: req.id, action: "approve" })}
                              disabled={actionLoadingId === req.id}
                            >
                              {actionLoadingId === req.id && <Loader2 className="h-4 w-4 me-1 animate-spin" />}
                              {t("family.recovery.approve", "Approve")}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setConfirmAction({ id: req.id, action: "reject" })}
                              disabled={actionLoadingId === req.id}
                            >
                              {t("family.recovery.reject", "Reject")}
                            </Button>
                          </div>
                        )}
                        {req.expiresAt && (
                          <p className="text-xs text-muted-foreground mt-2">
                            {t("family.recovery.expires", "Expires")} {formatDate(req.expiresAt, i18n.language)}
                          </p>
                        )}
                        <RecoveryTimeline request={req} />
                      </div>
                    );
                  })}
                </div>
              )}

              {pastRequests.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">
                    {t("family.recovery.pastRequests", "Past Requests")}
                  </p>
                  {pastRequests.map((req) => {
                    const config = STATUS_CONFIG[req.status];
                    const StatusIcon = config.icon;
                    return (
                      <div key={req.id} className="rounded-lg border p-3 opacity-70">
                        <div className="flex items-center justify-between">
                          <div className="min-w-0">
                            <p className="text-sm truncate">
                              {req.requesterName || req.requesterEmail || req.requesterId}
                            </p>
                            <p className="text-xs text-muted-foreground">{formatDate(req.requestedAt, i18n.language)}</p>
                          </div>
                          <Badge variant="outline" className={`gap-1 shrink-0 ${config.className}`}>
                            <StatusIcon className="h-3 w-3" />
                            {t(`family.recovery.status.${req.status}`, config.label)}
                          </Badge>
                        </div>
                        <RecoveryTimeline request={req} />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!confirmAction} onOpenChange={() => setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.action === "approve"
                ? t("family.recovery.approveTitle", "Approve Recovery")
                : t("family.recovery.rejectTitle", "Reject Recovery")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.action === "approve"
                ? t("family.recovery.approveDescription", "This will allow the member to generate new keys and regain access to shared vaults. You will need to re-wrap vault keys for them.")
                : t("family.recovery.rejectDescription", "This will deny the recovery request. The member can submit a new request later.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("actions.cancel", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmAction}
              className={confirmAction?.action === "reject" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
            >
              {actionLoadingId && <Loader2 className="h-4 w-4 me-1 animate-spin" />}
              {confirmAction?.action === "approve"
                ? t("family.recovery.confirmApprove", "Approve")
                : t("family.recovery.confirmReject", "Reject")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
