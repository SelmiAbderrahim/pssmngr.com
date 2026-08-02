// Copyright (c) 2026 Password Manager contributors
import { useState, useCallback } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ShieldCheck, ShieldOff } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSession } from "@/lib/auth/auth-client";
import {
  TwoFactorSetup,
  TwoFactorDisable,
  BackupCodes,
  ActiveSessions,
  TrustedDevices,
  Passkeys,
} from "@/components/dashboard/settings/security";

export const Route = createFileRoute("/_app/_auth/dashboard/settings/security")({
  component: SecuritySettingsPage,
});

function SecuritySettingsPage() {
  const { t } = useTranslation("settings");
  const { data: session } = useSession();
  const [showSetup, setShowSetup] = useState(false);

  const twoFactorEnabled = session?.user?.twoFactorEnabled ?? false;

  const handleSetupComplete = useCallback(() => {
    setShowSetup(false);
  }, []);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold">
        {t("security.title", "Security")}
      </h2>

      {/* Two-Factor Authentication Section */}
      {showSetup ? (
        <TwoFactorSetup
          onComplete={handleSetupComplete}
          onCancel={() => setShowSetup(false)}
        />
      ) : (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {twoFactorEnabled ? (
                  <ShieldCheck className="h-5 w-5 text-green-600" />
                ) : (
                  <ShieldOff className="h-5 w-5 text-muted-foreground" />
                )}
                <CardTitle className="text-lg">
                  {t("security.twoFactor.title", "Two-Factor Authentication")}
                </CardTitle>
              </div>
              <Badge
                variant={twoFactorEnabled ? "secondary" : "outline"}
                className={
                  twoFactorEnabled
                    ? "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300"
                    : ""
                }
              >
                {twoFactorEnabled
                  ? t("security.twoFactor.enabled", "Enabled")
                  : t("security.twoFactor.disabled", "Disabled")}
              </Badge>
            </div>
            <CardDescription>
              {t(
                "security.twoFactor.description",
                "Add an extra layer of security to your account by requiring a verification code from your authenticator app."
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {twoFactorEnabled ? (
              <TwoFactorDisable
                onDisabled={() => {}}
                trigger={
                  <Button variant="outline" className="min-h-[44px]">
                    {t("security.twoFactor.disable", "Disable 2FA")}
                  </Button>
                }
              />
            ) : (
              <Button onClick={() => setShowSetup(true)} className="min-h-[44px]">
                {t("security.twoFactor.enable", "Enable 2FA")}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Backup Codes (only when 2FA is enabled) */}
      {twoFactorEnabled && !showSetup && <BackupCodes />}

      {/* Passkeys */}
      <Passkeys />

      {/* Trusted Devices */}
      <TrustedDevices />

      {/* Active Sessions */}
      <ActiveSessions />

    </div>
  );
}
