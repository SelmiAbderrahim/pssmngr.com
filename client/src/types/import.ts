// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
// Import/Export types for password manager data migration

export type ImportItemType = "login" | "card" | "note" | "identity" | "totp";

export interface ImportedItem {
  type: ImportItemType;
  title: string;
  fields: Record<string, string>;
  folder?: string;
  tags?: string[];
}

export interface ImportError {
  line: number;
  message: string;
  raw?: string;
}

export interface DuplicateGroup {
  key: string;
  items: Array<{ index: number; item: ImportedItem }>;
}

export interface ImportResult {
  items: ImportedItem[];
  errors: ImportError[];
  duplicates: DuplicateGroup[];
  stats: {
    total: number;
    parsed: number;
    skipped: number;
    duplicateCount: number;
  };
}

export interface ImportParser {
  name: string;
  detect(content: string): boolean;
  parse(content: string): ImportResult;
}

export interface FieldMapping {
  source: string;
  target: string;
}

export interface GenericCSVOptions {
  fieldMappings: FieldMapping[];
  hasHeaders?: boolean;
  delimiter?: string;
}

// ── Import Pipeline Types ──────────────────────────────────────────

export type ImportPipelineStage =
  | "idle"
  | "reading"
  | "detecting"
  | "previewing"
  | "importing"
  | "done"
  | "error";

export interface ImportProgress {
  stage: ImportPipelineStage;
  /** Total items to import (after user confirmation) */
  total: number;
  /** Items encrypted and saved so far */
  imported: number;
  /** Items skipped (duplicates or user-deselected) */
  skipped: number;
  /** Items that failed during encrypt/save */
  errors: number;
}

export interface ImportSummary {
  imported: number;
  skipped: number;
  errors: ImportItemError[];
  durationMs: number;
}

export interface ImportItemError {
  index: number;
  title: string;
  message: string;
  /**
   * Batch the failed item belonged to. Reusing it on a retry keeps the
   * retried batch under its original idempotency key.
   */
  batchIndex?: number;
}
