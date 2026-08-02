// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Plaintext Export Service
 *
 * Exports vault items as unencrypted CSV or JSON files.
 * All decryption happens client-side — the server never sees plaintext data.
 *
 * SECURITY: These exports contain passwords in plaintext. The UI must show
 * a prominent warning dialog and require explicit confirmation before calling
 * these functions.
 *
 * Export flow:
 *   1. Fetch all encrypted items from server (paginated)
 *   2. Decrypt each item client-side
 *   3. Format as CSV or JSON
 *   4. Trigger browser download
 *   5. Log export event (timestamp only)
 */

import { vaultCrypto } from "@/services/vault-crypto";
import type { ServerItemRecord } from "@/services/vault-crypto";
import { trpcQuery } from "@/lib/api/trpc";
import type {
  ExportedVaultItem,
  PlaintextExportFormat,
  PlaintextExportResult,
} from "@/types/export";

// ── Constants ────────────────────────────────────────────────────────

const PAGE_SIZE = 100;

/** CSV column order — matches common password manager import formats. */
const CSV_COLUMNS = [
  "title",
  "username",
  "password",
  "url",
  "notes",
  "type",
] as const;

// ── Fetch all vault items (paginated) ────────────────────────────────

interface ListResponse {
  items: ServerItemRecord[];
  nextCursor?: string;
}

async function fetchAllItems(vaultId: string): Promise<ServerItemRecord[]> {
  const all: ServerItemRecord[] = [];
  let cursor: string | undefined;

  do {
    const params: Record<string, unknown> = {
      vaultId,
      limit: PAGE_SIZE,
    };
    if (cursor) params.cursor = cursor;

    const page = await trpcQuery<ListResponse>(
      "credentials",
      "list",
      params,
    );
    all.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);

  return all;
}

// ── Decrypt items ────────────────────────────────────────────────────

export interface PlaintextExportProgressCallback {
  (
    stage: "fetching" | "decrypting" | "formatting" | "downloading",
    current: number,
    total: number,
  ): void;
}

async function decryptAllItems(
  vaultId: string,
  onProgress?: PlaintextExportProgressCallback,
): Promise<ExportedVaultItem[]> {
  onProgress?.("fetching", 0, 0);
  const serverItems = await fetchAllItems(vaultId);
  const total = serverItems.length;

  if (total === 0) {
    throw new Error("No items to export");
  }

  const decryptedItems: ExportedVaultItem[] = [];

  for (let i = 0; i < serverItems.length; i++) {
    onProgress?.("decrypting", i + 1, total);
    const record = serverItems[i];
    if (!record) continue;
    const plaintext = await vaultCrypto.decryptServerItem(record);

    decryptedItems.push({
      itemType: record.itemType,
      title: (plaintext.title as string) ?? "",
      fields: (plaintext.fields as Record<string, string>) ?? {},
      ...(plaintext.folder ? { folder: plaintext.folder as string } : {}),
      ...(plaintext.tags ? { tags: plaintext.tags as string[] } : {}),
    });
  }

  return decryptedItems;
}

// ── CSV formatting ───────────────────────────────────────────────────

/**
 * Escape a value for CSV output (RFC 4180).
 * Wraps in double quotes if the value contains commas, quotes, or newlines.
 */
function escapeCsvValue(value: string): string {
  if (
    value.includes(",") ||
    value.includes('"') ||
    value.includes("\n") ||
    value.includes("\r")
  ) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Format decrypted items as CSV string.
 */
export function formatItemsAsCsv(items: ExportedVaultItem[]): string {
  const header = CSV_COLUMNS.join(",");
  const rows = items.map((item) => {
    const values = CSV_COLUMNS.map((col) => {
      if (col === "title") return escapeCsvValue(item.title);
      if (col === "type") return escapeCsvValue(item.itemType);
      if (col === "notes") return escapeCsvValue(item.fields.notes ?? item.fields.content ?? "");
      return escapeCsvValue(item.fields[col] ?? "");
    });
    return values.join(",");
  });

  return [header, ...rows].join("\n");
}

// ── JSON formatting ──────────────────────────────────────────────────

/**
 * Format decrypted items as a JSON array.
 * Each item has flat fields: title, type, username, password, url, notes,
 * plus folder/tags if present.
 */
export function formatItemsAsJson(items: ExportedVaultItem[]): string {
  const flat = items.map((item) => ({
    title: item.title,
    type: item.itemType,
    username: item.fields.username ?? "",
    password: item.fields.password ?? "",
    url: item.fields.url ?? "",
    notes: item.fields.notes ?? item.fields.content ?? "",
    fields: item.fields,
    ...(item.folder ? { folder: item.folder } : {}),
    ...(item.tags?.length ? { tags: item.tags } : {}),
  }));

  return JSON.stringify(flat, null, 2);
}

// ── Export functions ──────────────────────────────────────────────────

/**
 * Export all vault items as a plaintext CSV file.
 *
 * @param vaultId - Vault to export
 * @param onProgress - Optional progress callback
 * @returns Export result with item count and file size
 * @throws If vault is locked or export fails
 */
export async function exportPlaintextCsv(
  vaultId: string,
  onProgress?: PlaintextExportProgressCallback,
): Promise<PlaintextExportResult> {
  const items = await decryptAllItems(vaultId, onProgress);

  onProgress?.("formatting", 0, 1);
  const csvContent = formatItemsAsCsv(items);
  onProgress?.("formatting", 1, 1);

  const fileBytes = new TextEncoder().encode(csvContent);
  const timestamp = new Date().toISOString().slice(0, 10);
  const filename = `pssmngr-export-${timestamp}.csv`;
  const exportedAt = new Date().toISOString();

  onProgress?.("downloading", 0, 1);
  triggerDownload(fileBytes, filename, "text/csv;charset=utf-8");
  onProgress?.("downloading", 1, 1);

  logExportEvent("csv");

  return {
    itemCount: items.length,
    fileSize: fileBytes.length,
    filename,
    format: "csv",
    exportedAt,
  };
}

/**
 * Export all vault items as a plaintext JSON file.
 *
 * @param vaultId - Vault to export
 * @param onProgress - Optional progress callback
 * @returns Export result with item count and file size
 * @throws If vault is locked or export fails
 */
export async function exportPlaintextJson(
  vaultId: string,
  onProgress?: PlaintextExportProgressCallback,
): Promise<PlaintextExportResult> {
  const items = await decryptAllItems(vaultId, onProgress);

  onProgress?.("formatting", 0, 1);
  const jsonContent = formatItemsAsJson(items);
  onProgress?.("formatting", 1, 1);

  const fileBytes = new TextEncoder().encode(jsonContent);
  const timestamp = new Date().toISOString().slice(0, 10);
  const filename = `pssmngr-export-${timestamp}.json`;
  const exportedAt = new Date().toISOString();

  onProgress?.("downloading", 0, 1);
  triggerDownload(fileBytes, filename, "application/json");
  onProgress?.("downloading", 1, 1);

  logExportEvent("json");

  return {
    itemCount: items.length,
    fileSize: fileBytes.length,
    filename,
    format: "json",
    exportedAt,
  };
}

// ── Download helper ──────────────────────────────────────────────────

function triggerDownload(
  data: Uint8Array,
  filename: string,
  mimeType: string,
): void {
  const blob = new Blob([data.buffer as ArrayBuffer], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Export event logging ─────────────────────────────────────────────

/**
 * Log a plaintext export event. Records timestamp and format only —
 * never the exported content.
 */
function logExportEvent(format: PlaintextExportFormat): void {
  try {
    const events = JSON.parse(
      localStorage.getItem("pssmngr_export_log") ?? "[]",
    ) as Array<{ timestamp: string; format: string }>;
    events.push({ timestamp: new Date().toISOString(), format });
    // Keep last 50 events
    const trimmed = events.slice(-50);
    localStorage.setItem("pssmngr_export_log", JSON.stringify(trimmed));
  } catch {
    // Silently ignore — logging is best-effort
  }
}
