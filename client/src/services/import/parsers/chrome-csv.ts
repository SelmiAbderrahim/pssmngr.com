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
 * Chrome password CSV export format.
 * Headers: name,url,username,password,note
 * (Chrome 114+ also exports "note" column)
 */

const FIELD_MAP: Record<string, string> = {
  url: "url",
  username: "username",
  password: "password",
  note: "notes",
  notes: "notes",
};

export const chromeCSVParser: ImportParser = {
  name: "Chrome (CSV)",

  detect(content: string): boolean {
    const firstLine = content.split(/\r?\n/)[0]?.toLowerCase() ?? "";
    // Chrome CSV is minimal: name, url, username, password
    // Distinguish from 1Password/Bitwarden by absence of their specific columns
    const hasName = firstLine.includes("name");
    const hasUrl = firstLine.includes("url");
    const hasUsername = firstLine.includes("username");
    const hasPassword = firstLine.includes("password");
    const notBitwarden = !firstLine.includes("login_uri");
    const not1Password =
      !firstLine.includes("notesplain") && !firstLine.includes("login uri");
    const notLastPass = !firstLine.includes("grouping");

    return (
      hasName && hasUrl && hasUsername && hasPassword &&
      notBitwarden && not1Password && notLastPass
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

        // Chrome only exports login credentials
        const title =
          (row.name ?? "").trim() ||
          extractDomain(fields.url) ||
          `Imported item ${i + 1}`;

        // Skip rows with no meaningful data
        if (!fields.url && !fields.username && !fields.password) {
          errors.push({
            line: lineNum,
            message: "Row has no URL, username, or password",
            raw: JSON.stringify(row),
          });
          continue;
        }

        items.push({ type: "login", title, fields });
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

function extractDomain(url?: string): string {
  if (!url) return "";
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}
