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
 * LastPass CSV export format.
 * Headers: url,username,password,totp,extra,name,grouping,fav
 */

const FIELD_MAP: Record<string, string> = {
  url: "url",
  username: "username",
  password: "password",
  totp: "totp",
  extra: "notes",
};

export const lastPassCSVParser: ImportParser = {
  name: "LastPass (CSV)",

  detect(content: string): boolean {
    const firstLine = content.split(/\r?\n/)[0]?.toLowerCase() ?? "";
    // LastPass has distinctive "grouping" and "extra" columns
    return (
      firstLine.includes("url") &&
      firstLine.includes("username") &&
      firstLine.includes("password") &&
      firstLine.includes("grouping") &&
      firstLine.includes("extra")
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
        const fields: Record<string, string> = {};
        for (const [key, value] of Object.entries(row)) {
          if (!value) continue;
          const mapped = FIELD_MAP[key];
          if (mapped) {
            fields[mapped] = value;
          }
        }

        const title = (row.name ?? "").trim() || `Imported item ${i + 1}`;

        // LastPass uses "grouping" for folders (e.g., "Social" or "Finance/Banking")
        const grouping = (row.grouping ?? "").trim();
        const folder =
          grouping && grouping !== "(none)" && grouping !== "none"
            ? grouping
            : undefined;

        // Determine type: LastPass uses url "http://sn" for secure notes
        const url = (row.url ?? "").trim();
        let type: ImportedItem["type"] = "login";
        if (url === "http://sn" || url === "http://sn/") {
          type = "note";
          // For secure notes, move the "extra" content to notes and remove URL
          delete fields.url;
        }

        const fav = (row.fav ?? "").trim();
        const tags = fav === "1" ? ["favorite"] : undefined;

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
