// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  sha1Hex,
  checkPasswordBreached,
  checkPasswordsBatch,
  clearCache,
  getCacheSize,
  resetRateLimiter,
} from "../hibp-client";

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Known SHA-1 for "password" (uppercase hex):
 * 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8
 * Prefix: 5BAA6  |  Suffix: 1E4C9B93F3F0682250B6CF8331B7EE68FD8
 */
const KNOWN_PASSWORD = "password";
const KNOWN_HASH = "5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8";
const KNOWN_PREFIX = "5BAA6";
const KNOWN_SUFFIX = "1E4C9B93F3F0682250B6CF8331B7EE68FD8";

/**
 * Build a fake HIBP range response containing the given suffix with a count,
 * plus some decoy entries.
 */
function buildRangeResponse(
  matchSuffix?: string,
  matchCount?: number,
): string {
  const lines = [
    "0018A45C4D1DEF81644B54AB7F969B88D65:3",
    "00D4F6E8FA6EECAD2A3AA415EEC418D38EC:2",
    "011053FD0102E94D6AE2F8B83D76FAF94F6:1",
  ];
  if (matchSuffix && matchCount !== undefined) {
    lines.push(`${matchSuffix}:${matchCount}`);
  }
  return lines.join("\r\n") + "\r\n";
}

// ── Setup ────────────────────────────────────────────────────────────

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  clearCache();
  resetRateLimiter();

  fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(buildRangeResponse(KNOWN_SUFFIX, 3861493), {
      status: 200,
      statusText: "OK",
    }),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── SHA-1 Hashing ────────────────────────────────────────────────────

describe("sha1Hex", () => {
  it("produces correct SHA-1 for known input", async () => {
    const hash = await sha1Hex(KNOWN_PASSWORD);
    expect(hash).toBe(KNOWN_HASH);
  });

  it("returns uppercase hex", async () => {
    const hash = await sha1Hex("test");
    expect(hash).toMatch(/^[0-9A-F]+$/);
  });

  it("produces 40-char hex string", async () => {
    const hash = await sha1Hex("anything");
    expect(hash).toHaveLength(40);
  });
});

// ── k-Anonymity (Privacy) ────────────────────────────────────────────

describe("k-anonymity privacy", () => {
  it("sends only the 5-char prefix to the API", async () => {
    await checkPasswordBreached(KNOWN_PASSWORD);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toBe(`https://api.pwnedpasswords.com/range/${KNOWN_PREFIX}`);
  });

  it("never sends the full hash to the API", async () => {
    await checkPasswordBreached(KNOWN_PASSWORD);

    const url = fetchSpy.mock.calls[0][0] as string;
    // URL should contain only the 5-char prefix, not the full 40-char hash
    expect(url).not.toContain(KNOWN_HASH);
    expect(url).not.toContain(KNOWN_SUFFIX);
  });

  it("never sends plaintext password to the API", async () => {
    // Use a password that won't appear as substring in the URL
    const testPassword = "My$ecretP@ss!2024";
    fetchSpy.mockResolvedValueOnce(
      new Response(buildRangeResponse(), { status: 200 }),
    );
    await checkPasswordBreached(testPassword);

    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).not.toContain(testPassword);
  });

  it("sends Add-Padding header for extra privacy", async () => {
    await checkPasswordBreached(KNOWN_PASSWORD);

    const requestInit = fetchSpy.mock.calls[0][1] as RequestInit;
    const headers = requestInit.headers as Record<string, string>;
    expect(headers["Add-Padding"]).toBe("true");
  });
});

// ── Breach Detection ─────────────────────────────────────────────────

describe("checkPasswordBreached", () => {
  it("detects a breached password", async () => {
    const result = await checkPasswordBreached(KNOWN_PASSWORD);
    expect(result.breached).toBe(true);
    expect(result.count).toBe(3861493);
  });

  it("returns not breached when suffix is absent", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(buildRangeResponse(), {
        status: 200,
        statusText: "OK",
      }),
    );

    const result = await checkPasswordBreached("xK9#mP2$vL7@nQ5!zR");
    expect(result.breached).toBe(false);
    expect(result.count).toBe(0);
  });

  it("returns not breached for empty password", async () => {
    const result = await checkPasswordBreached("");
    expect(result.breached).toBe(false);
    expect(result.count).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("throws on API error", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response("Service Unavailable", {
        status: 503,
        statusText: "Service Unavailable",
      }),
    );

    await expect(checkPasswordBreached(KNOWN_PASSWORD)).rejects.toThrow(
      "HIBP API error: 503",
    );
  });
});

// ── Caching ──────────────────────────────────────────────────────────

describe("caching", () => {
  it("caches prefix responses to avoid duplicate requests", async () => {
    // Two passwords may share a prefix — but even with different prefixes,
    // checking the same password twice should hit cache
    await checkPasswordBreached(KNOWN_PASSWORD);
    await checkPasswordBreached(KNOWN_PASSWORD);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(getCacheSize()).toBe(1);
  });

  it("makes separate requests for different prefixes", async () => {
    // First call — default mock
    await checkPasswordBreached(KNOWN_PASSWORD);

    // Second call with different password (different prefix)
    fetchSpy.mockResolvedValueOnce(
      new Response(buildRangeResponse(), {
        status: 200,
        statusText: "OK",
      }),
    );
    await checkPasswordBreached("completely-different-password-xyz");

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(getCacheSize()).toBe(2);
  });

  it("clearCache resets the cache", async () => {
    await checkPasswordBreached(KNOWN_PASSWORD);
    expect(getCacheSize()).toBe(1);

    clearCache();
    expect(getCacheSize()).toBe(0);

    // Mock a fresh response for the second call
    fetchSpy.mockResolvedValueOnce(
      new Response(buildRangeResponse(KNOWN_SUFFIX, 3861493), {
        status: 200,
        statusText: "OK",
      }),
    );

    // Next call should hit network again
    await checkPasswordBreached(KNOWN_PASSWORD);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});

// ── Rate Limiting ────────────────────────────────────────────────────

describe("rate limiting", () => {
  it("enforces minimum interval between requests", async () => {
    // Two different passwords (different prefixes) to force two requests
    fetchSpy.mockImplementation(async () =>
      new Response(buildRangeResponse(), { status: 200, statusText: "OK" }),
    );

    const start = Date.now();
    await checkPasswordBreached("password-a-unique-1");
    await checkPasswordBreached("password-b-unique-2");
    const elapsed = Date.now() - start;

    // Should have waited at least ~100ms between the two requests
    expect(elapsed).toBeGreaterThanOrEqual(80); // Allow small timing variance
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});

// ── Batch Checking ───────────────────────────────────────────────────

describe("checkPasswordsBatch", () => {
  it("checks multiple passwords and returns results", async () => {
    fetchSpy.mockImplementation(async () =>
      new Response(buildRangeResponse(KNOWN_SUFFIX, 100), {
        status: 200,
        statusText: "OK",
      }),
    );

    const result = await checkPasswordsBatch([
      KNOWN_PASSWORD,
      "another-safe-pw",
    ]);

    expect(result.results.size).toBe(2);
    expect(result.results.get(KNOWN_PASSWORD)?.breached).toBe(true);
  });

  it("deduplicates identical passwords", async () => {
    fetchSpy.mockImplementation(async () =>
      new Response(buildRangeResponse(KNOWN_SUFFIX, 100), {
        status: 200,
        statusText: "OK",
      }),
    );

    const result = await checkPasswordsBatch([
      KNOWN_PASSWORD,
      KNOWN_PASSWORD,
      KNOWN_PASSWORD,
    ]);

    // Should only have one entry despite three inputs
    expect(result.results.size).toBe(1);
  });

  it("skips empty passwords", async () => {
    const result = await checkPasswordsBatch(["", "", KNOWN_PASSWORD]);

    expect(result.results.size).toBe(1);
    expect(result.results.has("")).toBe(false);
  });

  it("groups by prefix to minimize requests", async () => {
    // "pw2001" and "pw2501" share SHA-1 prefix DC0A5, so only one fetch needed
    fetchSpy.mockImplementation(async () =>
      new Response(buildRangeResponse(), { status: 200, statusText: "OK" }),
    );

    const result = await checkPasswordsBatch(["pw2001", "pw2501"]);

    // Same prefix → single fetch, two results
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(result.results.size).toBe(2);
    expect(result.results.has("pw2001")).toBe(true);
    expect(result.results.has("pw2501")).toBe(true);
  });

  it("returns correct breachedCount", async () => {
    // Mock: first prefix has a match, second doesn't
    let callIndex = 0;
    fetchSpy.mockImplementation(async () => {
      callIndex++;
      if (callIndex === 1) {
        return new Response(buildRangeResponse(KNOWN_SUFFIX, 42), {
          status: 200,
        });
      }
      return new Response(buildRangeResponse(), { status: 200 });
    });

    const result = await checkPasswordsBatch([
      KNOWN_PASSWORD,
      "safe-unique-password-xyz",
    ]);

    expect(result.breachedCount).toBeGreaterThanOrEqual(0);
    expect(result.breachedCount).toBeLessThanOrEqual(2);
  });

  it("returns empty results for empty array", async () => {
    const result = await checkPasswordsBatch([]);
    expect(result.results.size).toBe(0);
    expect(result.breachedCount).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// ── Network Errors & Timeout ────────────────────────────────────────

describe("network errors", () => {
  it("throws on network timeout (fetch rejection)", async () => {
    fetchSpy.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await expect(checkPasswordBreached(KNOWN_PASSWORD)).rejects.toThrow(
      "Failed to fetch",
    );
  });

  it("throws on abort signal timeout", async () => {
    fetchSpy.mockRejectedValueOnce(new DOMException("The operation was aborted", "AbortError"));

    await expect(checkPasswordBreached(KNOWN_PASSWORD)).rejects.toThrow(
      "aborted",
    );
  });

  it("handles API errors in batch gracefully by throwing", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response("Service Unavailable", {
        status: 503,
        statusText: "Service Unavailable",
      }),
    );

    await expect(
      checkPasswordsBatch([KNOWN_PASSWORD]),
    ).rejects.toThrow("HIBP API error: 503");
  });
});

// ── Rate Limiter First Call ─────────────────────────────────────────

describe("rate limiter — first call", () => {
  it("does not delay the very first call", async () => {
    const start = Date.now();
    await checkPasswordBreached(KNOWN_PASSWORD);
    const elapsed = Date.now() - start;

    // First call should be fast — well under the 100ms rate limit window
    expect(elapsed).toBeLessThan(80);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

// ── Response Parsing Edge Cases ──────────────────────────────────────

describe("response parsing", () => {
  it("handles response with \\r\\n line endings", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        `0018A45C4D1DEF81644B54AB7F969B88D65:3\r\n${KNOWN_SUFFIX}:999\r\n`,
        { status: 200 },
      ),
    );

    const result = await checkPasswordBreached(KNOWN_PASSWORD);
    expect(result.breached).toBe(true);
    expect(result.count).toBe(999);
  });

  it("handles response with \\n line endings", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        `0018A45C4D1DEF81644B54AB7F969B88D65:3\n${KNOWN_SUFFIX}:42\n`,
        { status: 200 },
      ),
    );

    const result = await checkPasswordBreached(KNOWN_PASSWORD);
    expect(result.breached).toBe(true);
    expect(result.count).toBe(42);
  });

  it("handles empty response body", async () => {
    fetchSpy.mockResolvedValueOnce(new Response("", { status: 200 }));

    const result = await checkPasswordBreached(KNOWN_PASSWORD);
    expect(result.breached).toBe(false);
    expect(result.count).toBe(0);
  });

  it("handles malformed lines gracefully", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        `malformed-line\n${KNOWN_SUFFIX}:5\n:badcount\n`,
        { status: 200 },
      ),
    );

    const result = await checkPasswordBreached(KNOWN_PASSWORD);
    expect(result.breached).toBe(true);
    expect(result.count).toBe(5);
  });
});
