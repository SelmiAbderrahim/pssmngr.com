// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface OrgSettingsFormProps {
  orgName: string;
  orgSlug: string;
  isOwnerOrAdmin: boolean;
  onSave: (name: string, slug: string) => Promise<void>;
}

export function OrgSettingsForm({
  orgName: initialName,
  orgSlug: initialSlug,
  isOwnerOrAdmin,
  onSave,
}: OrgSettingsFormProps) {
  const { t } = useTranslation(["organization", "common"]);
  const [orgName, setOrgName] = useState(initialName);
  const [orgSlug, setOrgSlug] = useState(initialSlug);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      await onSave(orgName.trim(), orgSlug.trim());
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="max-w-lg">
      <h2 className="text-lg font-semibold mb-4">
        {t("organization:settings.title")}
      </h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="org-name">
            {t("organization:settings.name")}
          </Label>
          <Input
            id="org-name"
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            maxLength={100}
            disabled={!isOwnerOrAdmin || isSaving}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="org-slug">
            {t("organization:settings.slug")}
          </Label>
          <Input
            id="org-slug"
            value={orgSlug}
            onChange={(e) => setOrgSlug(e.target.value)}
            maxLength={50}
            disabled={!isOwnerOrAdmin || isSaving}
          />
          <p className="text-xs text-muted-foreground">
            {t("organization:settings.slugHint")}
          </p>
        </div>
        {isOwnerOrAdmin && (
          <Button type="submit" disabled={isSaving} className="min-h-[44px]">
            {isSaving && (
              <Loader2 className="h-4 w-4 me-1 animate-spin" />
            )}
            {t("organization:settings.save")}
          </Button>
        )}
        {saveSuccess && (
          <p className="text-sm text-green-600 dark:text-green-400">
            {t("organization:settings.saved")}
          </p>
        )}
      </form>
    </div>
  );
}
