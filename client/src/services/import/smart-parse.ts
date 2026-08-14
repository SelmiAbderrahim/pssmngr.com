// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Smart add — bounded, pure, local parsing entry point.
 *
 * Everything here runs in the browser tab and touches nothing else: there is
 * no `fetch`, no tRPC call, no AI SDK, no logging, and no analytics in this
 * module or anything it imports. Plaintext parsed here stays in memory until
 * the caller encrypts it with the existing vault crypto helpers.
 *
 * Format handling reuses the existing detection and parsers in
 * `./parsers`; the only addition is a labelled `key: value` block fallback for
 * pasted text and `.txt` files, which the CSV/JSON parsers cannot represent.
 *
 * Errors and warnings are typed codes plus non-secret metadata. No warning,
 * error, or code path ever embeds the source text, a field value, or any
 * secret.
 */

import type {
  DuplicateGroup,
  ImportItemType,
  ImportResult,
  ImportedItem,
} from "@/types/import";
import { base32Decode, parseOTPAuthToFields } from "@/services/totp-engine";
import { findDuplicates, normalizeLineEndings } from "./csv-utils";
import { detectParser } from "./parsers";

/** Maximum accepted input length, in characters. */
export const MAX_IMPORT_CHARACTERS = 100_000;

/**
 * Pre-read `File.size` ceiling, in bytes. A UTF-8 character occupies at most
 * four bytes, so this is the smallest byte bound that cannot reject an input
 * which is still within {@link MAX_IMPORT_CHARACTERS}. The exact character
 * ceiling is enforced after decoding.
 */
export const MAX_IMPORT_FILE_BYTES = MAX_IMPORT_CHARACTERS * 4;

/**
 * Defensive ceiling on parsed items. Above the 300-record target so a
 * supported 300-record export is never truncated, and low enough that a
 * pathological input cannot mount an unbounded preview.
 */
export const MAX_IMPORT_ITEMS = 500;

/** Extensions accepted as plaintext input. */
export const PLAINTEXT_IMPORT_EXTENSIONS = [".csv", ".json", ".txt"] as const;

/** Encrypted bundles belong to the Import/Export flow, which owns the password. */
export const ENCRYPTED_BUNDLE_EXTENSION = ".pssmngr";

export type SmartParseErrorCode =
  /** Input was empty or whitespace only. */
  | "empty"
  /** `File.size` exceeded {@link MAX_IMPORT_FILE_BYTES}. */
  | "fileTooLarge"
  /** Decoded text exceeded {@link MAX_IMPORT_CHARACTERS}. */
  | "contentTooLarge"
  /** Parsed item count exceeded {@link MAX_IMPORT_ITEMS}. */
  | "tooManyItems"
  /** A `.pssmngr` bundle was supplied; route it to Import/Export instead. */
  | "encryptedBundle"
  /** File extension is not a supported plaintext format. */
  | "unsupportedFormat"
  /** Input was readable but produced no items. */
  | "noItems";

export type SmartParseWarningCode =
  /** A source row or block could not be understood and was skipped. */
  | "malformedRow"
  /** A row or block parsed but carried no title. */
  | "missingTitle"
  /** Non-empty source fields had no mapping and were dropped. */
  | "unmappedFields"
  /** The row or block repeats an earlier source row. */
  | "duplicateSource"
  /** A TOTP value was not a usable secret or `otpauth://` URI and was dropped. */
  | "invalidTotp";

export interface SmartParseError {
  code: SmartParseErrorCode;
  /** The bound that was exceeded, when the code describes a bound. */
  limit?: number;
  /** The observed magnitude, when the code describes a bound. */
  actual?: number;
}

export interface SmartParseWarning {
  code: SmartParseWarningCode;
  /** 1-based source row or block number. */
  line: number;
  /** Index into the returned item list, when a warning maps to an item. */
  itemIndex?: number;
  /**
   * Non-secret field or label names only. Never a field value. Names are
   * truncated so a pathological source cannot smuggle a payload through.
   */
  fields?: string[];
}

export interface SmartParseSuccess {
  ok: true;
  /** Name of the parser that handled the input, for display. */
  source: string;
  result: ImportResult;
  warnings: SmartParseWarning[];
}

export interface SmartParseFailure {
  ok: false;
  error: SmartParseError;
}

export type SmartParseResult = SmartParseSuccess | SmartParseFailure;

/** The subset of `File` this module needs, so callers can test without a DOM. */
export interface ImportFileDescriptor {
  name: string;
  size: number;
}

const MAX_REPORTED_FIELD_NAME_LENGTH = 40;
const MAX_REPORTED_FIELD_NAMES = 8;

/** Human label for the fallback parser, mirroring the `ImportParser.name` style. */
export const LABELLED_TEXT_SOURCE = "Labelled text";

function fileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot).toLowerCase();
}

/**
 * Decide whether a file may be read at all. Runs before any read so an
 * oversized file is never pulled into memory, and so encrypted bundles are
 * routed to the flow that owns password handling and decryption.
 */
export function checkImportFile(
  file: ImportFileDescriptor,
): SmartParseError | null {
  const ext = fileExtension(file.name);

  if (ext === ENCRYPTED_BUNDLE_EXTENSION) {
    return { code: "encryptedBundle" };
  }

  if (
    !(PLAINTEXT_IMPORT_EXTENSIONS as readonly string[]).includes(ext)
  ) {
    return { code: "unsupportedFormat" };
  }

  if (file.size > MAX_IMPORT_FILE_BYTES) {
    return {
      code: "fileTooLarge",
      limit: MAX_IMPORT_FILE_BYTES,
      actual: file.size,
    };
  }

  if (file.size === 0) {
    return { code: "empty" };
  }

  return null;
}

// ── TOTP normalization ───────────────────────────────────────────────

/**
 * Normalize a TOTP value to a bare base32 secret.
 *
 * Accepts an `otpauth://` URI (the secret is extracted) or a base32 secret
 * with optional spacing. Returns `null` when the value is not usable; the
 * caller drops the field and records an `invalidTotp` warning. The rejected
 * value is never returned, logged, or embedded in the warning.
 */
export function normalizeTotpSecret(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (/^otpauth:\/\//i.test(trimmed)) {
    try {
      return parseOTPAuthToFields(trimmed).secret.replace(/\s+/g, "").toUpperCase();
    } catch {
      return null;
    }
  }

  const candidate = trimmed.replace(/[\s-]+/g, "").toUpperCase();
  if (!/^[A-Z2-7]+=*$/.test(candidate)) return null;
  try {
    base32Decode(candidate);
  } catch {
    return null;
  }
  return candidate;
}

// ── Labelled `key: value` block fallback ─────────────────────────────

/**
 * Labels the modal's documented paste examples use, mapped onto the field
 * names the existing parsers already emit. A label outside this map is
 * reported as unmapped; a missing value is never inferred.
 */
const LABEL_TO_FIELD: Record<string, string> = {
  title: "title",
  name: "title",
  item: "title",
  username: "username",
  user: "username",
  login: "username",
  email: "username",
  password: "password",
  pass: "password",
  pwd: "password",
  url: "url",
  uri: "url",
  link: "url",
  site: "url",
  website: "url",
  notes: "notes",
  note: "notes",
  comment: "notes",
  totp: "totp",
  otp: "totp",
  "2fa": "totp",
  authenticator: "totp",
  "onetimepassword": "totp",
  folder: "folder",
  group: "folder",
  category: "folder",
  tags: "tags",
  tag: "tags",
  cardnumber: "cardNumber",
  number: "cardNumber",
  cvv: "cvv",
  cvc: "cvv",
  securitycode: "cvv",
  expiry: "expiry",
  expiration: "expiry",
  expirationdate: "expiry",
  cardholder: "cardholderName",
  cardholdername: "cardholderName",
  nameoncard: "cardholderName",
  firstname: "firstName",
  lastname: "lastName",
  fullname: "fullName",
  phone: "phone",
  phonenumber: "phone",
  address: "address",
  company: "company",
};

const LABEL_LINE = /^[ \t]*([A-Za-z][A-Za-z0-9 _-]{0,40}?)[ \t]*:[ \t]*(.*)$/;

function canonicalLabel(label: string): string {
  return label.toLowerCase().replace(/[\s_-]+/g, "");
}

/** Split into blocks on blank lines, preserving each block's 1-based start line. */
function splitBlocks(
  content: string,
): Array<{ line: number; lines: string[] }> {
  const blocks: Array<{ line: number; lines: string[] }> = [];
  let current: string[] = [];
  let start = 1;

  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? "";
    if (raw.trim() === "") {
      if (current.length > 0) {
        blocks.push({ line: start, lines: current });
        current = [];
      }
      start = i + 2;
      continue;
    }
    if (current.length === 0) start = i + 1;
    current.push(raw);
  }
  if (current.length > 0) blocks.push({ line: start, lines: current });

  return blocks;
}

/**
 * True when every non-empty block carries at least one recognized label.
 * Deliberately strict: a CSV data row such as `https://example.com,bob,pw`
 * yields the unrecognized label `https`, so CSV never reaches this fallback.
 */
export function looksLikeLabelledText(content: string): boolean {
  const blocks = splitBlocks(content);
  if (blocks.length === 0) return false;

  return blocks.every((block) =>
    block.lines.some((line) => {
      const match = LABEL_LINE.exec(line);
      if (!match) return false;
      const [, label, value] = match;
      if (!label || !value?.trim()) return false;
      return canonicalLabel(label) in LABEL_TO_FIELD;
    }),
  );
}

function inferBlockType(fields: Record<string, string>): ImportItemType {
  if (fields.cardNumber || fields.cvv || fields.cardholderName) return "card";
  if (fields.password) return "login";
  if (fields.totp) return "totp";
  if (
    fields.firstName ||
    fields.lastName ||
    fields.fullName ||
    fields.address ||
    fields.phone ||
    fields.company
  ) {
    return "identity";
  }
  if (fields.notes) return "note";
  return "login";
}

function truncateName(name: string): string {
  return name.length > MAX_REPORTED_FIELD_NAME_LENGTH
    ? `${name.slice(0, MAX_REPORTED_FIELD_NAME_LENGTH)}…`
    : name;
}

/**
 * Parse labelled `key: value` blocks. Pure; preserves source order; never
 * infers a value that the source did not supply.
 */
export function parseLabelledText(content: string): {
  items: ImportedItem[];
  warnings: SmartParseWarning[];
} {
  const items: ImportedItem[] = [];
  const warnings: SmartParseWarning[] = [];

  for (const block of splitBlocks(content)) {
    const fields: Record<string, string> = {};
    const unmapped: string[] = [];
    let malformed = false;
    let folder: string | undefined;
    let tags: string[] | undefined;

    for (const line of block.lines) {
      const match = LABEL_LINE.exec(line);
      if (!match) {
        malformed = true;
        continue;
      }
      const [, rawLabel, rawValue] = match;
      const value = (rawValue ?? "").trim();
      // An empty value is not a value. Never infer one.
      if (!value) continue;

      const target = LABEL_TO_FIELD[canonicalLabel(rawLabel ?? "")];
      if (!target) {
        if (unmapped.length < MAX_REPORTED_FIELD_NAMES) {
          unmapped.push(truncateName((rawLabel ?? "").trim()));
        }
        continue;
      }

      if (target === "folder") {
        folder = value;
        continue;
      }
      if (target === "tags") {
        tags = value
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean);
        continue;
      }
      // First occurrence wins, so ordering stays deterministic.
      if (fields[target] === undefined) fields[target] = value;
    }

    if (malformed) {
      warnings.push({ code: "malformedRow", line: block.line });
    }

    const hasContent = Object.keys(fields).length > 0;
    if (!hasContent) continue;

    if (fields.totp !== undefined) {
      const normalized = normalizeTotpSecret(fields.totp);
      if (normalized) {
        fields.totp = normalized;
      } else {
        delete fields.totp;
        warnings.push({ code: "invalidTotp", line: block.line });
      }
    }

    const title = fields.title ?? "";
    delete fields.title;

    const itemIndex = items.length;
    if (!title) {
      warnings.push({ code: "missingTitle", line: block.line, itemIndex });
    }
    if (unmapped.length > 0) {
      warnings.push({
        code: "unmappedFields",
        line: block.line,
        itemIndex,
        fields: unmapped,
      });
    }

    items.push({
      type: inferBlockType(fields),
      title,
      fields,
      ...(folder ? { folder } : {}),
      ...(tags?.length ? { tags } : {}),
    });
  }

  return { items, warnings };
}

// ── Entry point ──────────────────────────────────────────────────────

function toDuplicateGroups(items: ImportedItem[]): DuplicateGroup[] {
  const groups: DuplicateGroup[] = [];
  for (const [key, entries] of findDuplicates(items)) {
    groups.push({ key, items: entries.map((e) => ({ index: e.index, item: e.item as ImportedItem })) });
  }
  return groups;
}

/**
 * Normalize TOTP on items produced by the existing CSV/JSON parsers, which
 * store the raw source value. Mutating a copy keeps those parsers untouched.
 */
function normalizeParsedTotp(
  items: ImportedItem[],
  warnings: SmartParseWarning[],
): ImportedItem[] {
  return items.map((item, index) => {
    const raw = item.fields.totp;
    if (raw === undefined || raw === "") return item;

    const normalized = normalizeTotpSecret(raw);
    if (normalized === raw) return item;

    const fields = { ...item.fields };
    if (normalized) {
      fields.totp = normalized;
    } else {
      delete fields.totp;
      warnings.push({ code: "invalidTotp", line: index + 1, itemIndex: index });
    }
    return { ...item, fields };
  });
}

/**
 * Parse plaintext import content into preview items.
 *
 * Pure and synchronous: no I/O, no network, no logging. Ordering follows the
 * source exactly and values are preserved verbatim apart from documented TOTP
 * normalization.
 */
export function smartParse(content: string): SmartParseResult {
  if (content.length > MAX_IMPORT_CHARACTERS) {
    return {
      ok: false,
      error: {
        code: "contentTooLarge",
        limit: MAX_IMPORT_CHARACTERS,
        actual: content.length,
      },
    };
  }

  const normalized = normalizeLineEndings(content);
  if (normalized.trim() === "") {
    return { ok: false, error: { code: "empty" } };
  }

  const warnings: SmartParseWarning[] = [];
  let source: string;
  let items: ImportedItem[];
  let result: ImportResult;

  if (looksLikeLabelledText(normalized)) {
    const parsed = parseLabelledText(normalized);
    warnings.push(...parsed.warnings);
    items = parsed.items;
    source = LABELLED_TEXT_SOURCE;
    const duplicates = toDuplicateGroups(items);
    result = {
      items,
      errors: [],
      duplicates,
      stats: {
        total: items.length,
        parsed: items.length,
        skipped: 0,
        duplicateCount: duplicates.reduce(
          (sum, group) => sum + group.items.length,
          0,
        ),
      },
    };
  } else {
    const parser = detectParser(normalized);
    const parsed = parser.parse(normalized);
    source = parser.name;
    items = normalizeParsedTotp(parsed.items, warnings);
    result = { ...parsed, items };
    for (const error of parsed.errors) {
      warnings.push({ code: "malformedRow", line: error.line });
    }
  }

  if (items.length > MAX_IMPORT_ITEMS) {
    return {
      ok: false,
      error: {
        code: "tooManyItems",
        limit: MAX_IMPORT_ITEMS,
        actual: items.length,
      },
    };
  }

  if (items.length === 0) {
    return { ok: false, error: { code: "noItems" } };
  }

  for (const group of result.duplicates) {
    // The first occurrence is the original; later ones repeat it.
    for (const entry of group.items.slice(1)) {
      warnings.push({
        code: "duplicateSource",
        line: entry.index + 1,
        itemIndex: entry.index,
      });
    }
  }

  warnings.sort((a, b) => a.line - b.line || a.code.localeCompare(b.code));

  return { ok: true, source, result, warnings };
}
