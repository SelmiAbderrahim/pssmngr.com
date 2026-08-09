// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * useImportPipeline
 *
 * React hook that manages the full import pipeline state:
 *   idle → reading → detecting → previewing → importing → done
 *
 * File contents are processed in memory only — no temp files.
 */

import { useState, useCallback, useRef } from "react";
import type {
  ImportResult,
  ImportProgress,
  ImportSummary,
  ImportPipelineStage,
  ImportedItem,
} from "@/types/import";
import {
  readFile,
  parseFileContent,
  executeImport,
} from "@/services/import/pipeline";

export interface ImportPipelineState {
  stage: ImportPipelineStage;
  /** Detected source format name */
  source: string | null;
  /** Parsed import result (available during preview) */
  parseResult: ImportResult | null;
  /** Items selected for import (user can deselect during preview) */
  selectedItems: ImportedItem[];
  /** Live progress during import */
  progress: ImportProgress | null;
  /** Final summary after import completes */
  summary: ImportSummary | null;
  /** Error message if pipeline fails */
  error: string | null;
}

const INITIAL_STATE: ImportPipelineState = {
  stage: "idle",
  source: null,
  parseResult: null,
  selectedItems: [],
  progress: null,
  summary: null,
  error: null,
};

export function useImportPipeline() {
  const [state, setState] = useState<ImportPipelineState>(INITIAL_STATE);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  /**
   * Step 1: Upload and parse a file.
   * Transitions: idle → reading → detecting → previewing
   */
  const uploadFile = useCallback(async (file: File) => {
    try {
      setState((s) => ({ ...s, stage: "reading", error: null }));

      const content = await readFile(file);

      setState((s) => ({ ...s, stage: "detecting" }));

      const { result, source } = parseFileContent(content);

      setState((s) => ({
        ...s,
        stage: "previewing",
        source,
        parseResult: result,
        selectedItems: [...result.items],
      }));
    } catch (err) {
      setState((s) => ({
        ...s,
        stage: "error",
        error: err instanceof Error ? err.message : "Failed to parse file",
      }));
    }
  }, []);

  /**
   * Handle file input change event (from file picker or drag-drop).
   */
  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      await uploadFile(file);
      // Clear the input so the same file can be re-selected
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [uploadFile],
  );

  /**
   * Handle drag-and-drop file.
   */
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

  /**
   * Toggle an item's selection during preview.
   */
  const toggleItem = useCallback((index: number) => {
    setState((s) => {
      if (!s.parseResult) return s;
      const item = s.parseResult.items[index];
      if (!item) return s;

      const isSelected = s.selectedItems.includes(item);
      const selectedItems = isSelected
        ? s.selectedItems.filter((i) => i !== item)
        : [...s.selectedItems, item];

      return { ...s, selectedItems };
    });
  }, []);

  /**
   * Select or deselect all items.
   */
  const toggleAll = useCallback((selected: boolean) => {
    setState((s) => {
      if (!s.parseResult) return s;
      return {
        ...s,
        selectedItems: selected ? [...s.parseResult.items] : [],
      };
    });
  }, []);

  /**
   * Step 2: Execute the import with selected items.
   * Transitions: previewing → importing → done
   */
  const confirmImport = useCallback(
    async (vaultId: string) => {
      if (state.selectedItems.length === 0) return;

      setState((s) => ({ ...s, stage: "importing", error: null }));

      try {
        const summary = await executeImport(
          state.selectedItems,
          vaultId,
          (progress) => {
            setState((s) => ({ ...s, progress }));
          },
        );

        setState((s) => ({
          ...s,
          stage: "done",
          summary,
          progress: {
            stage: "done",
            total: state.selectedItems.length,
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
    [state.selectedItems],
  );

  /**
   * Reset pipeline to initial state.
   */
  const reset = useCallback(() => {
    setState(INITIAL_STATE);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  return {
    ...state,
    fileInputRef,
    uploadFile,
    handleFileSelect,
    handleFileDrop,
    toggleItem,
    toggleAll,
    confirmImport,
    reset,
  };
}
