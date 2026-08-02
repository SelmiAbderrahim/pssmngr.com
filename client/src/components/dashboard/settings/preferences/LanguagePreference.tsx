// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Language Preference Component
 *
 * Dedicated language selection for Settings page.
 * Provides more detailed UI than the compact language switcher.
 *
 * Features:
 * - Radio button grid showing all supported languages with flags
 * - Visual selection state with checkmark
 * - Loading indicator during save
 * - RTL-aware layout
 * - Touch-friendly targets (44px minimum)
 * - Sync note explaining cross-device sync
 */

import { useTranslation } from "react-i18next";
import { Globe, Check, Loader2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/providers/LanguageProvider";
import { languages, type SupportedLanguage } from "@/i18n";
import { cn } from "@/lib/utils";

export function LanguagePreference() {
  const { t } = useTranslation("settings");
  const {
    language,
    changeLanguage,
    supportedLanguages,
    isSaving,
    isLoading,
  } = useLanguage();

  const handleChange = async (value: string) => {
    await changeLanguage(value as SupportedLanguage);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl font-bold">
          <Globe className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          {t("preferences.language.title", "Language")}
          {(isSaving || isLoading) && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </CardTitle>
        <CardDescription>
          {t(
            "preferences.language.description",
            "Select your preferred language for the dashboard"
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <RadioGroup
          value={language}
          onValueChange={handleChange}
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
          disabled={isSaving}
        >
          {supportedLanguages.map((code) => {
            const info = languages[code];
            const isSelected = code === language;

            return (
              <div
                key={code}
                className={cn(
                  "flex min-h-[44px] items-center gap-3 rounded-lg border p-4",
                  "hover:bg-accent hover:text-accent-foreground",
                  "focus-within:ring-2 focus-within:ring-ring",
                  "transition-colors",
                  isSelected && "border-primary bg-primary/5",
                  isSaving && "opacity-70 cursor-wait",
                  info.dir === "rtl" && "text-end"
                )}
              >
                <RadioGroupItem
                  value={code}
                  id={`lang-${code}`}
                  className="shrink-0"
                />
                <Label
                  htmlFor={`lang-${code}`}
                  className={cn(
                    "flex flex-1 cursor-pointer items-center gap-3",
                    info.dir === "rtl" && "text-end"
                  )}
                >
                  <span className="text-xl" aria-hidden="true">
                    {info.flag}
                  </span>
                  <span className="flex-1 font-medium">{info.name}</span>
                  {isSelected && (
                    <Check
                      className="h-4 w-4 text-primary"
                      aria-hidden="true"
                    />
                  )}
                </Label>
              </div>
            );
          })}
        </RadioGroup>

        <p className="mt-4 text-sm text-muted-foreground">
          {t(
            "preferences.language.syncNote",
            "Your language preference will be saved and synced across all your devices."
          )}
        </p>
      </CardContent>
    </Card>
  );
}

export default LanguagePreference;
