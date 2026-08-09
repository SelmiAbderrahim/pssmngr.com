// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { describe, it, expect, vi } from "vitest";
import {
  generateRandomBytes,
  generateSecretKey,
  generateSalt,
  secretKeyToBase32,
  base32ToSecretKey,
  uint8ToBase64,
  base64ToUint8,
  deriveVaultKey,
  generateX25519KeyPair,
} from "../vault-crypto";

// ── Random Generation ────────────────────────────────────────────────

describe("generateRandomBytes", () => {
  it("returns correct length", () => {
    expect(generateRandomBytes(16).length).toBe(16);
    expect(generateRandomBytes(32).length).toBe(32);
    expect(generateRandomBytes(1).length).toBe(1);
  });

  it("returns a Uint8Array", () => {
    expect(generateRandomBytes(8)).toBeInstanceOf(Uint8Array);
  });

  it("generates different bytes each call", () => {
    const a = generateRandomBytes(32);
    const b = generateRandomBytes(32);
    // Technically could be equal but astronomically unlikely for 32 bytes
    const equal = a.every((v, i) => v === b[i]);
    expect(equal).toBe(false);
  });
});

describe("generateSecretKey", () => {
  it("returns 16 bytes (128-bit)", () => {
    const key = generateSecretKey();
    expect(key.length).toBe(16);
    expect(key).toBeInstanceOf(Uint8Array);
  });
});

describe("generateSalt", () => {
  it("returns 16 bytes (128-bit)", () => {
    const salt = generateSalt();
    expect(salt.length).toBe(16);
    expect(salt).toBeInstanceOf(Uint8Array);
  });
});

// ── Base32 Encoding ──────────────────────────────────────────────────

describe("secretKeyToBase32 / base32ToSecretKey", () => {
  it("round-trips a key through base32", () => {
    const original = new Uint8Array([
      0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x57, 0x6f, 0x72,
      0x6c, 0x64, 0x31, 0x32, 0x33, 0x34, 0x35, 0x36,
    ]);
    const encoded = secretKeyToBase32(original);
    const decoded = base32ToSecretKey(encoded);
    expect(decoded).toEqual(original);
  });

  it("round-trips random secret keys", () => {
    for (let i = 0; i < 10; i++) {
      const key = generateSecretKey();
      const encoded = secretKeyToBase32(key);
      const decoded = base32ToSecretKey(encoded);
      expect(decoded).toEqual(key);
    }
  });

  it("formats with dashes every 5 characters", () => {
    const key = new Uint8Array(16).fill(0);
    const encoded = secretKeyToBase32(key);
    // Should contain dashes
    expect(encoded).toContain("-");
    // Each segment should be at most 5 characters
    const segments = encoded.split("-");
    for (const seg of segments) {
      expect(seg.length).toBeLessThanOrEqual(5);
    }
  });

  it("handles dashes in input when decoding", () => {
    const key = generateSecretKey();
    const encoded = secretKeyToBase32(key);
    // encoded already has dashes; decode should handle them
    const decoded = base32ToSecretKey(encoded);
    expect(decoded).toEqual(key);
  });

  it("decoding is case-insensitive", () => {
    const key = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x01, 0x02, 0x03, 0x04,
      0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c]);
    const encoded = secretKeyToBase32(key);
    const lower = base32ToSecretKey(encoded.toLowerCase());
    const upper = base32ToSecretKey(encoded.toUpperCase());
    expect(lower).toEqual(upper);
  });

  it("throws on invalid base32 characters", () => {
    expect(() => base32ToSecretKey("INVALID!CHARS")).toThrow(
      "Invalid Base32 character",
    );
  });

  it("encodes to uppercase A-Z2-7 characters plus dashes", () => {
    const key = generateSecretKey();
    const encoded = secretKeyToBase32(key);
    // Only valid base32 chars and dashes
    expect(encoded).toMatch(/^[A-Z2-7\-]+$/);
  });
});

// ── Base64 Helpers ───────────────────────────────────────────────────

describe("uint8ToBase64 / base64ToUint8", () => {
  it("round-trips bytes through base64", () => {
    const original = new Uint8Array([0, 1, 127, 128, 255]);
    const encoded = uint8ToBase64(original);
    const decoded = base64ToUint8(encoded);
    expect(decoded).toEqual(original);
  });

  it("round-trips empty array", () => {
    const empty = new Uint8Array(0);
    const encoded = uint8ToBase64(empty);
    const decoded = base64ToUint8(encoded);
    expect(decoded).toEqual(empty);
  });

  it("produces valid base64 string", () => {
    const bytes = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
    const encoded = uint8ToBase64(bytes);
    expect(encoded).toMatch(/^[A-Za-z0-9+/=]*$/);
    expect(encoded).toBe("SGVsbG8=");
  });

  it("round-trips all byte values (0-255)", () => {
    const allBytes = new Uint8Array(256);
    for (let i = 0; i < 256; i++) allBytes[i] = i;
    const encoded = uint8ToBase64(allBytes);
    const decoded = base64ToUint8(encoded);
    expect(decoded).toEqual(allBytes);
  });

  it("round-trips large arrays", () => {
    const large = new Uint8Array(10000);
    for (let i = 0; i < large.length; i++) large[i] = i % 256;
    const encoded = uint8ToBase64(large);
    const decoded = base64ToUint8(encoded);
    expect(decoded).toEqual(large);
  });
});

// ── deriveVaultKey ────────────────────────────────────────────────────

describe("deriveVaultKey", () => {
  it("throws when master password is empty", async () => {
    const salt = generateSalt();
    const secretKey = generateSecretKey();
    await expect(
      deriveVaultKey({ masterPassword: "", secretKey, salt }),
    ).rejects.toThrow("Master password is required");
  });

  it("throws when secret key is too short", async () => {
    const salt = generateSalt();
    const shortKey = new Uint8Array(8); // less than 16 bytes
    await expect(
      deriveVaultKey({ masterPassword: "password", secretKey: shortKey, salt }),
    ).rejects.toThrow("Secret key must be at least 16 bytes");
  });

  it("returns a 32-byte vault key", async () => {
    const salt = generateSalt();
    const secretKey = generateSecretKey();
    const result = await deriveVaultKey({
      masterPassword: "correct-horse-battery-staple",
      secretKey,
      salt,
    });
    expect(result.vaultKey).toBeInstanceOf(Uint8Array);
    expect(result.vaultKey.length).toBe(32);
  });

  it("returns the same salt that was passed in", async () => {
    const salt = generateSalt();
    const secretKey = generateSecretKey();
    const result = await deriveVaultKey({
      masterPassword: "test-password",
      secretKey,
      salt,
    });
    expect(result.salt).toEqual(salt);
  });

  it("produces deterministic output for the same inputs (mock is deterministic)", async () => {
    const salt = new Uint8Array(16).fill(5);
    const secretKey = new Uint8Array(16).fill(7);
    const result1 = await deriveVaultKey({
      masterPassword: "same-password",
      secretKey,
      salt,
    });
    const result2 = await deriveVaultKey({
      masterPassword: "same-password",
      secretKey,
      salt,
    });
    expect(result1.vaultKey).toEqual(result2.vaultKey);
  });

  it("produces different output for different passwords", async () => {
    const salt = generateSalt();
    const secretKey = generateSecretKey();
    const result1 = await deriveVaultKey({
      masterPassword: "password-one",
      secretKey,
      salt,
    });
    const result2 = await deriveVaultKey({
      masterPassword: "password-two",
      secretKey,
      salt,
    });
    const equal = result1.vaultKey.every((v, i) => v === result2.vaultKey[i]);
    expect(equal).toBe(false);
  });

  it("produces different output for different salts", async () => {
    const secretKey = generateSecretKey();
    const salt1 = new Uint8Array(16).fill(1);
    const salt2 = new Uint8Array(16).fill(2);
    const result1 = await deriveVaultKey({
      masterPassword: "same-password",
      secretKey,
      salt: salt1,
    });
    const result2 = await deriveVaultKey({
      masterPassword: "same-password",
      secretKey,
      salt: salt2,
    });
    const equal = result1.vaultKey.every((v, i) => v === result2.vaultKey[i]);
    expect(equal).toBe(false);
  });

  it("accepts custom KDF parameters", async () => {
    const salt = generateSalt();
    const secretKey = generateSecretKey();
    const result = await deriveVaultKey({
      masterPassword: "test-password",
      secretKey,
      salt,
      memoryKiB: 65536,
      iterations: 2,
      parallelism: 2,
    });
    expect(result.vaultKey).toBeInstanceOf(Uint8Array);
    expect(result.vaultKey.length).toBe(32);
  });

  it("NFC-normalizes the master password", async () => {
    const salt = generateSalt();
    const secretKey = generateSecretKey();
    // Both forms should produce the same result after NFC normalization
    const composed = "\u00e9"; // é as single code point (NFC)
    const decomposed = "e\u0301"; // é as e + combining accent (NFD)
    const result1 = await deriveVaultKey({
      masterPassword: composed,
      secretKey,
      salt,
    });
    const result2 = await deriveVaultKey({
      masterPassword: decomposed,
      secretKey,
      salt,
    });
    // After NFC normalization both should produce equal keys
    expect(result1.vaultKey).toEqual(result2.vaultKey);
  });
});

// ── generateX25519KeyPair ─────────────────────────────────────────────

describe("generateX25519KeyPair", () => {
  it("returns publicKey and privateKey as Uint8Arrays", async () => {
    const { publicKey, privateKey } = await generateX25519KeyPair();
    expect(publicKey).toBeInstanceOf(Uint8Array);
    expect(privateKey).toBeInstanceOf(Uint8Array);
  });

  it("returns 32-byte keys", async () => {
    const { publicKey, privateKey } = await generateX25519KeyPair();
    expect(publicKey.length).toBe(32);
    expect(privateKey.length).toBe(32);
  });

  it("generates different key pairs on each call", async () => {
    const pair1 = await generateX25519KeyPair();
    const pair2 = await generateX25519KeyPair();
    const publicEqual = pair1.publicKey.every((v, i) => v === pair2.publicKey[i]);
    const privateEqual = pair1.privateKey.every((v, i) => v === pair2.privateKey[i]);
    // Astronomically unlikely to be equal for random 32-byte keys
    expect(publicEqual).toBe(false);
    expect(privateEqual).toBe(false);
  });

  it("public key and private key are different", async () => {
    const { publicKey, privateKey } = await generateX25519KeyPair();
    const equal = publicKey.every((v, i) => v === privateKey[i]);
    expect(equal).toBe(false);
  });
});
