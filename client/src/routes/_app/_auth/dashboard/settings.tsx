// Copyright (c) 2026 Password Manager contributors
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/_app/_auth/dashboard/settings")({
  component: SettingsLayout,
});

function SettingsLayout() {
  const { t } = useTranslation("common");

  return (
    <div className="container mx-auto max-w-5xl p-4 sm:p-6">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl font-semibold sm:text-3xl">
          {t("settings.title", "Settings")}
        </h1>
        <p className="mt-2 text-muted-foreground">
          {t("settings.subtitle", "Manage your account and preferences")}
        </p>
      </div>

      <Outlet />
    </div>
  );
}
