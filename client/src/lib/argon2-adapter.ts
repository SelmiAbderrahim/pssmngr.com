// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Adapter for argon2-browser that bypasses Vite's broken CJS-to-ESM transpilation.
 *
 * argon2-browser is a CJS/UMD module whose factory gets lost during Vite's module
 * transform (import returns {}). This adapter loads the bundled version via a
 * dynamic <script> tag, which correctly sets window.argon2 via the UMD global path.
 * The bundled version has WASM base64-encoded inline — no external .wasm fetch needed.
 */

/** Argon2 algorithm type constants (from the Argon2 specification, RFC 9106) */
export const ArgonType = {
  Argon2d: 0,
  Argon2i: 1,
  Argon2id: 2,
} as const;

export interface Argon2HashParams {
  pass: Uint8Array;
  salt: Uint8Array;
  type: number;
  mem: number;
  time: number;
  parallelism: number;
  hashLen: number;
}

export interface Argon2HashResult {
  hash: Uint8Array;
  hashHex?: string;
  encoded?: string;
}

export type Argon2HashFn = (params: Argon2HashParams) => Promise<Argon2HashResult>;

 
type WindowWithArgon2 = typeof globalThis & { argon2?: { hash: Argon2HashFn } };

/** Cached loading promise — ensures only one script tag is created. */
let _loadPromise: Promise<Argon2HashFn> | null = null;

/** Load the argon2 hash function via dynamic script injection */
export function loadArgon2Hash(): Promise<Argon2HashFn> {
  const win = globalThis as WindowWithArgon2;

  // Already loaded (cached on window from previous call)
  if (typeof win.argon2?.hash === "function") {
    return Promise.resolve(win.argon2.hash);
  }

  // Deduplicate concurrent calls — share a single loading promise
  if (!_loadPromise) {
    _loadPromise = (async () => {
      try {
        // Load via <script> tag — UMD sets window.argon2 = { hash, ArgonType, verify }
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement("script");
          script.src = "/wasm/argon2-bundled.min.js";
          script.onload = () => resolve();
          script.onerror = () =>
            reject(new Error("Failed to load argon2 WASM bundle"));
          document.head.appendChild(script);
        });

        const hash = (globalThis as WindowWithArgon2).argon2?.hash;
        if (typeof hash !== "function") {
          throw new Error(
            "argon2-browser: hash function not found after script load",
          );
        }

        return hash;
      } catch (err) {
        _loadPromise = null; // Allow retry on failure
        throw err;
      }
    })();
  }

  return _loadPromise;
}
