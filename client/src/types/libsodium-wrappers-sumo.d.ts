// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
declare module "libsodium-wrappers-sumo" {
  export const ready: Promise<void>;

  // Key exchange
  export function crypto_box_keypair(): {
    publicKey: Uint8Array;
    privateKey: Uint8Array;
    keyType: string;
  };

  // Random
  export function randombytes_buf(length: number): Uint8Array;

  // XChaCha20-Poly1305 IETF AEAD
  export const crypto_aead_xchacha20poly1305_ietf_NPUBBYTES: number;
  export const crypto_aead_xchacha20poly1305_ietf_ABYTES: number;
  export const crypto_aead_xchacha20poly1305_ietf_KEYBYTES: number;

  export function crypto_aead_xchacha20poly1305_ietf_keygen(): Uint8Array;

  export function crypto_aead_xchacha20poly1305_ietf_encrypt(
    message: Uint8Array,
    additionalData: Uint8Array | null,
    secretNonce: Uint8Array | null,
    publicNonce: Uint8Array,
    key: Uint8Array,
  ): Uint8Array;

  export function crypto_aead_xchacha20poly1305_ietf_decrypt(
    secretNonce: Uint8Array | null,
    ciphertext: Uint8Array,
    additionalData: Uint8Array | null,
    publicNonce: Uint8Array,
    key: Uint8Array,
  ): Uint8Array;

  // CJS default export — the actual object where functions are populated after ready resolves
  const _default: typeof import("libsodium-wrappers-sumo");
  export default _default;
}
