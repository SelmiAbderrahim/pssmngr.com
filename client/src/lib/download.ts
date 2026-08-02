// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * File download utilities.
 *
 * Shared helpers for triggering browser downloads from base64 data or blobs.
 *
 * @module lib/download
 */

/**
 * Decode base64 to a Uint8Array and trigger a browser download.
 *
 * Uses Blob + Object URL instead of data-URL to avoid browser size limits.
 */
export function downloadBase64File(
  base64Data: string,
  filename: string,
  mimeType: string,
) {
  const binaryStr = atob(base64Data);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  const blob = new Blob([bytes], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
