// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { describe, it, expect } from "vitest";
import {
  generatePassword,
  buildCharset,
  calculateEntropy,
  type GeneratorConfig,
} from "../password-generator";

// ── Helpers ──────────────────────────────────────────────────────────

const UPPERCASE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LOWERCASE = "abcdefghijklmnopqrstuvwxyz";
const DIGITS = "0123456789";
const SYMBOLS = "!@#$%^&*()-_=+[]{}|;:',.<>?/";
const AMBIGUOUS = "0O1lI";

function baseConfig(overrides: Partial<GeneratorConfig> = {}): GeneratorConfig {
  return {
    length: 16,
    uppercase: true,
    lowercase: true,
    digits: true,
    symbols: false,
    ...overrides,
  };
}

// ── buildCharset ─────────────────────────────────────────────────────

describe("buildCharset", () => {
  it("includes uppercase when enabled", () => {
    const pool = buildCharset(baseConfig({ lowercase: false, digits: false }));
    for (const ch of UPPERCASE) {
      expect(pool).toContain(ch);
    }
    for (const ch of LOWERCASE) {
      expect(pool).not.toContain(ch);
    }
  });

  it("includes lowercase when enabled", () => {
    const pool = buildCharset(baseConfig({ uppercase: false, digits: false }));
    for (const ch of LOWERCASE) {
      expect(pool).toContain(ch);
    }
  });

  it("includes digits when enabled", () => {
    const pool = buildCharset(baseConfig({ uppercase: false, lowercase: false }));
    for (const ch of DIGITS) {
      expect(pool).toContain(ch);
    }
  });

  it("includes symbols when enabled", () => {
    const pool = buildCharset(baseConfig({ symbols: true }));
    for (const ch of SYMBOLS) {
      expect(pool).toContain(ch);
    }
  });

  it("excludes ambiguous characters when configured", () => {
    const pool = buildCharset(baseConfig({ excludeAmbiguous: true }));
    for (const ch of AMBIGUOUS) {
      expect(pool).not.toContain(ch);
    }
  });

  it("excludes custom characters", () => {
    const pool = buildCharset(baseConfig({ excludeChars: "abc123" }));
    expect(pool).not.toContain("a");
    expect(pool).not.toContain("b");
    expect(pool).not.toContain("c");
    expect(pool).not.toContain("1");
    expect(pool).not.toContain("2");
    expect(pool).not.toContain("3");
  });

  it("applies both ambiguous and custom exclusions", () => {
    const pool = buildCharset(
      baseConfig({ excludeAmbiguous: true, excludeChars: "abc" }),
    );
    for (const ch of AMBIGUOUS) {
      expect(pool).not.toContain(ch);
    }
    expect(pool).not.toContain("a");
    expect(pool).not.toContain("b");
    expect(pool).not.toContain("c");
  });

  it("throws when pool is empty", () => {
    expect(() =>
      buildCharset({
        length: 8,
        uppercase: false,
        lowercase: false,
        digits: false,
        symbols: false,
      }),
    ).toThrow("Character pool is empty");
  });

  it("single charset produces correct pool", () => {
    const pool = buildCharset(
      baseConfig({ uppercase: false, lowercase: false, digits: true }),
    );
    expect(pool).toBe(DIGITS);
  });
});

// ── generatePassword ─────────────────────────────────────────────────

describe("generatePassword", () => {
  it("produces password of exact requested length", () => {
    for (const len of [8, 16, 32, 64, 128]) {
      const pw = generatePassword(baseConfig({ length: len }));
      expect(pw.length).toBe(len);
    }
  });

  it("only contains characters from the configured charset", () => {
    const config = baseConfig({ symbols: false });
    const pool = new Set(buildCharset(config));
    for (let i = 0; i < 20; i++) {
      const pw = generatePassword(config);
      for (const ch of pw) {
        expect(pool.has(ch)).toBe(true);
      }
    }
  });

  it("does not contain excluded characters", () => {
    const excluded = "aeiou";
    const config = baseConfig({ excludeChars: excluded });
    for (let i = 0; i < 20; i++) {
      const pw = generatePassword(config);
      for (const ch of excluded) {
        expect(pw).not.toContain(ch);
      }
    }
  });

  it("does not contain ambiguous characters when excluded", () => {
    const config = baseConfig({ excludeAmbiguous: true });
    for (let i = 0; i < 20; i++) {
      const pw = generatePassword(config);
      for (const ch of AMBIGUOUS) {
        expect(pw).not.toContain(ch);
      }
    }
  });

  it("throws for length below 8", () => {
    expect(() => generatePassword(baseConfig({ length: 7 }))).toThrow(
      "Password length must be between 8 and 128",
    );
    expect(() => generatePassword(baseConfig({ length: 0 }))).toThrow();
    expect(() => generatePassword(baseConfig({ length: -1 }))).toThrow();
  });

  it("throws for length above 128", () => {
    expect(() => generatePassword(baseConfig({ length: 129 }))).toThrow(
      "Password length must be between 8 and 128",
    );
    expect(() => generatePassword(baseConfig({ length: 1000 }))).toThrow();
  });

  it("works at minimum length (8)", () => {
    const pw = generatePassword(baseConfig({ length: 8 }));
    expect(pw.length).toBe(8);
  });

  it("works at maximum length (128)", () => {
    const pw = generatePassword(baseConfig({ length: 128 }));
    expect(pw.length).toBe(128);
  });

  it("works with single charset (digits only)", () => {
    const config: GeneratorConfig = {
      length: 16,
      uppercase: false,
      lowercase: false,
      digits: true,
      symbols: false,
    };
    const pw = generatePassword(config);
    expect(pw.length).toBe(16);
    for (const ch of pw) {
      expect(DIGITS).toContain(ch);
    }
  });

  it("works with symbols only", () => {
    const config: GeneratorConfig = {
      length: 12,
      uppercase: false,
      lowercase: false,
      digits: false,
      symbols: true,
    };
    const pw = generatePassword(config);
    expect(pw.length).toBe(12);
    for (const ch of pw) {
      expect(SYMBOLS).toContain(ch);
    }
  });

  it("generates different passwords on consecutive calls", () => {
    const config = baseConfig({ length: 32 });
    const passwords = new Set<string>();
    for (let i = 0; i < 50; i++) {
      passwords.add(generatePassword(config));
    }
    // With a 62-char pool and length 32, collision probability is negligible
    expect(passwords.size).toBe(50);
  });

  // ── Distribution uniformity (chi-squared) ──────────────────────────

  it("produces roughly uniform distribution over 10k samples", () => {
    const config: GeneratorConfig = {
      length: 8,
      uppercase: false,
      lowercase: false,
      digits: true,
      symbols: false,
    };
    const pool = buildCharset(config);
    const counts: Record<string, number> = {};
    for (const ch of pool) counts[ch] = 0;

    const samples = 10_000;
    for (let i = 0; i < samples; i++) {
      const pw = generatePassword(config);
      for (const ch of pw) {
        counts[ch]++;
      }
    }

    const totalChars = samples * config.length; // 80,000
    const expected = totalChars / pool.length; // ~8,000 per digit
    let chiSquared = 0;
    for (const ch of pool) {
      chiSquared += (counts[ch] - expected) ** 2 / expected;
    }

    // For 9 degrees of freedom (10 digits - 1), p=0.001 threshold ≈ 27.88
    // Use generous threshold to avoid flaky tests
    expect(chiSquared).toBeLessThan(50);
  });
});

// ── calculateEntropy ─────────────────────────────────────────────────

describe("calculateEntropy", () => {
  it("calculates entropy as length × log2(poolSize)", () => {
    const config = baseConfig({ length: 16 });
    const pool = buildCharset(config);
    const expected = 16 * Math.log2(pool.length);
    expect(calculateEntropy(config)).toBeCloseTo(expected, 5);
  });

  it("returns 0 when pool has only 1 character", () => {
    // All chars excluded except one digit — pool = 1 char
    const config: GeneratorConfig = {
      length: 8,
      uppercase: false,
      lowercase: false,
      digits: true,
      symbols: false,
      excludeChars: "123456789",
    };
    expect(calculateEntropy(config)).toBe(0);
  });

  it("entropy increases with length", () => {
    const short = calculateEntropy(baseConfig({ length: 8 }));
    const long = calculateEntropy(baseConfig({ length: 32 }));
    expect(long).toBeGreaterThan(short);
    expect(long / short).toBeCloseTo(32 / 8, 5);
  });

  it("entropy increases with larger charset", () => {
    const noSymbols = calculateEntropy(baseConfig({ symbols: false }));
    const withSymbols = calculateEntropy(baseConfig({ symbols: true }));
    expect(withSymbols).toBeGreaterThan(noSymbols);
  });

  it("digits-only entropy is length × log2(10)", () => {
    const config: GeneratorConfig = {
      length: 20,
      uppercase: false,
      lowercase: false,
      digits: true,
      symbols: false,
    };
    expect(calculateEntropy(config)).toBeCloseTo(20 * Math.log2(10), 5);
  });
});
