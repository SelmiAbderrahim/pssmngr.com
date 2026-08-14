// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Smart add wizard
 *
 * Steps: Upload/paste → Detecting → Preview → Saving → Summary
 *
 * Parsing runs on this device. Only encrypted items are sent to the server,
 * in batches of at most 50. At most 50 editable rows are mounted per page.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Upload,
  FileText,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Trash2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  useImportPipeline,
  PREVIEW_PAGE_SIZE,
  type PreviewRow,
} from "@/hooks/useImportPipeline";
import {
  MAX_IMPORT_CHARACTERS,
  type SmartParseError,
  type SmartParseWarning,
} from "@/services/import/smart-parse";

const SUPPORTED_FORMATS = [
  { name: "1Password", ext: "CSV" },
  { name: "Bitwarden", ext: "JSON, CSV" },
  { name: "Chrome", ext: "CSV" },
  { name: "LastPass", ext: "CSV" },
  { name: "Generic CSV", nameKey: "importExport.formats.genericCsv", ext: "CSV" },
] as const;

/**
 * Expands a checkbox to a 44x44 pointer/keyboard target through a centred
 * pseudo-element, without enlarging the visual box.
 */
const CHECKBOX_HIT_AREA =
  "relative before:absolute before:start-1/2 before:top-1/2 before:h-11 " +
  "before:w-11 before:-translate-x-1/2 before:-translate-y-1/2 " +
  "before:content-[''] rtl:before:translate-x-1/2";

interface ImportWizardProps {
  vaultId: string;
}

export function ImportWizard({ vaultId }: ImportWizardProps) {
  const { t } = useTranslation("common");
  const pipeline = useImportPipeline();

  const {
    stage,
    source,
    rows,
    pageRows,
    page,
    pageCount,
    selectedKeys,
    duplicateKeys,
    warnings,
    progress,
    summary,
    parseError,
    error,
    maxItems,
    fileInputRef,
    analyzeText,
    handleFileSelect,
    handleFileDrop,
    toggleItem,
    toggleAll,
    editRow,
    deleteRow,
    setPage,
    back,
    confirmImport,
    retryFailed,
    reset,
  } = pipeline;

  const [pasteValue, setPasteValue] = useState("");
  const previewHeadingRef = useRef<HTMLParagraphElement | null>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleConfirm = useCallback(() => {
    confirmImport(vaultId);
  }, [confirmImport, vaultId]);

  const handleBack = useCallback(() => {
    setPasteValue("");
    back();
  }, [back]);

  const handleReset = useCallback(() => {
    setPasteValue("");
    reset();
  }, [reset]);

  // Discard any in-flight read/parse when this step unmounts, so a stale
  // result can never repopulate plaintext preview state.
  useEffect(() => () => reset(), [reset]);

  // Move focus to the preview heading once results are ready.
  useEffect(() => {
    if (stage === "previewing") previewHeadingRef.current?.focus();
  }, [stage]);

  // Step 1: Upload or paste
  if (stage === "idle") {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {t(
            "importExport.import.onDevice",
            "Your file is read and sorted into items on this device. Only encrypted items are sent to the server.",
          )}
        </p>

        <div
          onDrop={handleFileDrop}
          onDragOver={handleDragOver}
          onClick={() => fileInputRef.current?.click()}
          className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-border p-8 text-center cursor-pointer hover:bg-muted/50 transition-colors duration-150"
        >
          <Upload className="h-8 w-8 text-muted-foreground" />
          <div>
            <p className="font-medium">
              {t("importExport.import.dropzone.title", "Drop your file here or click to browse")}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {t("importExport.import.dropzone.subtitle", "Supports CSV, JSON, and TXT files")}
            </p>
          </div>
          <Button variant="outline" size="sm" className="min-h-[44px] min-w-[44px]">
            {t("importExport.import.dropzone.browse", "Choose File")}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.json,.txt"
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="smart-add-paste">
            {t("importExport.import.paste.label", "Or paste your items")}
          </Label>
          <Textarea
            id="smart-add-paste"
            value={pasteValue}
            onChange={(e) => setPasteValue(e.target.value)}
            rows={5}
            maxLength={MAX_IMPORT_CHARACTERS}
            placeholder={t(
              "importExport.import.paste.placeholder",
              "Title: Example\nUsername: you@example.com\nPassword: ...",
            )}
            className="text-start"
          />
          <Button
            onClick={() => {
              const content = pasteValue;
              // Drop the pasted plaintext as soon as it is handed to the
              // parser, so it is not held in two places during review.
              setPasteValue("");
              analyzeText(content);
            }}
            disabled={pasteValue.trim().length === 0}
            className="min-h-[44px] min-w-[44px]"
          >
            {t("importExport.import.paste.analyze", "Review items")}
          </Button>
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

  // Step 2: Reading / Detecting
  if (stage === "reading" || stage === "detecting") {
    return (
      <div
        className="flex flex-col items-center justify-center gap-3 py-12"
        role="status"
        aria-live="polite"
      >
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          {stage === "reading"
            ? t("importExport.import.reading", "Reading file...")
            : t("importExport.import.detecting", "Sorting items on this device...")}
        </p>
      </div>
    );
  }

  // Step 3: Preview
  if (stage === "previewing") {
    const selectedCount = selectedKeys.size;
    const allSelected = rows.length > 0 && selectedCount === rows.length;
    const someSelected = selectedCount > 0 && !allSelected;
    const firstShown = rows.length === 0 ? 0 : page * PREVIEW_PAGE_SIZE + 1;
    const lastShown = page * PREVIEW_PAGE_SIZE + pageRows.length;

    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p
              className="font-medium"
              tabIndex={-1}
              ref={previewHeadingRef}
            >
              {t("importExport.import.preview.title", "Review items")}
            </p>
            <p className="text-sm text-muted-foreground">
              {source && (
                <span>
                  {t("importExport.import.preview.detected", "Detected: {{source}}", { source })}
                  {" · "}
                </span>
              )}
              {t("importExport.import.preview.count", "{{count}} items found", {
                count: rows.length,
              })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBack}
              className="min-h-[44px] min-w-[44px]"
            >
              {t("importExport.import.preview.back", "Back")}
            </Button>
            <Button
              size="sm"
              onClick={handleConfirm}
              disabled={selectedCount === 0}
              className="min-h-[44px] min-w-[44px]"
            >
              {t("importExport.import.preview.import", "Add {{count}} items", {
                count: selectedCount,
              })}
            </Button>
          </div>
        </div>

        {warnings.length > 0 && (
          <div className="flex items-start gap-2 rounded-md border border-yellow-500/50 bg-yellow-500/5 p-3 text-sm">
            <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 mt-0.5 shrink-0" />
            <ul className="space-y-1">
              {summarizeWarnings(warnings).map(({ code, count }) => (
                <li key={code}>{t(warningKey(code), { count })}</li>
              ))}
            </ul>
          </div>
        )}

        {duplicateKeys.size > 0 && (
          <div className="flex items-start gap-2 rounded-md border border-yellow-500/50 bg-yellow-500/5 p-3 text-sm">
            <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 mt-0.5 shrink-0" />
            <span>
              {t("importExport.import.preview.duplicates", "{{count}} exact duplicates detected", {
                count: duplicateKeys.size,
              })}
            </span>
          </div>
        )}

        <div className="rounded-md border overflow-auto max-h-[480px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    // 44x44 hit area without changing the visual box size.
                    className={CHECKBOX_HIT_AREA}
                    checked={allSelected ? true : someSelected ? "indeterminate" : false}
                    onCheckedChange={(checked) => toggleAll(!!checked)}
                    aria-label={t(
                      "importExport.import.preview.selectAll",
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
                <TableHead className="w-12">
                  <span className="sr-only">
                    {t("importExport.import.preview.col.actions", "Actions")}
                  </span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.map((row, offset) => (
                <ImportPreviewRow
                  key={row.key}
                  row={row}
                  rowNumber={page * PREVIEW_PAGE_SIZE + offset + 1}
                  selected={selectedKeys.has(row.key)}
                  duplicate={duplicateKeys.has(row.key)}
                  onToggle={toggleItem}
                  onEdit={editRow}
                  onDelete={deleteRow}
                />
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {t(
              "importExport.import.preview.range",
              "Showing {{first}}–{{last}} of {{total}}",
              { first: firstShown, last: lastShown, total: rows.length },
            )}
          </p>
          {pageCount > 1 && (
            <nav
              className="flex items-center gap-2"
              aria-label={t(
                "importExport.import.preview.pagination",
                "Preview pages",
              )}
            >
              <Button
                variant="outline"
                size="sm"
                className="min-h-[44px] min-w-[44px]"
                onClick={() => setPage(0)}
                disabled={page === 0}
                aria-label={t("importExport.import.preview.firstPage", "First page")}
              >
                <ChevronLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
                <ChevronLeft className="h-4 w-4 -ms-3 rtl:rotate-180" aria-hidden="true" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="min-h-[44px] min-w-[44px]"
                onClick={() => setPage(page - 1)}
                disabled={page === 0}
                aria-label={t("importExport.import.preview.prevPage", "Previous page")}
              >
                <ChevronLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
              </Button>
              <span className="text-sm">
                {t("importExport.import.preview.pageOf", "Page {{page}} of {{pages}}", {
                  page: page + 1,
                  pages: pageCount,
                })}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="min-h-[44px] min-w-[44px]"
                onClick={() => setPage(page + 1)}
                disabled={page >= pageCount - 1}
                aria-label={t("importExport.import.preview.nextPage", "Next page")}
              >
                <ChevronRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="min-h-[44px] min-w-[44px]"
                onClick={() => setPage(pageCount - 1)}
                disabled={page >= pageCount - 1}
                aria-label={t("importExport.import.preview.lastPage", "Last page")}
              >
                <ChevronRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
                <ChevronRight className="h-4 w-4 -ms-3 rtl:rotate-180" aria-hidden="true" />
              </Button>
            </nav>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          {t(
            "importExport.import.preview.limit",
            "Up to {{max}} items can be reviewed at once.",
            { max: maxItems },
          )}
        </p>
      </div>
    );
  }

  // Step 4: Saving
  if (stage === "importing" && progress) {
    const pct = progress.total > 0
      ? Math.round((progress.imported / progress.total) * 100)
      : 0;

    return (
      <div className="flex flex-col items-center justify-center gap-4 py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <div className="w-full max-w-xs space-y-2">
          <Progress value={pct} />
          <p className="text-sm text-center text-muted-foreground" role="status" aria-live="polite">
            {t("importExport.import.progress", "Saved {{current}} of {{total}} encrypted items...", {
              current: progress.imported,
              total: progress.total,
            })}
          </p>
        </div>
      </div>
    );
  }

  // Step 5: Summary
  if (stage === "done" && summary) {
    return (
      <div className="space-y-4">
        <div className="flex flex-col items-center justify-center gap-3 py-8">
          <CheckCircle2 className="h-10 w-10 text-green-600 dark:text-green-400" />
          <div className="text-center">
            <p className="text-lg font-semibold" role="status" aria-live="polite">
              {t("importExport.import.summary.title", "Items added")}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card>
            <CardContent className="pt-4 pb-4 text-center">
              <p className="text-2xl font-semibold">{summary.imported}</p>
              <p className="text-sm text-muted-foreground">
                {t("importExport.import.summary.imported", "Added")}
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

        {rows.length > 0 && (
          <div className="rounded-md border p-3 space-y-2">
            <p className="text-sm font-medium">
              {t(
                "importExport.import.summary.retainedRows",
                "{{count}} items were not saved and are still here.",
                { count: rows.length },
              )}
            </p>
            <Button onClick={retryFailed} className="min-h-[44px] min-w-[44px]">
              {t("importExport.import.summary.retry", "Try these again")}
            </Button>
          </div>
        )}

        <Button onClick={handleReset} variant="outline" className="min-h-[44px] min-w-[44px]">
          {t("importExport.import.summary.importMore", "Add more items")}
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
          <p className="font-medium" role="alert">
            {t("importExport.import.error.title", "Could not read those items")}
          </p>
          <p className="text-sm text-muted-foreground mt-1 max-w-md">
            {parseError ? t(parseErrorKey(parseError), parseErrorValues(parseError)) : error}
          </p>
        </div>
        <Button onClick={handleReset} variant="outline" className="min-h-[44px] min-w-[44px]">
          {t("importExport.import.error.retry", "Try Again")}
        </Button>
      </div>
    );
  }

  return null;
}

// ── Typed message helpers ────────────────────────────────────────────

/**
 * Map a typed parse error to its translation key. The rendered message never
 * includes any of the source text — only the code and its numeric bounds.
 */
function parseErrorKey(error: SmartParseError): string {
  return `importExport.import.parseError.${error.code}`;
}

function parseErrorValues(error: SmartParseError) {
  return { limit: error.limit ?? 0, actual: error.actual ?? 0 };
}

function warningKey(code: SmartParseWarning["code"]): string {
  return `importExport.import.warning.${code}`;
}

/** Group warnings by code so the preview shows counts, never row content. */
function summarizeWarnings(warnings: SmartParseWarning[]) {
  const counts = new Map<SmartParseWarning["code"], number>();
  for (const warning of warnings) {
    counts.set(warning.code, (counts.get(warning.code) ?? 0) + 1);
  }
  return [...counts.entries()].map(([code, count]) => ({ code, count }));
}

// ── Preview Row ──────────────────────────────────────────────────────

interface ImportPreviewRowProps {
  row: PreviewRow;
  rowNumber: number;
  selected: boolean;
  duplicate: boolean;
  onToggle: (key: string) => void;
  onEdit: (
    key: string,
    patch: { title?: string; fields?: Record<string, string> },
  ) => void;
  onDelete: (key: string) => void;
}

function ImportPreviewRow({
  row,
  rowNumber,
  selected,
  duplicate,
  onToggle,
  onEdit,
  onDelete,
}: ImportPreviewRowProps) {
  const { t } = useTranslation("common");
  const { item } = row;
  const typeBadgeVariant = item.type === "login" ? "secondary" : "outline";

  return (
    <TableRow className={cn("transition-colors duration-150", !selected && "opacity-60")}>
      <TableCell>
        <Checkbox
          className={CHECKBOX_HIT_AREA}
          checked={selected}
          onCheckedChange={() => onToggle(row.key)}
          // Row number only — never the item's content.
          aria-label={t("importExport.import.preview.selectRow", "Select item {{row}}", {
            row: rowNumber,
          })}
        />
      </TableCell>
      <TableCell className="text-start font-medium">
        <Input
          value={item.title}
          onChange={(e) => onEdit(row.key, { title: e.target.value })}
          aria-label={t("importExport.import.preview.editTitle", "Title for item {{row}}", {
            row: rowNumber,
          })}
          className="min-h-[44px] text-start"
        />
        {duplicate && (
          <span className="text-xs text-yellow-600 dark:text-yellow-400">
            {t("importExport.import.preview.duplicateRow", "Duplicate")}
          </span>
        )}
      </TableCell>
      <TableCell className="text-start">
        <Badge variant={typeBadgeVariant} className="capitalize">
          {t(`importExport.import.itemType.${item.type}`, item.type)}
        </Badge>
      </TableCell>
      <TableCell className="text-start hidden sm:table-cell">
        <Input
          value={item.fields.username ?? ""}
          onChange={(e) => onEdit(row.key, { fields: { username: e.target.value } })}
          aria-label={t(
            "importExport.import.preview.editUsername",
            "Username for item {{row}}",
            { row: rowNumber },
          )}
          className="min-h-[44px] text-start"
        />
      </TableCell>
      <TableCell className="text-start hidden md:table-cell">
        <Input
          value={item.fields.url ?? ""}
          onChange={(e) => onEdit(row.key, { fields: { url: e.target.value } })}
          aria-label={t("importExport.import.preview.editUrl", "URL for item {{row}}", {
            row: rowNumber,
          })}
          className="min-h-[44px] text-start"
        />
      </TableCell>
      <TableCell>
        <Button
          variant="ghost"
          size="sm"
          className="min-h-[44px] min-w-[44px]"
          onClick={() => onDelete(row.key)}
          aria-label={t("importExport.import.preview.deleteRow", "Remove item {{row}}", {
            row: rowNumber,
          })}
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </Button>
      </TableCell>
    </TableRow>
  );
}
