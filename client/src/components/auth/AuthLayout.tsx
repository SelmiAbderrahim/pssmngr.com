// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Authentication Layout Component
 *
 * A flexible layout wrapper for authentication pages with:
 * - Responsive split layout (mobile: full-screen form, desktop: branding + form)
 * - RTL support with logical properties (start/end instead of left/right)
 * - Optional back button navigation
 * - Customizable title and subtitle
 * - Design system compliance (STYLES.md)
 *
 * @module components/auth/AuthLayout
 */

import * as React from "react";
import { ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Logo } from "@/ui/logo";

/**
 * Props for AuthLayout component
 */
export interface AuthLayoutProps {
  /** Content to render inside the layout */
  children: React.ReactNode;
  /** Page title displayed in the header */
  title: string;
  /** Optional subtitle/description */
  subtitle?: string;
  /** Whether to show the back button */
  showBackButton?: boolean;
  /** Callback when back button is clicked */
  onBack?: () => void;
  /** Whether to show the logo */
  showLogo?: boolean;
  /** Optional footer content */
  footer?: React.ReactNode;
  /** Optional className for the card */
  className?: string;
  /** Card width variant */
  size?: "sm" | "md" | "lg";
}

/**
 * AuthLayout - Wrapper component for authentication pages
 *
 * Provides a responsive, accessible layout for all auth-related pages
 * with proper semantic structure, RTL support, and ARIA attributes.
 *
 * Responsive breakpoints:
 * - Mobile (<lg): Full-screen form, no branding panel
 * - Tablet (md): Centered form with moderate padding
 * - Desktop (lg+): Split layout with branding on start side, form on end side
 *
 * @example
 * ```tsx
 * <AuthLayout
 *   title="Welcome Back"
 *   subtitle="Sign in to continue"
 *   showBackButton
 *   onBack={() => navigate(-1)}
 * >
 *   <LoginForm />
 * </AuthLayout>
 * ```
 */
export function AuthLayout({
  children,
  title,
  subtitle,
  showBackButton = false,
  onBack,
  showLogo = true,
  footer,
  className,
  size = "md",
}: AuthLayoutProps): React.JSX.Element {
  const { t } = useTranslation("auth");
  const sizeClasses = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
  };

  return (
    <div className="min-h-screen flex" role="main" aria-label={t("layout.ariaLabel")}>
      {/* Branding side - hidden on mobile, visible on desktop */}
      <div className={cn(
        "hidden lg:flex lg:w-1/2",
        "bg-primary",
        "items-center justify-center",
        "relative overflow-hidden"
      )}>
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary to-primary/80" />

        {/* Grid pattern overlay */}
        <div className="base-grid absolute inset-0 opacity-20" />

        {/* Branding content */}
        <div className="relative z-10 text-center px-8 max-w-md">
          {showLogo && (
            <div className="flex justify-center mb-8">
              <Logo width={64} height={64} className="invert brightness-0" />
            </div>
          )}
          <h1 className="text-4xl font-bold text-primary-foreground mb-4">
            {t("common:app.name")}
          </h1>
          <p className="text-xl text-primary-foreground/90">
            {t("layout.brandSubtitle")}
          </p>
        </div>
      </div>

      {/* Form side - full width on mobile, half width on desktop */}
      <div className={cn(
        "w-full lg:w-1/2",
        "flex items-center justify-center",
        "px-4 sm:px-6 lg:px-8",
        "py-12",
        "bg-background",
        "relative"
      )}>
        {/* Background gradient - visible on mobile/tablet */}
        <div className="lg:hidden fixed inset-0 bg-gradient-to-t from-muted/50 to-transparent" />

        {/* Grid pattern overlay - visible on mobile/tablet */}
        <div className="lg:hidden base-grid fixed inset-0 opacity-30" />

        {/* Form container */}
        <div className={cn(
          "w-full relative z-10",
          sizeClasses[size]
        )}>
          <Card className={cn("shadow-lg", className)}>
            <CardHeader className="space-y-1 text-center">
              {/* Back button - RTL support with logical properties */}
              {showBackButton && (
                <div className="flex justify-start -ms-2 -mt-2 mb-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onBack}
                    className="text-muted-foreground hover:text-foreground"
                    aria-label={t("layout.goBack")}
                  >
                    <ArrowLeft className="me-2 h-4 w-4 rtl:scale-x-[-1]" />
                    {t("common:back")}
                  </Button>
                </div>
              )}

              {/* Logo - visible on mobile only (hidden on desktop where branding side shows) */}
              {showLogo && (
                <div className="flex justify-center mb-4 lg:hidden">
                  <Logo />
                </div>
              )}

              {/* Title */}
              <CardTitle className="text-2xl font-bold tracking-tight text-card-foreground">
                {title}
              </CardTitle>

              {/* Subtitle */}
              {subtitle && (
                <CardDescription className="text-muted-foreground">
                  {subtitle}
                </CardDescription>
              )}
            </CardHeader>

            <CardContent className="space-y-4">
              {children}
            </CardContent>

            {/* Footer - RTL support with logical properties */}
            {footer && (
              <div className="px-6 pb-6 pt-0">
                {footer}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

export default AuthLayout;
