// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Vault cryptographic operations for the frontend auth flow.
 *
 * Self-contained adapter that mirrors @pssmngr/crypto functions
 * needed for login/registration without cross-package imports.
 */

// ── Constants ───────────────────────────────────────────────────────

const VAULT_KEY_LENGTH = 32; // 256-bit
const SALT_LENGTH = 16; // 128-bit
const SECRET_KEY_LENGTH = 16; // 128-bit

const DEFAULT_KDF_PARAMS = {
  memoryKiB: 131072, // 128 MiB
  iterations: 3,
  parallelism: 4,
};

const LOCAL_DEV_PBKDF2_ITERATIONS = 20_000;

function isLocalDevBrowser() {
  const hostname =
    typeof globalThis.location === "undefined"
      ? ""
      : globalThis.location.hostname;

  return (
    import.meta.env.DEV &&
    (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1")
  );
}

// ── Random Generation ───────────────────────────────────────────────

export function generateRandomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

export function generateSecretKey(): Uint8Array {
  return generateRandomBytes(SECRET_KEY_LENGTH);
}

export function generateSalt(): Uint8Array {
  return generateRandomBytes(SALT_LENGTH);
}

// ── Base32 Encoding (RFC 4648, no padding) ──────────────────────────

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function secretKeyToBase32(secretKey: Uint8Array): string {
  let result = "";
  let bits = 0;
  let value = 0;
  for (const byte of secretKey) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      result += BASE32_ALPHABET[(value >>> bits) & 0x1f];
    }
  }
  if (bits > 0) {
    result += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f];
  }
  return result.match(/.{1,5}/g)?.join("-") ?? result;
}

export function base32ToSecretKey(encoded: string): Uint8Array {
  const stripped = encoded.replace(/-/g, "").toUpperCase();
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;
  for (const char of stripped) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) throw new Error(`Invalid Base32 character: ${char}`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >>> bits) & 0xff);
    }
  }
  return new Uint8Array(bytes);
}

// ── Uint8Array ↔ Base64 helpers ────────────────────────────────────

export function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export function base64ToUint8(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ── Argon2id Key Derivation ────────────────────────────────────────

export interface DeriveVaultKeyParams {
  masterPassword: string;
  secretKey: Uint8Array;
  salt: Uint8Array;
  memoryKiB?: number;
  iterations?: number;
  parallelism?: number;
}

export interface DeriveVaultKeyResult {
  vaultKey: Uint8Array;
  salt: Uint8Array;
}

/**
 * Derive a 256-bit vault key from master password + secret key
 * using Argon2id (via argon2-browser WASM).
 */
export async function deriveVaultKey(
  params: DeriveVaultKeyParams,
): Promise<DeriveVaultKeyResult> {
  const { masterPassword, secretKey, salt } = params;
  const memoryKiB = params.memoryKiB ?? DEFAULT_KDF_PARAMS.memoryKiB;
  const iterations = params.iterations ?? DEFAULT_KDF_PARAMS.iterations;
  const parallelism = params.parallelism ?? DEFAULT_KDF_PARAMS.parallelism;

  if (!masterPassword) throw new Error("Master password is required");
  if (!secretKey || secretKey.length < SECRET_KEY_LENGTH) {
    throw new Error(`Secret key must be at least ${SECRET_KEY_LENGTH} bytes`);
  }

  // NFC-normalize password, then concatenate with secret key
  const encoder = new TextEncoder();
  const passwordBytes = encoder.encode(masterPassword.normalize("NFC"));
  const combined = new Uint8Array(passwordBytes.length + secretKey.length);
  combined.set(passwordBytes, 0);
  combined.set(secretKey, passwordBytes.length);

  try {
    if (
      isLocalDevBrowser() &&
      params.memoryKiB === undefined &&
      params.iterations === undefined &&
      params.parallelism === undefined
    ) {
      const keyMaterial = await crypto.subtle.importKey(
        "raw",
        combined as BufferSource,
        "PBKDF2",
        false,
        ["deriveBits"],
      );
      const bits = await crypto.subtle.deriveBits(
        {
          name: "PBKDF2",
          hash: "SHA-256",
          salt: new Uint8Array(salt) as BufferSource,
          iterations: LOCAL_DEV_PBKDF2_ITERATIONS,
        },
        keyMaterial,
        VAULT_KEY_LENGTH * 8,
      );

      return { vaultKey: new Uint8Array(bits), salt };
    }

    const { ArgonType, loadArgon2Hash } = await import("./argon2-adapter");
    const argon2Hash = await loadArgon2Hash();

    const result = await argon2Hash({
      pass: combined,
      salt: salt,
      type: ArgonType.Argon2id,
      mem: memoryKiB,
      time: iterations,
      parallelism: parallelism,
      hashLen: VAULT_KEY_LENGTH,
    });

    const vaultKey = new Uint8Array(result.hash);

    // Zero the library's internal copy
    if (result.hash instanceof Uint8Array) result.hash.fill(0);

    return { vaultKey, salt };
  } finally {
    passwordBytes.fill(0);
    combined.fill(0);
  }
}

// ── X25519 Key Pair Generation ─────────────────────────────────────

export interface KeyPairResult {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

/**
 * Generate an X25519 key pair for device enrollment.
 */
export async function generateX25519KeyPair(): Promise<KeyPairResult> {
  // Dynamic import — resolved via Vite alias to crypto/node_modules
  const mod = await import("libsodium-wrappers-sumo");
  const sodium = mod.default ?? mod;
  await sodium.ready;
  const pair = sodium.crypto_box_keypair();
  return {
    publicKey: new Uint8Array(pair.publicKey),
    privateKey: new Uint8Array(pair.privateKey),
  };
}
