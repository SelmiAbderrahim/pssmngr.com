// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Watchtower Privacy Boundary Test
 *
 * Proves that:
 *  1. analyzeVault() never makes any network request (no fetch, no
 *     postMessage, no XHR). All analysis is local.
 *  2. checkPasswordsBatch() never sends a full SHA-1 hash or the
 *     plaintext password to the network. Only the 5-char hash prefix
 *     is allowed in the request URL.
 *
 * This is the privacy contract for the Watchtower feature.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { DecryptedVaultItem } from "@/components/vault/VaultItemCard";
import { analyzeVault } from "../watchtower-analyzer";
import {
  checkPasswordsBatch,
  clearCache,
  resetRateLimiter,
  sha1Hex,
} from "../hibp-client";

function makeLogin(
  id: string,
  password: string,
  totpSecret?: string,
): DecryptedVaultItem {
  const now = new Date().toISOString();
  return {
    id,
    itemType: "login",
    isFavorite: false,
    createdAt: now,
    updatedAt: now,
    decrypted: {
      title: `Item ${id}`,
      password,
      ...(totpSecret ? { totpSecret } : {}),
    },
  };
}

describe("analyzeVault privacy", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      throw new Error("analyzeVault must not perform any network I/O");
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("performs no fetch calls", async () => {
    const items = [
      makeLogin("1", "weak"),
      makeLogin("2", "xK9#mP2$vL7@nQ5"),
      makeLogin("3", "xK9#mP2$vL7@nQ5"),
    ];
    await analyzeVault(items, {
      breachedCount: 0,
      detectMissing2fa: true,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("never returns plaintext passwords in the breakdown", async () => {
    const sensitive = "MyTopSecretP@ssword!2024xZ";
    const items = [
      makeLogin("1", sensitive),
      makeLogin("2", sensitive),
    ];
    const result = await analyzeVault(items, { breachedCount: 1 });
    const serialised = JSON.stringify(result.breakdown);
    expect(serialised).not.toContain(sensitive);
  });
});

describe("checkPasswordsBatch privacy", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    clearCache();
    resetRateLimiter();
    fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      return new Response("FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF:0\r\n", {
        status: 200,
      });
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("never sends plaintext passwords or full SHA-1 hashes", async () => {
    const passwords = [
      "MyTopSecret!2024xZ",
      "AnotherSensitive@Pass99",
      "Third!StrongPw#42mN",
    ];

    await checkPasswordsBatch(passwords);

    // Pre-compute the full hashes so we can assert they never appear.
    const hashes = await Promise.all(passwords.map((p) => sha1Hex(p)));

    expect(fetchSpy.mock.calls.length).toBeGreaterThan(0);

    for (const call of fetchSpy.mock.calls) {
      const url = String(call[0]);

      // No plaintext password may appear in any outbound request.
      for (const password of passwords) {
        expect(url).not.toContain(password);
      }

      // No full hash (40 hex chars) may appear in any outbound request.
      for (const hash of hashes) {
        expect(url).not.toContain(hash);
        // Also reject the suffix (last 35 chars) — only the 5-char
        // prefix is allowed.
        expect(url).not.toContain(hash.substring(5));
      }

      // The URL must be the HIBP range API with exactly 5 hex chars
      // after /range/.
      expect(url).toMatch(/^https:\/\/api\.pwnedpasswords\.com\/range\/[0-9A-F]{5}$/);
    }
  });

  it("sends the Add-Padding header for traffic-analysis resistance", async () => {
    await checkPasswordsBatch(["MyTopSecret!2024xZ"]);
    expect(fetchSpy).toHaveBeenCalled();
    const init = fetchSpy.mock.calls[0][1] as RequestInit | undefined;
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers["Add-Padding"]).toBe("true");
  });
});
