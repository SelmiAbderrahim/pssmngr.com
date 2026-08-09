// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * CSV parsing utilities that handle quoted fields, embedded newlines,
 * and escaped quotes per RFC 4180.
 */

export function parseCSVRows(content: string, delimiter = ","): string[][] {
  const rows: string[][] = [];
  let current: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  while (i < content.length) {
    const ch = content[i];

    if (inQuotes) {
      if (ch === '"') {
        // Escaped quote ("") or end of quoted field
        if (i + 1 < content.length && content[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i++;
        }
      } else {
        field += ch;
        i++;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
      } else if (ch === delimiter) {
        current.push(field);
        field = "";
        i++;
      } else if (ch === "\r") {
        // Handle \r\n or lone \r
        current.push(field);
        field = "";
        if (current.some((f) => f.length > 0)) {
          rows.push(current);
        }
        current = [];
        i += i + 1 < content.length && content[i + 1] === "\n" ? 2 : 1;
      } else if (ch === "\n") {
        current.push(field);
        field = "";
        if (current.some((f) => f.length > 0)) {
          rows.push(current);
        }
        current = [];
        i++;
      } else {
        field += ch;
        i++;
      }
    }
  }

  // Flush last field/row
  current.push(field);
  if (current.some((f) => f.length > 0)) {
    rows.push(current);
  }

  return rows;
}

export function csvToObjects(
  content: string,
  delimiter = ","
): Record<string, string>[] {
  const rows = parseCSVRows(content, delimiter);
  if (rows.length < 2) return [];

  const headerRow = rows[0];
  if (!headerRow) return [];
  const headers = headerRow.map((h) => h.trim().toLowerCase());
  const objects: Record<string, string>[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const obj: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      const header = headers[j];
      if (!header) continue;
      obj[header] = (row[j] ?? "").trim();
    }
    objects.push(obj);
  }

  return objects;
}

export function normalizeLineEndings(content: string): string {
  return content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

/**
 * Detect duplicates by URL + username combination for login items.
 */
export function findDuplicates(
  items: Array<{ type: string; fields: Record<string, string> }>,
  indexOffset = 0
): Map<string, Array<{ index: number; item: (typeof items)[number] }>> {
  const seen = new Map<
    string,
    Array<{ index: number; item: (typeof items)[number] }>
  >();

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item) continue;
    if (item.type !== "login") continue;

    const url = (item.fields.url ?? "").toLowerCase().trim();
    const username = (item.fields.username ?? "").toLowerCase().trim();
    if (!url && !username) continue;

    const key = `${url}|${username}`;
    const group = seen.get(key) ?? [];
    group.push({ index: i + indexOffset, item });
    seen.set(key, group);
  }

  // Only return groups with 2+ entries
  const duplicates = new Map<
    string,
    Array<{ index: number; item: (typeof items)[number] }>
  >();
  for (const [key, group] of seen) {
    if (group.length > 1) {
      duplicates.set(key, group);
    }
  }

  return duplicates;
}
