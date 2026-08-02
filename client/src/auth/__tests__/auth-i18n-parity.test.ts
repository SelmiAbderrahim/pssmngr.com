// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Locale parity for the keys added by the secure-session work. Each
 * locale must define the exact same key set with the exact same
 * interpolation variables — i18next will silently fall back if a key
 * is missing, so we enforce this at the unit-test layer.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const LANGS = ["en", "ar", "fr", "de", "es"] as const;
const REQUIRED = {
  "session_expired.title": [],
  "session_expired.description": [],
  "session_expired.cta": [],
  "session_expired.toast": [],
  "biometric.prompt": [],
  "biometric.fallback": [],
  "biometric.unavailable": [],
  "biometric.failed": [],
  "biometric.cancelled": [],
  "vault_locked.title": [],
  "vault_locked.background_description": [],
  "vault_locked.idle_description": [],
  "vault_locked.cold_start_description": [],
  "vault_locked.cta_unlock": [],
  "vault_locked.cta_signout": [],
  "errors.session_required": [],
  "errors.session_invalid": [],
} as const;

function get(obj: unknown, dotted: string): string | undefined {
  let cur: unknown = obj;
  for (const segment of dotted.split(".")) {
    if (cur && typeof cur === "object" && segment in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[segment];
    } else {
      return undefined;
    }
  }
  return typeof cur === "string" ? cur : undefined;
}

function extractInterpolation(value: string): string[] {
  const re = /\{\{(\w+)\}\}/g;
  const out: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(value)) !== null) out.push(match[1]);
  return out.sort();
}

describe("auth i18n parity for secure-session keys", () => {
  for (const lang of LANGS) {
    it(`${lang}: contains all required keys`, () => {
      const filePath = path.resolve(
        __dirname,
        "..",
        "..",
        "..",
        "public",
        "locales",
        lang,
        "auth.json",
      );
      const json = JSON.parse(fs.readFileSync(filePath, "utf8"));
      for (const key of Object.keys(REQUIRED)) {
        const v = get(json, key);
        expect(v, `missing ${lang}:${key}`).toBeTypeOf("string");
        expect(v!.length).toBeGreaterThan(0);
        // No unresolved interpolation should leak (we don't use any in
        // this set, but the assertion documents the invariant).
        expect(extractInterpolation(v!)).toEqual([]);
      }
    });
  }
});
