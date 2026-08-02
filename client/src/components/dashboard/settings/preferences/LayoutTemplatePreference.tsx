// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Layout Template Preference Component
 *
 * Lets the user pick a UI layout template (vault presentation + density).
 * Persists via LayoutTemplateProvider (localStorage + cross-device DB sync).
 * Mirrors LanguagePreference.
 */

import { useTranslation } from "react-i18next";
import { LayoutGrid, Table, List, Check, Loader2 } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useLayoutTemplate } from "@/providers/LayoutTemplateProvider";
import {
  LAYOUT_TEMPLATES,
  LAYOUT_TEMPLATE_IDS,
  type LayoutTemplateId,
} from "@/config/templates";
import { cn } from "@/lib/utils";

const TEMPLATE_ICONS: Record<LayoutTemplateId, React.ElementType> = {
  default: LayoutGrid,
  compact: Table,
  list: List,
};

export function LayoutTemplatePreference() {
  const { t } = useTranslation("settings");
  const { template, templateConfig, changeTemplate, isSaving } =
    useLayoutTemplate();

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <LayoutGrid
            className="h-4 w-4 text-muted-foreground"
            aria-hidden="true"
          />
          <Label>{t("layoutTemplate.title", "Layout template")}</Label>
          {isSaving && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {t(
            "layoutTemplate.description",
            "Choose how your vault and content are laid out. Synced across your devices."
          )}
        </p>
      </div>

      <RadioGroup
        value={template}
        onValueChange={(value) => changeTemplate(value as LayoutTemplateId)}
        className="grid gap-3 sm:grid-cols-3"
        disabled={isSaving}
        aria-label={t("layoutTemplate.title", "Layout template")}
      >
        {LAYOUT_TEMPLATE_IDS.map((id) => {
          const cfg = LAYOUT_TEMPLATES[id];
          const Icon = TEMPLATE_ICONS[id];
          const isSelected = id === template;
          return (
            <div
              key={id}
              className={cn(
                "flex min-h-[44px] items-start gap-3 rounded-lg border p-4",
                "hover:bg-accent hover:text-accent-foreground",
                "focus-within:ring-2 focus-within:ring-ring transition-colors",
                isSelected && "border-primary bg-primary/5",
                isSaving && "opacity-70 cursor-wait"
              )}
            >
              <RadioGroupItem
                value={id}
                id={`tpl-${id}`}
                className="mt-1 shrink-0"
              />
              <Label
                htmlFor={`tpl-${id}`}
                className="flex flex-1 cursor-pointer flex-col gap-1"
              >
                <span className="flex items-center gap-2 font-medium">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {t(cfg.labelKey, id)}
                  {isSelected && (
                    <Check
                      className="ms-auto h-4 w-4 text-primary"
                      aria-hidden="true"
                    />
                  )}
                </span>
                <span className="text-xs text-muted-foreground">
                  {t(cfg.descKey, "")}
                </span>
              </Label>
            </div>
          );
        })}
      </RadioGroup>

      <p className="sr-only" aria-live="polite">
        {t(templateConfig.labelKey, template)}
      </p>
    </div>
  );
}

export default LayoutTemplatePreference;
