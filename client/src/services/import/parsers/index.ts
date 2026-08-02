// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import type { ImportParser, ImportResult } from "@/types/import";
import { onePasswordCSVParser } from "./onepassword-csv";
import { bitwardenJSONParser } from "./bitwarden-json";
import { bitwardenCSVParser } from "./bitwarden-csv";
import { chromeCSVParser } from "./chrome-csv";
import { lastPassCSVParser } from "./lastpass-csv";
import { genericCSVParser, createGenericCSVParser } from "./generic-csv";

export {
  onePasswordCSVParser,
  bitwardenJSONParser,
  bitwardenCSVParser,
  chromeCSVParser,
  lastPassCSVParser,
  genericCSVParser,
  createGenericCSVParser,
};

/**
 * All built-in parsers in detection priority order.
 * More specific formats are checked first; generic CSV is last (fallback).
 */
export const ALL_PARSERS: ImportParser[] = [
  bitwardenJSONParser,
  bitwardenCSVParser,
  onePasswordCSVParser,
  lastPassCSVParser,
  chromeCSVParser,
  genericCSVParser,
];

/**
 * Auto-detect the format and return the matching parser.
 * Returns the first parser whose `detect()` returns true.
 * Falls back to generic CSV if nothing else matches.
 */
export function detectParser(content: string): ImportParser {
  for (const parser of ALL_PARSERS) {
    if (parser.detect(content)) {
      return parser;
    }
  }
  return genericCSVParser;
}

/**
 * Auto-detect format and parse in one step.
 */
export function autoImport(content: string): ImportResult & { source: string } {
  const parser = detectParser(content);
  const result = parser.parse(content);
  return { ...result, source: parser.name };
}
