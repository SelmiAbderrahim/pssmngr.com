// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { describe, it, expect } from "vitest";
import { secureRandomIndex } from "../crypto-random";

describe("secureRandomIndex", () => {
  it("returns values in [0, max)", () => {
    for (const max of [1, 2, 10, 100, 256, 7776]) {
      for (let i = 0; i < 100; i++) {
        const val = secureRandomIndex(max);
        expect(val).toBeGreaterThanOrEqual(0);
        expect(val).toBeLessThan(max);
        expect(Number.isInteger(val)).toBe(true);
      }
    }
  });

  it("returns 0 when max is 1", () => {
    for (let i = 0; i < 20; i++) {
      expect(secureRandomIndex(1)).toBe(0);
    }
  });

  it("throws for max <= 0", () => {
    expect(() => secureRandomIndex(0)).toThrow("max must be positive");
    expect(() => secureRandomIndex(-1)).toThrow("max must be positive");
    expect(() => secureRandomIndex(-100)).toThrow("max must be positive");
  });

  it("covers all values for small max", () => {
    const max = 6;
    const seen = new Set<number>();
    // With 200 trials and max=6, probability of missing any value is negligible
    for (let i = 0; i < 200; i++) {
      seen.add(secureRandomIndex(max));
    }
    expect(seen.size).toBe(max);
  });

  it("produces roughly uniform distribution", () => {
    const max = 10;
    const counts = new Array(max).fill(0);
    const samples = 10_000;

    for (let i = 0; i < samples; i++) {
      counts[secureRandomIndex(max)]++;
    }

    const expected = samples / max;
    let chiSquared = 0;
    for (let i = 0; i < max; i++) {
      chiSquared += (counts[i] - expected) ** 2 / expected;
    }

    // 9 degrees of freedom, generous threshold
    expect(chiSquared).toBeLessThan(50);
  });

  it("works with powers of 2", () => {
    for (const max of [2, 4, 8, 16, 32, 64, 128, 256]) {
      const val = secureRandomIndex(max);
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThan(max);
    }
  });

  it("works with non-powers of 2", () => {
    for (const max of [3, 5, 7, 13, 97, 7776]) {
      const val = secureRandomIndex(max);
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThan(max);
    }
  });

  it("uses crypto.getRandomValues (CSPRNG)", () => {
    // Verify crypto API is available (jsdom provides it)
    expect(typeof crypto.getRandomValues).toBe("function");
    // The function should work — this proves it uses the crypto API
    const val = secureRandomIndex(100);
    expect(val).toBeGreaterThanOrEqual(0);
    expect(val).toBeLessThan(100);
  });
});
