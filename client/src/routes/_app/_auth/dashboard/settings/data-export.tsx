// Copyright (c) 2026 Password Manager contributors
// Legacy path — the GDPR account-data export lives in the unified
// Data settings surface (ExportSection). This file exists only to keep
// bookmarks/emails alive; it never renders.
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/settings/data-export",
)({
  beforeLoad: () => {
    throw redirect({
      to: "/dashboard/settings/import-export",
      search: { tab: "export" },
      replace: true,
    });
  },
});
