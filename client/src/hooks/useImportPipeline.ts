// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * useImportPipeline
 *
 * State for Smart add:
 *   idle → reading → detecting → previewing → importing → done
 *
 * Parsing happens entirely on this device through the local parser; the only
 * network calls are the encrypted batch mutations issued by `executeImport`.
 * File contents and preview items stay in memory and are cleared on reset.
 */

import { useState, useCallback, useRef, useMemo } from "react";
import type {
  ImportResult,
  ImportProgress,
  ImportSummary,
  ImportPipelineStage,
  ImportedItem,
} from "@/types/import";
import {
  readFile,
  executeImport,
  newImportOperationId,
} from "@/services/import/pipeline";
import { BULK_BATCH_SIZE } from "@/services/import/bulk-save";
import {
  MAX_IMPORT_ITEMS,
  checkImportFile,
  smartParse,
  type SmartParseError,
  type SmartParseWarning,
} from "@/services/import/smart-parse";
import { exactItemFingerprint } from "@/services/vault-duplicates";

/** Editable preview rows rendered per page. */
export const PREVIEW_PAGE_SIZE = 50;

export interface PreviewRow {
  /** Stable, non-secret row key. Survives edits and deletions. */
  key: string;
  item: ImportedItem;
  /**
   * Batch this row was submitted in. Set on the first save attempt and kept
   * on retry so the retried batch reuses its idempotency key.
   */
  batchIndex?: number;
}

export interface ImportPipelineState {
  stage: ImportPipelineStage;
  /** Detected source format name */
  source: string | null;
  /** Parsed import result (available during preview) */
  parseResult: ImportResult | null;
  /** Editable preview rows, in source order. */
  rows: PreviewRow[];
  /** Row keys selected for import. */
  selectedKeys: Set<string>;
  /** Typed, secret-safe row/block warnings from the parser. */
  warnings: SmartParseWarning[];
  /** Live progress during import */
  progress: ImportProgress | null;
  /** Final summary after import completes */
  summary: ImportSummary | null;
  /** Typed parse failure, translated at the component boundary. */
  parseError: SmartParseError | null;
  /** Free-form error message if the save stage fails */
  error: string | null;
  /** Zero-based preview page. */
  page: number;
}

const INITIAL_STATE: ImportPipelineState = {
  stage: "idle",
  source: null,
  parseResult: null,
  rows: [],
  selectedKeys: new Set(),
  warnings: [],
  progress: null,
  summary: null,
  parseError: null,
  error: null,
  page: 0,
};

function toRows(items: ImportedItem[]): PreviewRow[] {
  // Index-derived keys: non-secret and stable for the life of one parse.
  return items.map((item, index) => ({ key: `row-${index}`, item }));
}

export function useImportPipeline() {
  const [state, setState] = useState<ImportPipelineState>(INITIAL_STATE);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  /**
   * Monotonic token for the newest read/parse. A result whose token is stale —
   * because the dialog closed or a newer input was selected — is discarded.
   */
  const runToken = useRef(0);
  /**
   * Retained across retries so a retried batch reuses its idempotency key and
   * cannot duplicate a batch the server already committed.
   */
  const operationId = useRef<string | null>(null);

  const applyParse = useCallback((content: string, token: number) => {
    const parsed = smartParse(content);
    if (token !== runToken.current) return;

    if (!parsed.ok) {
      setState((s) => ({
        ...s,
        stage: "error",
        parseError: parsed.error,
        error: null,
      }));
      return;
    }

    const rows = toRows(parsed.result.items);
    setState((s) => ({
      ...s,
      stage: "previewing",
      source: parsed.source,
      parseResult: parsed.result,
      rows,
      selectedKeys: new Set(rows.map((row) => row.key)),
      warnings: parsed.warnings,
      parseError: null,
      error: null,
      page: 0,
    }));
  }, []);

  /** Read and parse a file. Bounds are checked before the file is read. */
  const uploadFile = useCallback(
    async (file: File) => {
      const token = ++runToken.current;
      operationId.current = null;

      const rejection = checkImportFile(file);
      if (rejection) {
        setState((s) => ({
          ...s,
          stage: "error",
          parseError: rejection,
          error: null,
        }));
        return;
      }

      setState((s) => ({ ...s, stage: "reading", parseError: null, error: null }));

      let content: string;
      try {
        content = await readFile(file);
      } catch {
        if (token !== runToken.current) return;
        setState((s) => ({
          ...s,
          stage: "error",
          parseError: { code: "unsupportedFormat" },
        }));
        return;
      }

      if (token !== runToken.current) return;
      setState((s) => ({ ...s, stage: "detecting" }));
      applyParse(content, token);
    },
    [applyParse],
  );

  /** Parse pasted text through the same local parser. */
  const analyzeText = useCallback(
    (content: string) => {
      const token = ++runToken.current;
      operationId.current = null;
      setState((s) => ({ ...s, stage: "detecting", parseError: null, error: null }));
      applyParse(content, token);
    },
    [applyParse],
  );

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      await uploadFile(file);
      // Clear the input so the same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [uploadFile],
  );

  const handleFileDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const file = e.dataTransfer.files[0];
      if (!file) return;
      await uploadFile(file);
    },
    [uploadFile],
  );

  const toggleItem = useCallback((key: string) => {
    setState((s) => {
      const selectedKeys = new Set(s.selectedKeys);
      if (selectedKeys.has(key)) selectedKeys.delete(key);
      else selectedKeys.add(key);
      return { ...s, selectedKeys };
    });
  }, []);

  const toggleAll = useCallback((selected: boolean) => {
    setState((s) => ({
      ...s,
      selectedKeys: selected ? new Set(s.rows.map((row) => row.key)) : new Set(),
    }));
  }, []);

  /** Edit one field of a preview row in memory. */
  const editRow = useCallback(
    (key: string, patch: { title?: string; fields?: Record<string, string> }) => {
      setState((s) => ({
        ...s,
        rows: s.rows.map((row) =>
          row.key === key
            ? {
                ...row,
                item: {
                  ...row.item,
                  ...(patch.title !== undefined ? { title: patch.title } : {}),
                  ...(patch.fields
                    ? { fields: { ...row.item.fields, ...patch.fields } }
                    : {}),
                },
              }
            : row,
        ),
      }));
    },
    [],
  );

  /** Remove a preview row and clamp the page so it stays in range. */
  const deleteRow = useCallback((key: string) => {
    setState((s) => {
      const rows = s.rows.filter((row) => row.key !== key);
      const selectedKeys = new Set(s.selectedKeys);
      selectedKeys.delete(key);
      const lastPage = Math.max(0, Math.ceil(rows.length / PREVIEW_PAGE_SIZE) - 1);
      return { ...s, rows, selectedKeys, page: Math.min(s.page, lastPage) };
    });
  }, []);

  const setPage = useCallback((page: number) => {
    setState((s) => {
      const lastPage = Math.max(
        0,
        Math.ceil(s.rows.length / PREVIEW_PAGE_SIZE) - 1,
      );
      return { ...s, page: Math.min(Math.max(0, page), lastPage) };
    });
  }, []);

  /** Return to the upload step, discarding parsed plaintext. */
  const back = useCallback(() => {
    runToken.current++;
    operationId.current = null;
    setState(INITIAL_STATE);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  /**
   * Encrypt and save the selected rows in bounded ciphertext batches.
   * Rows that fail are retained for retry; the operation id is reused so a
   * retry cannot duplicate a batch the server already committed.
   */
  const confirmImport = useCallback(
    async (vaultId: string) => {
      const selected = state.rows.filter((row) => state.selectedKeys.has(row.key));
      if (selected.length === 0) return;

      if (!operationId.current) operationId.current = newImportOperationId();

      setState((s) => ({ ...s, stage: "importing", error: null }));

      try {
        // Rows retried after a failure keep their original batch, so the
        // retry reuses that batch's idempotency key rather than colliding
        // with a batch the server already committed.
        const batchIndexes = selected.map(
          (row, index) => row.batchIndex ?? Math.floor(index / BULK_BATCH_SIZE),
        );

        const summary = await executeImport(
          selected.map((row) => row.item),
          vaultId,
          (progress) => setState((s) => ({ ...s, progress })),
          { operationId: operationId.current!, batchIndexes },
        );

        const failedBatches = new Map(
          summary.errors.map((e) => [e.index, e.batchIndex] as const),
        );
        const failedRows = selected
          .filter((_, index) => failedBatches.has(index))
          .map((row, position) => {
            const originalIndex = selected.indexOf(row);
            return {
              ...row,
              batchIndex:
                failedBatches.get(originalIndex) ??
                batchIndexes[originalIndex] ??
                position,
            };
          });

        setState((s) => ({
          ...s,
          stage: "done",
          summary,
          // Retain only the rows that still need saving.
          rows: failedRows,
          selectedKeys: new Set(failedRows.map((row) => row.key)),
          page: 0,
          progress: {
            stage: "done",
            total: selected.length,
            imported: summary.imported,
            skipped: summary.skipped,
            errors: summary.errors.length,
          },
        }));
      } catch (err) {
        setState((s) => ({
          ...s,
          stage: "error",
          error: err instanceof Error ? err.message : "Import failed",
        }));
      }
    },
    [state.rows, state.selectedKeys],
  );

  /** Re-open the preview with the rows that failed, keeping the operation id. */
  const retryFailed = useCallback(() => {
    setState((s) =>
      s.rows.length === 0
        ? s
        : { ...s, stage: "previewing", summary: null, error: null, page: 0 },
    );
  }, []);

  const reset = useCallback(() => {
    runToken.current++;
    operationId.current = null;
    setState(INITIAL_STATE);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  /**
   * Exact-duplicate row keys, computed in O(n) with sets over ephemeral
   * fingerprints. The fingerprints are never stored, logged, or transmitted.
   */
  const duplicateKeys = useMemo(() => {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const row of state.rows) {
      const fingerprint = exactItemFingerprint({
        itemType: row.item.type,
        data: { title: row.item.title, fields: row.item.fields },
      });
      if (seen.has(fingerprint)) duplicates.add(row.key);
      else seen.add(fingerprint);
    }
    return duplicates;
  }, [state.rows]);

  const pageCount = Math.max(
    1,
    Math.ceil(state.rows.length / PREVIEW_PAGE_SIZE),
  );
  const page = Math.min(state.page, pageCount - 1);
  const pageRows = useMemo(
    () =>
      state.rows.slice(
        page * PREVIEW_PAGE_SIZE,
        page * PREVIEW_PAGE_SIZE + PREVIEW_PAGE_SIZE,
      ),
    [state.rows, page],
  );

  return {
    ...state,
    page,
    pageCount,
    pageRows,
    duplicateKeys,
    maxItems: MAX_IMPORT_ITEMS,
    fileInputRef,
    uploadFile,
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
  };
}
