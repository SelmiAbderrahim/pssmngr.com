// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { useTranslation } from "react-i18next";
import { Check, ChevronDown, Globe, Loader2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/ui/select";
import { languages, type SupportedLanguage } from "@/i18n";
import { useLanguage } from "@/providers/LanguageProvider";
import { cn } from "@/lib/utils";

export function LanguageSwitcher() {
  const { t } = useTranslation();
  const {
    language,
    languageInfo,
    changeLanguage,
    isSaving,
  } = useLanguage();

  // Convert languages object to array format for rendering
  const langs = Object.entries(languages).map(([code, info]) => ({
    text: info.name,
    value: code,
    flag: info.flag,
    dir: info.dir,
  }));

  const handleLanguageChange = async (value: string) => {
    await changeLanguage(value as SupportedLanguage);
  };

  return (
    <Select value={language} onValueChange={handleLanguageChange} disabled={isSaving}>
      <SelectTrigger
        className={cn(
          "h-11 w-auto min-w-11 gap-1.5 rounded-md sm:h-9 sm:min-w-[2.5rem]",
          "border-border/50 bg-background/50 backdrop-blur-sm",
          "px-2 sm:px-3",
          "hover:bg-accent hover:border-border",
          "focus:ring-1 focus:ring-ring/50",
          "transition-colors duration-150",
          "[&>svg:last-child]:hidden", // Hide default chevron
          isSaving && "opacity-70 cursor-wait"
        )}
        aria-label={t("language.select", "Select language")}
      >
        {/* Mobile: Flag only */}
        <span className="text-base sm:hidden" aria-hidden="true">
          {languageInfo?.flag}
        </span>

        {/* Desktop: Globe icon or Loader + Language name */}
        <div className="hidden items-center gap-2 sm:flex">
          {isSaving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-hidden="true" />
          ) : (
            <Globe className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          )}
          <span className="text-xs font-medium text-foreground/80">
            {languageInfo?.name}
          </span>
        </div>

        <ChevronDown
          className="h-3 w-3 shrink-0 text-muted-foreground/70"
          aria-hidden="true"
        />
      </SelectTrigger>

      <SelectContent
        align="end"
        className={cn(
          "min-w-[160px] rounded-lg",
          "border-border/50 bg-popover/95 backdrop-blur-md",
          "shadow-sm"
        )}
      >
        {langs.map(({ text, value, flag, dir }) => {
          const isActive = value === language;
          return (
            <SelectItem
              key={value}
              value={value}
              className={cn(
                "cursor-pointer rounded-md py-2.5 ps-3 pe-8",
                "text-sm font-medium",
                "focus:bg-accent focus:text-accent-foreground",
                "transition-colors duration-150",
                dir === "rtl" && "text-end",
                isActive && "bg-accent/50"
              )}
            >
              <div className="flex items-center gap-3" dir={dir}>
                <span className="text-base" aria-hidden="true">
                  {flag}
                </span>
                <span className="flex-1">{text}</span>
                {isActive && (
                  <Check
                    className="h-4 w-4 text-primary"
                    aria-hidden="true"
                  />
                )}
              </div>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
