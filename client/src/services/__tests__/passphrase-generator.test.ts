// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { describe, it, expect } from "vitest";
import {
  generatePassphrase,
  calculatePassphraseEntropy,
  type PassphraseConfig,
} from "../passphrase-generator";
import { EFF_WORDLIST } from "../eff-wordlist";

// ── Helpers ──────────────────────────────────────────────────────────

function baseConfig(overrides: Partial<PassphraseConfig> = {}): PassphraseConfig {
  return {
    wordCount: 5,
    separator: "-",
    capitalize: false,
    includeNumber: false,
    ...overrides,
  };
}

const effSet = new Set(EFF_WORDLIST);

// ── EFF Wordlist Integrity ───────────────────────────────────────────

describe("EFF wordlist", () => {
  it("contains exactly 7776 words", () => {
    expect(EFF_WORDLIST.length).toBe(7776);
  });

  it("has no duplicates", () => {
    expect(effSet.size).toBe(7776);
  });

  it("all words are lowercase alphabetic (may contain hyphens)", () => {
    for (const word of EFF_WORDLIST) {
      expect(word).toMatch(/^[a-z]+(-[a-z]+)*$/);
    }
  });
});

// ── generatePassphrase ───────────────────────────────────────────────

describe("generatePassphrase", () => {
  it("produces correct number of words", () => {
    for (const wordCount of [3, 5, 7, 10]) {
      const passphrase = generatePassphrase(baseConfig({ wordCount, separator: " " }));
      const words = passphrase.split(" ");
      expect(words.length).toBe(wordCount);
    }
  });

  it("all words come from EFF wordlist", () => {
    // Use space separator to avoid conflicts with hyphenated words
    // in the EFF wordlist (e.g. "drop-down", "t-shirt", "yo-yo")
    for (let i = 0; i < 20; i++) {
      const passphrase = generatePassphrase(baseConfig({ separator: " " }));
      const words = passphrase.split(" ");
      for (const word of words) {
        expect(effSet.has(word.toLowerCase())).toBe(true);
      }
    }
  });

  it("applies separator correctly", () => {
    for (const separator of ["-", " ", ".", "_"]) {
      const passphrase = generatePassphrase(baseConfig({ separator }));
      if (separator === "-") {
        expect(passphrase).toContain("-");
      } else {
        const parts = passphrase.split(separator);
        expect(parts.length).toBe(5);
      }
    }
  });

  it("capitalizes first letter of each word when configured", () => {
    for (let i = 0; i < 10; i++) {
      const passphrase = generatePassphrase(
        baseConfig({ capitalize: true, separator: " " }),
      );
      const words = passphrase.split(" ");
      for (const word of words) {
        expect(word[0]).toMatch(/[A-Z]/);
        // Rest of word should be lowercase; hyphenated EFF words like
        // "t-shirt" capitalize to "T-shirt", so the rest may START with "-"
        if (word.length > 1) {
          expect(word.slice(1)).toMatch(/^[a-z-]+$/);
        }
      }
    }
  });

  it("does not capitalize when capitalize is false", () => {
    for (let i = 0; i < 10; i++) {
      const passphrase = generatePassphrase(baseConfig({ capitalize: false, separator: " " }));
      const words = passphrase.split(" ");
      for (const word of words) {
        expect(word).toMatch(/^[a-z]+(-[a-z]+)*$/);
      }
    }
  });

  it("appends a digit when includeNumber is true", () => {
    for (let i = 0; i < 20; i++) {
      const passphrase = generatePassphrase(
        baseConfig({ includeNumber: true }),
      );
      // Last character should be a digit
      expect(passphrase[passphrase.length - 1]).toMatch(/[0-9]/);
    }
  });

  it("does not append digit when includeNumber is false", () => {
    for (let i = 0; i < 10; i++) {
      const passphrase = generatePassphrase(
        baseConfig({ includeNumber: false }),
      );
      // Last character should be a letter (part of last word)
      expect(passphrase[passphrase.length - 1]).toMatch(/[a-z]/);
    }
  });

  it("appended number is 0-9", () => {
    const digits = new Set<string>();
    // Generate many passphrases to collect digit variety
    for (let i = 0; i < 200; i++) {
      const passphrase = generatePassphrase(
        baseConfig({ includeNumber: true }),
      );
      digits.add(passphrase[passphrase.length - 1]);
    }
    // All collected digits should be 0-9
    for (const d of digits) {
      expect("0123456789").toContain(d);
    }
    // Should see multiple different digits
    expect(digits.size).toBeGreaterThan(1);
  });

  // ── Edge cases ────────────────────────────────────────────────────

  it("throws for word count below 3", () => {
    expect(() => generatePassphrase(baseConfig({ wordCount: 2 }))).toThrow(
      "Word count must be between 3 and 10",
    );
    expect(() => generatePassphrase(baseConfig({ wordCount: 0 }))).toThrow();
    expect(() => generatePassphrase(baseConfig({ wordCount: -1 }))).toThrow();
  });

  it("throws for word count above 10", () => {
    expect(() => generatePassphrase(baseConfig({ wordCount: 11 }))).toThrow(
      "Word count must be between 3 and 10",
    );
    expect(() => generatePassphrase(baseConfig({ wordCount: 100 }))).toThrow();
  });

  it("works at minimum word count (3)", () => {
    const passphrase = generatePassphrase(baseConfig({ wordCount: 3, separator: " " }));
    expect(passphrase.split(" ").length).toBe(3);
  });

  it("works at maximum word count (10)", () => {
    const passphrase = generatePassphrase(baseConfig({ wordCount: 10, separator: " " }));
    expect(passphrase.split(" ").length).toBe(10);
  });

  it("generates different passphrases on consecutive calls", () => {
    const passphrases = new Set<string>();
    for (let i = 0; i < 50; i++) {
      passphrases.add(generatePassphrase(baseConfig()));
    }
    // 5 words from 7776 — collision is astronomically unlikely
    expect(passphrases.size).toBe(50);
  });

  it("works with capitalize + includeNumber + space separator", () => {
    const config = baseConfig({
      capitalize: true,
      includeNumber: true,
      separator: " ",
      wordCount: 4,
    });
    const passphrase = generatePassphrase(config);
    const lastChar = passphrase[passphrase.length - 1];
    expect(lastChar).toMatch(/[0-9]/);
    // Remove trailing digit, split by space
    const withoutDigit = passphrase.slice(0, -1);
    const words = withoutDigit.split(" ");
    expect(words.length).toBe(4);
    for (const word of words) {
      expect(word[0]).toMatch(/[A-Z]/);
    }
  });
});

// ── calculatePassphraseEntropy ───────────────────────────────────────

describe("calculatePassphraseEntropy", () => {
  it("equals wordCount × log2(7776)", () => {
    const config = baseConfig({ wordCount: 5 });
    const expected = 5 * Math.log2(7776);
    expect(calculatePassphraseEntropy(config)).toBeCloseTo(expected, 5);
  });

  it("adds log2(10) when includeNumber is true", () => {
    const without = calculatePassphraseEntropy(
      baseConfig({ includeNumber: false }),
    );
    const withNum = calculatePassphraseEntropy(
      baseConfig({ includeNumber: true }),
    );
    expect(withNum - without).toBeCloseTo(Math.log2(10), 5);
  });

  it("entropy scales linearly with word count", () => {
    const e3 = calculatePassphraseEntropy(baseConfig({ wordCount: 3 }));
    const e6 = calculatePassphraseEntropy(baseConfig({ wordCount: 6 }));
    expect(e6 / e3).toBeCloseTo(2, 5);
  });

  it("5-word passphrase has ~64.6 bits of entropy", () => {
    const entropy = calculatePassphraseEntropy(baseConfig({ wordCount: 5 }));
    // 5 × 12.925 ≈ 64.62
    expect(entropy).toBeCloseTo(5 * Math.log2(7776), 1);
    expect(entropy).toBeGreaterThan(64);
    expect(entropy).toBeLessThan(65);
  });

  it("entropy is independent of separator and capitalization", () => {
    const a = calculatePassphraseEntropy(
      baseConfig({ separator: "-", capitalize: false }),
    );
    const b = calculatePassphraseEntropy(
      baseConfig({ separator: ".", capitalize: true }),
    );
    expect(a).toBe(b);
  });
});
