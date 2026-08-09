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
 * Bitwarden CSV export format.
 * Headers: folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp
 */

const FIELD_MAP: Record<string, string> = {
  login_uri: "url",
  login_username: "username",
  login_password: "password",
  login_totp: "totp",
  notes: "notes",
  name: "title",
};

const TYPE_MAP: Record<string, ImportedItem["type"]> = {
  login: "login",
  note: "note",
  "secure note": "note",
  card: "card",
  identity: "identity",
};

function mapFields(row: Record<string, string>): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const [key, value] of Object.entries(row)) {
    if (!value) continue;
    const mapped = FIELD_MAP[key];
    if (mapped && mapped !== "title") {
      fields[mapped] = value;
    }
  }

  // Parse custom fields from the "fields" column (Bitwarden format: "name: value\n")
  const customFieldsStr = row.fields ?? "";
  if (customFieldsStr) {
    const customEntries = customFieldsStr.split("\n");
    for (const entry of customEntries) {
      const colonIdx = entry.indexOf(":");
      if (colonIdx > 0) {
        const name = entry.slice(0, colonIdx).trim();
        const value = entry.slice(colonIdx + 1).trim();
        if (name && value) {
          fields[`custom_${name}`] = value;
        }
      }
    }
  }

  return fields;
}

export const bitwardenCSVParser: ImportParser = {
  name: "Bitwarden (CSV)",

  detect(content: string): boolean {
    const firstLine = content.split(/\r?\n/)[0]?.toLowerCase() ?? "";
    // Bitwarden CSV has these distinctive columns
    return (
      firstLine.includes("login_uri") &&
      firstLine.includes("login_username") &&
      firstLine.includes("login_password")
    );
  },

  parse(content: string): ImportResult {
    const rows = csvToObjects(content);
    const items: ImportedItem[] = [];
    const errors: ImportError[] = [];

    if (rows.length === 0) {
      errors.push({ line: 1, message: "Empty file or missing headers" });
      return {
        items: [],
        errors,
        duplicates: [],
        stats: { total: 0, parsed: 0, skipped: 0, duplicateCount: 0 },
      };
    }

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row) continue;
      const lineNum = i + 2;

      try {
        const fields = mapFields(row);
        const title = (row.name ?? "").trim() || `Imported item ${i + 1}`;
        const rawType = (row.type ?? "login").toLowerCase().trim();
        const type = TYPE_MAP[rawType] ?? "login";
        const folder = (row.folder ?? "").trim() || undefined;
        const favorite = (row.favorite ?? "").trim();
        const tags = favorite === "1" ? ["favorite"] : undefined;

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
