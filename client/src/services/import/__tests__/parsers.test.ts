// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { describe, it, expect } from "vitest";
import { onePasswordCSVParser } from "../parsers/onepassword-csv";
import { bitwardenJSONParser } from "../parsers/bitwarden-json";
import { bitwardenCSVParser } from "../parsers/bitwarden-csv";
import { chromeCSVParser } from "../parsers/chrome-csv";
import { lastPassCSVParser } from "../parsers/lastpass-csv";
import { genericCSVParser, createGenericCSVParser } from "../parsers/generic-csv";
import { detectParser, autoImport } from "../parsers";
import { parseCSVRows, csvToObjects, findDuplicates, normalizeLineEndings } from "../csv-utils";

// ─── CSV Utils ───────────────────────────────────────────────

describe("csv-utils", () => {
  describe("parseCSVRows", () => {
    it("parses simple CSV", () => {
      const rows = parseCSVRows("a,b,c\n1,2,3");
      expect(rows).toEqual([
        ["a", "b", "c"],
        ["1", "2", "3"],
      ]);
    });

    it("handles quoted fields with commas", () => {
      const rows = parseCSVRows('a,"b,c",d\n1,"2,3",4');
      expect(rows).toEqual([
        ["a", "b,c", "d"],
        ["1", "2,3", "4"],
      ]);
    });

    it("handles escaped quotes", () => {
      const rows = parseCSVRows('a,"he said ""hi""",c');
      expect(rows).toEqual([["a", 'he said "hi"', "c"]]);
    });

    it("handles newlines inside quoted fields", () => {
      const rows = parseCSVRows('a,"line1\nline2",c');
      expect(rows).toEqual([["a", "line1\nline2", "c"]]);
    });

    it("handles CRLF line endings", () => {
      const rows = parseCSVRows("a,b\r\n1,2\r\n");
      expect(rows).toEqual([
        ["a", "b"],
        ["1", "2"],
      ]);
    });

    it("returns empty array for empty input", () => {
      expect(parseCSVRows("")).toEqual([]);
    });
  });

  describe("csvToObjects", () => {
    it("maps rows to objects using headers", () => {
      const objs = csvToObjects("Name,Age\nAlice,30\nBob,25");
      expect(objs).toEqual([
        { name: "Alice", age: "30" },
        { name: "Bob", age: "25" },
      ]);
    });

    it("returns empty array for header-only CSV", () => {
      expect(csvToObjects("Name,Age")).toEqual([]);
    });

    it("trims headers and values", () => {
      const objs = csvToObjects(" Name , Age \n Alice , 30 ");
      expect(objs).toEqual([{ name: "Alice", age: "30" }]);
    });
  });

  describe("findDuplicates", () => {
    it("detects duplicate login items by url+username", () => {
      const items = [
        { type: "login", fields: { url: "https://example.com", username: "alice" } },
        { type: "login", fields: { url: "https://other.com", username: "bob" } },
        { type: "login", fields: { url: "https://example.com", username: "alice" } },
      ];
      const dups = findDuplicates(items);
      expect(dups.size).toBe(1);
      const group = dups.get("https://example.com|alice")!;
      expect(group).toHaveLength(2);
      expect(group[0].index).toBe(0);
      expect(group[1].index).toBe(2);
    });

    it("ignores non-login items", () => {
      const items = [
        { type: "note", fields: { url: "https://example.com", username: "alice" } },
        { type: "note", fields: { url: "https://example.com", username: "alice" } },
      ];
      expect(findDuplicates(items).size).toBe(0);
    });

    it("returns empty map when no duplicates", () => {
      const items = [
        { type: "login", fields: { url: "https://a.com", username: "u1" } },
        { type: "login", fields: { url: "https://b.com", username: "u2" } },
      ];
      expect(findDuplicates(items).size).toBe(0);
    });
  });
});

// ─── 1Password CSV Parser ────────────────────────────────────

describe("onePasswordCSVParser", () => {
  const SAMPLE = [
    "Title,Url,Username,Password,Notes,Type,Tags,Vault,notesPlain",
    '"Gmail","https://gmail.com","alice@gmail.com","pass123","My email","Login","email,personal","Personal",""',
    '"Bank","https://bank.com","alice","s3cure!","","Login","finance","Personal",""',
  ].join("\n");

  it("detects 1Password CSV format", () => {
    expect(onePasswordCSVParser.detect(SAMPLE)).toBe(true);
  });

  it("does not detect Chrome CSV", () => {
    const chrome = "name,url,username,password\nGmail,https://gmail.com,alice,pass";
    expect(onePasswordCSVParser.detect(chrome)).toBe(false);
  });

  it("parses items correctly", () => {
    const result = onePasswordCSVParser.parse(SAMPLE);
    expect(result.items).toHaveLength(2);
    expect(result.errors).toHaveLength(0);
    expect(result.stats.parsed).toBe(2);
  });

  it("maps fields correctly", () => {
    const result = onePasswordCSVParser.parse(SAMPLE);
    const item = result.items[0];
    expect(item.title).toBe("Gmail");
    expect(item.type).toBe("login");
    expect(item.fields.url).toBe("https://gmail.com");
    expect(item.fields.username).toBe("alice@gmail.com");
    expect(item.fields.password).toBe("pass123");
    expect(item.fields.notes).toBe("My email");
  });

  it("extracts folders and tags", () => {
    const result = onePasswordCSVParser.parse(SAMPLE);
    expect(result.items[0].folder).toBe("Personal");
    expect(result.items[0].tags).toEqual(["email", "personal"]);
  });

  it("reports errors for empty file", () => {
    const result = onePasswordCSVParser.parse("");
    expect(result.errors).toHaveLength(1);
    expect(result.items).toHaveLength(0);
  });
});

// ─── Bitwarden JSON Parser ───────────────────────────────────

describe("bitwardenJSONParser", () => {
  const SAMPLE = JSON.stringify({
    encrypted: false,
    folders: [{ id: "f1", name: "Social" }],
    items: [
      {
        type: 1,
        name: "Twitter",
        folderId: "f1",
        favorite: true,
        login: {
          uris: [{ uri: "https://twitter.com" }],
          username: "alice",
          password: "tw1tter!",
          totp: "otpauth://totp/Twitter?secret=ABC",
        },
        notes: "My twitter",
      },
      {
        type: 2,
        name: "Secret Note",
        folderId: null,
        notes: "Top secret content",
        secureNote: { type: 0 },
      },
      {
        type: 3,
        name: "Visa Card",
        card: {
          cardholderName: "Alice Smith",
          brand: "Visa",
          number: "4111111111111111",
          expMonth: "12",
          expYear: "2025",
          code: "123",
        },
      },
      {
        type: 4,
        name: "My Identity",
        identity: {
          firstName: "Alice",
          lastName: "Smith",
          email: "alice@example.com",
          phone: "555-1234",
        },
      },
    ],
  });

  it("detects Bitwarden JSON format", () => {
    expect(bitwardenJSONParser.detect(SAMPLE)).toBe(true);
  });

  it("does not detect CSV content", () => {
    expect(bitwardenJSONParser.detect("name,url\na,b")).toBe(false);
  });

  it("does not detect non-Bitwarden JSON", () => {
    expect(bitwardenJSONParser.detect('{"foo": "bar"}')).toBe(false);
  });

  it("parses all item types", () => {
    const result = bitwardenJSONParser.parse(SAMPLE);
    expect(result.items).toHaveLength(4);
    expect(result.items[0].type).toBe("login");
    expect(result.items[1].type).toBe("note");
    expect(result.items[2].type).toBe("card");
    expect(result.items[3].type).toBe("identity");
  });

  it("maps login fields correctly", () => {
    const result = bitwardenJSONParser.parse(SAMPLE);
    const login = result.items[0];
    expect(login.fields.url).toBe("https://twitter.com");
    expect(login.fields.username).toBe("alice");
    expect(login.fields.password).toBe("tw1tter!");
    expect(login.fields.totp).toBe("otpauth://totp/Twitter?secret=ABC");
    expect(login.fields.notes).toBe("My twitter");
  });

  it("maps card fields correctly", () => {
    const result = bitwardenJSONParser.parse(SAMPLE);
    const card = result.items[2];
    expect(card.fields.cardholderName).toBe("Alice Smith");
    expect(card.fields.number).toBe("4111111111111111");
    expect(card.fields.expMonth).toBe("12");
    expect(card.fields.code).toBe("123");
  });

  it("maps identity fields correctly", () => {
    const result = bitwardenJSONParser.parse(SAMPLE);
    const id = result.items[3];
    expect(id.fields.firstName).toBe("Alice");
    expect(id.fields.lastName).toBe("Smith");
    expect(id.fields.email).toBe("alice@example.com");
  });

  it("resolves folder names", () => {
    const result = bitwardenJSONParser.parse(SAMPLE);
    expect(result.items[0].folder).toBe("Social");
    expect(result.items[1].folder).toBeUndefined();
  });

  it("sets favorite tag", () => {
    const result = bitwardenJSONParser.parse(SAMPLE);
    expect(result.items[0].tags).toEqual(["favorite"]);
    expect(result.items[1].tags).toBeUndefined();
  });

  it("rejects encrypted exports", () => {
    const encrypted = JSON.stringify({ encrypted: true, items: [] });
    const result = bitwardenJSONParser.parse(encrypted);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain("Encrypted");
  });

  it("reports error for invalid JSON", () => {
    const result = bitwardenJSONParser.parse("not json {{{");
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain("Invalid JSON");
  });

  it("parses custom fields", () => {
    const data = JSON.stringify({
      items: [
        {
          type: 1,
          name: "With Custom",
          login: { username: "u", password: "p" },
          fields: [{ name: "Security Question", value: "Answer", type: 0 }],
        },
      ],
    });
    const result = bitwardenJSONParser.parse(data);
    expect(result.items[0].fields["custom_Security Question"]).toBe("Answer");
  });
});

// ─── Bitwarden CSV Parser ────────────────────────────────────

describe("bitwardenCSVParser", () => {
  const SAMPLE = [
    "folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp",
    'Social,1,login,Twitter,,,,https://twitter.com,alice,tw1tter!,',
    ',0,note,Secret Note,Top secret,,,,,,',
  ].join("\n");

  it("detects Bitwarden CSV format", () => {
    expect(bitwardenCSVParser.detect(SAMPLE)).toBe(true);
  });

  it("does not detect Chrome CSV", () => {
    expect(bitwardenCSVParser.detect("name,url,username,password")).toBe(false);
  });

  it("parses items correctly", () => {
    const result = bitwardenCSVParser.parse(SAMPLE);
    expect(result.items).toHaveLength(2);
    expect(result.items[0].type).toBe("login");
    expect(result.items[1].type).toBe("note");
  });

  it("maps login fields", () => {
    const result = bitwardenCSVParser.parse(SAMPLE);
    const login = result.items[0];
    expect(login.fields.url).toBe("https://twitter.com");
    expect(login.fields.username).toBe("alice");
    expect(login.fields.password).toBe("tw1tter!");
  });

  it("extracts folder and favorite", () => {
    const result = bitwardenCSVParser.parse(SAMPLE);
    expect(result.items[0].folder).toBe("Social");
    expect(result.items[0].tags).toEqual(["favorite"]);
  });

  it("handles custom fields column", () => {
    const csv = [
      "folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp",
      ',0,login,Test,,"pin: 1234\nsecurity: answer",,https://test.com,u,p,',
    ].join("\n");
    const result = bitwardenCSVParser.parse(csv);
    expect(result.items[0].fields.custom_pin).toBe("1234");
    expect(result.items[0].fields.custom_security).toBe("answer");
  });
});

// ─── Chrome CSV Parser ───────────────────────────────────────

describe("chromeCSVParser", () => {
  const SAMPLE = [
    "name,url,username,password,note",
    "gmail.com,https://accounts.google.com,alice@gmail.com,pass123,My email",
    "github.com,https://github.com,alice,gh_token,",
  ].join("\n");

  it("detects Chrome CSV format", () => {
    expect(chromeCSVParser.detect(SAMPLE)).toBe(true);
  });

  it("does not detect Bitwarden CSV", () => {
    expect(
      chromeCSVParser.detect(
        "folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp"
      )
    ).toBe(false);
  });

  it("does not detect LastPass CSV", () => {
    expect(
      chromeCSVParser.detect("url,username,password,totp,extra,name,grouping,fav")
    ).toBe(false);
  });

  it("parses items correctly", () => {
    const result = chromeCSVParser.parse(SAMPLE);
    expect(result.items).toHaveLength(2);
    expect(result.items.every((i) => i.type === "login")).toBe(true);
  });

  it("maps fields correctly", () => {
    const result = chromeCSVParser.parse(SAMPLE);
    const item = result.items[0];
    expect(item.title).toBe("gmail.com");
    expect(item.fields.url).toBe("https://accounts.google.com");
    expect(item.fields.username).toBe("alice@gmail.com");
    expect(item.fields.password).toBe("pass123");
    expect(item.fields.notes).toBe("My email");
  });

  it("uses domain as title when name is empty", () => {
    const csv = "name,url,username,password\n,https://example.com,user,pass";
    const result = chromeCSVParser.parse(csv);
    expect(result.items[0].title).toBe("example.com");
  });

  it("skips rows with no meaningful data", () => {
    const csv = "name,url,username,password\nEmpty,,,";
    const result = chromeCSVParser.parse(csv);
    expect(result.items).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
  });

  it("detects duplicates", () => {
    const csv = [
      "name,url,username,password",
      "Site,https://example.com,alice,pass1",
      "Site Copy,https://example.com,alice,pass2",
    ].join("\n");
    const result = chromeCSVParser.parse(csv);
    expect(result.duplicates).toHaveLength(1);
    expect(result.stats.duplicateCount).toBe(1);
  });
});

// ─── LastPass CSV Parser ─────────────────────────────────────

describe("lastPassCSVParser", () => {
  const SAMPLE = [
    "url,username,password,totp,extra,name,grouping,fav",
    "https://gmail.com,alice@gmail.com,pass123,,My email notes,Gmail,Email,1",
    "http://sn,,,,,Secret Note,Notes,0",
  ].join("\n");

  it("detects LastPass CSV format", () => {
    expect(lastPassCSVParser.detect(SAMPLE)).toBe(true);
  });

  it("does not detect Chrome CSV", () => {
    expect(lastPassCSVParser.detect("name,url,username,password")).toBe(false);
  });

  it("parses login items", () => {
    const result = lastPassCSVParser.parse(SAMPLE);
    expect(result.items).toHaveLength(2);
    expect(result.items[0].type).toBe("login");
    expect(result.items[0].fields.url).toBe("https://gmail.com");
    expect(result.items[0].fields.username).toBe("alice@gmail.com");
  });

  it("identifies secure notes by http://sn URL", () => {
    const result = lastPassCSVParser.parse(SAMPLE);
    const note = result.items[1];
    expect(note.type).toBe("note");
    expect(note.fields.url).toBeUndefined();
  });

  it("extracts folder from grouping", () => {
    const result = lastPassCSVParser.parse(SAMPLE);
    expect(result.items[0].folder).toBe("Email");
    expect(result.items[1].folder).toBe("Notes");
  });

  it("ignores (none) grouping", () => {
    const csv = [
      "url,username,password,totp,extra,name,grouping,fav",
      "https://a.com,u,p,,,Test,(none),0",
    ].join("\n");
    const result = lastPassCSVParser.parse(csv);
    expect(result.items[0].folder).toBeUndefined();
  });

  it("sets favorite tag", () => {
    const result = lastPassCSVParser.parse(SAMPLE);
    expect(result.items[0].tags).toEqual(["favorite"]);
    expect(result.items[1].tags).toBeUndefined();
  });

  it("maps extra field to notes", () => {
    const result = lastPassCSVParser.parse(SAMPLE);
    expect(result.items[0].fields.notes).toBe("My email notes");
  });
});

// ─── Generic CSV Parser ──────────────────────────────────────

describe("genericCSVParser", () => {
  it("detects CSV-like content", () => {
    expect(genericCSVParser.detect("col1,col2\nval1,val2")).toBe(true);
  });

  it("does not detect single-column content", () => {
    expect(genericCSVParser.detect("just a single line")).toBe(false);
  });

  it("auto-maps common column names", () => {
    const csv = [
      "Website,User,Pass,Note",
      "https://example.com,alice,secret,My note",
    ].join("\n");
    const result = genericCSVParser.parse(csv);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].fields.url).toBe("https://example.com");
    expect(result.items[0].fields.username).toBe("alice");
    expect(result.items[0].fields.password).toBe("secret");
    expect(result.items[0].fields.notes).toBe("My note");
  });

  it("auto-maps folder and tags", () => {
    const csv = [
      "Title,URL,Username,Password,Folder,Tags",
      "Gmail,https://gmail.com,alice,pass,Email,\"personal,email\"",
    ].join("\n");
    const result = genericCSVParser.parse(csv);
    expect(result.items[0].folder).toBe("Email");
    expect(result.items[0].tags).toEqual(["personal", "email"]);
  });

  it("skips empty rows", () => {
    const csv = "url,username,password\n,,";
    const result = genericCSVParser.parse(csv);
    expect(result.items).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
  });

  it("classifies items with password as login", () => {
    const csv = "url,password\nhttps://a.com,pass";
    const result = genericCSVParser.parse(csv);
    expect(result.items[0].type).toBe("login");
  });

  it("classifies items without password as note", () => {
    const csv = "title,notes\nMy Note,Some content";
    const result = genericCSVParser.parse(csv);
    expect(result.items[0].type).toBe("note");
  });
});

describe("createGenericCSVParser with custom mappings", () => {
  it("applies custom field mappings", () => {
    const parser = createGenericCSVParser({
      fieldMappings: [
        { source: "site", target: "url" },
        { source: "login_name", target: "username" },
        { source: "secret", target: "password" },
      ],
    });
    const csv = "site,login_name,secret\nhttps://a.com,alice,pass123";
    const result = parser.parse(csv);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].fields.url).toBe("https://a.com");
    expect(result.items[0].fields.username).toBe("alice");
    expect(result.items[0].fields.password).toBe("pass123");
  });

  it("supports custom delimiter", () => {
    const parser = createGenericCSVParser({ fieldMappings: [], delimiter: ";" });
    const csv = "url;username;password\nhttps://a.com;alice;pass";
    const result = parser.parse(csv);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].fields.url).toBe("https://a.com");
  });

  it("handles headerless CSV with positional mappings", () => {
    const parser = createGenericCSVParser({
      hasHeaders: false,
      fieldMappings: [
        { source: "0", target: "url" },
        { source: "1", target: "username" },
        { source: "2", target: "password" },
      ],
    });
    const csv = "https://a.com,alice,pass123\nhttps://b.com,bob,s3cret";
    const result = parser.parse(csv);
    expect(result.items).toHaveLength(2);
    expect(result.items[0].fields.url).toBe("https://a.com");
    expect(result.items[1].fields.username).toBe("bob");
  });

  it("errors on headerless CSV without mappings", () => {
    const parser = createGenericCSVParser({ hasHeaders: false, fieldMappings: [] });
    const result = parser.parse("a,b,c");
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain("field mappings");
  });
});

// ─── Auto-Detection ──────────────────────────────────────────

describe("detectParser", () => {
  it("detects Bitwarden JSON", () => {
    const content = JSON.stringify({
      items: [{ type: 1, name: "Test", login: {} }],
    });
    expect(detectParser(content).name).toBe("Bitwarden (JSON)");
  });

  it("detects Bitwarden CSV", () => {
    const content =
      "folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp\n" +
      ",0,login,Test,,,,https://a.com,u,p,";
    expect(detectParser(content).name).toBe("Bitwarden (CSV)");
  });

  it("detects 1Password CSV", () => {
    const content =
      "Title,Url,Username,Password,Notes,Type,Tags,notesPlain\n" +
      "Gmail,https://gmail.com,alice,pass,,,email,";
    expect(detectParser(content).name).toBe("1Password (CSV)");
  });

  it("detects LastPass CSV", () => {
    const content =
      "url,username,password,totp,extra,name,grouping,fav\n" +
      "https://a.com,u,p,,,Test,,0";
    expect(detectParser(content).name).toBe("LastPass (CSV)");
  });

  it("detects Chrome CSV", () => {
    const content = "name,url,username,password\nGmail,https://gmail.com,alice,pass";
    expect(detectParser(content).name).toBe("Chrome (CSV)");
  });

  it("falls back to Generic CSV", () => {
    const content = "col1,col2\nval1,val2";
    expect(detectParser(content).name).toBe("Generic CSV");
  });
});

describe("autoImport", () => {
  it("returns parsed result with source name", () => {
    const content = "name,url,username,password\nGmail,https://gmail.com,alice,pass";
    const result = autoImport(content);
    expect(result.source).toBe("Chrome (CSV)");
    expect(result.items).toHaveLength(1);
    expect(result.items[0].fields.url).toBe("https://gmail.com");
  });
});

// ─── Duplicate Detection (Integration) ──────────────────────

// ─── Additional csv-utils coverage ──────────────────────────────

describe("csv-utils (additional coverage)", () => {
  describe("normalizeLineEndings", () => {
    it("converts CRLF to LF", () => {
      expect(normalizeLineEndings("a\r\nb\r\nc")).toBe("a\nb\nc");
    });

    it("converts lone CR to LF", () => {
      expect(normalizeLineEndings("a\rb\rc")).toBe("a\nb\nc");
    });

    it("leaves LF unchanged", () => {
      expect(normalizeLineEndings("a\nb\nc")).toBe("a\nb\nc");
    });

    it("handles mixed line endings", () => {
      expect(normalizeLineEndings("a\r\nb\rc\nd")).toBe("a\nb\nc\nd");
    });
  });

  describe("parseCSVRows with custom delimiter", () => {
    it("parses semicolon-delimited CSV", () => {
      const rows = parseCSVRows("a;b;c\n1;2;3", ";");
      expect(rows).toEqual([
        ["a", "b", "c"],
        ["1", "2", "3"],
      ]);
    });

    it("parses tab-delimited CSV", () => {
      const rows = parseCSVRows("a\tb\tc\n1\t2\t3", "\t");
      expect(rows).toEqual([
        ["a", "b", "c"],
        ["1", "2", "3"],
      ]);
    });
  });

  describe("parseCSVRows edge cases", () => {
    it("handles lone CR without LF", () => {
      const rows = parseCSVRows("a,b\r1,2");
      expect(rows).toEqual([
        ["a", "b"],
        ["1", "2"],
      ]);
    });

    it("handles empty fields between delimiters", () => {
      const rows = parseCSVRows("a,,c\n1,,3");
      expect(rows).toEqual([
        ["a", "", "c"],
        ["1", "", "3"],
      ]);
    });
  });

  describe("csvToObjects edge cases", () => {
    it("uses custom delimiter", () => {
      const objs = csvToObjects("Name;Age\nAlice;30", ";");
      expect(objs).toEqual([{ name: "Alice", age: "30" }]);
    });

    it("handles rows shorter than headers", () => {
      const objs = csvToObjects("Name,Age,City\nAlice,30");
      expect(objs).toEqual([{ name: "Alice", age: "30", city: "" }]);
    });
  });

  describe("findDuplicates with indexOffset", () => {
    it("applies index offset to duplicate entries", () => {
      const items = [
        { type: "login", fields: { url: "https://a.com", username: "u" } },
        { type: "login", fields: { url: "https://a.com", username: "u" } },
      ];
      const dups = findDuplicates(items, 10);
      const group = dups.get("https://a.com|u")!;
      expect(group[0].index).toBe(10);
      expect(group[1].index).toBe(11);
    });
  });

  describe("findDuplicates edge cases", () => {
    it("skips login items with no url and no username", () => {
      const items = [
        { type: "login", fields: {} },
        { type: "login", fields: {} },
      ];
      expect(findDuplicates(items).size).toBe(0);
    });

    it("normalizes url and username to lowercase", () => {
      const items = [
        { type: "login", fields: { url: "HTTPS://A.COM", username: "USER" } },
        { type: "login", fields: { url: "https://a.com", username: "user" } },
      ];
      const dups = findDuplicates(items);
      expect(dups.size).toBe(1);
    });
  });
});

// ─── Additional 1Password Parser Coverage ───────────────────────

describe("onePasswordCSVParser (additional coverage)", () => {
  it("infers card type from Type column", () => {
    const csv = [
      "Title,Url,Username,Password,Notes,Type,Tags,notesPlain",
      "My Card,,,,,Credit Card,,",
    ].join("\n");
    const result = onePasswordCSVParser.parse(csv);
    expect(result.items[0].type).toBe("card");
  });

  it("infers identity type from Type column", () => {
    const csv = [
      "Title,Url,Username,Password,Notes,Type,Tags,notesPlain",
      "My ID,,,,,Identity,,",
    ].join("\n");
    const result = onePasswordCSVParser.parse(csv);
    expect(result.items[0].type).toBe("identity");
  });

  it("infers note type when only notes field present", () => {
    const csv = [
      "Title,Url,Username,Password,Notes,Type,Tags,notesPlain",
      "My Note,,,,Some notes,,,Some notes",
    ].join("\n");
    const result = onePasswordCSVParser.parse(csv);
    expect(result.items[0].type).toBe("note");
  });

  it("falls back title to Imported item N", () => {
    const csv = [
      "Title,Url,Username,Password,Notes,Type,Tags,notesPlain",
      ",https://example.com,user,pass,,Login,,",
    ].join("\n");
    const result = onePasswordCSVParser.parse(csv);
    expect(result.items[0].title).toBe("Imported item 1");
  });

  it("maps TOTP field", () => {
    const csv = [
      "Title,Url,Username,Password,OTP,Type,Tags,notesPlain",
      "GitHub,https://github.com,user,pass,otpauth://totp/Test,Login,,",
    ].join("\n");
    const result = onePasswordCSVParser.parse(csv);
    expect(result.items[0].fields.totp).toBe("otpauth://totp/Test");
  });

  it("handles vault column as folder", () => {
    const csv = [
      "Title,Url,Username,Password,Notes,Type,Tags,Vault,notesPlain",
      "Test,https://a.com,u,p,,Login,,Work,",
    ].join("\n");
    const result = onePasswordCSVParser.parse(csv);
    expect(result.items[0].folder).toBe("Work");
  });
});

// ─── Additional Bitwarden JSON Parser Coverage ──────────────────

describe("bitwardenJSONParser (additional coverage)", () => {
  it("returns login type for unknown numeric type", () => {
    const data = JSON.stringify({
      items: [{ type: 99, name: "Unknown", login: {} }],
    });
    const result = bitwardenJSONParser.parse(data);
    expect(result.items[0].type).toBe("login");
  });

  it("falls back to empty fields when login/card/identity/note object is missing", () => {
    const data = JSON.stringify({
      items: [
        { type: 1, name: "No Login" },
        { type: 3, name: "No Card" },
        { type: 4, name: "No Identity" },
        { type: 2, name: "No Note" },
      ],
    });
    const result = bitwardenJSONParser.parse(data);
    expect(result.items).toHaveLength(4);
    expect(Object.keys(result.items[0].fields)).toHaveLength(0);
    expect(Object.keys(result.items[1].fields)).toHaveLength(0);
    expect(Object.keys(result.items[2].fields)).toHaveLength(0);
    expect(Object.keys(result.items[3].fields)).toHaveLength(0);
  });

  it("falls back item name to Imported item N", () => {
    const data = JSON.stringify({
      items: [{ type: 1, name: "", login: { username: "u" } }],
    });
    const result = bitwardenJSONParser.parse(data);
    expect(result.items[0].title).toBe("Imported item 1");
  });

  it("does not detect JSON with empty items array", () => {
    const data = JSON.stringify({ items: [] });
    expect(bitwardenJSONParser.detect(data)).toBe(false);
  });

  it("parses all identity fields", () => {
    const data = JSON.stringify({
      items: [
        {
          type: 4,
          name: "Full Identity",
          identity: {
            firstName: "Alice",
            middleName: "M",
            lastName: "Smith",
            email: "a@b.com",
            phone: "555-1234",
            address1: "123 Main St",
            city: "Springfield",
            state: "IL",
            postalCode: "62701",
            country: "US",
            company: "Acme Corp",
          },
          notes: "Identity notes",
        },
      ],
    });
    const result = bitwardenJSONParser.parse(data);
    const fields = result.items[0].fields;
    expect(fields.firstName).toBe("Alice");
    expect(fields.middleName).toBe("M");
    expect(fields.lastName).toBe("Smith");
    expect(fields.email).toBe("a@b.com");
    expect(fields.phone).toBe("555-1234");
    expect(fields.address).toBe("123 Main St");
    expect(fields.city).toBe("Springfield");
    expect(fields.state).toBe("IL");
    expect(fields.postalCode).toBe("62701");
    expect(fields.country).toBe("US");
    expect(fields.company).toBe("Acme Corp");
    expect(fields.notes).toBe("Identity notes");
  });

  it("includes card brand field", () => {
    const data = JSON.stringify({
      items: [
        {
          type: 3,
          name: "Card",
          card: { brand: "Mastercard", number: "5555", code: "321" },
        },
      ],
    });
    const result = bitwardenJSONParser.parse(data);
    expect(result.items[0].fields.brand).toBe("Mastercard");
  });

  it("includes card notes", () => {
    const data = JSON.stringify({
      items: [
        {
          type: 3,
          name: "Card",
          card: { number: "4111" },
          notes: "Rewards card",
        },
      ],
    });
    const result = bitwardenJSONParser.parse(data);
    expect(result.items[0].fields.notes).toBe("Rewards card");
  });

  it("skips custom fields with empty name or value", () => {
    const data = JSON.stringify({
      items: [
        {
          type: 1,
          name: "Test",
          login: { username: "u" },
          fields: [
            { name: "", value: "val", type: 0 },
            { name: "key", value: "", type: 0 },
            { name: "valid", value: "data", type: 0 },
          ],
        },
      ],
    });
    const result = bitwardenJSONParser.parse(data);
    expect(result.items[0].fields.custom_valid).toBe("data");
    expect(result.items[0].fields["custom_"]).toBeUndefined();
    expect(result.items[0].fields.custom_key).toBeUndefined();
  });
});

// ─── Additional Bitwarden CSV Parser Coverage ───────────────────

describe("bitwardenCSVParser (additional coverage)", () => {
  it("maps 'secure note' type", () => {
    const csv = [
      "folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp",
      ",0,secure note,My Note,secret text,,,,,,",
    ].join("\n");
    const result = bitwardenCSVParser.parse(csv);
    expect(result.items[0].type).toBe("note");
  });

  it("maps card type", () => {
    const csv = [
      "folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp",
      ",0,card,My Card,,,,,,,",
    ].join("\n");
    const result = bitwardenCSVParser.parse(csv);
    expect(result.items[0].type).toBe("card");
  });

  it("maps identity type", () => {
    const csv = [
      "folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp",
      ",0,identity,My ID,,,,,,,",
    ].join("\n");
    const result = bitwardenCSVParser.parse(csv);
    expect(result.items[0].type).toBe("identity");
  });

  it("defaults unknown type to login", () => {
    const csv = [
      "folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp",
      ",0,unknown,Something,,,,https://a.com,u,p,",
    ].join("\n");
    const result = bitwardenCSVParser.parse(csv);
    expect(result.items[0].type).toBe("login");
  });

  it("falls back title to Imported item N", () => {
    const csv = [
      "folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp",
      ",0,login,,,,,,u,p,",
    ].join("\n");
    const result = bitwardenCSVParser.parse(csv);
    expect(result.items[0].title).toBe("Imported item 1");
  });

  it("handles empty file", () => {
    const result = bitwardenCSVParser.parse("");
    expect(result.items).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain("Empty");
  });

  it("detects duplicates", () => {
    const csv = [
      "folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp",
      ",0,login,Site A,,,,https://a.com,user,pass1,",
      ",0,login,Site A Copy,,,,https://a.com,user,pass2,",
    ].join("\n");
    const result = bitwardenCSVParser.parse(csv);
    expect(result.duplicates).toHaveLength(1);
    expect(result.stats.duplicateCount).toBe(1);
  });
});

// ─── Additional LastPass Parser Coverage ────────────────────────

describe("lastPassCSVParser (additional coverage)", () => {
  it("identifies secure notes with trailing slash URL", () => {
    const csv = [
      "url,username,password,totp,extra,name,grouping,fav",
      "http://sn/,,,,,Secure Note,Notes,0",
    ].join("\n");
    const result = lastPassCSVParser.parse(csv);
    expect(result.items[0].type).toBe("note");
    expect(result.items[0].fields.url).toBeUndefined();
  });

  it("ignores lowercase 'none' grouping", () => {
    const csv = [
      "url,username,password,totp,extra,name,grouping,fav",
      "https://a.com,u,p,,,Test,none,0",
    ].join("\n");
    const result = lastPassCSVParser.parse(csv);
    expect(result.items[0].folder).toBeUndefined();
  });

  it("handles empty file", () => {
    const result = lastPassCSVParser.parse("");
    expect(result.items).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain("Empty");
  });

  it("falls back title to Imported item N", () => {
    const csv = [
      "url,username,password,totp,extra,name,grouping,fav",
      "https://a.com,u,p,,,,Email,0",
    ].join("\n");
    const result = lastPassCSVParser.parse(csv);
    expect(result.items[0].title).toBe("Imported item 1");
  });

  it("handles TOTP field", () => {
    const csv = [
      "url,username,password,totp,extra,name,grouping,fav",
      "https://a.com,u,p,otpauth://totp/Test,,Auth Site,,0",
    ].join("\n");
    const result = lastPassCSVParser.parse(csv);
    expect(result.items[0].fields.totp).toBe("otpauth://totp/Test");
  });

  it("detects duplicates", () => {
    const csv = [
      "url,username,password,totp,extra,name,grouping,fav",
      "https://a.com,user,pass1,,,Site A,,0",
      "https://a.com,user,pass2,,,Site A Copy,,0",
    ].join("\n");
    const result = lastPassCSVParser.parse(csv);
    expect(result.duplicates).toHaveLength(1);
    expect(result.stats.duplicateCount).toBe(1);
  });
});

// ─── Additional Chrome Parser Coverage ──────────────────────────

describe("chromeCSVParser (additional coverage)", () => {
  it("falls back to Imported item N when no name and invalid URL", () => {
    const csv = "name,url,username,password\n,not-a-url,user,pass";
    const result = chromeCSVParser.parse(csv);
    expect(result.items[0].title).toBe("Imported item 1");
  });

  it("handles empty file", () => {
    const result = chromeCSVParser.parse("");
    expect(result.items).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain("Empty");
  });

  it("counts skipped rows in stats", () => {
    const csv = [
      "name,url,username,password",
      "Good,https://a.com,user,pass",
      "Empty,,,",
    ].join("\n");
    const result = chromeCSVParser.parse(csv);
    expect(result.items).toHaveLength(1);
    expect(result.stats.skipped).toBe(1);
    expect(result.stats.parsed).toBe(1);
  });
});

// ─── Additional Generic CSV Parser Coverage ─────────────────────

describe("genericCSVParser (additional coverage)", () => {
  it("auto-maps various column name aliases", () => {
    const csv = [
      "website,user,pass,memo,category,tag",
      "https://a.com,alice,secret,my memo,Work,important",
    ].join("\n");
    const result = genericCSVParser.parse(csv);
    expect(result.items[0].fields.url).toBe("https://a.com");
    expect(result.items[0].fields.username).toBe("alice");
    expect(result.items[0].fields.password).toBe("secret");
    expect(result.items[0].fields.notes).toBe("my memo");
    expect(result.items[0].folder).toBe("Work");
    expect(result.items[0].tags).toEqual(["important"]);
  });

  it("auto-maps totp/otp/2fa columns", () => {
    const csv = "url,username,password,2fa\nhttps://a.com,u,p,otpauth://test";
    const result = genericCSVParser.parse(csv);
    expect(result.items[0].fields.totp).toBe("otpauth://test");
  });

  it("handles tags with semicolons", () => {
    const csv = [
      "title,url,password,tags",
      "Test,https://a.com,pass,\"work;personal;important\"",
    ].join("\n");
    const result = genericCSVParser.parse(csv);
    expect(result.items[0].tags).toEqual(["work", "personal", "important"]);
  });
});

describe("createGenericCSVParser (additional coverage)", () => {
  it("extracts folder from custom mappings", () => {
    const parser = createGenericCSVParser({
      fieldMappings: [
        { source: "site", target: "url" },
        { source: "dir", target: "folder" },
      ],
    });
    const csv = "site,dir\nhttps://a.com,Work";
    const result = parser.parse(csv);
    expect(result.items[0].folder).toBe("Work");
  });

  it("extracts and splits tags from custom mappings", () => {
    const parser = createGenericCSVParser({
      fieldMappings: [
        { source: "site", target: "url" },
        { source: "labels", target: "tags" },
      ],
    });
    const csv = 'site,labels\nhttps://a.com,"a,b,c"';
    const result = parser.parse(csv);
    expect(result.items[0].tags).toEqual(["a", "b", "c"]);
  });

  it("extracts title from custom mappings", () => {
    const parser = createGenericCSVParser({
      fieldMappings: [
        { source: "entry_name", target: "title" },
        { source: "site", target: "url" },
      ],
    });
    const csv = "entry_name,site\nMy Entry,https://a.com";
    const result = parser.parse(csv);
    expect(result.items[0].title).toBe("My Entry");
  });

  it("uses URL as title fallback in headerless mode", () => {
    const parser = createGenericCSVParser({
      hasHeaders: false,
      fieldMappings: [{ source: "0", target: "url" }],
    });
    const csv = "https://a.com";
    const result = parser.parse(csv);
    expect(result.items[0].title).toBe("https://a.com");
  });
});

// ─── Additional Auto-Detection Coverage ─────────────────────────

describe("detectParser (additional coverage)", () => {
  it("does not detect non-CSV single-column content", () => {
    expect(genericCSVParser.detect("just a plain text string")).toBe(false);
  });
});

// ─── Duplicate Detection (Integration) ──────────────────────────

describe("duplicate detection across parsers", () => {
  it("detects duplicates in 1Password import", () => {
    const csv = [
      "Title,Url,Username,Password,Notes,Type,Tags,notesPlain",
      "Gmail,https://gmail.com,alice,pass1,,Login,,",
      "Gmail Backup,https://gmail.com,alice,pass2,,Login,,",
    ].join("\n");
    const result = onePasswordCSVParser.parse(csv);
    expect(result.duplicates).toHaveLength(1);
    expect(result.stats.duplicateCount).toBe(1);
  });

  it("detects duplicates in Bitwarden JSON import", () => {
    const data = JSON.stringify({
      items: [
        {
          type: 1,
          name: "Gmail",
          login: {
            uris: [{ uri: "https://gmail.com" }],
            username: "alice",
            password: "pass1",
          },
        },
        {
          type: 1,
          name: "Gmail Copy",
          login: {
            uris: [{ uri: "https://gmail.com" }],
            username: "alice",
            password: "pass2",
          },
        },
      ],
    });
    const result = bitwardenJSONParser.parse(data);
    expect(result.duplicates).toHaveLength(1);
    expect(result.stats.duplicateCount).toBe(1);
  });
});
