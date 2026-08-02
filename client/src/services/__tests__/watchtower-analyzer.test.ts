// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { describe, it, expect } from "vitest";
import type { DecryptedVaultItem } from "@/components/vault/VaultItemCard";
import type { ItemType } from "@/components/vault/VaultItemCard";
import {
  detectCharsetSize,
  calculatePasswordEntropy,
  hasSequentialPattern,
  hasKeyboardWalkPattern,
  hasRepeatedPattern,
  isWeakPassword,
  analyzeVault,
} from "../watchtower-analyzer";

// ── Helpers ──────────────────────────────────────────────────────────

function makeItem(
  id: string,
  password: string,
  overrides: Partial<{
    updatedAt: string;
    itemType: ItemType;
  }> = {},
): DecryptedVaultItem {
  const now = new Date().toISOString();
  return {
    id,
    itemType: overrides.itemType ?? "login",
    isFavorite: false,
    createdAt: now,
    updatedAt: overrides.updatedAt ?? now,
    decrypted: { title: `Item ${id}`, password },
  };
}

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

// ── detectCharsetSize ────────────────────────────────────────────────

describe("detectCharsetSize", () => {
  it("returns 26 for lowercase only", () => {
    expect(detectCharsetSize("abcxyz")).toBe(26);
  });

  it("returns 26 for uppercase only", () => {
    expect(detectCharsetSize("ABCXYZ")).toBe(26);
  });

  it("returns 10 for digits only", () => {
    expect(detectCharsetSize("0123456789")).toBe(10);
  });

  it("returns 52 for mixed case", () => {
    expect(detectCharsetSize("aAbBcC")).toBe(52);
  });

  it("includes 32 for symbols", () => {
    expect(detectCharsetSize("a!@#")).toBe(26 + 32);
  });

  it("includes 128 for extended characters", () => {
    expect(detectCharsetSize("aé")).toBe(26 + 128);
  });

  it("returns full pool for complex password", () => {
    expect(detectCharsetSize("aA1!é")).toBe(26 + 26 + 10 + 32 + 128);
  });

  it("returns 0 for empty string", () => {
    expect(detectCharsetSize("")).toBe(0);
  });

  it("returns 0 for space-only (code 32, below symbol range)", () => {
    // Space is charCode 32, which is below the symbol range (33-126)
    expect(detectCharsetSize("   ")).toBe(0);
  });
});

// ── calculatePasswordEntropy ─────────────────────────────────────────

describe("calculatePasswordEntropy", () => {
  it("returns 0 for empty string", () => {
    expect(calculatePasswordEntropy("")).toBe(0);
  });

  it("returns 0 for null/undefined", () => {
    expect(calculatePasswordEntropy(null as unknown as string)).toBe(0);
    expect(calculatePasswordEntropy(undefined as unknown as string)).toBe(0);
  });

  it("calculates correctly for lowercase password", () => {
    // 8 chars * log2(26) ≈ 37.6
    const entropy = calculatePasswordEntropy("abcdefgh");
    expect(entropy).toBeCloseTo(8 * Math.log2(26), 5);
  });

  it("calculates correctly for mixed-case + digits", () => {
    // 10 chars * log2(62) ≈ 59.5
    const entropy = calculatePasswordEntropy("aAbBcC1234");
    expect(entropy).toBeCloseTo(10 * Math.log2(62), 5);
  });

  it("higher entropy for longer passwords", () => {
    const short = calculatePasswordEntropy("aB1");
    const long = calculatePasswordEntropy("aB1cD2eF3gH4");
    expect(long).toBeGreaterThan(short);
  });

  it("higher entropy for larger charset", () => {
    const lower = calculatePasswordEntropy("abcdefghij"); // 26
    const mixed = calculatePasswordEntropy("aBcDeFgHiJ"); // 52
    expect(mixed).toBeGreaterThan(lower);
  });
});

// ── hasSequentialPattern ─────────────────────────────────────────────

describe("hasSequentialPattern", () => {
  it("detects forward alpha sequence", () => {
    expect(hasSequentialPattern("xxabcdxx")).toBe(true);
  });

  it("detects reverse alpha sequence", () => {
    expect(hasSequentialPattern("xxdcbaxx")).toBe(true);
  });

  it("detects forward digit sequence", () => {
    expect(hasSequentialPattern("xx1234xx")).toBe(true);
  });

  it("detects reverse digit sequence", () => {
    expect(hasSequentialPattern("xx4321xx")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(hasSequentialPattern("xxABCDxx")).toBe(true);
  });

  it("returns false for non-sequential", () => {
    expect(hasSequentialPattern("axbycz12")).toBe(false);
  });

  it("returns false for run shorter than minRun", () => {
    expect(hasSequentialPattern("abc")).toBe(false); // only 3, need 4
  });

  it("respects custom minRun", () => {
    expect(hasSequentialPattern("abc", 3)).toBe(true);
    expect(hasSequentialPattern("ab", 3)).toBe(false);
  });
});

// ── hasKeyboardWalkPattern ───────────────────────────────────────────

describe("hasKeyboardWalkPattern", () => {
  it("detects qwerty walk", () => {
    expect(hasKeyboardWalkPattern("xxqwerxx")).toBe(true);
  });

  it("detects asdf walk", () => {
    expect(hasKeyboardWalkPattern("xxasdfxx")).toBe(true);
  });

  it("detects zxcv walk", () => {
    expect(hasKeyboardWalkPattern("xxzxcvxx")).toBe(true);
  });

  it("detects reverse keyboard walk", () => {
    expect(hasKeyboardWalkPattern("xxrewqxx")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(hasKeyboardWalkPattern("xxQWERxx")).toBe(true);
  });

  it("returns false for non-keyboard-walk", () => {
    expect(hasKeyboardWalkPattern("abcdefgh")).toBe(false);
  });

  it("returns false for short walk", () => {
    expect(hasKeyboardWalkPattern("qwe")).toBe(false); // 3 < 4
  });
});

// ── hasRepeatedPattern ───────────────────────────────────────────────

describe("hasRepeatedPattern", () => {
  it("detects 3+ repeated chars", () => {
    expect(hasRepeatedPattern("xxaaaxx")).toBe(true);
  });

  it("detects long repeated run", () => {
    expect(hasRepeatedPattern("bbbbbbb")).toBe(true);
  });

  it("returns false for only 2 repeated", () => {
    expect(hasRepeatedPattern("aabb")).toBe(false);
  });

  it("returns false for no repeats", () => {
    expect(hasRepeatedPattern("abcdefg")).toBe(false);
  });

  it("respects custom minRun", () => {
    expect(hasRepeatedPattern("aa", 2)).toBe(true);
    expect(hasRepeatedPattern("a", 2)).toBe(false);
  });
});

// ── isWeakPassword ───────────────────────────────────────────────────

describe("isWeakPassword", () => {
  it("flags empty/null as weak", () => {
    expect(isWeakPassword("")).toBe(true);
    expect(isWeakPassword(null as unknown as string)).toBe(true);
  });

  it("flags low-entropy password as weak", () => {
    // "password" = 8 * log2(26) ≈ 37.6 < 40
    expect(isWeakPassword("password")).toBe(true);
  });

  it("flags sequential pattern as weak even with sufficient entropy", () => {
    // "abcdefghijklmnop" = 16 * log2(26) ≈ 75.2 bits (high entropy)
    // but contains sequential pattern
    expect(isWeakPassword("abcdefghijklmnop")).toBe(true);
  });

  it("flags keyboard walk as weak even with sufficient entropy", () => {
    expect(isWeakPassword("qwertyuiop1234")).toBe(true);
  });

  it("flags repeated chars as weak", () => {
    expect(isWeakPassword("Str0ng!aaaPw#9xZ")).toBe(true);
  });

  it("returns false for strong, non-patterned password", () => {
    // High entropy, no patterns
    expect(isWeakPassword("xK9#mP2$vL7@nQ5")).toBe(false);
  });

  it("respects custom entropy threshold", () => {
    // "abcxyz12" = 8 * log2(36) ≈ 41.4 bits
    // But it doesn't have sequential >= 4 or keyboard walk >= 4
    // abcx - a,b,c sequential forward (3), then x breaks it. Not >= 4.
    // Actually "abcx" - a(0),b(1),c(2),x(23): fwd run is 3 at c, then x breaks. Not >= 4.
    // This should pass entropy check at threshold 40.
    // But wait, does it have patterns? Let me check:
    // "abcxyz12": abc is run of 3 (< 4), xyz is run of 3 (< 4), 12 is run of 2. No pattern triggers.
    // So with 41.4 bits and no patterns, it's NOT weak at threshold 40.
    expect(isWeakPassword("abcxyz12", 40)).toBe(false);
    // But weak at threshold 50
    expect(isWeakPassword("abcxyz12", 50)).toBe(true);
  });
});

// ── analyzeVault ─────────────────────────────────────────────────────

describe("analyzeVault", () => {
  it("returns score 100 for empty vault", async () => {
    const result = await analyzeVault([]);
    expect(result.weak).toEqual([]);
    expect(result.reused).toEqual([]);
    expect(result.old).toEqual([]);
    expect(result.missing2fa).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.score).toBe(100);
    expect(result.breakdown.score).toBe(100);
    expect(result.breakdown.totalPenalty).toBe(0);
    expect(result.breakdown.categories).toEqual([]);
  });

  it("ignores items without passwords", async () => {
    const note: DecryptedVaultItem = {
      id: "n1",
      itemType: "note",
      isFavorite: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      decrypted: { title: "My Note", content: "secret text" },
    };
    const result = await analyzeVault([note]);
    expect(result.total).toBe(0);
    expect(result.score).toBe(100);
  });

  it("detects weak passwords", async () => {
    const items = [
      makeItem("1", "weak"), // 4 * log2(26) ≈ 18.8 bits
      makeItem("2", "xK9#mP2$vL7@nQ5"), // strong
    ];
    const result = await analyzeVault(items);
    expect(result.weak).toHaveLength(1);
    expect(result.weak[0].id).toBe("1");
    expect(result.total).toBe(2);
  });

  it("groups reused passwords", async () => {
    const items = [
      makeItem("1", "SharedPass!42xZ"),
      makeItem("2", "SharedPass!42xZ"),
      makeItem("3", "UniquePass!99qW"),
    ];
    const result = await analyzeVault(items);
    expect(result.reused).toHaveLength(1);
    expect(result.reused[0]).toHaveLength(2);
    const ids = result.reused[0].map((i) => i.id).sort();
    expect(ids).toEqual(["1", "2"]);
  });

  it("creates multiple reuse groups", async () => {
    const items = [
      makeItem("1", "GroupA!pw42xZ"),
      makeItem("2", "GroupA!pw42xZ"),
      makeItem("3", "GroupB!pw99qW"),
      makeItem("4", "GroupB!pw99qW"),
      makeItem("5", "Unique!pw77mN"),
    ];
    const result = await analyzeVault(items);
    expect(result.reused).toHaveLength(2);
  });

  it("detects old passwords", async () => {
    const items = [
      makeItem("1", "xK9#mP2$vL7@nQ5", { updatedAt: daysAgo(100) }),
      makeItem("2", "yL8$nQ3#wM6@pR4", { updatedAt: daysAgo(10) }),
    ];
    const result = await analyzeVault(items);
    expect(result.old).toHaveLength(1);
    expect(result.old[0].id).toBe("1");
  });

  it("respects custom old threshold", async () => {
    const items = [
      makeItem("1", "xK9#mP2$vL7@nQ5", { updatedAt: daysAgo(50) }),
    ];
    const defaultResult = await analyzeVault(items);
    expect(defaultResult.old).toHaveLength(0); // 50 < 90

    const strictResult = await analyzeVault(items, { oldThresholdDays: 30 });
    expect(strictResult.old).toHaveLength(1); // 50 > 30
  });

  it("returns score 100 for all strong, unique, fresh passwords", async () => {
    const items = [
      makeItem("1", "xK9#mP2$vL7@nQ5"),
      makeItem("2", "yL8$nQ3#wM6@pR4"),
      makeItem("3", "zA7!oR4%xN5#qS6"),
    ];
    const result = await analyzeVault(items);
    expect(result.weak).toHaveLength(0);
    expect(result.reused).toHaveLength(0);
    expect(result.old).toHaveLength(0);
    expect(result.score).toBe(100);
  });

  it("calculates score with penalties", async () => {
    // 4 items: 1 weak, 2 reused, 1 old
    const items = [
      makeItem("1", "weak"), // weak
      makeItem("2", "SamePass!42xZqW"), // reused
      makeItem("3", "SamePass!42xZqW"), // reused
      makeItem("4", "xK9#mP2$vL7@nQ5", { updatedAt: daysAgo(200) }), // old
    ];
    const result = await analyzeVault(items);

    // weakPenalty = (1/4) * 30 = 7.5
    // reusedPenalty = (2/4) * 30 = 15
    // oldPenalty = (1/4) * 15 = 3.75
    // score = round(100 - 7.5 - 15 - 3.75) = round(73.75) = 74
    expect(result.score).toBe(74);
  });

  it("includes breached penalty in score", async () => {
    const items = [
      makeItem("1", "xK9#mP2$vL7@nQ5"),
      makeItem("2", "yL8$nQ3#wM6@pR4"),
    ];
    const result = await analyzeVault(items, { breachedCount: 1 });

    // breachedPenalty = (1/2) * 25 = 12.5
    // score = round(100 - 12.5) = 88
    expect(result.score).toBe(88);
  });

  it("clamps score to 0 minimum", async () => {
    // All items weak + reused + old + breached
    const items = [
      makeItem("1", "weak", { updatedAt: daysAgo(200) }),
      makeItem("2", "weak", { updatedAt: daysAgo(200) }),
    ];
    const result = await analyzeVault(items, { breachedCount: 2 });

    // weakPenalty = (2/2)*30 = 30
    // reusedPenalty = (2/2)*30 = 30
    // oldPenalty = (2/2)*15 = 15
    // breachedPenalty = (2/2)*25 = 25
    // score = max(0, round(100-30-30-15-25)) = max(0, 0) = 0
    expect(result.score).toBe(0);
  });

  it("caps breachedCount to total items", async () => {
    const items = [makeItem("1", "xK9#mP2$vL7@nQ5")];
    const result = await analyzeVault(items, { breachedCount: 999 });

    // breachedPenalty = min(999,1)/1 * 25 = 25
    // score = round(100 - 25) = 75
    expect(result.score).toBe(75);
  });

  it("handles items with empty password field", async () => {
    const item: DecryptedVaultItem = {
      id: "1",
      itemType: "login",
      isFavorite: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      decrypted: { title: "No Password", password: "" },
    };
    const result = await analyzeVault([item]);
    expect(result.total).toBe(0);
    expect(result.score).toBe(100);
  });
});

// ── Score Breakdown ──────────────────────────────────────────────────

describe("analyzeVault score breakdown", () => {
  it("exposes a category for every risk type", async () => {
    const items = [
      makeItem("1", "weak"),
      makeItem("2", "SamePass!42xZqW"),
      makeItem("3", "SamePass!42xZqW"),
      makeItem("4", "xK9#mP2$vL7@nQ5", { updatedAt: daysAgo(200) }),
    ];
    const result = await analyzeVault(items, { breachedCount: 1 });

    const ids = result.breakdown.categories.map((c) => c.category).sort();
    expect(ids).toEqual([
      "breached",
      "missing2fa",
      "old",
      "reused",
      "weak",
    ]);
  });

  it("orders categories by penalty descending", async () => {
    const items = [
      makeItem("1", "weak"),
      makeItem("2", "weak2"),
      makeItem("3", "SamePass!42xZqW"),
      makeItem("4", "SamePass!42xZqW"),
    ];
    const result = await analyzeVault(items, { breachedCount: 1 });
    const penalties = result.breakdown.categories.map((c) => c.penalty);
    const sorted = [...penalties].sort((a, b) => b - a);
    expect(penalties).toEqual(sorted);
  });

  it("totalPenalty matches 100 - score", async () => {
    const items = [
      makeItem("1", "weak"),
      makeItem("2", "xK9#mP2$vL7@nQ5"),
    ];
    const result = await analyzeVault(items);
    // Allow ±1 for rounding between sum of 0.1-rounded penalties
    // and the integer score.
    expect(Math.abs(100 - result.score - result.breakdown.totalPenalty))
      .toBeLessThanOrEqual(1);
  });

  it("is deterministic across runs", async () => {
    const items = [
      makeItem("1", "weak"),
      makeItem("2", "SamePass!42xZqW"),
      makeItem("3", "SamePass!42xZqW"),
      makeItem("4", "xK9#mP2$vL7@nQ5", { updatedAt: daysAgo(120) }),
    ];
    const a = await analyzeVault(items, { breachedCount: 1 });
    const b = await analyzeVault(items, { breachedCount: 1 });
    expect(a.score).toBe(b.score);
    expect(a.breakdown.totalPenalty).toBe(b.breakdown.totalPenalty);
    expect(a.breakdown.categories.map((c) => c.penalty)).toEqual(
      b.breakdown.categories.map((c) => c.penalty),
    );
  });

  it("missing-2FA category is zero when detection disabled", async () => {
    const items = [makeItem("1", "xK9#mP2$vL7@nQ5")];
    const result = await analyzeVault(items);
    const m2fa = result.breakdown.categories.find(
      (c) => c.category === "missing2fa",
    );
    expect(m2fa?.penalty).toBe(0);
    expect(result.missing2fa).toEqual([]);
  });

  it("detects login items missing TOTP when opted-in", async () => {
    const withTotp: DecryptedVaultItem = {
      id: "with-totp",
      itemType: "login",
      isFavorite: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      decrypted: {
        title: "GitHub",
        password: "xK9#mP2$vL7@nQ5",
        totpSecret: "JBSWY3DPEHPK3PXP",
      },
    };
    const noTotp = makeItem("no-totp", "yL8$nQ3#wM6@pR4");
    const result = await analyzeVault([withTotp, noTotp], {
      detectMissing2fa: true,
    });
    expect(result.missing2fa).toHaveLength(1);
    expect(result.missing2fa[0].id).toBe("no-totp");
    const m2fa = result.breakdown.categories.find(
      (c) => c.category === "missing2fa",
    );
    expect(m2fa?.penalty).toBeGreaterThan(0);
  });

  it("category severities follow the documented mapping", async () => {
    const items = [
      makeItem("1", "weak"),
      makeItem("2", "SamePass!42xZqW"),
      makeItem("3", "SamePass!42xZqW"),
      makeItem("4", "xK9#mP2$vL7@nQ5", { updatedAt: daysAgo(200) }),
    ];
    const result = await analyzeVault(items, {
      breachedCount: 1,
      detectMissing2fa: true,
    });
    const severityByCategory = Object.fromEntries(
      result.breakdown.categories.map((c) => [c.category, c.severity]),
    );
    expect(severityByCategory.breached).toBe("critical");
    expect(severityByCategory.weak).toBe("warning");
    expect(severityByCategory.reused).toBe("warning");
    expect(severityByCategory.old).toBe("info");
    expect(severityByCategory.missing2fa).toBe("info");
  });
});
