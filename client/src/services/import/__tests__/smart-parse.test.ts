// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Smart add local parser tests.
 *
 * Every credential in this file is synthetic and generated below. No real
 * credential appears in any fixture.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  MAX_IMPORT_CHARACTERS,
  MAX_IMPORT_FILE_BYTES,
  MAX_IMPORT_ITEMS,
  LABELLED_TEXT_SOURCE,
  checkImportFile,
  looksLikeLabelledText,
  normalizeTotpSecret,
  parseLabelledText,
  smartParse,
  type SmartParseSuccess,
} from "../smart-parse";
import { base32Encode } from "@/services/totp-engine";

// ── Synthetic fixtures ───────────────────────────────────────────────

function syntheticSecret(index: number): string {
  return base32Encode(
    Uint8Array.from({ length: 10 }, (_, i) => (index * 31 + i * 7) % 256),
  );
}

function syntheticRecords(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    title: `Synthetic Site ${i + 1}`,
    username: `user${i + 1}@synthetic.invalid`,
    password: `Synthetic-Pw-${i + 1}-${(i * 7919) % 10007}`,
    url: `https://site-${i + 1}.synthetic.invalid/login`,
    notes: `Synthetic note ${i + 1}`,
  }));
}

/** A generic CSV export shaped like the ones the existing parsers accept. */
function syntheticCsv(count: number, eol = "\n"): string {
  const rows = syntheticRecords(count).map(
    (r) =>
      `"${r.title}","${r.username}","${r.password}","${r.url}","${r.notes}"`,
  );
  return [`name,username,password,url,notes`, ...rows].join(eol) + eol;
}

function syntheticLabelledBlocks(count: number, eol = "\n"): string {
  return syntheticRecords(count)
    .map(
      (r) =>
        [
          `Title: ${r.title}`,
          `Username: ${r.username}`,
          `Password: ${r.password}`,
          `URL: ${r.url}`,
          `Notes: ${r.notes}`,
        ].join(eol),
    )
    .join(`${eol}${eol}`);
}

function expectOk(result: ReturnType<typeof smartParse>): SmartParseSuccess {
  if (!result.ok) {
    throw new Error(`expected parse to succeed, got ${result.error.code}`);
  }
  return result;
}

/** Read the parser's own source so purity can be asserted statically. */
function readSmartParseSource(): string {
  return readFileSync(
    resolve(process.cwd(), "src/services/import/smart-parse.ts"),
    "utf8",
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ── 300-record scale ─────────────────────────────────────────────────

describe("smartParse — 300 records", () => {
  it("parses a 300-record CSV export into 300 ordered preview items", () => {
    const parsed = expectOk(smartParse(syntheticCsv(300)));
    const records = syntheticRecords(300);

    expect(parsed.result.items).toHaveLength(300);
    expect(parsed.result.items[0]?.title).toBe(records[0]!.title);
    expect(parsed.result.items[299]?.title).toBe(records[299]!.title);
    expect(parsed.result.items.map((i) => i.title)).toEqual(
      records.map((r) => r.title),
    );
    // Values are preserved exactly.
    expect(parsed.result.items[42]?.fields.password).toBe(records[42]!.password);
    expect(parsed.result.items[42]?.fields.url).toBe(records[42]!.url);
    expect(parsed.warnings).toEqual([]);
  });

  it("parses 300 labelled text blocks into 300 ordered preview items", () => {
    const parsed = expectOk(smartParse(syntheticLabelledBlocks(300)));
    const records = syntheticRecords(300);

    expect(parsed.source).toBe(LABELLED_TEXT_SOURCE);
    expect(parsed.result.items).toHaveLength(300);
    expect(parsed.result.items.map((i) => i.title)).toEqual(
      records.map((r) => r.title),
    );
    expect(parsed.result.items[299]?.fields.username).toBe(
      records[299]!.username,
    );
    expect(parsed.result.items.every((i) => i.type === "login")).toBe(true);
    expect(parsed.warnings).toEqual([]);
  });

  it("parses 300 CRLF labelled blocks identically to LF blocks", () => {
    const lf = expectOk(smartParse(syntheticLabelledBlocks(300, "\n")));
    const crlf = expectOk(smartParse(syntheticLabelledBlocks(300, "\r\n")));
    expect(crlf.result.items).toEqual(lf.result.items);
  });
});

// ── Detection ────────────────────────────────────────────────────────

describe("smartParse — format detection", () => {
  it("routes Bitwarden JSON to the existing JSON parser", () => {
    const content = JSON.stringify({
      items: [
        {
          type: 1,
          name: "Synthetic JSON Login",
          login: {
            username: "json@synthetic.invalid",
            password: "Synthetic-Json-Pw-1",
            uris: [{ uri: "https://json.synthetic.invalid" }],
          },
        },
      ],
    });
    const parsed = expectOk(smartParse(content));
    expect(parsed.source).toBe("Bitwarden (JSON)");
    expect(parsed.result.items[0]?.title).toBe("Synthetic JSON Login");
  });

  it("routes a Chrome CSV to the existing CSV parser, not the labelled fallback", () => {
    const content = [
      "name,url,username,password",
      "Synthetic Chrome,https://chrome.synthetic.invalid,chrome@synthetic.invalid,Synthetic-Chrome-Pw",
    ].join("\n");
    const parsed = expectOk(smartParse(content));
    expect(parsed.source).not.toBe(LABELLED_TEXT_SOURCE);
    expect(parsed.result.items).toHaveLength(1);
  });

  it("does not treat CSV data rows containing URLs as labelled text", () => {
    const content = [
      "name,url,username,password",
      "Synthetic,https://a.synthetic.invalid,a@synthetic.invalid,Pw-A",
      "Synthetic 2,https://b.synthetic.invalid,b@synthetic.invalid,Pw-B",
    ].join("\n");
    expect(looksLikeLabelledText(content)).toBe(false);
  });

  it("handles quoted CSV fields containing the delimiter and embedded newlines", () => {
    const content = [
      "name,username,password,notes",
      '"Synthetic, Inc","q@synthetic.invalid","Pw-Q","line one\nline two"',
    ].join("\n");
    const parsed = expectOk(smartParse(content));
    expect(parsed.result.items[0]?.title).toBe("Synthetic, Inc");
    expect(parsed.result.items[0]?.fields.notes).toBe("line one\nline two");
  });
});

// ── Labelled block behaviour ─────────────────────────────────────────

describe("parseLabelledText", () => {
  it("never infers a missing value", () => {
    const { items } = parseLabelledText(
      ["Title: Only Title", "Username:", "Password:   "].join("\n"),
    );
    expect(items).toHaveLength(1);
    expect(items[0]?.title).toBe("Only Title");
    expect(items[0]?.fields.username).toBeUndefined();
    expect(items[0]?.fields.password).toBeUndefined();
  });

  it("warns on a block with no title without dropping the item", () => {
    const parsed = expectOk(
      smartParse(
        ["Username: t@synthetic.invalid", "Password: Synthetic-Pw"].join("\n"),
      ),
    );
    expect(parsed.result.items).toHaveLength(1);
    expect(parsed.result.items[0]?.title).toBe("");
    expect(parsed.warnings).toContainEqual({
      code: "missingTitle",
      line: 1,
      itemIndex: 0,
    });
  });

  it("reports unmapped non-empty labels by name and drops their values", () => {
    const parsed = expectOk(
      smartParse(
        [
          "Title: Synthetic Unmapped",
          "Password: Synthetic-Pw",
          "Reward Number: 998877",
        ].join("\n"),
      ),
    );
    const warning = parsed.warnings.find((w) => w.code === "unmappedFields");
    expect(warning?.fields).toEqual(["Reward Number"]);
    expect(JSON.stringify(parsed.result.items)).not.toContain("998877");
  });

  it("warns on malformed lines inside a block and keeps the parsed fields", () => {
    const parsed = expectOk(
      smartParse(
        [
          "Title: Synthetic Malformed",
          "this line has no label",
          "Password: Synthetic-Pw",
        ].join("\n"),
      ),
    );
    expect(parsed.warnings).toContainEqual({ code: "malformedRow", line: 1 });
    expect(parsed.result.items[0]?.fields.password).toBe("Synthetic-Pw");
  });

  it("ignores blank lines between and around blocks", () => {
    const parsed = expectOk(
      smartParse(
        [
          "",
          "Title: One",
          "Password: Pw-One",
          "",
          "",
          "Title: Two",
          "Password: Pw-Two",
          "",
        ].join("\n"),
      ),
    );
    expect(parsed.result.items.map((i) => i.title)).toEqual(["One", "Two"]);
  });

  it("infers card, identity, note, and totp shapes from present labels only", () => {
    const secret = syntheticSecret(1);
    const parsed = expectOk(
      smartParse(
        [
          "Title: Synthetic Card\nCard Number: 4111111111111111\nCVV: 123",
          "Title: Synthetic Identity\nFirst Name: Ada\nLast Name: Synthetic",
          "Title: Synthetic Note\nNotes: a synthetic note",
          `Title: Synthetic TOTP\nTOTP: ${secret}`,
        ].join("\n\n"),
      ),
    );
    expect(parsed.result.items.map((i) => i.type)).toEqual([
      "card",
      "identity",
      "note",
      "totp",
    ]);
  });

  it("splits tags and folder out of the field map", () => {
    const parsed = expectOk(
      smartParse(
        [
          "Title: Synthetic Tagged",
          "Password: Pw-Tagged",
          "Folder: Work",
          "Tags: alpha, beta ,",
        ].join("\n"),
      ),
    );
    expect(parsed.result.items[0]?.folder).toBe("Work");
    expect(parsed.result.items[0]?.tags).toEqual(["alpha", "beta"]);
    expect(parsed.result.items[0]?.fields.tags).toBeUndefined();
  });
});

// ── Duplicates ───────────────────────────────────────────────────────

describe("smartParse — duplicate source rows", () => {
  it("groups exact duplicate source rows and warns on the repeats only", () => {
    const block = [
      "Title: Synthetic Dup",
      "Username: dup@synthetic.invalid",
      "Password: Synthetic-Dup-Pw",
      "URL: https://dup.synthetic.invalid",
    ].join("\n");
    const parsed = expectOk(smartParse([block, block, block].join("\n\n")));

    expect(parsed.result.items).toHaveLength(3);
    expect(parsed.result.duplicates).toHaveLength(1);
    const dupWarnings = parsed.warnings.filter(
      (w) => w.code === "duplicateSource",
    );
    expect(dupWarnings.map((w) => w.itemIndex)).toEqual([1, 2]);
  });
});

// ── TOTP normalization ───────────────────────────────────────────────

describe("normalizeTotpSecret", () => {
  it("extracts the secret from an otpauth:// URI", () => {
    const secret = syntheticSecret(3);
    expect(
      normalizeTotpSecret(
        `otpauth://totp/Synthetic:acct@synthetic.invalid?secret=${secret}&issuer=Synthetic`,
      ),
    ).toBe(secret);
  });

  it("uppercases and strips spacing from a bare base32 secret", () => {
    const secret = syntheticSecret(4);
    const spaced = secret.toLowerCase().replace(/(.{4})/g, "$1 ").trim();
    expect(normalizeTotpSecret(spaced)).toBe(secret);
  });

  it("rejects non-base32 values and malformed URIs", () => {
    expect(normalizeTotpSecret("not a secret!")).toBeNull();
    expect(normalizeTotpSecret("otpauth://totp/x?issuer=y")).toBeNull();
    expect(normalizeTotpSecret("   ")).toBeNull();
  });

  it("drops an unusable TOTP value and warns without echoing it", () => {
    const parsed = expectOk(
      smartParse(
        [
          "Title: Synthetic Bad TOTP",
          "Password: Synthetic-Pw",
          "TOTP: 1!!!not-base32!!!",
        ].join("\n"),
      ),
    );
    expect(parsed.result.items[0]?.fields.totp).toBeUndefined();
    expect(parsed.warnings).toContainEqual({ code: "invalidTotp", line: 1 });
    expect(JSON.stringify(parsed.warnings)).not.toContain("not-base32");
  });

  it("normalizes TOTP values coming from the existing CSV parsers", () => {
    const secret = syntheticSecret(5);
    const content = [
      "name,username,password,totp",
      `Synthetic TOTP CSV,t@synthetic.invalid,Pw-T,${secret.toLowerCase()}`,
    ].join("\n");
    const parsed = expectOk(smartParse(content));
    expect(parsed.result.items[0]?.fields.totp).toBe(secret);
  });
});

// ── Bounds ───────────────────────────────────────────────────────────

describe("smartParse — bounds", () => {
  it("rejects content over the character ceiling", () => {
    const result = smartParse("x".repeat(MAX_IMPORT_CHARACTERS + 1));
    expect(result).toEqual({
      ok: false,
      error: {
        code: "contentTooLarge",
        limit: MAX_IMPORT_CHARACTERS,
        actual: MAX_IMPORT_CHARACTERS + 1,
      },
    });
  });

  it("accepts content exactly at the character ceiling", () => {
    const csv = syntheticCsv(1);
    const padded = csv + "\n".repeat(MAX_IMPORT_CHARACTERS - csv.length);
    expect(padded).toHaveLength(MAX_IMPORT_CHARACTERS);
    expect(smartParse(padded).ok).toBe(true);
  });

  it("rejects more items than the defensive item ceiling", () => {
    const result = smartParse(syntheticLabelledBlocks(MAX_IMPORT_ITEMS + 1));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error.code).toBe("tooManyItems");
    expect(result.error.limit).toBe(MAX_IMPORT_ITEMS);
    expect(result.error.actual).toBe(MAX_IMPORT_ITEMS + 1);
  });

  it("keeps the item ceiling above the 300-record target", () => {
    expect(MAX_IMPORT_ITEMS).toBeGreaterThan(300);
  });

  it("rejects empty and whitespace-only input", () => {
    expect(smartParse("")).toEqual({ ok: false, error: { code: "empty" } });
    expect(smartParse("  \n\r\n  ")).toEqual({
      ok: false,
      error: { code: "empty" },
    });
  });

  it("reports readable input that produces no items", () => {
    const result = smartParse("name,username,password\n");
    expect(result).toEqual({ ok: false, error: { code: "noItems" } });
  });
});

describe("checkImportFile", () => {
  it("accepts supported plaintext extensions within the byte ceiling", () => {
    for (const name of ["a.csv", "a.json", "a.txt", "A.CSV"]) {
      expect(checkImportFile({ name, size: 1024 })).toBeNull();
    }
  });

  it("routes encrypted bundles to the Import/Export flow", () => {
    expect(checkImportFile({ name: "vault.pssmngr", size: 10 })).toEqual({
      code: "encryptedBundle",
    });
  });

  it("rejects unsupported extensions", () => {
    expect(checkImportFile({ name: "vault.zip", size: 10 })?.code).toBe(
      "unsupportedFormat",
    );
  });

  it("rejects oversized files by File.size before any read", () => {
    expect(
      checkImportFile({ name: "big.csv", size: MAX_IMPORT_FILE_BYTES + 1 }),
    ).toEqual({
      code: "fileTooLarge",
      limit: MAX_IMPORT_FILE_BYTES,
      actual: MAX_IMPORT_FILE_BYTES + 1,
    });
    expect(
      checkImportFile({ name: "ok.csv", size: MAX_IMPORT_FILE_BYTES }),
    ).toBeNull();
  });

  it("rejects an empty file", () => {
    expect(checkImportFile({ name: "empty.csv", size: 0 })?.code).toBe("empty");
  });
});

// ── Purity ───────────────────────────────────────────────────────────

describe("smartParse — purity", () => {
  it("does not call fetch while parsing 300 records", () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("network access is forbidden"));
    const xhrSpy = vi.spyOn(XMLHttpRequest.prototype, "open");

    expectOk(smartParse(syntheticCsv(300)));
    expectOk(smartParse(syntheticLabelledBlocks(300)));

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(xhrSpy).not.toHaveBeenCalled();
  });

  it("has no network, tRPC, AI SDK, logging, or analytics reference in its source", () => {
    const source = readSmartParseSource();
    const forbidden = [
      /\bfetch\s*\(/,
      /XMLHttpRequest/,
      /WebSocket/,
      /\btrpcQuery\b/,
      /\btrpcMutation\b/,
      /@ai-sdk/,
      /\bopenai\b/i,
      /\banthropic\b/i,
      /\bconsole\./,
      /\bgtag\b/,
      /\bnavigator\.sendBeacon\b/,
    ];
    for (const pattern of forbidden) {
      expect(source, `forbidden reference ${pattern}`).not.toMatch(pattern);
    }
  });

  it("imports only local parsing modules", () => {
    const source = readSmartParseSource();
    const imports = [...source.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
    expect(imports.sort()).toEqual([
      "./csv-utils",
      "./parsers",
      "@/services/totp-engine",
      "@/types/import",
    ]);
  });
});
