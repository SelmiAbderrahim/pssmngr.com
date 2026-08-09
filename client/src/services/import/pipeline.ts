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

const BATCH_SIZE = 50;

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
): Promise<ImportSummary> {
  const startTime = Date.now();
  const errors: ImportItemError[] = [];
  let imported = 0;
  let skipped = 0;

  const progress: ImportProgress = {
    stage: "importing",
    total: items.length,
    imported: 0,
    skipped: 0,
    errors: 0,
  };

  const emitProgress = () => {
    progress.imported = imported;
    progress.skipped = skipped;
    progress.errors = errors.length;
    onProgress?.({ ...progress });
  };

  emitProgress();

  // Process in batches of BATCH_SIZE
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);

    // Encrypt each item in the batch in parallel
    const encryptedBatch: Array<{
      itemType: string;
      ciphertext: string;
      nonce: string;
      authTag: string;
      wrappedDataKey: string;
      wrappedDataKeyNonce: string;
      wrappedDataKeyAuthTag: string;
    } | null> = await Promise.all(
      batch.map(async (item, batchIndex) => {
        const globalIndex = i + batchIndex;
        try {
          const plaintext = buildPlaintext(item);
          const encrypted = await vaultCrypto.encryptItem(plaintext);
          return {
            itemType: mapItemType(item.type),
            ...encrypted,
          };
        } catch (err) {
          errors.push({
            index: globalIndex,
            title: item.title,
            message:
              err instanceof Error ? err.message : "Encryption failed",
          });
          return null;
        }
      }),
    );

    // Filter out failed encryptions
    const validItems = encryptedBatch.filter(
      (item): item is NonNullable<typeof item> => item !== null,
    );
    const failedCount = encryptedBatch.length - validItems.length;
    skipped += failedCount;

    // Send batch to server
    if (validItems.length > 0) {
      try {
        const result = await trpcMutation<{ created: number }>(
          "credentials",
          "batchCreate",
          { vaultId, items: validItems },
        );
        imported += result.created;
      } catch (err) {
        // If the whole batch fails, record errors for each item
        for (let j = 0; j < validItems.length; j++) {
          const globalIndex = i + j;
          errors.push({
            index: globalIndex,
            title: batch[j]?.title ?? `Item ${globalIndex + 1}`,
            message: err instanceof Error ? err.message : "Save failed",
          });
        }
      }
    }

    emitProgress();
  }

  return {
    imported,
    skipped,
    errors,
    durationMs: Date.now() - startTime,
  };
}
