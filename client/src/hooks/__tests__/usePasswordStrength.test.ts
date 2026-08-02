// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
vi.unmock("@/hooks/usePasswordStrength");

import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { usePasswordStrength } from "../usePasswordStrength";

describe("usePasswordStrength", () => {
  describe("empty password", () => {
    it("returns none strength and score 0", () => {
      const { result } = renderHook(() => usePasswordStrength(""));
      expect(result.current.strength).toBe("none");
      expect(result.current.score).toBe(0);
    });

    it("returns all requirements as false", () => {
      const { result } = renderHook(() => usePasswordStrength(""));
      expect(result.current.requirements).toEqual({
        length: false,
        uppercase: false,
        lowercase: false,
        number: false,
        special: false,
      });
    });

    it("returns empty feedback array", () => {
      const { result } = renderHook(() => usePasswordStrength(""));
      expect(result.current.feedback).toEqual([]);
    });

    it("returns muted color", () => {
      const { result } = renderHook(() => usePasswordStrength(""));
      expect(result.current.color).toBe("var(--muted)");
      expect(result.current.colorVar).toBe("--muted");
    });
  });

  describe("weak passwords (score < 40)", () => {
    it("rates short lowercase-only password as weak", () => {
      const { result } = renderHook(() => usePasswordStrength("abc"));
      expect(result.current.strength).toBe("weak");
      expect(result.current.score).toBeLessThan(40);
    });

    it("returns destructive color for weak passwords", () => {
      const { result } = renderHook(() => usePasswordStrength("abc"));
      expect(result.current.color).toBe("var(--destructive)");
      expect(result.current.colorVar).toBe("--destructive");
    });

    it("rates common password as weak regardless of character variety", () => {
      const { result } = renderHook(() => usePasswordStrength("password"));
      expect(result.current.strength).toBe("weak");
    });

    it("penalizes common passwords from the list", () => {
      const { result: commonResult } = renderHook(() =>
        usePasswordStrength("password"),
      );
      const { result: normalResult } = renderHook(() =>
        usePasswordStrength("xyzwvuts"),
      );
      expect(commonResult.current.score).toBeLessThan(
        normalResult.current.score,
      );
      expect(commonResult.current.feedback).toContain(
        "Avoid common passwords",
      );
    });
  });

  describe("medium passwords (40 <= score < 70)", () => {
    it("rates password meeting basic requirements as medium", () => {
      // "MyP4ss!" is 7 chars (no length bonus) with upper+lower+number+special = score 60
      const { result } = renderHook(() => usePasswordStrength("MyP4ss!"));
      expect(result.current.strength).toBe("medium");
      expect(result.current.score).toBeGreaterThanOrEqual(40);
      expect(result.current.score).toBeLessThan(70);
    });

    it("returns warning color for medium passwords", () => {
      const { result } = renderHook(() => usePasswordStrength("MyP4ss!"));
      expect(result.current.color).toContain("warning");
      expect(result.current.colorVar).toBe("--warning");
    });
  });

  describe("strong passwords (score >= 70)", () => {
    it("rates long varied password as strong", () => {
      const { result } = renderHook(() =>
        usePasswordStrength("MyStr0ng!P@ssw0rd"),
      );
      expect(result.current.strength).toBe("strong");
      expect(result.current.score).toBeGreaterThanOrEqual(70);
    });

    it("returns success color for strong passwords", () => {
      const { result } = renderHook(() =>
        usePasswordStrength("MyStr0ng!P@ssw0rd"),
      );
      expect(result.current.color).toContain("success");
      expect(result.current.colorVar).toBe("--success");
    });
  });

  describe("requirements", () => {
    it("detects length requirement (>= 8 chars)", () => {
      const { result: short } = renderHook(() => usePasswordStrength("Ab1!xyz"));
      expect(short.current.requirements.length).toBe(false);

      const { result: long } = renderHook(() =>
        usePasswordStrength("Ab1!xyzw"),
      );
      expect(long.current.requirements.length).toBe(true);
    });

    it("detects uppercase requirement", () => {
      const { result: noUpper } = renderHook(() =>
        usePasswordStrength("abc123!@"),
      );
      expect(noUpper.current.requirements.uppercase).toBe(false);

      const { result: withUpper } = renderHook(() =>
        usePasswordStrength("Abc123!@"),
      );
      expect(withUpper.current.requirements.uppercase).toBe(true);
    });

    it("detects lowercase requirement", () => {
      const { result: noLower } = renderHook(() =>
        usePasswordStrength("ABC123!@"),
      );
      expect(noLower.current.requirements.lowercase).toBe(false);

      const { result: withLower } = renderHook(() =>
        usePasswordStrength("ABc123!@"),
      );
      expect(withLower.current.requirements.lowercase).toBe(true);
    });

    it("detects number requirement", () => {
      const { result: noNum } = renderHook(() =>
        usePasswordStrength("Abcdefg!"),
      );
      expect(noNum.current.requirements.number).toBe(false);

      const { result: withNum } = renderHook(() =>
        usePasswordStrength("Abcdef1!"),
      );
      expect(withNum.current.requirements.number).toBe(true);
    });

    it("detects special character requirement", () => {
      const { result: noSpecial } = renderHook(() =>
        usePasswordStrength("Abcdefg1"),
      );
      expect(noSpecial.current.requirements.special).toBe(false);

      const { result: withSpecial } = renderHook(() =>
        usePasswordStrength("Abcdef1!"),
      );
      expect(withSpecial.current.requirements.special).toBe(true);
    });
  });

  describe("penalties", () => {
    it("penalizes sequential characters", () => {
      // "abcdef" contains sequential "abc"
      const { result: seqResult } = renderHook(() =>
        usePasswordStrength("abcdef1A!"),
      );
      expect(seqResult.current.feedback).toContain(
        "Avoid sequential characters (abc, 123)",
      );

      // Compare with non-sequential password of similar composition
      const { result: nonSeqResult } = renderHook(() =>
        usePasswordStrength("xwzfhg1A!"),
      );
      expect(seqResult.current.score).toBeLessThan(
        nonSeqResult.current.score,
      );
    });

    it("penalizes repeated characters", () => {
      // "aaaBw1!x" has repeated "aaa", "ghkBw1!x" does not (and no sequential match)
      const { result: repResult } = renderHook(() =>
        usePasswordStrength("aaaBw1!x"),
      );
      expect(repResult.current.feedback).toContain(
        "Avoid repeated characters (aaa, 111)",
      );

      const { result: nonRepResult } = renderHook(() =>
        usePasswordStrength("ghkBw1!x"),
      );
      expect(repResult.current.score).toBeLessThan(
        nonRepResult.current.score,
      );
    });
  });

  describe("feedback messages", () => {
    it("suggests adding missing character types", () => {
      const { result } = renderHook(() => usePasswordStrength("aaaa"));
      expect(result.current.feedback).toContain("Use at least 8 characters");
      expect(result.current.feedback).toContain("Add an uppercase letter");
      expect(result.current.feedback).toContain("Add a number");
      expect(result.current.feedback).toContain(
        "Add a special character (!@#$%^&*)",
      );
    });

    it("does not suggest lowercase when present", () => {
      const { result } = renderHook(() => usePasswordStrength("abc"));
      expect(result.current.feedback).not.toContain("Add a lowercase letter");
    });

    it("has no missing-type feedback for password with all types", () => {
      const { result } = renderHook(() =>
        usePasswordStrength("LongEnoughP4ss!"),
      );
      expect(result.current.feedback).not.toContain(
        "Use at least 8 characters",
      );
      expect(result.current.feedback).not.toContain("Add an uppercase letter");
      expect(result.current.feedback).not.toContain("Add a lowercase letter");
      expect(result.current.feedback).not.toContain("Add a number");
      expect(result.current.feedback).not.toContain(
        "Add a special character (!@#$%^&*)",
      );
    });
  });

  describe("score boundaries", () => {
    it("score never exceeds 100", () => {
      const { result } = renderHook(() =>
        usePasswordStrength("VeryL0ng!Str#ngP@ssw0rdWith$pecial"),
      );
      expect(result.current.score).toBeLessThanOrEqual(100);
    });

    it("score never goes below 0", () => {
      // Common password with sequential + repeated chars
      const { result } = renderHook(() => usePasswordStrength("password"));
      expect(result.current.score).toBeGreaterThanOrEqual(0);
    });

    it("score 39 is weak, score 40 is medium", () => {
      // Verify the boundary logic: < 40 = weak, >= 40 = medium
      const { result: weak } = renderHook(() => usePasswordStrength("abc"));
      expect(weak.current.score).toBeLessThan(40);
      expect(weak.current.strength).toBe("weak");

      const { result: medium } = renderHook(() =>
        usePasswordStrength("MyPass1!"),
      );
      expect(medium.current.score).toBeGreaterThanOrEqual(40);
      expect(medium.current.strength).not.toBe("weak");
    });
  });

  describe("translation function", () => {
    it("uses translation function for feedback when provided", () => {
      const mockT = vi.fn(
        (_key: string, fallback: string) => `translated:${fallback}`,
      );
      const { result } = renderHook(() => usePasswordStrength("abc", mockT));
      expect(mockT).toHaveBeenCalled();
      expect(
        result.current.feedback.some((f: string) =>
          f.startsWith("translated:"),
        ),
      ).toBe(true);
    });

    it("uses fallback text when no translation function provided", () => {
      const { result } = renderHook(() => usePasswordStrength("abc"));
      expect(result.current.feedback).toContain("Use at least 8 characters");
      expect(result.current.feedback).toContain("Add an uppercase letter");
    });
  });
});
