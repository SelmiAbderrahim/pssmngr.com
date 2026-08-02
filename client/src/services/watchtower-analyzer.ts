// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Watchtower Password Analyzer
 *
 * Client-side analysis of decrypted vault items for weak, reused,
 * old, breached, and missing-2FA opportunities. All analysis happens
 * locally — no plaintext leaves the device.
 *
 * Detection criteria:
 *  - Weak: entropy < 40 bits OR common patterns (sequential, keyboard walk, repeated)
 *  - Reused: multiple items sharing the same password (SHA-256 grouped)
 *  - Old: password not changed in > 90 days (configurable)
 *  - Breached: caller-supplied count from HIBP k-anonymity client
 *  - Missing 2FA: login item without a TOTP secret on a service that
 *    likely supports it (caller-supplied hint set or default heuristic)
 *
 * Scoring model:
 *  Each category contributes a deterministic penalty proportional to
 *  the share of items affected. The breakdown is exposed so the UI can
 *  show a transparent "why this score" view.
 */

import type { DecryptedVaultItem } from "@/components/vault/VaultItemCard";

// ── Types ──────────────────────────────────────────────────────────

export type RiskCategory =
  | "weak"
  | "reused"
  | "old"
  | "breached"
  | "missing2fa";

export type RiskSeverity = "critical" | "warning" | "info";

export interface ScoreCategoryBreakdown {
  /** Stable category id. */
  category: RiskCategory;
  /** Items affected by this category. */
  count: number;
  /** Items considered for this category (denominator). */
  considered: number;
  /** Maximum possible penalty for this category. */
  weight: number;
  /** Actual penalty applied to the score (rounded to 0.1). */
  penalty: number;
  /** Severity for sorting / colouring. */
  severity: RiskSeverity;
}

export interface ScoreBreakdown {
  /** Final score 0-100. */
  score: number;
  /** Per-category contributions, ordered by penalty descending. */
  categories: ScoreCategoryBreakdown[];
  /** Total items with a password considered for scoring. */
  total: number;
  /** Sum of all category penalties (rounded). */
  totalPenalty: number;
}

export interface AnalysisResult {
  weak: DecryptedVaultItem[];
  reused: DecryptedVaultItem[][];
  old: DecryptedVaultItem[];
  /** Login items lacking a TOTP secret. Optional — empty by default. */
  missing2fa: DecryptedVaultItem[];
  total: number;
  score: number; // 0-100
  /** Transparent breakdown of how the score was computed. */
  breakdown: ScoreBreakdown;
}

export interface AnalyzerOptions {
  oldThresholdDays?: number; // default 90
  weakEntropyBits?: number; // default 40
  breachedCount?: number; // from HIBP client, default 0
  /**
   * Whether to surface missing-2FA findings. Off by default to
   * preserve backwards compatibility with the existing badge counts.
   */
  detectMissing2fa?: boolean;
}

// ── Constants ──────────────────────────────────────────────────────

const DEFAULT_WEAK_ENTROPY_BITS = 40;
const DEFAULT_OLD_THRESHOLD_DAYS = 90;
const MS_PER_DAY = 86_400_000;

const ALPHA_SEQUENCE = "abcdefghijklmnopqrstuvwxyz";
const DIGIT_SEQUENCE = "0123456789";
const KEYBOARD_ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];

// ── Charset & Entropy ──────────────────────────────────────────────

/** Detect the effective charset size from a password's actual characters. */
export function detectCharsetSize(password: string): number {
  let hasLower = false;
  let hasUpper = false;
  let hasDigit = false;
  let hasSymbol = false;
  let hasExtended = false;

  for (const char of password) {
    const code = char.charCodeAt(0);
    if (code >= 97 && code <= 122) hasLower = true;
    else if (code >= 65 && code <= 90) hasUpper = true;
    else if (code >= 48 && code <= 57) hasDigit = true;
    else if (code >= 33 && code <= 126) hasSymbol = true;
    else if (code > 127) hasExtended = true;
  }

  let size = 0;
  if (hasLower) size += 26;
  if (hasUpper) size += 26;
  if (hasDigit) size += 10;
  if (hasSymbol) size += 32;
  if (hasExtended) size += 128;
  return size;
}

/**
 * Calculate entropy in bits for an actual password.
 * entropy = length * log2(charsetSize)
 */
export function calculatePasswordEntropy(password: string): number {
  if (!password || password.length === 0) return 0;
  const size = detectCharsetSize(password);
  if (size <= 1) return 0;
  return password.length * Math.log2(size);
}

// ── Pattern Detection ──────────────────────────────────────────────

/** Check for a consecutive run (forward or backward) within a sequence. */
function hasConsecutiveRun(
  password: string,
  sequence: string,
  minRun: number,
): boolean {
  const lower = password.toLowerCase();
  let fwd = 1;
  let bwd = 1;

  for (let i = 1; i < lower.length; i++) {
    const prev = sequence.indexOf(lower[i - 1] ?? "");
    const curr = sequence.indexOf(lower[i] ?? "");

    if (prev >= 0 && curr >= 0) {
      fwd = curr === prev + 1 ? fwd + 1 : 1;
      bwd = curr === prev - 1 ? bwd + 1 : 1;
      if (fwd >= minRun || bwd >= minRun) return true;
    } else {
      fwd = 1;
      bwd = 1;
    }
  }
  return false;
}

/** Detect sequential runs like "abcd" or "4321". */
export function hasSequentialPattern(
  password: string,
  minRun = 4,
): boolean {
  return (
    hasConsecutiveRun(password, ALPHA_SEQUENCE, minRun) ||
    hasConsecutiveRun(password, DIGIT_SEQUENCE, minRun)
  );
}

/** Detect keyboard walk patterns like "qwerty" or "asdf". */
export function hasKeyboardWalkPattern(
  password: string,
  minRun = 4,
): boolean {
  return KEYBOARD_ROWS.some((row) =>
    hasConsecutiveRun(password, row, minRun),
  );
}

/** Detect repeated character runs like "aaa". */
export function hasRepeatedPattern(
  password: string,
  minRun = 3,
): boolean {
  let run = 1;
  for (let i = 1; i < password.length; i++) {
    if (password[i] === password[i - 1]) {
      run++;
      if (run >= minRun) return true;
    } else {
      run = 1;
    }
  }
  return false;
}

/**
 * Check if a password is weak.
 * Weak = low entropy OR has common patterns.
 */
export function isWeakPassword(
  password: string,
  entropyThreshold = DEFAULT_WEAK_ENTROPY_BITS,
): boolean {
  if (!password) return true;
  if (calculatePasswordEntropy(password) < entropyThreshold) return true;
  if (hasSequentialPattern(password)) return true;
  if (hasKeyboardWalkPattern(password)) return true;
  if (hasRepeatedPattern(password)) return true;
  return false;
}

// ── SHA-256 Hashing ────────────────────────────────────────────────

/** Hash a password with SHA-256 for reuse comparison. */
async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ── Helpers ────────────────────────────────────────────────────────

function getPassword(item: DecryptedVaultItem): string | null {
  const pw = item.decrypted.password;
  return typeof pw === "string" && pw.length > 0 ? pw : null;
}

function hasTotp(item: DecryptedVaultItem): boolean {
  const secret = item.decrypted.totpSecret ?? item.decrypted.totp;
  return typeof secret === "string" && secret.length > 0;
}

function isLogin(item: DecryptedVaultItem): boolean {
  // Default to "login" when itemType is missing (legacy items).
  return !item.itemType || item.itemType === "login";
}

// ── Score Weights ──────────────────────────────────────────────────
// Sum of base weights = 100. Breached and missing-2FA are tracked
// separately; breached + weak/reused/old already covers 100, so
// missing-2FA contributes a small additional weight that is allowed
// to push the displayed penalty over 100 (the final score still
// clamps at 0).
//
//   weak: 30, reused: 30, old: 15, breached: 25, missing2fa: 10

const WEIGHT_WEAK = 30;
const WEIGHT_REUSED = 30;
const WEIGHT_OLD = 15;
const WEIGHT_BREACHED = 25;
const WEIGHT_MISSING_2FA = 10;

const CATEGORY_SEVERITY: Record<RiskCategory, RiskSeverity> = {
  breached: "critical",
  weak: "warning",
  reused: "warning",
  missing2fa: "info",
  old: "info",
};

/** Round to 0.1 precision for stable display. */
function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

// ── Main Analyzer ──────────────────────────────────────────────────

/**
 * Analyze decrypted vault items for weak, reused, old, breached, and
 * (optionally) missing-2FA findings. All analysis happens client-side
 * — no plaintext leaves the device.
 *
 * The returned `breakdown` exposes the deterministic per-category
 * penalty math so the UI can render a transparent "why this score"
 * view.
 */
export async function analyzeVault(
  items: DecryptedVaultItem[],
  options?: AnalyzerOptions,
): Promise<AnalysisResult> {
  const weakBits = options?.weakEntropyBits ?? DEFAULT_WEAK_ENTROPY_BITS;
  const oldDays = options?.oldThresholdDays ?? DEFAULT_OLD_THRESHOLD_DAYS;
  const breachedCount = options?.breachedCount ?? 0;
  const detectMissing2fa = options?.detectMissing2fa ?? false;

  const withPw = items.filter((i) => getPassword(i) !== null);
  const total = withPw.length;

  if (total === 0) {
    const emptyBreakdown: ScoreBreakdown = {
      score: 100,
      categories: [],
      total: 0,
      totalPenalty: 0,
    };
    return {
      weak: [],
      reused: [],
      old: [],
      missing2fa: [],
      total: 0,
      score: 100,
      breakdown: emptyBreakdown,
    };
  }

  // 1. Weak password detection
  const weak = withPw.filter((i) => isWeakPassword(getPassword(i)!, weakBits));

  // 2. Reused password detection (SHA-256 grouped)
  const groups = new Map<string, DecryptedVaultItem[]>();
  await Promise.all(
    withPw.map(async (item) => {
      const hash = await sha256Hex(getPassword(item)!);
      const g = groups.get(hash);
      if (g) g.push(item);
      else groups.set(hash, [item]);
    }),
  );
  const reused = [...groups.values()].filter((g) => g.length > 1);

  // 3. Old password detection
  const now = Date.now();
  const thresholdMs = oldDays * MS_PER_DAY;
  const old = withPw.filter(
    (i) => now - new Date(i.updatedAt).getTime() > thresholdMs,
  );

  // 4. Missing 2FA detection (login items without a TOTP secret)
  const loginItems = withPw.filter(isLogin);
  const missing2fa = detectMissing2fa
    ? loginItems.filter((i) => !hasTotp(i))
    : [];

  // 5. Score breakdown — deterministic penalties.
  const reusedItemCount = reused.reduce((s, g) => s + g.length, 0);
  const safeBreached = Math.max(0, Math.min(breachedCount, total));
  const loginDenominator = Math.max(1, loginItems.length);

  const categories: ScoreCategoryBreakdown[] = [
    {
      category: "weak",
      count: weak.length,
      considered: total,
      weight: WEIGHT_WEAK,
      penalty: round1((weak.length / total) * WEIGHT_WEAK),
      severity: CATEGORY_SEVERITY.weak,
    },
    {
      category: "reused",
      count: reusedItemCount,
      considered: total,
      weight: WEIGHT_REUSED,
      penalty: round1((reusedItemCount / total) * WEIGHT_REUSED),
      severity: CATEGORY_SEVERITY.reused,
    },
    {
      category: "old",
      count: old.length,
      considered: total,
      weight: WEIGHT_OLD,
      penalty: round1((old.length / total) * WEIGHT_OLD),
      severity: CATEGORY_SEVERITY.old,
    },
    {
      category: "breached",
      count: safeBreached,
      considered: total,
      weight: WEIGHT_BREACHED,
      penalty: round1((safeBreached / total) * WEIGHT_BREACHED),
      severity: CATEGORY_SEVERITY.breached,
    },
    {
      category: "missing2fa",
      count: missing2fa.length,
      considered: loginItems.length,
      weight: WEIGHT_MISSING_2FA,
      penalty: detectMissing2fa
        ? round1((missing2fa.length / loginDenominator) * WEIGHT_MISSING_2FA)
        : 0,
      severity: CATEGORY_SEVERITY.missing2fa,
    },
  ];

  const rawPenalty = categories.reduce((s, c) => s + c.penalty, 0);
  const score = Math.max(0, Math.round(100 - rawPenalty));

  // Sort categories by penalty descending so the UI can show the
  // biggest contributors first.
  const sortedCategories = [...categories].sort(
    (a, b) => b.penalty - a.penalty,
  );

  const breakdown: ScoreBreakdown = {
    score,
    categories: sortedCategories,
    total,
    totalPenalty: round1(rawPenalty),
  };

  return { weak, reused, old, missing2fa, total, score, breakdown };
}
