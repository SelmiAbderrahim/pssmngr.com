// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Import Wizard Component
 *
 * Multi-step wizard for importing credentials from other password managers.
 * Steps: Upload → Detecting → Preview → Importing → Summary
 */

import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Upload,
  FileText,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useImportPipeline } from "@/hooks/useImportPipeline";
import type { ImportedItem } from "@/types/import";

const SUPPORTED_FORMATS = [
  { name: "1Password", ext: "CSV" },
  { name: "Bitwarden", ext: "JSON, CSV" },
  { name: "Chrome", ext: "CSV" },
  { name: "LastPass", ext: "CSV" },
  {
    name: "Generic CSV",
    nameKey: "importExport.formats.genericCsv",
    ext: "CSV",
  },
] as const;

interface ImportWizardProps {
  vaultId: string;
}

export function ImportWizard({ vaultId }: ImportWizardProps) {
  const { t } = useTranslation("common");
  const pipeline = useImportPipeline();

  const {
    stage,
    source,
    parseResult,
    selectedItems,
    progress,
    summary,
    error,
    fileInputRef,
    handleFileSelect,
    handleFileDrop,
    toggleItem,
    toggleAll,
    confirmImport,
    reset,
  } = pipeline;

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleConfirm = useCallback(() => {
    confirmImport(vaultId);
  }, [confirmImport, vaultId]);

  // Step 1: File upload (idle state)
  if (stage === "idle") {
    return (
      <div className="space-y-4">
        <div
          onDrop={handleFileDrop}
          onDragOver={handleDragOver}
          onClick={() => fileInputRef.current?.click()}
          className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-border p-8 text-center cursor-pointer hover:bg-muted/50 transition-colors duration-150"
        >
          <Upload className="h-8 w-8 text-muted-foreground" />
          <div>
            <p className="font-medium">
              {t(
                "importExport.import.dropzone.title",
                "Drop your file here or click to browse",
              )}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {t(
                "importExport.import.dropzone.subtitle",
                "Supports CSV and JSON files",
              )}
            </p>
          </div>
          <Button variant="outline" size="sm" className="min-h-[44px]">
            {t("importExport.import.dropzone.browse", "Choose File")}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.json"
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>

        <div>
          <p className="text-sm font-medium mb-2">
            {t("importExport.import.supported", "Supported formats")}
          </p>
          <div className="flex flex-wrap gap-2">
            {SUPPORTED_FORMATS.map((f) => (
              <Badge key={f.name} variant="outline" className="gap-1">
                <FileText className="h-3 w-3" />
                {"nameKey" in f && f.nameKey ? t(f.nameKey, f.name) : f.name}
                <span className="text-muted-foreground">({f.ext})</span>
              </Badge>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Step 2: Reading / Detecting (loading)
  if (stage === "reading" || stage === "detecting") {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          {stage === "reading"
            ? t("importExport.import.reading", "Reading file...")
            : t("importExport.import.detecting", "Detecting format...")}
        </p>
      </div>
    );
  }

  // Step 3: Preview with selection
  if (stage === "previewing" && parseResult) {
    const allSelected = selectedItems.length === parseResult.items.length;
    const someSelected = selectedItems.length > 0 && !allSelected;

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">
              {t("importExport.import.preview.title", "Preview")}
            </p>
            <p className="text-sm text-muted-foreground">
              {source && (
                <span>
                  {t(
                    "importExport.import.preview.detected",
                    "Detected: {{source}}",
                    { source },
                  )}
                  {" \u00B7 "}
                </span>
              )}
              {t("importExport.import.preview.count", "{{count}} items found", {
                count: parseResult.items.length,
              })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={reset}
              className="min-h-[44px]"
            >
              {t("importExport.import.preview.cancel", "Cancel")}
            </Button>
            <Button
              size="sm"
              onClick={handleConfirm}
              disabled={selectedItems.length === 0}
              className="min-h-[44px]"
            >
              {t(
                "importExport.import.preview.import",
                "Import {{count}} items",
                {
                  count: selectedItems.length,
                },
              )}
            </Button>
          </div>
        </div>

        {parseResult.errors.length > 0 && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm">
            <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
            <span>
              {t(
                "importExport.import.preview.parseErrors",
                "{{count}} rows could not be parsed",
                {
                  count: parseResult.errors.length,
                },
              )}
            </span>
          </div>
        )}

        {parseResult.duplicates.length > 0 && (
          <div className="flex items-start gap-2 rounded-md border border-yellow-500/50 bg-yellow-500/5 p-3 text-sm">
            <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 mt-0.5 shrink-0" />
            <span>
              {t(
                "importExport.import.preview.duplicates",
                "{{count}} potential duplicates detected",
                {
                  count: parseResult.duplicates.length,
                },
              )}
            </span>
          </div>
        )}

        <div className="rounded-md border overflow-auto max-h-[400px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={
                      allSelected
                        ? true
                        : someSelected
                          ? "indeterminate"
                          : false
                    }
                    onCheckedChange={(checked) => toggleAll(!!checked)}
                    aria-label={t(
                      "a11y.selectAll",
                      "Select all items",
                    )}
                  />
                </TableHead>
                <TableHead className="text-start">
                  {t("importExport.import.preview.col.title", "Title")}
                </TableHead>
                <TableHead className="text-start">
                  {t("importExport.import.preview.col.type", "Type")}
                </TableHead>
                <TableHead className="text-start hidden sm:table-cell">
                  {t("importExport.import.preview.col.username", "Username")}
                </TableHead>
                <TableHead className="text-start hidden md:table-cell">
                  {t("importExport.import.preview.col.url", "URL")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {parseResult.items.map((item, i) => (
                <ImportPreviewRow
                  key={i}
                  item={item}
                  index={i}
                  selected={selectedItems.includes(item)}
                  onToggle={toggleItem}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }

  // Step 4: Importing (progress)
  if (stage === "importing" && progress) {
    const pct =
      progress.total > 0
        ? Math.round((progress.imported / progress.total) * 100)
        : 0;

    return (
      <div className="flex flex-col items-center justify-center gap-4 py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <div className="w-full max-w-xs space-y-2">
          <Progress value={pct} />
          <p className="text-sm text-center text-muted-foreground">
            {t(
              "importExport.import.progress",
              "Importing {{current}} of {{total}}...",
              {
                current: progress.imported,
                total: progress.total,
              },
            )}
          </p>
        </div>
      </div>
    );
  }

  // Step 5: Summary (done)
  if (stage === "done" && summary) {
    const durationSec = (summary.durationMs / 1000).toFixed(1);

    return (
      <div className="space-y-4">
        <div className="flex flex-col items-center justify-center gap-3 py-8">
          <CheckCircle2 className="h-10 w-10 text-green-600 dark:text-green-400" />
          <div className="text-center">
            <p className="text-lg font-semibold">
              {t("importExport.import.summary.title", "Import Complete")}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {t(
                "importExport.import.summary.duration",
                "Completed in {{seconds}}s",
                {
                  seconds: durationSec,
                },
              )}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card>
            <CardContent className="pt-4 pb-4 text-center">
              <p className="text-2xl font-semibold">{summary.imported}</p>
              <p className="text-sm text-muted-foreground">
                {t("importExport.import.summary.imported", "Imported")}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4 text-center">
              <p className="text-2xl font-semibold">{summary.skipped}</p>
              <p className="text-sm text-muted-foreground">
                {t("importExport.import.summary.skipped", "Skipped")}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4 text-center">
              <p className="text-2xl font-semibold">{summary.errors.length}</p>
              <p className="text-sm text-muted-foreground">
                {t("importExport.import.summary.errors", "Errors")}
              </p>
            </CardContent>
          </Card>
        </div>

        {summary.errors.length > 0 && (
          <div className="rounded-md border p-3 space-y-1">
            <p className="text-sm font-medium">
              {t("importExport.import.summary.errorDetails", "Failed items")}
            </p>
            {summary.errors.slice(0, 10).map((err, i) => (
              <p key={i} className="text-sm text-muted-foreground">
                {err.title}: {err.message}
              </p>
            ))}
            {summary.errors.length > 10 && (
              <p className="text-sm text-muted-foreground">
                {t(
                  "importExport.import.summary.moreErrors",
                  "...and {{count}} more",
                  {
                    count: summary.errors.length - 10,
                  },
                )}
              </p>
            )}
          </div>
        )}

        <Button onClick={reset} variant="outline" className="min-h-[44px]">
          {t("importExport.import.summary.importMore", "Import More")}
        </Button>
      </div>
    );
  }

  // Error state
  if (stage === "error") {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12">
        <XCircle className="h-10 w-10 text-destructive" />
        <div className="text-center">
          <p className="font-medium">
            {t("importExport.import.error.title", "Import Failed")}
          </p>
          <p className="text-sm text-muted-foreground mt-1 max-w-md">{error}</p>
        </div>
        <Button onClick={reset} variant="outline" className="min-h-[44px]">
          {t("importExport.import.error.retry", "Try Again")}
        </Button>
      </div>
    );
  }

  return null;
}

// ── Preview Row ──────────────────────────────────────────────────────

interface ImportPreviewRowProps {
  item: ImportedItem;
  index: number;
  selected: boolean;
  onToggle: (index: number) => void;
}

function ImportPreviewRow({
  item,
  index,
  selected,
  onToggle,
}: ImportPreviewRowProps) {
  const { t } = useTranslation("common");
  const typeBadgeVariant = item.type === "login" ? "secondary" : "outline";

  return (
    <TableRow
      className={cn(
        "cursor-pointer hover:bg-muted/50 transition-colors duration-150",
        !selected && "opacity-60",
      )}
      onClick={() => onToggle(index)}
    >
      <TableCell>
        <Checkbox
          checked={selected}
          onCheckedChange={() => onToggle(index)}
          onClick={(e) => e.stopPropagation()}
          aria-label={t(
            "a11y.selectItem",
            "Select item {{id}}",
            { id: item.title || "untitled" },
          )}
        />
      </TableCell>
      <TableCell className="text-start font-medium">
        {item.title || "(untitled)"}
      </TableCell>
      <TableCell className="text-start">
        <Badge variant={typeBadgeVariant} className="capitalize">
          {item.type}
        </Badge>
      </TableCell>
      <TableCell className="text-start hidden sm:table-cell text-muted-foreground">
        {item.fields.username || "\u2014"}
      </TableCell>
      <TableCell className="text-start hidden md:table-cell text-muted-foreground truncate max-w-[200px]">
        {item.fields.url || "\u2014"}
      </TableCell>
    </TableRow>
  );
}
