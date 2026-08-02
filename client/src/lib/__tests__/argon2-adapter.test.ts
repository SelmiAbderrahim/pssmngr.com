// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ArgonType, loadArgon2Hash as loadArgon2HashStatic } from "../argon2-adapter";

// In test environment, set window.argon2 from the mock
// (the real adapter loads via <script> tag, but jsdom doesn't execute scripts)
const mockArgon2 = {
  hash: async (params: {
    pass: Uint8Array;
    salt: Uint8Array;
    type: number;
    mem: number;
    time: number;
    parallelism: number;
    hashLen: number;
  }) => {
    // Deterministic fake hash: XOR pass bytes with salt bytes
    const result = new Uint8Array(params.hashLen);
    for (let i = 0; i < params.hashLen; i++) {
      result[i] =
        (params.pass[i % params.pass.length] ?? 0) ^
        (params.salt[i % params.salt.length] ?? 0) ^
        (i & 0xff);
    }
    return { hash: result };
  },
  ArgonType: { Argon2d: 0, Argon2i: 1, Argon2id: 2 },
};

describe("ArgonType", () => {
  it("has correct constant values per Argon2 spec (RFC 9106)", () => {
    expect(ArgonType.Argon2d).toBe(0);
    expect(ArgonType.Argon2i).toBe(1);
    expect(ArgonType.Argon2id).toBe(2);
  });

  it("has exactly three entries", () => {
    expect(Object.keys(ArgonType)).toEqual(["Argon2d", "Argon2i", "Argon2id"]);
  });
});

describe("loadArgon2Hash", () => {
  beforeEach(() => {
    // Simulate the UMD script having loaded by setting window.argon2
    (globalThis as Record<string, unknown>).argon2 = mockArgon2;
  });

  afterEach(() => {
    delete (globalThis as Record<string, unknown>).argon2;
  });

  it("returns a function from window.argon2 cache", async () => {
    const hash = await loadArgon2HashStatic();
    expect(typeof hash).toBe("function");
  });

  it("returned function produces a hash result", async () => {
    const hash = await loadArgon2HashStatic();
    const result = await hash({
      pass: new Uint8Array([1, 2, 3]),
      salt: new Uint8Array([4, 5, 6]),
      type: ArgonType.Argon2id,
      mem: 1024,
      time: 1,
      parallelism: 1,
      hashLen: 32,
    });
    expect(result.hash).toBeInstanceOf(Uint8Array);
    expect(result.hash.length).toBe(32);
  });

  it("produces deterministic output for same inputs", async () => {
    const hash = await loadArgon2HashStatic();
    const params = {
      pass: new Uint8Array([10, 20, 30]),
      salt: new Uint8Array([40, 50, 60]),
      type: ArgonType.Argon2id,
      mem: 1024,
      time: 1,
      parallelism: 1,
      hashLen: 16,
    };
    const result1 = await hash(params);
    const result2 = await hash(params);
    expect(result1.hash).toEqual(result2.hash);
  });

  it("uses cached window.argon2 on subsequent calls", async () => {
    const hash1 = await loadArgon2HashStatic();
    const hash2 = await loadArgon2HashStatic();
    // Both should return the exact same function reference (cached)
    expect(hash1).toBe(hash2);
  });
});

describe("loadArgon2Hash — script injection paths", () => {
  let originalCreateElement: typeof document.createElement;
  let originalAppendChild: typeof document.head.appendChild;
  // Re-imported fresh per test so the module-level _loadPromise cache is reset
  // between tests; otherwise a successful injection caches the resolved promise
  // and later error-path tests never re-run the script-injection branch.
  let loadArgon2Hash: typeof loadArgon2HashStatic;

  beforeEach(async () => {
    // Ensure argon2 is NOT pre-loaded so the script-injection branch runs
    delete (globalThis as Record<string, unknown>).argon2;

    vi.resetModules();
    ({ loadArgon2Hash } = await import("../argon2-adapter"));

    originalCreateElement = document.createElement.bind(document);
    originalAppendChild = document.head.appendChild.bind(document.head);
  });

  afterEach(() => {
    // Restore originals
    document.createElement = originalCreateElement;
    document.head.appendChild = originalAppendChild;
    delete (globalThis as Record<string, unknown>).argon2;
    vi.restoreAllMocks();
  });

  it("loads argon2 via script injection and returns hash function", async () => {
    // Intercept script creation: on appendChild, fire onload and set window.argon2
    vi.spyOn(document.head, "appendChild").mockImplementation((node) => {
      const script = node as HTMLScriptElement;
      // Simulate UMD bundle setting the global, then firing onload
      (globalThis as Record<string, unknown>).argon2 = mockArgon2;
      if (typeof script.onload === "function") {
        script.onload(new Event("load"));
      }
      return node;
    });

    const hash = await loadArgon2Hash();
    expect(typeof hash).toBe("function");
    expect(document.head.appendChild).toHaveBeenCalledOnce();
  });

  it("sets script src to the correct bundled path", async () => {
    let capturedSrc = "";

    vi.spyOn(document.head, "appendChild").mockImplementation((node) => {
      const script = node as HTMLScriptElement;
      capturedSrc = script.src;
      (globalThis as Record<string, unknown>).argon2 = mockArgon2;
      if (typeof script.onload === "function") {
        script.onload(new Event("load"));
      }
      return node;
    });

    await loadArgon2Hash();
    // jsdom resolves relative URLs against "about:blank", so check the suffix
    expect(capturedSrc).toContain("/wasm/argon2-bundled.min.js");
  });

  it("appends the script to document.head", async () => {
    const appendSpy = vi
      .spyOn(document.head, "appendChild")
      .mockImplementation((node) => {
        const script = node as HTMLScriptElement;
        (globalThis as Record<string, unknown>).argon2 = mockArgon2;
        if (typeof script.onload === "function") {
          script.onload(new Event("load"));
        }
        return node;
      });

    await loadArgon2Hash();
    expect(appendSpy).toHaveBeenCalledOnce();
    const appended = appendSpy.mock.calls[0][0] as HTMLScriptElement;
    expect(appended.tagName).toBe("SCRIPT");
  });

  it("rejects with an error when the script fails to load (onerror path)", async () => {
    vi.spyOn(document.head, "appendChild").mockImplementation((node) => {
      const script = node as HTMLScriptElement;
      // Simulate failed script load — onerror fires, argon2 is never set
      if (typeof script.onerror === "function") {
        script.onerror(new Event("error"));
      }
      return node;
    });

    await expect(loadArgon2Hash()).rejects.toThrow(
      "Failed to load argon2 WASM bundle",
    );
  });

  it("throws when script loads but argon2.hash is not a function", async () => {
    vi.spyOn(document.head, "appendChild").mockImplementation((node) => {
      const script = node as HTMLScriptElement;
      // Script loads but sets an incomplete/broken global (no hash function)
      (globalThis as Record<string, unknown>).argon2 = { ArgonType: {} };
      if (typeof script.onload === "function") {
        script.onload(new Event("load"));
      }
      return node;
    });

    await expect(loadArgon2Hash()).rejects.toThrow(
      "argon2-browser: hash function not found after script load",
    );
  });

  it("throws when script loads but window.argon2 is undefined", async () => {
    vi.spyOn(document.head, "appendChild").mockImplementation((node) => {
      const script = node as HTMLScriptElement;
      // Script loads but never sets window.argon2 at all
      if (typeof script.onload === "function") {
        script.onload(new Event("load"));
      }
      return node;
    });

    await expect(loadArgon2Hash()).rejects.toThrow(
      "argon2-browser: hash function not found after script load",
    );
  });

  it("returned hash function works correctly after script injection", async () => {
    vi.spyOn(document.head, "appendChild").mockImplementation((node) => {
      const script = node as HTMLScriptElement;
      (globalThis as Record<string, unknown>).argon2 = mockArgon2;
      if (typeof script.onload === "function") {
        script.onload(new Event("load"));
      }
      return node;
    });

    const hash = await loadArgon2Hash();
    const result = await hash({
      pass: new Uint8Array([1, 2, 3]),
      salt: new Uint8Array([4, 5, 6]),
      type: ArgonType.Argon2id,
      mem: 1024,
      time: 1,
      parallelism: 1,
      hashLen: 32,
    });

    expect(result.hash).toBeInstanceOf(Uint8Array);
    expect(result.hash.length).toBe(32);
  });
});
