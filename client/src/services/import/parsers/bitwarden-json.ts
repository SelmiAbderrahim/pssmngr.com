// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import type {
  ImportParser,
  ImportResult,
  ImportedItem,
  ImportError,
} from "@/types/import";
import { findDuplicates } from "../csv-utils";

/**
 * Bitwarden JSON export format.
 * Structure: { encrypted: false, folders: [...], items: [...] }
 * Item types: 1=Login, 2=SecureNote, 3=Card, 4=Identity
 */

interface BitwardenExport {
  encrypted?: boolean;
  folders?: Array<{ id: string; name: string }>;
  items?: BitwardenItem[];
}

interface BitwardenItem {
  id?: string;
  folderId?: string | null;
  type: number;
  name: string;
  notes?: string | null;
  favorite?: boolean;
  login?: {
    uris?: Array<{ uri: string; match?: number | null }>;
    username?: string | null;
    password?: string | null;
    totp?: string | null;
  };
  card?: {
    cardholderName?: string | null;
    brand?: string | null;
    number?: string | null;
    expMonth?: string | null;
    expYear?: string | null;
    code?: string | null;
  };
  identity?: {
    title?: string | null;
    firstName?: string | null;
    middleName?: string | null;
    lastName?: string | null;
    email?: string | null;
    phone?: string | null;
    address1?: string | null;
    city?: string | null;
    state?: string | null;
    postalCode?: string | null;
    country?: string | null;
    company?: string | null;
  };
  secureNote?: { type: number };
  fields?: Array<{
    name: string;
    value: string;
    type: number;
  }>;
  collectionIds?: string[];
}

const TYPE_MAP: Record<number, ImportedItem["type"]> = {
  1: "login",
  2: "note",
  3: "card",
  4: "identity",
};

function parseLogin(item: BitwardenItem): Record<string, string> {
  const fields: Record<string, string> = {};
  const login = item.login;
  if (!login) return fields;

  if (login.uris?.[0]?.uri) fields.url = login.uris[0].uri;
  if (login.username) fields.username = login.username;
  if (login.password) fields.password = login.password;
  if (login.totp) fields.totp = login.totp;
  if (item.notes) fields.notes = item.notes;

  return fields;
}

function parseCard(item: BitwardenItem): Record<string, string> {
  const fields: Record<string, string> = {};
  const card = item.card;
  if (!card) return fields;

  if (card.cardholderName) fields.cardholderName = card.cardholderName;
  if (card.brand) fields.brand = card.brand;
  if (card.number) fields.number = card.number;
  if (card.expMonth) fields.expMonth = card.expMonth;
  if (card.expYear) fields.expYear = card.expYear;
  if (card.code) fields.code = card.code;
  if (item.notes) fields.notes = item.notes;

  return fields;
}

function parseIdentity(item: BitwardenItem): Record<string, string> {
  const fields: Record<string, string> = {};
  const id = item.identity;
  if (!id) return fields;

  if (id.firstName) fields.firstName = id.firstName;
  if (id.middleName) fields.middleName = id.middleName;
  if (id.lastName) fields.lastName = id.lastName;
  if (id.email) fields.email = id.email;
  if (id.phone) fields.phone = id.phone;
  if (id.address1) fields.address = id.address1;
  if (id.city) fields.city = id.city;
  if (id.state) fields.state = id.state;
  if (id.postalCode) fields.postalCode = id.postalCode;
  if (id.country) fields.country = id.country;
  if (id.company) fields.company = id.company;
  if (item.notes) fields.notes = item.notes;

  return fields;
}

function parseNote(item: BitwardenItem): Record<string, string> {
  const fields: Record<string, string> = {};
  if (item.notes) fields.notes = item.notes;
  return fields;
}

function parseCustomFields(
  item: BitwardenItem,
  fields: Record<string, string>
): void {
  if (!item.fields) return;
  for (const f of item.fields) {
    if (f.name && f.value) {
      fields[`custom_${f.name}`] = f.value;
    }
  }
}

export const bitwardenJSONParser: ImportParser = {
  name: "Bitwarden (JSON)",

  detect(content: string): boolean {
    const trimmed = content.trim();
    if (!trimmed.startsWith("{")) return false;
    try {
      const data = JSON.parse(trimmed);
      return (
        typeof data === "object" &&
        data !== null &&
        Array.isArray(data.items) &&
        data.items.length > 0 &&
        typeof data.items[0].type === "number" &&
        typeof data.items[0].name === "string"
      );
    } catch {
      return false;
    }
  },

  parse(content: string): ImportResult {
    const errors: ImportError[] = [];
    const items: ImportedItem[] = [];

    let data: BitwardenExport;
    try {
      data = JSON.parse(content.trim());
    } catch {
      errors.push({ line: 1, message: "Invalid JSON" });
      return {
        items: [],
        errors,
        duplicates: [],
        stats: { total: 0, parsed: 0, skipped: 0, duplicateCount: 0 },
      };
    }

    if (data.encrypted) {
      errors.push({
        line: 1,
        message:
          "Encrypted Bitwarden export detected. Please export as unencrypted JSON.",
      });
      return {
        items: [],
        errors,
        duplicates: [],
        stats: { total: 0, parsed: 0, skipped: 0, duplicateCount: 0 },
      };
    }

    const folderMap = new Map<string, string>();
    if (data.folders) {
      for (const f of data.folders) {
        folderMap.set(f.id, f.name);
      }
    }

    const rawItems = data.items ?? [];

    for (let i = 0; i < rawItems.length; i++) {
      const raw = rawItems[i];
      if (!raw) continue;

      try {
        const type = TYPE_MAP[raw.type] ?? "login";
        let fields: Record<string, string>;

        switch (type) {
          case "login":
            fields = parseLogin(raw);
            break;
          case "card":
            fields = parseCard(raw);
            break;
          case "identity":
            fields = parseIdentity(raw);
            break;
          case "note":
            fields = parseNote(raw);
            break;
          default:
            fields = {};
        }

        parseCustomFields(raw, fields);

        const folder = raw.folderId
          ? folderMap.get(raw.folderId)
          : undefined;
        const tags = raw.favorite ? ["favorite"] : undefined;

        items.push({
          type,
          title: raw.name || `Imported item ${i + 1}`,
          fields,
          folder,
          tags,
        });
      } catch {
        errors.push({
          line: i + 1,
          message: `Failed to parse item: ${raw.name ?? "unknown"}`,
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
        total: rawItems.length,
        parsed: items.length,
        skipped: rawItems.length - items.length,
        duplicateCount,
      },
    };
  },
};
