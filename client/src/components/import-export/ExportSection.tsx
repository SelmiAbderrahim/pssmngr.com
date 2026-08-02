// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Export Section Component
 *
 * Three export options:
 *   1. Plaintext CSV/JSON
 *   2. Encrypted vault export (.pssmngr)
 *   3. Encrypted account data export (GDPR bundle; moved from data-export.tsx)
 *
 * Every export trigger uses `SensitiveActionGate` and requires a fresh master
 * password verification before any data is written.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Download,
  FileArchive,
  FileJson,
  FileText,
  Loader2,
  Lock,
  Shield,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { SensitiveActionGate } from "@/components/vault/SensitiveActionGate";
import { apiConfig } from "@/lib/api/config";
import { trpcMutation, trpcQuery } from "@/lib/api/trpc";
import {
  exportEncrypted,
  exportPlaintextCsv,
  exportPlaintextJson,
} from "@/services/export";
import { PlaintextWarningDialog } from "./PlaintextWarningDialog";

interface ExportSectionProps {
  vaultId: string;
}

type ExportStatus = "idle" | "exporting" | "done" | "error";

type AccountExportStatus =
  "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "EXPIRED" | "REVOKED";

type AccountExportFormat = "JSON" | "CSV" | "BOTH";

interface AccountExportRow {
  id: string;
  status: AccountExportStatus;
  requestedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  expiresAt: string | null;
  bundleSizeBytes: number;
  downloadCount: number;
  requestedFormat: AccountExportFormat;
  errorMessage: string;
}

const ACCOUNT_EXPORT_POLL_MS = 4000;

function formatBytes(n: number): string {
  if (!n || n <= 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

function accountStatusClass(s: AccountExportStatus): string {
  switch (s) {
    case "SUCCEEDED":
      return "bg-green-50 text-green-900 border-green-200 dark:bg-green-900/20 dark:text-green-300";
    case "FAILED":
      return "border-destructive/40 text-destructive";
    case "EXPIRED":
    case "REVOKED":
      return "text-muted-foreground";
    default:
      return "";
  }
}

function accountDownloadUrl(id: string): string {
  return `${apiConfig.baseUrl}/data-export/download/${id}`;
}

export function ExportSection({ vaultId }: ExportSectionProps) {
  const { t } = useTranslation(["common", "settings"]);
  const [encryptedStatus, setEncryptedStatus] = useState<ExportStatus>("idle");
  const [encryptedError, setEncryptedError] = useState<string | null>(null);

  const handleEncryptedExport = useCallback(async () => {
    setEncryptedStatus("exporting");
    setEncryptedError(null);
    try {
      await exportEncrypted(vaultId);
      setEncryptedStatus("done");
      setTimeout(() => setEncryptedStatus("idle"), 3000);
    } catch (err) {
      setEncryptedError(
        err instanceof Error
          ? err.message
          : t("importExport.export.error.exportFailed", "Export failed"),
      );
      setEncryptedStatus("error");
    }
  }, [vaultId, t]);

  const handleCsvExport = useCallback(async () => {
    await exportPlaintextCsv(vaultId);
  }, [vaultId]);

  const handleJsonExport = useCallback(async () => {
    await exportPlaintextJson(vaultId);
  }, [vaultId]);

  // ── Encrypted account data export (moved from data-export.tsx) ─────
  const [accountRows, setAccountRows] = useState<AccountExportRow[]>([]);
  const [accountLoading, setAccountLoading] = useState(true);
  const [accountCreating, setAccountCreating] = useState(false);
  const [accountFormat, setAccountFormat] =
    useState<AccountExportFormat>("BOTH");

  const accountInFlight = useMemo(
    () =>
      accountRows.some((r) => r.status === "PENDING" || r.status === "RUNNING"),
    [accountRows],
  );

  const refreshAccountRows = useCallback(async () => {
    try {
      const data = await trpcQuery<AccountExportRow[]>("dataExport", "list");
      setAccountRows(Array.isArray(data) ? data : []);
    } catch {
      // best-effort — surface whatever we already have
    } finally {
      setAccountLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshAccountRows();
  }, [refreshAccountRows]);

  useEffect(() => {
    if (!accountInFlight) return;
    const id = window.setInterval(() => {
      void refreshAccountRows();
    }, ACCOUNT_EXPORT_POLL_MS);
    return () => window.clearInterval(id);
  }, [accountInFlight, refreshAccountRows]);

  const handleAccountCreate = useCallback(async () => {
    setAccountCreating(true);
    try {
      await trpcMutation<{ requestId: string }>("dataExport", "create", {
        format: accountFormat,
      });
      toast.success(t("dataExport.toast.created", { ns: "settings" }));
      await refreshAccountRows();
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string };
      if (e?.code === "TOO_MANY_REQUESTS") {
        toast.error(t("dataExport.toast.rateLimited", { ns: "settings" }));
      } else if (e?.code === "CONFLICT") {
        toast.warning(t("dataExport.inFlight", { ns: "settings" }));
      } else {
        toast.error(t("dataExport.toast.createError", { ns: "settings" }));
      }
    } finally {
      setAccountCreating(false);
    }
  }, [accountFormat, refreshAccountRows, t]);

  const handleAccountRevoke = useCallback(
    async (id: string) => {
      try {
        await trpcMutation<{ success: boolean }>("dataExport", "revoke", {
          requestId: id,
        });
        toast.success(t("dataExport.toast.revoked", { ns: "settings" }));
        await refreshAccountRows();
      } catch {
        toast.error(t("dataExport.toast.revokeError", { ns: "settings" }));
      }
    },
    [refreshAccountRows, t],
  );

  return (
    <div className="space-y-4">
      {/* Option 1: Plaintext CSV/JSON */}
      <Card data-testid="export-option-plaintext">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
            <CardTitle className="text-lg">
              {t("importExport.export.plaintext.title", "Plaintext Export")}
            </CardTitle>
          </div>
          <CardDescription>
            {t(
              "importExport.export.plaintext.description",
              "Export as unencrypted CSV or JSON. Use these formats only for importing into another password manager.",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex items-start gap-2 rounded-md border border-yellow-500/50 bg-yellow-500/5 p-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-600 dark:text-yellow-400" />
            <span>
              {t(
                "importExport.export.plaintext.warning",
                "These files contain your passwords in plaintext. Anyone with access to the file can read them. Delete after use.",
              )}
            </span>
          </div>

          <div className="flex flex-wrap gap-3">
            <SensitiveActionGate action="export">
              <PlaintextWarningDialog
                format="csv"
                onConfirm={handleCsvExport}
                trigger={
                  <Button variant="outline" className="min-h-[44px]">
                    <FileText className="h-4 w-4 me-1" />
                    {t("importExport.export.plaintext.csv", "Export CSV")}
                  </Button>
                }
              />
            </SensitiveActionGate>
            <SensitiveActionGate action="export">
              <PlaintextWarningDialog
                format="json"
                onConfirm={handleJsonExport}
                trigger={
                  <Button variant="outline" className="min-h-[44px]">
                    <FileJson className="h-4 w-4 me-1" />
                    {t("importExport.export.plaintext.json", "Export JSON")}
                  </Button>
                }
              />
            </SensitiveActionGate>
          </div>
        </CardContent>
      </Card>

      {/* Option 2: Encrypted vault export */}
      <Card data-testid="export-option-encrypted-vault">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">
                {t("importExport.export.encrypted.title", "Encrypted Export")}
              </CardTitle>
            </div>
            <Badge
              variant="secondary"
              className="bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300"
            >
              <Shield className="h-3 w-3 me-1" />
              {t("importExport.export.encrypted.recommended", "Recommended")}
            </Badge>
          </div>
          <CardDescription>
            {t(
              "importExport.export.encrypted.description",
              "Export your vault as an encrypted .pssmngr file. This file can only be opened with your master password.",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <SensitiveActionGate action="export">
              <Button
                onClick={handleEncryptedExport}
                disabled={encryptedStatus === "exporting"}
                className="min-h-[44px]"
              >
                {encryptedStatus === "exporting" ? (
                  <>
                    <Loader2 className="h-4 w-4 me-1 animate-spin" />
                    {t(
                      "importExport.export.encrypted.exporting",
                      "Exporting...",
                    )}
                  </>
                ) : encryptedStatus === "done" ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 me-1" />
                    {t("importExport.export.encrypted.done", "Downloaded")}
                  </>
                ) : (
                  <>
                    <Lock className="h-4 w-4 me-1" />
                    {t(
                      "importExport.export.encrypted.button",
                      "Export .pssmngr",
                    )}
                  </>
                )}
              </Button>
            </SensitiveActionGate>
            {encryptedStatus === "error" && encryptedError && (
              <span className="text-sm text-destructive">{encryptedError}</span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Option 3: Encrypted account data export (GDPR bundle) */}
      <Card data-testid="export-option-account-data">
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileArchive className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">
              {t("dataExport.title", "Data export", { ns: "settings" })}
            </CardTitle>
          </div>
          <CardDescription>
            {t(
              "dataExport.subtitle",
              "Download a copy of all your data — encrypted exactly as we store it.",
              { ns: "settings" },
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50/40 p-3 text-sm dark:border-amber-900/40 dark:bg-amber-900/10">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" />
            <span>
              {t(
                "dataExport.explainer",
                "Your export contains only encrypted blobs. Password Manager is zero-knowledge — you'll need your master password to open it.",
                { ns: "settings" },
              )}
            </span>
          </div>

          <RadioGroup
            value={accountFormat}
            onValueChange={(v) => setAccountFormat(v as AccountExportFormat)}
            className="flex flex-col gap-2 sm:flex-row sm:gap-6"
          >
            {(["JSON", "CSV", "BOTH"] as const).map((opt) => (
              <div key={opt} className="flex items-center gap-2 min-h-[44px]">
                <RadioGroupItem
                  id={`account-export-format-${opt}`}
                  value={opt}
                />
                <Label
                  htmlFor={`account-export-format-${opt}`}
                  className="cursor-pointer"
                >
                  {t(
                    `dataExport.format.${opt.toLowerCase() as "json" | "csv" | "both"}`,
                    { ns: "settings" },
                  )}
                </Label>
              </div>
            ))}
          </RadioGroup>

          {accountInFlight && (
            <p className="text-sm text-muted-foreground" role="status">
              {t("dataExport.inFlight", { ns: "settings" })}
            </p>
          )}

          <SensitiveActionGate action="export">
            <Button
              type="button"
              onClick={() => void handleAccountCreate()}
              disabled={accountCreating || accountInFlight}
              className="min-h-[44px]"
            >
              {accountCreating ? (
                <>
                  <Loader2 className="me-2 h-4 w-4 animate-spin" />
                  {t("dataExport.status.RUNNING", { ns: "settings" })}
                </>
              ) : (
                <>
                  <FileArchive className="me-2 h-4 w-4" />
                  {t("dataExport.requestNew", { ns: "settings" })}
                </>
              )}
            </Button>
          </SensitiveActionGate>

          {accountLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{t("dataExport.status.RUNNING", { ns: "settings" })}</span>
            </div>
          ) : accountRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("dataExport.empty", { ns: "settings" })}
            </p>
          ) : (
            <div className="space-y-2">
              {accountRows.map((r) => {
                const canDownload = r.status === "SUCCEEDED";
                const canRevoke =
                  r.status === "PENDING" ||
                  r.status === "RUNNING" ||
                  r.status === "SUCCEEDED";
                return (
                  <div
                    key={r.id}
                    className="flex flex-col gap-3 rounded-md border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className={accountStatusClass(r.status)}
                        >
                          {t(`dataExport.status.${r.status}`, {
                            ns: "settings",
                          })}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {r.requestedAt || "—"}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {t("dataExport.table.size", { ns: "settings" })}:{" "}
                        {formatBytes(r.bundleSizeBytes)}
                      </div>
                      {r.errorMessage ? (
                        <p className="truncate text-xs text-destructive">
                          {r.errorMessage}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {canDownload ? (
                        <Button
                          asChild
                          variant="outline"
                          size="sm"
                          className="min-h-[44px]"
                        >
                          <a href={accountDownloadUrl(r.id)}>
                            <Download className="me-2 h-4 w-4" />
                            {t("dataExport.table.download", { ns: "settings" })}
                          </a>
                        </Button>
                      ) : null}
                      {canRevoke ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void handleAccountRevoke(r.id)}
                          className="min-h-[44px]"
                        >
                          <Trash2 className="me-2 h-4 w-4" />
                          {t("dataExport.table.revoke", { ns: "settings" })}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
