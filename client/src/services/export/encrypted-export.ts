// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Encrypted Export Service
 *
 * Exports vault items as an encrypted .pssmngr file.
 * All decryption and re-encryption happens client-side — the server
 * never sees plaintext vault data.
 *
 * Export flow:
 *   1. Fetch all encrypted items from server (paginated)
 *   2. Decrypt each item client-side
 *   3. Serialize decrypted items to JSON
 *   4. Encrypt entire JSON blob with vault key (XChaCha20-Poly1305)
 *   5. Package as PSSMNGRExport and trigger browser download
 */

import { vaultCrypto } from "@/services/vault-crypto";
import type { ServerItemRecord } from "@/services/vault-crypto";
import { trpcQuery } from "@/lib/api/trpc";
import { uint8ToBase64, base64ToUint8 } from "@/lib/vault-crypto";
import type {
  PSSMNGRExport,
  ExportedVaultItem,
  ExportResult,
} from "@/types/export";

// ── Constants ────────────────────────────────────────────────────────

const EXPORT_VERSION = 1 as const;
const PAGE_SIZE = 100;
const FILE_EXTENSION = ".pssmngr";

// ── Fetch all vault items (paginated) ────────────────────────────────

interface ListResponse {
  items: ServerItemRecord[];
  nextCursor?: string;
}

/**
 * Fetch all items from a vault using cursor pagination.
 */
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

// ── Export ────────────────────────────────────────────────────────────

export interface ExportProgressCallback {
  (stage: "fetching" | "decrypting" | "encrypting" | "downloading", current: number, total: number): void;
}

/**
 * Export all vault items as an encrypted .pssmngr file.
 *
 * @param vaultId - Vault to export
 * @param onProgress - Optional progress callback
 * @returns Export result with item count and file size
 * @throws If vault is locked or export fails
 */
export async function exportEncrypted(
  vaultId: string,
  onProgress?: ExportProgressCallback,
): Promise<ExportResult> {
  // 1. Fetch all encrypted items from server
  onProgress?.("fetching", 0, 0);
  const serverItems = await fetchAllItems(vaultId);
  const total = serverItems.length;

  if (total === 0) {
    throw new Error("No items to export");
  }

  // 2. Decrypt each item client-side
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

  // 3. Serialize to JSON and encrypt with vault key
  onProgress?.("encrypting", 0, 1);
  const jsonPayload = JSON.stringify(decryptedItems);
  const payloadBytes = new TextEncoder().encode(jsonPayload);
  const encryptedBlob = await vaultCrypto.encryptBlob(payloadBytes);

  // encryptBlob returns base64 of [nonce (24 bytes)][ciphertext+tag]
  // We need to split it back for the PSSMNGRExport format
  const packed = base64ToUint8(encryptedBlob);
  const nonceLen = 24; // XChaCha20-Poly1305 nonce
  const tagLen = 16; // Poly1305 auth tag

  const nonce = packed.slice(0, nonceLen);
  const ciphertextWithTag = packed.slice(nonceLen);
  const ciphertext = ciphertextWithTag.slice(0, -tagLen);
  const authTag = ciphertextWithTag.slice(-tagLen);

  onProgress?.("encrypting", 1, 1);

  // 4. Package as PSSMNGRExport
  const exportData: PSSMNGRExport = {
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    itemCount: decryptedItems.length,
    ciphertext: uint8ToBase64(ciphertext),
    nonce: uint8ToBase64(nonce),
    authTag: uint8ToBase64(authTag),
  };

  const fileContent = JSON.stringify(exportData, null, 2);
  const fileBytes = new TextEncoder().encode(fileContent);

  // 5. Trigger browser download
  onProgress?.("downloading", 0, 1);
  const timestamp = new Date().toISOString().slice(0, 10);
  const filename = `pssmngr-export-${timestamp}${FILE_EXTENSION}`;

  triggerDownload(fileBytes, filename, "application/json");
  onProgress?.("downloading", 1, 1);

  return {
    itemCount: decryptedItems.length,
    fileSize: fileBytes.length,
    filename,
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
