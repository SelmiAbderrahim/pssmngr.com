// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
declare module 'argon2-browser' {
  interface Argon2HashResult {
    hash: Uint8Array;
    hashHex: string;
    encoded: string;
  }

  interface Argon2HashOptions {
    pass: string | Uint8Array;
    salt: Uint8Array;
    time?: number;
    mem?: number;
    hashLen?: number;
    parallelism?: number;
    type?: number;
  }

  export const ArgonType: {
    Argon2d: 0;
    Argon2i: 1;
    Argon2id: 2;
  };

  export function hash(options: Argon2HashOptions): Promise<Argon2HashResult>;
  export function verify(options: { pass: string | Uint8Array; encoded: string }): Promise<boolean>;
}
