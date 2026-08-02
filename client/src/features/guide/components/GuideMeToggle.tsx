// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Settings-screen switch. The way back once the floating launcher is hidden.
 */

import { useTranslation } from "react-i18next";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useGuide } from "../GuideProvider";

export const GuideMeToggle = () => {
  const { t } = useTranslation("guide");
  const { state, setEnabled } = useGuide();

  return (
    <div
      className="flex items-center justify-between gap-3 rounded-lg border bg-card p-4"
      data-testid="guide-me-toggle"
    >
      <div>
        <Label htmlFor="guide-me-toggle" className="text-sm font-medium">
          {t("toggle.label")}
        </Label>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("toggle.description")}
        </p>
        {state.error ? (
          <p role="alert" className="mt-1 text-sm font-medium text-destructive">
            {state.error}
          </p>
        ) : null}
      </div>
      <Switch
        id="guide-me-toggle"
        checked={state.enabled}
        disabled={state.saving}
        onCheckedChange={(checked) => setEnabled(checked)}
      />
    </div>
  );
};
