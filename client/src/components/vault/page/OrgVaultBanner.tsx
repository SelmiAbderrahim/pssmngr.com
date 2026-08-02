// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * OrgVaultBanner
 *
 * Non-personal workspace banner surfaces: resolve error, first-time
 * "set up shared vault" prompt, member-pending notice, and the
 * owner-side "grant pending members" panel. Extracted verbatim from
 * vault.tsx.
 */

import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Loader2, ShieldCheck } from "lucide-react";
import type { OrgVaultAccess } from "@/services/org-shared-vault";

type OrgVaultState =
  | { kind: "none"; canManage: boolean }
  | { kind: "pending" }
  | { kind: "ready"; canManage: boolean; access: OrgVaultAccess };

interface OrgVaultBannerProps {
  isPersonalWorkspace: boolean;
  isUnlocked: boolean;
  orgVault: OrgVaultState | null;
  orgResolveError: unknown;
  orgSetupBusy: boolean;
  orgGrantMessage: string | null;
  onRunOrgResolve: () => void;
  onSetupSharedVault: () => void;
  onGrantPendingMembers: () => void;
}

export function OrgVaultBanner({
  isPersonalWorkspace,
  isUnlocked,
  orgVault,
  orgResolveError,
  orgSetupBusy,
  orgGrantMessage,
  onRunOrgResolve,
  onSetupSharedVault,
  onGrantPendingMembers,
}: OrgVaultBannerProps) {
  const { t } = useTranslation();
  if (isPersonalWorkspace || !isUnlocked) return null;

  if (!orgVault && orgResolveError) {
    return (
      <div className="mb-4">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <span>
              {t(
                "vault.org.resolveError",
                "Couldn't check your shared vault access.",
              )}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={onRunOrgResolve}
              className="shrink-0"
            >
              {t("vault.org.retry", "Retry")}
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!orgVault) return null;

  return (
    <div className="mb-4">
      {orgVault.kind === "none" && orgVault.canManage && (
        <Card className="rounded-lg border bg-card shadow-sm">
          <CardContent className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 py-4">
            <div>
              <h3 className="font-semibold">
                {t("vault.org.setupTitle", "Share this organization's vault")}
              </h3>
              <p className="text-sm text-muted-foreground">
                {t(
                  "vault.org.setupDesc",
                  "Create a shared vault so members see the same items. Your existing items in this organization will be imported, and members who have signed in get access automatically.",
                )}
              </p>
            </div>
            <Button
              onClick={onSetupSharedVault}
              disabled={orgSetupBusy}
              className="min-h-[44px] shrink-0"
            >
              {orgSetupBusy ? (
                <Loader2 className="h-4 w-4 me-2 animate-spin" />
              ) : (
                <ShieldCheck className="h-4 w-4 me-2" />
              )}
              {t("vault.org.setupButton", "Set up shared vault")}
            </Button>
          </CardContent>
        </Card>
      )}
      {orgVault.kind === "none" && !orgVault.canManage && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {t(
              "vault.org.noneMember",
              "This organization doesn't have a shared vault yet.",
            )}
          </AlertDescription>
        </Alert>
      )}
      {orgVault.kind === "pending" && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <span>
              {t(
                "vault.org.pending",
                "You'll see the shared items once an organization admin grants you access. Make sure you've signed in on this device first.",
              )}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={onRunOrgResolve}
              className="shrink-0"
            >
              {t("vault.org.checkAgain", "Check again")}
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {orgVault.kind === "ready" && orgVault.canManage && (
        <Card className="rounded-lg border bg-card shadow-sm">
          <CardContent className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 py-4">
            <div>
              <h3 className="font-semibold">
                {t("vault.org.grantTitle", "Grant member access")}
              </h3>
              <p className="text-sm text-muted-foreground">
                {orgGrantMessage ??
                  t(
                    "vault.org.grantDesc",
                    "Wrap the shared vault key for organization members who signed in after setup.",
                  )}
              </p>
            </div>
            <Button
              onClick={onGrantPendingMembers}
              disabled={orgSetupBusy}
              className="min-h-[44px] shrink-0"
            >
              {orgSetupBusy ? (
                <Loader2 className="h-4 w-4 me-2 animate-spin" />
              ) : (
                <ShieldCheck className="h-4 w-4 me-2" />
              )}
              {t("vault.org.grantButton", "Grant access")}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
