// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Settings, LogOut } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
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

interface FamilySettingsPanelProps {
  familyName: string;
  isOrganizer: boolean;
  isLoading: boolean;
  onUpdateName: (name: string) => Promise<void>;
  onLeaveFamily: () => Promise<void>;
}

export function FamilySettingsPanel({
  familyName,
  isOrganizer,
  isLoading,
  onUpdateName,
  onLeaveFamily,
}: FamilySettingsPanelProps) {
  const { t } = useTranslation("common");
  const [name, setName] = useState(familyName);
  const [isSaving, setIsSaving] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const hasChanges = name.trim() !== familyName;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    const trimmed = name.trim();
    if (!trimmed) {
      setError(t("family.settings.nameRequired", "Family name is required."));
      return;
    }

    setIsSaving(true);
    try {
      await onUpdateName(trimmed);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("family.settings.updateError", "Failed to update settings."));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleLeave() {
    setIsLeaving(true);
    try {
      await onLeaveFamily();
    } finally {
      setIsLeaving(false);
      setShowLeaveConfirm(false);
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-9 w-24" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-6">
        {isOrganizer && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <Settings className="h-5 w-5" />
                {t("family.settings.title", "Family Settings")}
              </CardTitle>
              <CardDescription>
                {t("family.settings.description", "Manage your family configuration.")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSave} className="space-y-4">
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                {success && (
                  <Alert>
                    <AlertDescription>{t("family.settings.saved", "Settings saved.")}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2">
                  <Label htmlFor="family-name">{t("family.settings.nameLabel", "Family name")}</Label>
                  <Input
                    id="family-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={64}
                    disabled={isSaving}
                  />
                </div>

                <Button type="submit" size="sm" disabled={isSaving || !hasChanges}>
                  {isSaving && <Loader2 className="h-4 w-4 me-1 animate-spin" />}
                  {t("actions.save", "Save")}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {!isOrganizer && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-semibold">
                {t("family.settings.leaveTitle", "Leave Family")}
              </CardTitle>
              <CardDescription>
                {t("family.settings.leaveDescription", "Leave this family. You will lose access to all shared vaults.")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setShowLeaveConfirm(true)}
              >
                <LogOut className="h-4 w-4 me-1 rtl:scale-x-[-1]" />
                {t("family.settings.leaveAction", "Leave Family")}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      <AlertDialog open={showLeaveConfirm} onOpenChange={setShowLeaveConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("family.settings.leaveConfirmTitle", "Leave Family?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "family.settings.leaveConfirmDescription",
                "You will lose access to all shared vaults and their contents. This action cannot be undone."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("actions.cancel", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleLeave}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isLeaving && <Loader2 className="h-4 w-4 me-1 animate-spin" />}
              {t("family.settings.confirmLeave", "Leave Family")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
