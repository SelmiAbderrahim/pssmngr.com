// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { Sun, Moon, Monitor } from "lucide-react";
import { cn } from "@/utils/misc";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/ui/select";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

export const themes = ["light", "dark", "system"] as const;

export const useTheme = () => {
  // Start as "system" so the initial render matches server-prerendered HTML
  // (localStorage is unavailable during SSR, and reading it here would cause a
  // hydration mismatch). The persisted preference is adopted on mount below.
  const [currentTheme, setCurrentTheme] = useState<"light" | "dark" | "system">(
    "system",
  );
  const [initialized, setInitialized] = useState(false);

  // A similar script runs early via /init-fouc.js, loaded in <head> of index.html.
  useEffect(() => {
    if (!initialized) {
      // Adopt the stored preference after hydration (client only). The real
      // .dark class was already applied early by /init-fouc.js, so this only
      // syncs the switcher's selected value.
      const stored =
        typeof window === "undefined"
          ? null
          : (localStorage.theme as "light" | "dark" | "system" | undefined);
      if (stored === "light" || stored === "dark" || stored === "system") {
        setCurrentTheme(stored);
      }
      setInitialized(true);
      return;
    }
    if (currentTheme === "system") {
      localStorage.removeItem("theme");
    } else {
      localStorage.theme = currentTheme;
    }
    if (
      currentTheme === "dark" ||
      (currentTheme === "system" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches)
    ) {
      document.documentElement.classList.add("dark");
      document.documentElement.style.colorScheme = "dark";
    } else {
      document.documentElement.classList.remove("dark");
      document.documentElement.style.colorScheme = "light";
    }
  }, [currentTheme]);

  return [currentTheme, setCurrentTheme] as const;
};

export function ThemeSwitcher({ triggerClass }: { triggerClass?: string }) {
  const [currentTheme, setCurrentTheme] = useTheme();
  const { t } = useTranslation("common");
  
  return (
    <Select
      value={currentTheme}
      onValueChange={(theme) =>
        setCurrentTheme(theme as (typeof themes)[number])
      }
    >
      <SelectTrigger
        className={cn(
          "h-6 rounded border-primary/20 bg-secondary !px-2 hover:border-primary/40",
          triggerClass,
        )}
      >
        <div className="flex items-start gap-2">
          {currentTheme === "light" ? (
            <Sun className="h-[14px] w-[14px]" />
          ) : currentTheme === "dark" ? (
            <Moon className="h-[14px] w-[14px]" />
          ) : (
            <Monitor className="h-[14px] w-[14px]" />
          )}
          <span className="text-xs font-medium">
            {t(`theme.${currentTheme}`)}
          </span>
        </div>
      </SelectTrigger>
      <SelectContent>
        {themes.map((theme) => (
          <SelectItem
            key={theme}
            value={theme}
            className={`text-sm font-medium text-primary/60 ${theme === currentTheme && "text-primary"}`}
          >
            {t(`theme.${theme}`)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ThemeSwitcherHome() {
  const [, setCurrentTheme] = useTheme();
  const { t } = useTranslation("common");
  
  return (
    <div className="flex gap-3">
      {themes.map((theme) => (
        <button 
          key={theme} 
          name="theme" 
          onClick={() => setCurrentTheme(theme)}
          title={t(`theme.${theme}`)}
        >
          {theme === "light" ? (
            <Sun className="h-4 w-4 text-primary/80 hover:text-primary" />
          ) : theme === "dark" ? (
            <Moon className="h-4 w-4 text-primary/80 hover:text-primary" />
          ) : (
            <Monitor className="h-4 w-4 text-primary/80 hover:text-primary" />
          )}
        </button>
      ))}
    </div>
  );
}
