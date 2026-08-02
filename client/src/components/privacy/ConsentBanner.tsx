// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * GDPR Consent Banner Component
 *
 * Displays a cookie/analytics consent banner for GDPR/CCPA compliance.
 * Manages user consent preferences for analytics tracking.
 *
 * @module components/privacy/ConsentBanner
 */

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { X, Cookie, Shield, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  getAnalyticsConsent,
  setAnalyticsConsent,
  type ConsentPreferences,
} from "@/lib/consent";
import { updateGAConsent } from "@/lib/analytics/gtag";

interface ConsentBannerProps {
  /** Called when consent preferences are saved */
  onConsentChange?: (preferences: ConsentPreferences) => void;
  /** Custom className for the banner */
  className?: string;
}

export function ConsentBanner({
  onConsentChange,
  className,
}: ConsentBannerProps) {
  const { t } = useTranslation("common");
  const [isVisible, setIsVisible] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [preferences, setPreferences] = useState<ConsentPreferences>({
    analytics: false,
    functional: true, // Always required
  });

  // Check if consent has been given on mount
  useEffect(() => {
    const existingConsent = getAnalyticsConsent();
    if (!existingConsent.hasResponded) {
      // Show banner after a small delay for better UX
      const timer = setTimeout(() => setIsVisible(true), 1000);
      return () => clearTimeout(timer);
    }
    // Load existing preferences
    setPreferences(existingConsent);
    return undefined;
  }, []);

  const handleAcceptAll = () => {
    const newPreferences: ConsentPreferences = {
      analytics: true,
      functional: true,
      hasResponded: true,
      timestamp: Date.now(),
    };
    setAnalyticsConsent(newPreferences);
    updateGAConsent(true);
    setPreferences(newPreferences);
    setIsVisible(false);
    onConsentChange?.(newPreferences);
  };

  const handleRejectAll = () => {
    const newPreferences: ConsentPreferences = {
      analytics: false,
      functional: true, // Always keep functional
      hasResponded: true,
      timestamp: Date.now(),
    };
    setAnalyticsConsent(newPreferences);
    updateGAConsent(false);
    setPreferences(newPreferences);
    setIsVisible(false);
    onConsentChange?.(newPreferences);
  };

  const handleSavePreferences = () => {
    const newPreferences: ConsentPreferences = {
      ...preferences,
      hasResponded: true,
      timestamp: Date.now(),
    };
    setAnalyticsConsent(newPreferences);
    updateGAConsent(newPreferences.analytics);
    setIsVisible(false);
    onConsentChange?.(newPreferences);
  };

  if (!isVisible) {
    return null;
  }

  return (
    <div
      className={cn(
        "fixed inset-x-4 bottom-4 z-50 sm:inset-x-auto sm:end-4 sm:max-w-md",
        className
      )}
      role="dialog"
      aria-labelledby="consent-title"
      aria-describedby="consent-description"
    >
      <Card className="shadow-lg border-border">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <Cookie className="h-5 w-5 text-primary" aria-hidden="true" />
              <CardTitle id="consent-title" className="text-lg">
                {t("privacy.consent.title", "Cookie Preferences")}
              </CardTitle>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleRejectAll}
              aria-label={t("actions.close")}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <CardDescription id="consent-description">
            {t(
              "privacy.consent.description",
              "We use cookies to improve your experience and analyze site usage."
            )}
          </CardDescription>
        </CardHeader>

        {showDetails && (
          <CardContent className="pt-0 pb-4 space-y-4">
            {/* Functional cookies - always on */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <Label htmlFor="functional" className="text-sm font-medium">
                  {t("privacy.consent.functional", "Essential")}
                </Label>
              </div>
              <Switch
                id="functional"
                checked={true}
                disabled
                aria-describedby="functional-desc"
              />
            </div>
            <p id="functional-desc" className="text-xs text-muted-foreground ps-6">
              {t(
                "privacy.consent.functionalDesc",
                "Required for the site to function properly."
              )}
            </p>

            {/* Analytics cookies */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Settings className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <Label htmlFor="analytics" className="text-sm font-medium">
                  {t("privacy.consent.analytics", "Analytics")}
                </Label>
              </div>
              <Switch
                id="analytics"
                checked={preferences.analytics}
                onCheckedChange={(checked) =>
                  setPreferences((prev) => ({ ...prev, analytics: checked }))
                }
                aria-describedby="analytics-desc"
              />
            </div>
            <p id="analytics-desc" className="text-xs text-muted-foreground ps-6">
              {t(
                "privacy.consent.analyticsDesc",
                "Help us understand how you use our site to improve it."
              )}
            </p>

          </CardContent>
        )}

        <CardFooter className="flex-col gap-2 pt-0">
          {showDetails ? (
            <Button onClick={handleSavePreferences} className="w-full">
              {t("privacy.consent.savePreferences", "Save Preferences")}
            </Button>
          ) : (
            <>
              <div className="flex gap-2 w-full">
                <Button
                  variant="outline"
                  onClick={handleRejectAll}
                  className="flex-1"
                >
                  {t("privacy.consent.rejectAll", "Reject All")}
                </Button>
                <Button onClick={handleAcceptAll} className="flex-1">
                  {t("privacy.consent.acceptAll", "Accept All")}
                </Button>
              </div>
              <Button
                variant="link"
                onClick={() => setShowDetails(true)}
                className="text-sm"
              >
                {t("privacy.consent.customize", "Customize Preferences")}
              </Button>
            </>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}

export default ConsentBanner;
