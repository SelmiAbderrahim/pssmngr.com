// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Diceware Passphrase Generator
 *
 * Uses EFF large wordlist (7776 words) with CSPRNG word selection.
 * Math.random is NEVER used — all randomness is CSPRNG.
 */

import { EFF_WORDLIST } from "./eff-wordlist";
import { secureRandomIndex } from "./crypto-random";

// ── Types ───────────────────────────────────────────────────────────

export interface PassphraseConfig {
  wordCount: number; // 3–10
  separator: string; // '-', ' ', '.', '_'
  capitalize: boolean; // Capitalize first letter of each word
  includeNumber: boolean; // Append random digit to passphrase
}

// ── Constants ───────────────────────────────────────────────────────

const MIN_WORDS = 3;
const MAX_WORDS = 10;
const WORDLIST_SIZE = 7776; // 6^5

// ── Public API ──────────────────────────────────────────────────────

/**
 * Generate a cryptographically secure diceware passphrase.
 *
 * @throws If wordCount is outside 3–10.
 */
export function generatePassphrase(config: PassphraseConfig): string {
  if (config.wordCount < MIN_WORDS || config.wordCount > MAX_WORDS) {
    throw new Error(`Word count must be between ${MIN_WORDS} and ${MAX_WORDS}.`);
  }

  if (EFF_WORDLIST.length !== WORDLIST_SIZE) {
    throw new Error("EFF wordlist integrity error: expected 7776 words.");
  }

  const words: string[] = [];

  for (let i = 0; i < config.wordCount; i++) {
    const word = EFF_WORDLIST[secureRandomIndex(EFF_WORDLIST.length)];
    if (!word) continue;
    const formatted = config.capitalize
      ? word.charAt(0).toUpperCase() + word.slice(1)
      : word;
    words.push(formatted);
  }

  let passphrase = words.join(config.separator);

  if (config.includeNumber) {
    passphrase += secureRandomIndex(10).toString();
  }

  return passphrase;
}

/**
 * Calculate the entropy (in bits) for a passphrase configuration.
 *
 * Base entropy: wordCount * log2(7776)
 * If includeNumber: adds log2(10) ~ 3.32 bits
 */
export function calculatePassphraseEntropy(config: PassphraseConfig): number {
  let entropy = config.wordCount * Math.log2(WORDLIST_SIZE);
  if (config.includeNumber) {
    entropy += Math.log2(10);
  }
  return entropy;
}
