// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * HIBP Pwned Passwords Client (k-Anonymity)
 *
 * Uses the Have I Been Pwned range API so that no plaintext password
 * or full hash ever leaves the device. Only the first 5 hex characters
 * of the SHA-1 hash are sent to the API; the client matches the
 * remaining suffix locally.
 *
 * Privacy model:
 *  1. SHA-1 the password locally
 *  2. Send only prefix (5 chars) → api.pwnedpasswords.com/range/{prefix}
 *  3. API returns all matching suffixes + counts
 *  4. Client checks suffix locally — server never learns the full hash
 */

// ── Types ──────────────────────────────────────────────────────────

export interface BreachResult {
  breached: boolean;
  count: number;
}

export interface BatchBreachResult {
  /** Map of password → breach result */
  results: Map<string, BreachResult>;
  /** Number of passwords found in breaches */
  breachedCount: number;
}

// ── SHA-1 via Web Crypto ───────────────────────────────────────────

/** Hash a string with SHA-1 and return uppercase hex. */
export async function sha1Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-1", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

// ── Prefix Cache ───────────────────────────────────────────────────

/**
 * In-memory cache keyed by 5-char hash prefix.
 * Stores the parsed suffix→count map so repeated checks for passwords
 * sharing a prefix don't hit the network again.
 */
const prefixCache = new Map<string, Map<string, number>>();

/** Clear the prefix cache (exposed for testing). */
export function clearCache(): void {
  prefixCache.clear();
}

/** Get current cache size (exposed for testing). */
export function getCacheSize(): number {
  return prefixCache.size;
}

// ── Rate Limiter ───────────────────────────────────────────────────

const MIN_REQUEST_INTERVAL_MS = 100;
let lastRequestTime = 0;

/** Wait until at least MIN_REQUEST_INTERVAL_MS has elapsed since last request. */
async function waitForRateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_REQUEST_INTERVAL_MS) {
    await new Promise((resolve) =>
      setTimeout(resolve, MIN_REQUEST_INTERVAL_MS - elapsed),
    );
  }
  lastRequestTime = Date.now();
}

/** Reset rate limiter state (exposed for testing). */
export function resetRateLimiter(): void {
  lastRequestTime = 0;
}

// ── Response Parser ────────────────────────────────────────────────

/**
 * Parse HIBP range response into a suffix→count map.
 *
 * Response format (one per line):
 *   SUFFIX:COUNT\r\n
 *
 * Example:
 *   0018A45C4D1DEF81644B54AB7F969B88D65:1
 *   00D4F6E8FA6EECAD2A3AA415EEC418D38EC:2
 */
function parseRangeResponse(text: string): Map<string, number> {
  const map = new Map<string, number>();
  const lines = text.trim().split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) continue;

    const suffix = trimmed.substring(0, colonIdx).toUpperCase();
    const count = parseInt(trimmed.substring(colonIdx + 1), 10);
    if (suffix && !isNaN(count)) {
      map.set(suffix, count);
    }
  }

  return map;
}

// ── Fetch Prefix ───────────────────────────────────────────────────

/**
 * Fetch suffix data for a 5-char hash prefix from HIBP.
 * Returns cached data if available.
 */
async function fetchPrefix(prefix: string): Promise<Map<string, number>> {
  const cached = prefixCache.get(prefix);
  if (cached) return cached;

  await waitForRateLimit();

  const response = await fetch(
    `https://api.pwnedpasswords.com/range/${prefix}`,
    {
      headers: {
        "Add-Padding": "true", // Request padded responses for extra privacy
      },
    },
  );

  if (!response.ok) {
    throw new Error(
      `HIBP API error: ${response.status} ${response.statusText}`,
    );
  }

  const text = await response.text();
  const suffixes = parseRangeResponse(text);
  prefixCache.set(prefix, suffixes);
  return suffixes;
}

// ── Public API ─────────────────────────────────────────────────────

/**
 * Check if a single password has appeared in known data breaches.
 *
 * Uses k-anonymity: only the first 5 chars of the SHA-1 hash are sent
 * to the HIBP API. The full hash never leaves the device.
 *
 * **Requires user consent** — callers must gate this behind an explicit
 * opt-in UI before invoking.
 */
export async function checkPasswordBreached(
  password: string,
): Promise<BreachResult> {
  if (!password) return { breached: false, count: 0 };

  const hash = await sha1Hex(password);
  const prefix = hash.substring(0, 5);
  const suffix = hash.substring(5);

  const suffixes = await fetchPrefix(prefix);
  const count = suffixes.get(suffix);

  return count !== undefined
    ? { breached: true, count }
    : { breached: false, count: 0 };
}

/**
 * Check multiple passwords against HIBP in batch.
 *
 * Groups passwords by SHA-1 prefix to minimize network requests,
 * respects rate limiting between requests, and caches results.
 *
 * **Requires user consent** — callers must gate this behind an explicit
 * opt-in UI before invoking.
 */
export async function checkPasswordsBatch(
  passwords: string[],
): Promise<BatchBreachResult> {
  const results = new Map<string, BreachResult>();
  let breachedCount = 0;

  // Deduplicate and compute hashes
  const uniquePasswords = [...new Set(passwords.filter(Boolean))];
  const hashEntries: Array<{ password: string; hash: string }> = [];

  for (const password of uniquePasswords) {
    const hash = await sha1Hex(password);
    hashEntries.push({ password, hash });
  }

  // Group by prefix to minimize requests
  const byPrefix = new Map<string, Array<{ password: string; suffix: string }>>();

  for (const { password, hash } of hashEntries) {
    const prefix = hash.substring(0, 5);
    const suffix = hash.substring(5);
    const group = byPrefix.get(prefix);
    if (group) {
      group.push({ password, suffix });
    } else {
      byPrefix.set(prefix, [{ password, suffix }]);
    }
  }

  // Fetch each prefix sequentially (rate-limited)
  for (const [prefix, entries] of byPrefix) {
    const suffixes = await fetchPrefix(prefix);

    for (const { password, suffix } of entries) {
      const count = suffixes.get(suffix);
      const result: BreachResult =
        count !== undefined
          ? { breached: true, count }
          : { breached: false, count: 0 };

      results.set(password, result);
      if (result.breached) breachedCount++;
    }
  }

  return { results, breachedCount };
}
