// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Cryptographically Secure Random Utilities
 *
 * Uses Web Crypto API (crypto.getRandomValues) exclusively.
 * Math.random is NEVER used — all randomness is CSPRNG.
 */

/**
 * Return a uniform random index in [0, max) using rejection sampling
 * to eliminate modulo bias. Uses CSPRNG exclusively.
 */
export function secureRandomIndex(max: number): number {
  if (max <= 0) throw new Error("max must be positive");

  // Smallest power-of-2 that is >= max
  const bitsNeeded = Math.ceil(Math.log2(max)) || 1;
  const bytesNeeded = Math.ceil(bitsNeeded / 8);
  const mask = (1 << bitsNeeded) - 1;

  const buf = new Uint8Array(bytesNeeded);

  // Rejection sampling: discard values >= max to avoid modulo bias
  // eslint-disable-next-line no-constant-condition
  while (true) {
    crypto.getRandomValues(buf);
    let value = 0;
    for (let i = 0; i < bytesNeeded; i++) {
      value = (value << 8) | (buf[i] ?? 0);
    }
    value &= mask;
    if (value < max) return value;
  }
}
