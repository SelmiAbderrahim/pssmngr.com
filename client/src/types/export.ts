// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Encrypted export types for .pssmngr format.
 *
 * The entire vault is encrypted as a single blob using the vault key
 * (XChaCha20-Poly1305). The file is self-contained and can be re-imported
 * by providing the master password to derive the vault key.
 */

/** Top-level .pssmngr export file structure (JSON). */
export interface PSSMNGRExport {
  /** Format version — always 1 for initial release. */
  version: 1;
  /** ISO 8601 timestamp of when the export was created. */
  exportedAt: string;
  /** Number of items in the export (plaintext metadata for UI). */
  itemCount: number;
  /** Base64-encoded ciphertext of the serialized vault items. */
  ciphertext: string;
  /** Base64-encoded 192-bit nonce used for encryption. */
  nonce: string;
  /** Base64-encoded 128-bit authentication tag. */
  authTag: string;
}

/** A single decrypted vault item as stored in the export payload. */
export interface ExportedVaultItem {
  itemType: string;
  title: string;
  fields: Record<string, string>;
  folder?: string;
  tags?: string[];
}

/** Result of an encrypted export operation. */
export interface ExportResult {
  /** Number of items exported. */
  itemCount: number;
  /** Size of the export file in bytes. */
  fileSize: number;
  /** Filename used for the download. */
  filename: string;
}

// ── Plaintext Export Types ─────────────────────────────────────────────

/** Supported plaintext export formats. */
export type PlaintextExportFormat = "csv" | "json";

/** Result of a plaintext export operation. */
export interface PlaintextExportResult {
  /** Number of items exported. */
  itemCount: number;
  /** Size of the export file in bytes. */
  fileSize: number;
  /** Filename used for the download. */
  filename: string;
  /** Format used for the export. */
  format: PlaintextExportFormat;
  /** ISO 8601 timestamp of when the export was created. */
  exportedAt: string;
}
