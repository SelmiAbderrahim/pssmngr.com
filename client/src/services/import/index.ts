// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
export {
  ALL_PARSERS,
  detectParser,
  autoImport,
  onePasswordCSVParser,
  bitwardenJSONParser,
  bitwardenCSVParser,
  chromeCSVParser,
  lastPassCSVParser,
  genericCSVParser,
  createGenericCSVParser,
} from "./parsers";

export { parseCSVRows, csvToObjects, findDuplicates } from "./csv-utils";

export {
  smartParse,
  checkImportFile,
  looksLikeLabelledText,
  parseLabelledText,
  normalizeTotpSecret,
  MAX_IMPORT_CHARACTERS,
  MAX_IMPORT_FILE_BYTES,
  MAX_IMPORT_ITEMS,
  PLAINTEXT_IMPORT_EXTENSIONS,
  ENCRYPTED_BUNDLE_EXTENSION,
  LABELLED_TEXT_SOURCE,
  type SmartParseResult,
  type SmartParseSuccess,
  type SmartParseFailure,
  type SmartParseError,
  type SmartParseErrorCode,
  type SmartParseWarning,
  type SmartParseWarningCode,
  type ImportFileDescriptor,
} from "./smart-parse";

export {
  readFile,
  parseFileContent,
  executeImport,
  type ParsedImport,
  type ProgressCallback,
} from "./pipeline";
