// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import type {
  ImportParser,
  ImportResult,
  ImportedItem,
  ImportError,
} from "@/types/import";
import { csvToObjects, findDuplicates } from "../csv-utils";

/**
 * 1Password CSV export format.
 * Headers: Title, Url, Username, Password, Notes, Type, Tags
 * (may vary slightly between 1Password versions)
 */

const EXPECTED_HEADERS = ["title", "username", "password"];

const FIELD_MAP: Record<string, string> = {
  url: "url",
  website: "url",
  "login uri": "url",
  login_uri: "url",
  username: "username",
  "login username": "username",
  login_username: "username",
  password: "password",
  "login password": "password",
  login_password: "password",
  title: "title",
  name: "title",
  notes: "notes",
  notesplain: "notes",
  "additional info": "notes",
  otp: "totp",
  "one-time password": "totp",
};

function mapFields(row: Record<string, string>): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const [key, value] of Object.entries(row)) {
    if (!value) continue;
    const mapped = FIELD_MAP[key];
    if (mapped) {
      fields[mapped] = value;
    }
  }
  return fields;
}

function inferType(
  row: Record<string, string>
): ImportedItem["type"] {
  const type = (row.type ?? "").toLowerCase();
  if (type.includes("card") || type.includes("credit")) return "card";
  if (type.includes("note") || type.includes("secure")) return "note";
  if (type.includes("identity") || type.includes("address")) return "identity";
  // Default: if it has a password or URL, it's a login
  if (row.password || row.url || row.website || row.username) return "login";
  if (row.notes || row.notesplain) return "note";
  return "login";
}

export const onePasswordCSVParser: ImportParser = {
  name: "1Password (CSV)",

  detect(content: string): boolean {
    const firstLine = content.split(/\r?\n/)[0]?.toLowerCase() ?? "";
    // 1Password CSVs typically have "title" and ("username" or "login_username")
    const hasTitle = firstLine.includes("title");
    const hasUsername =
      firstLine.includes("username") || firstLine.includes("login_username");
    const hasPassword =
      firstLine.includes("password") || firstLine.includes("login_password");
    // Distinguish from other formats: 1Password has "notes" or "notesPlain" column
    const has1PMarker =
      firstLine.includes("notesplain") ||
      firstLine.includes("login uri") ||
      firstLine.includes("login_uri") ||
      (hasTitle && firstLine.includes("type") && firstLine.includes("notes"));
    return hasTitle && hasUsername && hasPassword && has1PMarker;
  },

  parse(content: string): ImportResult {
    const rows = csvToObjects(content);
    const items: ImportedItem[] = [];
    const errors: ImportError[] = [];

    // Validate headers
    if (rows.length === 0) {
      errors.push({ line: 1, message: "Empty file or missing headers" });
      return {
        items: [],
        errors,
        duplicates: [],
        stats: { total: 0, parsed: 0, skipped: 0, duplicateCount: 0 },
      };
    }

    const firstRow = rows[0];
    if (firstRow) {
      const headers = Object.keys(firstRow);
      const missingHeaders = EXPECTED_HEADERS.filter(
        (h) => !headers.some((hdr) => FIELD_MAP[hdr] === h || hdr === h)
      );
      if (missingHeaders.length > 0) {
        errors.push({
          line: 1,
          message: `Missing expected columns: ${missingHeaders.join(", ")}`,
        });
      }
    }

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row) continue;
      const lineNum = i + 2; // +1 for 0-index, +1 for header row

      try {
        const fields = mapFields(row);
        const title = fields.title || `Imported item ${i + 1}`;
        delete fields.title;

        const type = inferType(row);
        const folder = (row.vault ?? row.folder ?? row.group ?? "").trim() || undefined;
        const tagStr = (row.tags ?? row.tag ?? "").trim();
        const tags = tagStr
          ? tagStr.split(/[,;]/).map((t) => t.trim()).filter(Boolean)
          : undefined;

        items.push({ type, title, fields, folder, tags });
      } catch {
        errors.push({
          line: lineNum,
          message: "Failed to parse row",
          raw: JSON.stringify(row),
        });
      }
    }

    const dupMap = findDuplicates(items);
    const duplicates = Array.from(dupMap.entries()).map(([key, group]) => ({
      key,
      items: group.map((g) => ({
        index: g.index,
        item: g.item as ImportedItem,
      })),
    }));
    const duplicateCount = duplicates.reduce(
      (sum, d) => sum + d.items.length - 1,
      0
    );

    return {
      items,
      errors,
      duplicates,
      stats: {
        total: rows.length,
        parsed: items.length,
        skipped: rows.length - items.length,
        duplicateCount,
      },
    };
  },
};
