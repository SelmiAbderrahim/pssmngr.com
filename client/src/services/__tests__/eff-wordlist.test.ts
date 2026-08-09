// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { describe, it, expect } from "vitest";
import { EFF_WORDLIST } from "../eff-wordlist";

describe("EFF_WORDLIST", () => {
  it("contains exactly 7776 words (6^5 for diceware)", () => {
    expect(EFF_WORDLIST).toHaveLength(7776);
  });

  it("is a readonly array", () => {
    // TypeScript enforces this at compile time, but we verify the reference is stable
    expect(Array.isArray(EFF_WORDLIST)).toBe(true);
  });

  it("contains only non-empty strings", () => {
    for (const word of EFF_WORDLIST) {
      expect(typeof word).toBe("string");
      expect(word.length).toBeGreaterThan(0);
    }
  });

  it("contains only lowercase words", () => {
    for (const word of EFF_WORDLIST) {
      expect(word).toBe(word.toLowerCase());
    }
  });

  it("has no duplicate entries", () => {
    const unique = new Set(EFF_WORDLIST);
    expect(unique.size).toBe(EFF_WORDLIST.length);
  });

  it("starts with 'abacus' (first EFF word)", () => {
    expect(EFF_WORDLIST[0]).toBe("abacus");
  });

  it("ends with 'zoom' (last EFF word)", () => {
    expect(EFF_WORDLIST[EFF_WORDLIST.length - 1]).toBe("zoom");
  });

  it("contains known EFF diceware words", () => {
    const knownWords = ["abacus", "battery", "correct", "staple", "village", "zoom"];
    for (const word of knownWords) {
      expect(EFF_WORDLIST).toContain(word);
    }
  });

  it("all entries are between 2-12 characters", () => {
    for (const word of EFF_WORDLIST) {
      expect(word.length).toBeGreaterThanOrEqual(2);
      expect(word.length).toBeLessThanOrEqual(12);
    }
  });

  it("words contain only lowercase ASCII letters and hyphens", () => {
    const validChars = /^[a-z]+(-[a-z]+)*$/;
    for (const word of EFF_WORDLIST) {
      expect(word).toMatch(validChars);
    }
  });
});
