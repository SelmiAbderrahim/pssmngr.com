// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { describe, it, expect, beforeEach } from "vitest";
import {
  SearchIndex,
  extractSearchableFields,
} from "../search-index";

describe("SearchIndex", () => {
  let index: SearchIndex;

  beforeEach(() => {
    index = new SearchIndex();
  });

  // ── Basic indexing & search ──────────────────────────────────

  it("finds items by exact token match", () => {
    index.addItem("1", { title: "GitHub Login", username: "alice" });
    index.addItem("2", { title: "Gmail Account", username: "bob" });

    expect(index.search("github")).toContain("1");
    expect(index.search("github")).not.toContain("2");
  });

  it("is case-insensitive", () => {
    index.addItem("1", { title: "GitHub" });

    expect(index.search("github")).toContain("1");
    expect(index.search("GITHUB")).toContain("1");
    expect(index.search("GitHub")).toContain("1");
  });

  it("supports prefix matching", () => {
    index.addItem("1", { title: "GitHub Enterprise" });
    index.addItem("2", { title: "GitLab CI" });

    const results = index.search("git");
    expect(results).toContain("1");
    expect(results).toContain("2");
  });

  it("supports multi-term AND matching", () => {
    index.addItem("1", {
      title: "GitHub Login",
      username: "alice",
    });
    index.addItem("2", {
      title: "GitHub Login",
      username: "bob",
    });

    const results = index.search("github alice");
    expect(results).toEqual(["1"]);
  });

  it("returns empty for no matches", () => {
    index.addItem("1", { title: "GitHub" });
    expect(index.search("amazon")).toEqual([]);
  });

  it("returns empty for empty query", () => {
    index.addItem("1", { title: "GitHub" });
    expect(index.search("")).toEqual([]);
    expect(index.search("   ")).toEqual([]);
  });

  it("returns empty when AND term has no matches", () => {
    index.addItem("1", { title: "GitHub", username: "alice" });
    expect(index.search("github nonexistent")).toEqual([]);
  });

  // ── Multiple fields ──────────────────────────────────────────

  it("searches across all indexed fields", () => {
    index.addItem("1", {
      title: "Work Email",
      username: "alice@company.com",
      url: "https://mail.company.com",
    });

    expect(index.search("alice")).toContain("1");
    expect(index.search("company")).toContain("1");
    expect(index.search("mail")).toContain("1");
    expect(index.search("work")).toContain("1");
  });

  // ── Item removal ─────────────────────────────────────────────

  it("removes items from index", () => {
    index.addItem("1", { title: "GitHub" });
    index.addItem("2", { title: "GitLab" });

    index.removeItem("1");

    expect(index.search("github")).toEqual([]);
    expect(index.search("gitlab")).toContain("2");
    expect(index.size).toBe(1);
  });

  it("handles removing non-existent item gracefully", () => {
    index.addItem("1", { title: "GitHub" });
    index.removeItem("nonexistent");
    expect(index.size).toBe(1);
  });

  // ── Item update (re-add) ────────────────────────────────────

  it("updates item by re-adding with same id", () => {
    index.addItem("1", { title: "GitHub" });
    index.addItem("1", { title: "GitLab" }); // re-add updates

    expect(index.search("github")).toEqual([]);
    expect(index.search("gitlab")).toContain("1");
    expect(index.size).toBe(1);
  });

  // ── Serialization ────────────────────────────────────────────

  it("round-trips through serialize/deserialize", () => {
    index.addItem("1", { title: "GitHub Login", username: "alice" });
    index.addItem("2", { title: "Gmail Account", url: "https://gmail.com" });

    const serialized = index.serialize();
    const restored = SearchIndex.deserialize(serialized);

    expect(restored.search("github")).toContain("1");
    expect(restored.search("alice")).toContain("1");
    expect(restored.search("gmail")).toContain("2");
    expect(restored.size).toBe(2);
  });

  it("rejects unknown version during deserialization", () => {
    const bad = new TextEncoder().encode(
      JSON.stringify({ v: 99, entries: [], itemTerms: [] }),
    );
    expect(() => SearchIndex.deserialize(bad)).toThrow(
      "Unsupported search index version",
    );
  });

  // ── Clear ────────────────────────────────────────────────────

  it("clears all entries", () => {
    index.addItem("1", { title: "GitHub" });
    index.addItem("2", { title: "GitLab" });
    index.clear();

    expect(index.size).toBe(0);
    expect(index.search("git")).toEqual([]);
  });

  // ── Performance ──────────────────────────────────────────────

  it("searches 5,000 items in under 100ms", () => {
    // Populate with 5k items
    for (let i = 0; i < 5000; i++) {
      index.addItem(`item-${i}`, {
        title: `Service ${i} Login`,
        username: `user${i}@example.com`,
        url: `https://service${i}.example.com/login`,
        notes: `Notes for service ${i} with some extra text`,
      });
    }

    expect(index.size).toBe(5000);

    // Benchmark single-term search
    const start1 = performance.now();
    const results1 = index.search("service");
    const elapsed1 = performance.now() - start1;
    expect(results1.length).toBe(5000);
    expect(elapsed1).toBeLessThan(100);

    // Benchmark prefix search
    const start2 = performance.now();
    const results2 = index.search("user42");
    const elapsed2 = performance.now() - start2;
    expect(results2.length).toBeGreaterThan(0);
    expect(elapsed2).toBeLessThan(100);

    // Benchmark multi-term AND search
    const start3 = performance.now();
    const results3 = index.search("service login");
    const elapsed3 = performance.now() - start3;
    expect(results3.length).toBe(5000);
    expect(elapsed3).toBeLessThan(100);
  });

  // ── Edge cases ───────────────────────────────────────────────

  it("ignores empty field values", () => {
    index.addItem("1", { title: "", username: "" });
    expect(index.size).toBe(1);
    expect(index.search("anything")).toEqual([]);
  });

  it("handles special characters in field values", () => {
    index.addItem("1", { url: "https://github.com/user/repo" });
    expect(index.search("github")).toContain("1");
    expect(index.search("repo")).toContain("1");
  });

  it("skips single-character tokens", () => {
    index.addItem("1", { title: "A B C test" });
    // "A", "B", "C" are single-char — not indexed
    expect(index.search("a")).toEqual([]);
    expect(index.search("test")).toContain("1");
  });
});

// ── extractSearchableFields ──────────────────────────────────────

describe("extractSearchableFields", () => {
  it("extracts known searchable keys", () => {
    const fields = extractSearchableFields({
      title: "My Login",
      username: "alice",
      password: "secret123",
      url: "https://example.com",
      notes: "Some notes",
    });

    expect(fields).toEqual({
      title: "My Login",
      username: "alice",
      url: "https://example.com",
      notes: "Some notes",
    });
    // password should NOT be included
    expect(fields).not.toHaveProperty("password");
  });

  it("skips non-string and empty values", () => {
    const fields = extractSearchableFields({
      title: "Test",
      username: "",
      email: null,
      url: 123,
      notes: "   ",
    });

    expect(fields).toEqual({ title: "Test" });
  });
});
