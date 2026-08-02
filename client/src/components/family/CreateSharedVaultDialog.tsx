// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, FolderLock } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface CreateSharedVaultDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (name: string) => Promise<void>;
}

export function CreateSharedVaultDialog({ open, onOpenChange, onCreate }: CreateSharedVaultDialogProps) {
  const { t } = useTranslation("common");
  const [name, setName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setName("");
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

    const trimmed = name.trim();
    if (!trimmed) {
      setError(t("family.sharedVaults.nameRequired", "Please enter a vault name."));
      return;
    }
    if (trimmed.length > 64) {
      setError(t("family.sharedVaults.nameTooLong", "Vault name must be 64 characters or fewer."));
      return;
    }

    setIsSubmitting(true);
    try {
      await onCreate(trimmed);
      handleOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : typeof err === "object" && err && "message" in err ? String(err.message) : null;
      setError(message || t("family.sharedVaults.createError", "Failed to create shared vault."));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderLock className="h-5 w-5" />
            {t("family.sharedVaults.createTitle", "Create Shared Vault")}
          </DialogTitle>
          <DialogDescription>
            {t("family.sharedVaults.createDescription", "Create a vault that family members can access together.")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="vault-name">{t("family.sharedVaults.nameLabel", "Vault name")}</Label>
            <Input
              id="vault-name"
              placeholder={t("family.sharedVaults.namePlaceholder", "e.g. Streaming Services")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={64}
              autoFocus
              disabled={isSubmitting}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isSubmitting}>
              {t("actions.cancel", "Cancel")}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 me-1 animate-spin" />}
              {t("family.sharedVaults.createAction", "Create Vault")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
