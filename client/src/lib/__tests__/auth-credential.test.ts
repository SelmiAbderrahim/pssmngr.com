// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { describe, expect, it } from "vitest";
import { deriveAuthenticationSecret } from "../auth-credential";

describe("deriveAuthenticationSecret", () => {
  it("derives a stable, URL-safe 256-bit credential", async () => {
    const key = new Uint8Array(32).fill(7);

    const first = await deriveAuthenticationSecret(key);
    const second = await deriveAuthenticationSecret(key);

    expect(first).toBe(second);
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("does not expose the vault key bytes", async () => {
    const key = new Uint8Array(32).fill(65);
    const credential = await deriveAuthenticationSecret(key);

    expect(credential).not.toContain("AAAA");
    expect(credential).not.toBe(btoa("A".repeat(32)).replace(/=+$/g, ""));
  });

  it("rejects keys with the wrong length", async () => {
    await expect(
      deriveAuthenticationSecret(new Uint8Array(31)),
    ).rejects.toThrow("exactly 32 bytes");
  });
});
