// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Import Pipeline
 *
 * Orchestrates the full import flow:
 *   file read → format detect → parse → preview → encrypt → batch save
 *
 * All file data is processed in memory only — no temp files on disk.
 * Batch saves in groups of 50 with progress callbacks.
 */

import type {
  ImportedItem,
  ImportResult,
  ImportProgress,
  ImportSummary,
  ImportItemError,
  ImportItemType,
} from "@/types/import";
import { detectParser } from "./index";
import { vaultCrypto } from "@/services/vault-crypto";
import { trpcMutation } from "@/lib/api/trpc";
import { saveEncryptedBatches, type BulkSaveEntry } from "./bulk-save";

/**
 * Mint a non-secret operation id for one import run. Reusing it on a retry
 * makes the retry idempotent per batch; it carries no item content.
 */
export function newImportOperationId(): string {
  const uuid =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `import-${uuid}`.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 64);
}

export type ProgressCallback = (progress: ImportProgress) => void;

export interface ParsedImport {
  result: ImportResult;
  source: string;
}

/**
 * Read a File object and return its text content.
 * Processes entirely in memory — no temp files.
 */
export function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
}

/**
 * Parse file content: auto-detect format and return parsed items.
 */
export function parseFileContent(content: string): ParsedImport {
  const parser = detectParser(content);
  const result = parser.parse(content);
  return { result, source: parser.name };
}

/**
 * Map an ImportItemType to the server's itemType enum value.
 */
function mapItemType(type: ImportItemType): string {
  switch (type) {
    case "login":
      return "login";
    case "card":
      return "card";
    case "note":
      return "note";
    case "identity":
      return "identity";
    case "totp":
      return "totp";
    default:
      return "login";
  }
}

/**
 * Build the plaintext object that gets encrypted for a single imported item.
 */
function buildPlaintext(item: ImportedItem): Record<string, unknown> {
  return {
    title: item.title,
    type: item.type,
    fields: item.fields,
    ...(item.folder ? { folder: item.folder } : {}),
    ...(item.tags?.length ? { tags: item.tags } : {}),
  };
}

/**
 * Execute the import: encrypt items client-side and batch-save to server.
 *
 * @param items     - Items to import (after user review/confirmation)
 * @param vaultId   - Target vault ID
 * @param onProgress - Progress callback for UI updates
 * @returns Import summary with counts and errors
 */
export async function executeImport(
  items: ImportedItem[],
  vaultId: string,
  onProgress?: ProgressCallback,
  options: { operationId?: string; batchIndexes?: number[] } = {},
): Promise<ImportSummary> {
  const startTime = Date.now();
  const operationId = options.operationId ?? newImportOperationId();

  // Stable, non-secret row keys. The index is the caller's identity for a row;
  // no title, value, or fingerprint is used.
  const entries: BulkSaveEntry[] = items.map((item, index) => ({
    key: String(index),
    itemType: mapItemType(item.type),
    data: buildPlaintext(item),
    ...(options.batchIndexes?.[index] !== undefined
      ? { batchIndex: options.batchIndexes[index] }
      : {}),
  }));

  const emit = (saved: number, failedCount: number) => {
    onProgress?.({
      stage: "importing",
      total: items.length,
      imported: saved,
      skipped: failedCount,
      errors: failedCount,
    });
  };

  emit(0, 0);

  const { saved, failed, failures } = await saveEncryptedBatches(entries, {
    operationId,
    vaultId,
    encrypt: (data) => vaultCrypto.encryptItem(data),
    submit: ({ items: encryptedItems, idempotencyKey }) =>
      trpcMutation<{ created: number }>("credentials", "batchCreate", {
        vaultId,
        items: encryptedItems,
        idempotencyKey,
      }),
    onProgress: (progress) => emit(progress.saved, 0),
  });

  const errors: ImportItemError[] = failures.map((failure) => {
    const index = Number(failure.key);
    return {
      index,
      title: items[index]?.title ?? `Item ${index + 1}`,
      message: failure.message,
      batchIndex: failure.batchIndex,
    };
  });

  emit(saved.length, failed.length);

  return {
    imported: saved.length,
    skipped: failed.length,
    errors,
    durationMs: Date.now() - startTime,
  };
}
