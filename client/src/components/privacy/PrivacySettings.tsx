// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Privacy Settings Component
 *
 * Settings panel for managing privacy preferences and analytics opt-out.
 * Integrates with the consent management system for GDPR/CCPA compliance.
 *
 * @module components/privacy/PrivacySettings
 */

import { useTranslation } from "react-i18next";
import { Shield, BarChart3 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useAnalyticsConsent } from "@/hooks/useAnalyticsConsent";

export function PrivacySettings() {
  const { t } = useTranslation("common");
  const {
    preferences,
    updateConsent,
  } = useAnalyticsConsent();

  const handleAnalyticsToggle = (enabled: boolean) => {
    updateConsent({ analytics: enabled });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" aria-hidden="true" />
          <CardTitle>{t("privacy.settings.title")}</CardTitle>
        </div>
        <CardDescription>{t("privacy.settings.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Analytics Tracking Toggle */}
        <div className="flex items-center justify-between">
          <div className="flex items-start gap-3">
            <BarChart3 className="h-5 w-5 text-muted-foreground mt-0.5" aria-hidden="true" />
            <div className="space-y-1">
              <Label
                htmlFor="analytics-tracking"
                className="text-sm font-medium"
              >
                {t("privacy.settings.analyticsTracking")}
              </Label>
              <p className="text-sm text-muted-foreground">
                {t("privacy.settings.analyticsTrackingDesc")}
              </p>
            </div>
          </div>
          <Switch
            id="analytics-tracking"
            checked={preferences?.analytics ?? false}
            onCheckedChange={handleAnalyticsToggle}
          />
        </div>

      </CardContent>
    </Card>
  );
}

export default PrivacySettings;
