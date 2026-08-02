// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { cn } from "@/utils/misc";
import { useTranslation } from "react-i18next";

interface LogoProps {
  width?: number;
  height?: number;
  className?: string;
  [key: string]: unknown | undefined;
}

export function Logo({ width, height, className, ...args }: LogoProps) {
  const { t } = useTranslation("common");
  
  return (
    <div className={cn("relative", className)} style={{ width: width ?? 40, height: height ?? 40 }} {...args}>
      <img
        src="/branding/logo-mono-black.svg"
        alt={t("logo")}
        className="absolute inset-0 h-full w-full object-contain dark:hidden"
      />
      <img
        src="/branding/logo-mono-white.svg"
        alt={t("logo")}
        className="absolute inset-0 hidden h-full w-full object-contain dark:block"
      />
    </div>
  );
}
