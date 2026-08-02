// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Cryptographically Secure Random Password Generator
 *
 * Uses Web Crypto API (crypto.getRandomValues) exclusively.
 * Math.random is NEVER used — all randomness is CSPRNG.
 */

import { secureRandomIndex } from "./crypto-random";

// ── Character Sets ──────────────────────────────────────────────────

const UPPERCASE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LOWERCASE = "abcdefghijklmnopqrstuvwxyz";
const DIGITS = "0123456789";
const SYMBOLS = "!@#$%^&*()-_=+[]{}|;:',.<>?/";
const AMBIGUOUS = "0O1lI";

// ── Types ───────────────────────────────────────────────────────────

export interface GeneratorConfig {
  length: number; // 8–128
  uppercase: boolean;
  lowercase: boolean;
  digits: boolean;
  symbols: boolean;
  excludeChars?: string;
  excludeAmbiguous?: boolean;
}

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Build the effective character pool from config.
 * Throws if the resulting pool is empty.
 */
export function buildCharset(config: GeneratorConfig): string {
  let pool = "";
  if (config.uppercase) pool += UPPERCASE;
  if (config.lowercase) pool += LOWERCASE;
  if (config.digits) pool += DIGITS;
  if (config.symbols) pool += SYMBOLS;

  if (config.excludeAmbiguous) {
    pool = pool
      .split("")
      .filter((c) => !AMBIGUOUS.includes(c))
      .join("");
  }

  if (config.excludeChars) {
    const excluded = new Set(config.excludeChars);
    pool = pool
      .split("")
      .filter((c) => !excluded.has(c))
      .join("");
  }

  if (pool.length === 0) {
    throw new Error(
      "Character pool is empty — enable at least one character set.",
    );
  }

  return pool;
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Generate a cryptographically secure random password.
 *
 * @throws If length is outside 8–128 or the character pool is empty.
 */
export function generatePassword(config: GeneratorConfig): string {
  if (config.length < 8 || config.length > 128) {
    throw new Error("Password length must be between 8 and 128.");
  }

  const pool = buildCharset(config);
  const chars: string[] = [];

  for (let i = 0; i < config.length; i++) {
    chars.push(pool[secureRandomIndex(pool.length)] ?? "");
  }

  return chars.join("");
}

/**
 * Calculate the entropy (in bits) for a given config.
 *
 * entropy = length × log2(charsetSize)
 */
export function calculateEntropy(config: GeneratorConfig): number {
  const pool = buildCharset(config);
  if (pool.length <= 1) return 0;
  return config.length * Math.log2(pool.length);
}
