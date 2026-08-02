// Copyright (c) 2026 Password Manager contributors
import { useCallback, useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Upload, Download } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ImportWizard } from "@/components/import-export/ImportWizard";
import { ExportSection } from "@/components/import-export/ExportSection";
import { trpcQuery } from "@/lib/api/trpc";

type TabState = "import" | "export";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/settings/import-export"
)({
  component: ImportExportSettingsPage,
  validateSearch: (search: Record<string, unknown>) => ({
    tab: (search.tab as TabState) || "import",
  }),
});

function ImportExportSettingsPage() {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const { tab } = Route.useSearch();

  // Resolve the user's current vault id at runtime (mirrors the vault page).
  const [vaultId, setVaultId] = useState<string | null>(null);
  const [vaultLoading, setVaultLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const vaults = await trpcQuery<Array<{ id: string }>>("vault", "list");
        if (!cancelled) setVaultId(vaults[0]?.id ?? null);
      } catch {
        if (!cancelled) setVaultId(null);
      } finally {
        if (!cancelled) setVaultLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleTabChange = useCallback(
    (newTab: string) => {
      navigate({
        to: "/dashboard/settings/import-export",
        search: { tab: newTab as TabState },
        replace: true,
      });
    },
    [navigate]
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">
          {t("importExport.title", "Import / Export")}
        </h2>
        <p className="text-muted-foreground mt-1">
          {t(
            "importExport.subtitle",
            "Import credentials from other password managers or export your vault."
          )}
        </p>
      </div>

      <Tabs value={tab} onValueChange={handleTabChange}>
        <TabsList className="mb-6">
          <TabsTrigger value="import" className="gap-1.5">
            <Upload className="h-4 w-4" />
            <span className="hidden sm:inline">
              {t("importExport.tabs.import", "Import")}
            </span>
          </TabsTrigger>
          <TabsTrigger value="export" className="gap-1.5">
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">
              {t("importExport.tabs.export", "Export")}
            </span>
          </TabsTrigger>
        </TabsList>

        {vaultLoading ? (
          <p className="text-sm text-muted-foreground">
            {t("common.loading", "Loading...")}
          </p>
        ) : vaultId ? (
          <>
            <TabsContent value="import">
              <ImportWizard vaultId={vaultId} />
            </TabsContent>

            <TabsContent value="export">
              <ExportSection vaultId={vaultId} />
            </TabsContent>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t("importExport.noVault", "No vault found.")}
          </p>
        )}
      </Tabs>
    </div>
  );
}
