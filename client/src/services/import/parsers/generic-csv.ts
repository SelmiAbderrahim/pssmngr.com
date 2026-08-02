// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import type {
  ImportParser,
  ImportResult,
  ImportedItem,
  ImportError,
  GenericCSVOptions,
  FieldMapping,
} from "@/types/import";
import { csvToObjects, parseCSVRows, findDuplicates } from "../csv-utils";

/**
 * Generic CSV parser with user-defined field mappings.
 * Used when no specific format is detected, or when the user
 * provides custom column-to-field mapping.
 */

/** Default field mapping guesses based on common column names. */
const AUTO_MAP: Record<string, string> = {
  url: "url",
  website: "url",
  uri: "url",
  link: "url",
  "web site": "url",
  login_uri: "url",
  username: "username",
  user: "username",
  login: "username",
  email: "username",
  "e-mail": "username",
  "user name": "username",
  account: "username",
  password: "password",
  pass: "password",
  passwd: "password",
  secret: "password",
  title: "title",
  name: "title",
  label: "title",
  description: "title",
  entry: "title",
  notes: "notes",
  note: "notes",
  extra: "notes",
  comment: "notes",
  comments: "notes",
  memo: "notes",
  folder: "folder",
  group: "folder",
  category: "folder",
  grouping: "folder",
  tags: "tags",
  tag: "tags",
  totp: "totp",
  otp: "totp",
  "2fa": "totp",
};

function applyMappings(
  row: Record<string, string>,
  mappings: FieldMapping[]
): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const { source, target } of mappings) {
    const value = row[source];
    if (value) {
      fields[target] = value;
    }
  }
  return fields;
}

function autoMapRow(row: Record<string, string>): {
  fields: Record<string, string>;
  folder?: string;
  tags?: string[];
} {
  const fields: Record<string, string> = {};
  let folder: string | undefined;
  let tags: string[] | undefined;

  for (const [key, value] of Object.entries(row)) {
    if (!value) continue;
    const mapped = AUTO_MAP[key];
    if (mapped === "folder") {
      folder = value;
    } else if (mapped === "tags") {
      tags = value
        .split(/[,;]/)
        .map((t) => t.trim())
        .filter(Boolean);
    } else if (mapped && mapped !== "title") {
      fields[mapped] = value;
    }
  }

  return { fields, folder, tags };
}

export function createGenericCSVParser(
  options?: GenericCSVOptions
): ImportParser {
  const hasCustomMappings =
    options?.fieldMappings && options.fieldMappings.length > 0;

  return {
    name: "Generic CSV",

    detect(content: string): boolean {
      // Generic parser is a fallback — only detect if it looks like CSV
      const firstLine = content.split(/\r?\n/)[0] ?? "";
      const delimiter = options?.delimiter ?? ",";
      // Must have at least 2 columns and look like CSV
      return firstLine.split(delimiter).length >= 2;
    },

    parse(content: string): ImportResult {
      const delimiter = options?.delimiter ?? ",";
      const items: ImportedItem[] = [];
      const errors: ImportError[] = [];

      if (options?.hasHeaders === false) {
        // No headers — use positional field mappings
        const rawRows = parseCSVRows(content, delimiter);
        if (!hasCustomMappings) {
          errors.push({
            line: 1,
            message:
              "Headerless CSV requires explicit field mappings",
          });
          return {
            items: [],
            errors,
            duplicates: [],
            stats: { total: 0, parsed: 0, skipped: 0, duplicateCount: 0 },
          };
        }

        for (let i = 0; i < rawRows.length; i++) {
          const rawRow = rawRows[i];
          if (!rawRow) continue;
          try {
            const row: Record<string, string> = {};
            for (let j = 0; j < rawRow.length; j++) {
              const cell = rawRow[j];
              if (cell !== undefined) {
                row[String(j)] = cell;
              }
            }
            const fields = applyMappings(row, options!.fieldMappings);
            const title =
              fields.title || fields.url || `Imported item ${i + 1}`;
            delete fields.title;

            items.push({ type: "login", title, fields });
          } catch {
            errors.push({
              line: i + 1,
              message: "Failed to parse row",
            });
          }
        }
      } else {
        // With headers
        const rows = csvToObjects(content, delimiter);

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
            let fields: Record<string, string>;
            let folder: string | undefined;
            let tags: string[] | undefined;

            if (hasCustomMappings) {
              fields = applyMappings(row, options!.fieldMappings);
              folder = fields.folder;
              delete fields.folder;
              if (fields.tags) {
                tags = fields.tags
                  .split(/[,;]/)
                  .map((t) => t.trim())
                  .filter(Boolean);
                delete fields.tags;
              }
            } else {
              const mapped = autoMapRow(row);
              fields = mapped.fields;
              folder = mapped.folder;
              tags = mapped.tags;
            }

            const title =
              (hasCustomMappings ? fields.title : undefined) ??
              ((row.title ?? row.name ?? row.label ?? "").trim() ||
              `Imported item ${i + 1}`);
            delete fields.title;

            // Skip empty rows
            if (Object.values(fields).every((v) => !v)) {
              errors.push({
                line: lineNum,
                message: "Row has no mappable data",
              });
              continue;
            }

            items.push({
              type: fields.password || fields.url ? "login" : "note",
              title,
              fields,
              folder,
              tags,
            });
          } catch {
            errors.push({
              line: lineNum,
              message: "Failed to parse row",
              raw: JSON.stringify(row),
            });
          }
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
          total: items.length + errors.length,
          parsed: items.length,
          skipped: errors.length,
          duplicateCount,
        },
      };
    },
  };
}

/** Default generic parser instance with auto-mapping. */
export const genericCSVParser = createGenericCSVParser();
