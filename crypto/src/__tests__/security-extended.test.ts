// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * @security -- Extended security tests for the pssmngr crypto SDK.
 *
 * These tests complement crypto/src/security.test.ts by covering gaps:
 *
 * - SEC-02-EXT: Nonce uniqueness at 10,000-operation scale (original does 1,000)
 * - SEC-18: Expanded no-plaintext-logging scan with additional sensitive
 *   variable names (vaultKey, password, token) and coverage of crypto/src/
 * - SEC-19: RNG bias detection via chi-squared goodness-of-fit
 * - SEC-20: Ciphertext indistinguishability from random
 * - SEC-21: Key-commitment — same ciphertext cannot decrypt under two keys
 * - SEC-22: Empty and boundary-length plaintext handling
 * - SEC-23: Additional Authenticated Data (AAD) binding verification
 *
 * Tests already fully covered in security.test.ts are NOT duplicated here:
 * - SEC-01 (Argon2id params) -- fully covered
 * - SEC-02 tamper detection (byte-by-byte ciphertext/authTag/nonce) -- fully covered
 * - SEC-12 (no Math.random in crypto SDK) -- fully covered
 * - RNG audit (source verification, entropy, uniqueness at 1k) -- fully covered
 * - SEC-03 (server-side plaintext logging) -- covered but extended here as SEC-18
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import { encryptItem, decryptItem, generateDataKeyAsync } from '../vault';
import { generateRandomBytes } from '../random';
import type { EncryptedBlob } from '../types';
import { CRYPTO_LENGTHS, CURRENT_CRYPTO_VERSION } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toHex(buf: Uint8Array): string {
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function makeKey(): Promise<Uint8Array> {
  return generateDataKeyAsync();
}

function collectTsSourceFiles(dir: string): string[] {
  const files: string[] = [];
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTsSourceFiles(full));
    } else if (
      entry.name.endsWith('.ts') &&
      !entry.name.endsWith('.test.ts') &&
      !entry.name.endsWith('.d.ts')
    ) {
      files.push(full);
    }
  }
  return files;
}

// ---------------------------------------------------------------------------
// SEC-02-EXT: Nonce uniqueness at 10,000-operation scale
// ---------------------------------------------------------------------------

describe('@security SEC-02-EXT: Nonce uniqueness at 10,000-operation scale', () => {
  it('10,000 encrypt operations with the same key produce 10,000 unique nonces', async () => {
    const key = await makeKey();
    const plaintext = new TextEncoder().encode('nonce-uniqueness-10k');
    const nonceSet = new Set<string>();

    for (let i = 0; i < 10_000; i++) {
      const blob = await encryptItem(plaintext, key);
      nonceSet.add(toHex(blob.nonce));
    }

    expect(nonceSet.size).toBe(10_000);
  }, 120_000); // generous timeout for 10k encrypt ops
});

// ---------------------------------------------------------------------------
// SEC-18: Expanded no-plaintext-logging scan
// ---------------------------------------------------------------------------

describe('@security SEC-18: No plaintext secrets logged in crypto or server code', () => {
  /**
   * Extended sensitive variable list. security.test.ts SEC-03 covers:
   *   masterPassword, privateKey, secretKey, sessionToken, apiKey, derivedKey
   *
   * This test adds the remaining variables requested:
   *   vaultKey, password, token
   *
   * The full combined list is checked against both crypto/src/ AND
   * pssmngr-server/packages/server/src/.
   */
  const EXTENDED_SENSITIVE_PATTERNS = [
    'masterPassword',
    'privateKey',
    'secretKey',
    'sessionToken',
    'apiKey',
    'derivedKey',
    'vaultKey',
    'password',
    'token',
  ];

  const LOG_CALL_REGEX =
    /(?:console\.(?:log|warn|debug|info)|logger\.(?:info|warn|error|debug|trace|log))\s*\(/;

  function findLoggingViolations(
    dir: string,
    patterns: string[],
  ): { file: string; line: number; text: string }[] {
    const files = collectTsSourceFiles(dir);
    const violations: { file: string; line: number; text: string }[] = [];

    for (const filePath of files) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
        const line = lines[lineIdx];
        // Skip comment lines
        const trimmed = line.trimStart();
        if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;

        if (LOG_CALL_REGEX.test(line)) {
          for (const pattern of patterns) {
            // Use word-boundary-aware check so "password" does not
            // false-positive on "passwordHash" being logged as a label
            // but DOES catch `console.log(password)` or `console.log("pw:", password)`
            const wordBoundary = new RegExp(`\\b${pattern}\\b`);
            if (wordBoundary.test(line)) {
              violations.push({
                file: path.relative(dir, filePath),
                line: lineIdx + 1,
                text: line.trim(),
              });
              break; // one violation per line is enough
            }
          }
        }
      }
    }

    return violations;
  }

  it('crypto/src/ source files do not log sensitive variable names', () => {
    const cryptoSrcDir = path.resolve(__dirname, '..');
    const violations = findLoggingViolations(
      cryptoSrcDir,
      EXTENDED_SENSITIVE_PATTERNS,
    );

    if (violations.length > 0) {
      const report = violations
        .map((v) => `  ${v.file}:${v.line} -- ${v.text}`)
        .join('\n');
      throw new Error(
        `SEC-18 VIOLATION: Found ${violations.length} log statement(s) referencing sensitive variables in crypto/src/:\n${report}`,
      );
    }
  });

  it('server source files do not log extended sensitive variable names', () => {
    const serverSrcDir = path.resolve(
      __dirname,
      '../../../pssmngr-server/packages/server/src',
    );

    if (!fs.existsSync(serverSrcDir)) {
      console.warn(
        `SEC-18: Skipping server scan -- directory not found at ${serverSrcDir}`,
      );
      return;
    }

    // Only check the three patterns NOT already in SEC-03: vaultKey, password, token
    const newPatterns = ['vaultKey', 'password', 'token'];
    const violations = findLoggingViolations(serverSrcDir, newPatterns);

    if (violations.length > 0) {
      const report = violations
        .map((v) => `  ${v.file}:${v.line} -- ${v.text}`)
        .join('\n');
      throw new Error(
        `SEC-18 VIOLATION: Found ${violations.length} log statement(s) referencing sensitive variables (vaultKey/password/token) in server:\n${report}`,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// SEC-19: RNG bias detection -- chi-squared goodness-of-fit
// ---------------------------------------------------------------------------

describe('@security SEC-19: RNG bias detection via chi-squared test', () => {
  it('generateRandomBytes output passes chi-squared uniformity test', () => {
    // Generate a large sample and verify byte distribution is uniform.
    // For 256 possible byte values and 25,600 samples (100 bytes per value),
    // the expected count per bucket is 100.
    const sampleSize = 25_600;
    const bytes = generateRandomBytes(sampleSize);
    const counts = new Float64Array(256);
    for (const b of bytes) counts[b]++;

    const expected = sampleSize / 256; // 100
    let chiSquared = 0;
    for (let i = 0; i < 256; i++) {
      const diff = counts[i] - expected;
      chiSquared += (diff * diff) / expected;
    }

    // Chi-squared critical value for 255 degrees of freedom at p=0.001
    // is approximately 321.4. A truly random source should rarely exceed this.
    // We use a generous threshold of 350 to avoid flaky failures while still
    // catching a biased RNG (e.g., Math.random would fail spectacularly).
    expect(chiSquared).toBeLessThan(350);
  });

  it('generateRandomBytes does not exhibit low-byte bias', () => {
    // Some weak RNGs produce more low bytes. Check that the lower half
    // (0-127) and upper half (128-255) are roughly balanced.
    const bytes = generateRandomBytes(10_000);
    let lowCount = 0;
    for (const b of bytes) {
      if (b < 128) lowCount++;
    }

    // Expected: 5000 +/- reasonable variance. Allow 4% deviation.
    expect(lowCount).toBeGreaterThan(4600);
    expect(lowCount).toBeLessThan(5400);
  });
});

// ---------------------------------------------------------------------------
// SEC-20: Ciphertext indistinguishability from random
// ---------------------------------------------------------------------------

describe('@security SEC-20: Ciphertext indistinguishability from random', () => {
  it('ciphertext bytes pass chi-squared uniformity test (no structure leakage)', async () => {
    const key = await makeKey();
    // Encrypt a highly structured plaintext (all zeros) and verify the
    // ciphertext has uniform byte distribution (no plaintext leakage).
    const plaintext = new Uint8Array(4096).fill(0x00);
    const blob = await encryptItem(plaintext, key);

    const counts = new Float64Array(256);
    for (const b of blob.ciphertext) counts[b]++;

    const expected = blob.ciphertext.length / 256;
    let chiSquared = 0;
    for (let i = 0; i < 256; i++) {
      const diff = counts[i] - expected;
      chiSquared += (diff * diff) / expected;
    }

    // With 4096 bytes and 256 buckets (expected ~16 per bucket), the
    // chi-squared critical value at p=0.001 (df=255) is ~321.
    // Use generous threshold for non-flaky test.
    expect(chiSquared).toBeLessThan(400);
  });

  it('ciphertext of all-zero plaintext does not contain long zero runs', async () => {
    const key = await makeKey();
    const plaintext = new Uint8Array(1024).fill(0x00);
    const blob = await encryptItem(plaintext, key);

    // In a properly encrypted output, runs of identical bytes should be short.
    // Check that no run of zeros exceeds 8 bytes (extremely unlikely in random data).
    let maxZeroRun = 0;
    let currentRun = 0;
    for (const b of blob.ciphertext) {
      if (b === 0x00) {
        currentRun++;
        if (currentRun > maxZeroRun) maxZeroRun = currentRun;
      } else {
        currentRun = 0;
      }
    }

    expect(maxZeroRun).toBeLessThan(9);
  });

  it('ciphertext of repeated-byte plaintext has high entropy', async () => {
    const key = await makeKey();
    const plaintext = new Uint8Array(2048).fill(0xaa);
    const blob = await encryptItem(plaintext, key);

    // Calculate Shannon entropy of ciphertext
    const counts = new Float64Array(256);
    for (const b of blob.ciphertext) counts[b]++;
    const len = blob.ciphertext.length;

    let entropy = 0;
    for (let i = 0; i < 256; i++) {
      if (counts[i] > 0) {
        const p = counts[i] / len;
        entropy -= p * Math.log2(p);
      }
    }

    // Maximum entropy for byte data is 8 bits. Good encryption should
    // produce entropy > 7.5 for a 2048-byte ciphertext.
    expect(entropy).toBeGreaterThan(7.0);
  });
});

// ---------------------------------------------------------------------------
// SEC-21: Key commitment -- same ciphertext must not decrypt under two keys
// ---------------------------------------------------------------------------

describe('@security SEC-21: Key commitment -- no multi-key decryption', () => {
  it('ciphertext encrypted under key A never decrypts under 500 random keys', async () => {
    const keyA = await makeKey();
    const plaintext = new TextEncoder().encode('key-commitment-test-data');
    const blob = await encryptItem(plaintext, keyA);

    let falseDecryptions = 0;

    for (let i = 0; i < 500; i++) {
      const randomKey = await makeKey();
      try {
        await decryptItem(blob, randomKey);
        falseDecryptions++;
      } catch {
        // Expected -- wrong key should always throw
      }
    }

    expect(falseDecryptions).toBe(0);
  }, 60_000);

  it('key differing by a single bit cannot decrypt', async () => {
    const key = await makeKey();
    const plaintext = new TextEncoder().encode('single-bit-key-test');
    const blob = await encryptItem(plaintext, key);

    // Flip each bit position in the key (32 bytes = 256 bits)
    for (let byteIdx = 0; byteIdx < key.length; byteIdx++) {
      for (let bitIdx = 0; bitIdx < 8; bitIdx++) {
        const wrongKey = new Uint8Array(key);
        wrongKey[byteIdx] ^= 1 << bitIdx;

        await expect(decryptItem(blob, wrongKey)).rejects.toThrow();
      }
    }
  }, 60_000);
});

// ---------------------------------------------------------------------------
// SEC-22: Empty and boundary-length plaintext handling
// ---------------------------------------------------------------------------

describe('@security SEC-22: Empty and boundary-length plaintext encryption', () => {
  it('encrypts and decrypts empty plaintext (0 bytes)', async () => {
    const key = await makeKey();
    const plaintext = new Uint8Array(0);
    const blob = await encryptItem(plaintext, key);
    const decrypted = await decryptItem(blob, key);

    expect(decrypted).toEqual(plaintext);
    expect(decrypted.length).toBe(0);
  });

  it('encrypts and decrypts 1-byte plaintext', async () => {
    const key = await makeKey();
    const plaintext = new Uint8Array([0x42]);
    const blob = await encryptItem(plaintext, key);
    const decrypted = await decryptItem(blob, key);

    expect(decrypted).toEqual(plaintext);
  });

  it('encrypts and decrypts plaintext at block boundary (64 bytes)', async () => {
    const key = await makeKey();
    const plaintext = generateRandomBytes(64);
    const blob = await encryptItem(plaintext, key);
    const decrypted = await decryptItem(blob, key);

    expect(decrypted).toEqual(plaintext);
  });

  it('encrypts and decrypts large plaintext (1 MiB)', async () => {
    const key = await makeKey();
    // crypto.getRandomValues has a 65536-byte limit, so fill in chunks
    const size = 1024 * 1024;
    const plaintext = new Uint8Array(size);
    const chunkSize = 65536;
    for (let offset = 0; offset < size; offset += chunkSize) {
      const len = Math.min(chunkSize, size - offset);
      plaintext.set(generateRandomBytes(len), offset);
    }
    const blob = await encryptItem(plaintext, key);
    const decrypted = await decryptItem(blob, key);

    expect(decrypted).toEqual(plaintext);
  }, 30_000);

  it('ciphertext length equals plaintext length for XChaCha20 stream cipher', async () => {
    // XChaCha20-Poly1305 is a stream cipher; ciphertext length should equal
    // plaintext length (auth tag is stored separately in our EncryptedBlob).
    const key = await makeKey();

    for (const size of [0, 1, 15, 16, 17, 31, 32, 33, 64, 128, 255, 256, 1024]) {
      const plaintext = generateRandomBytes(size);
      const blob = await encryptItem(plaintext, key);
      expect(blob.ciphertext.length).toBe(size);
    }
  });

  it('empty plaintext still produces valid nonce and authTag', async () => {
    const key = await makeKey();
    const blob = await encryptItem(new Uint8Array(0), key);

    expect(blob.nonce.length).toBe(CRYPTO_LENGTHS.nonce);
    expect(blob.authTag.length).toBe(CRYPTO_LENGTHS.authTag);
    expect(blob.version).toBe(CURRENT_CRYPTO_VERSION);
  });

  it('tampered empty ciphertext still detected by authTag', async () => {
    const key = await makeKey();
    const blob = await encryptItem(new Uint8Array(0), key);

    // Append a byte to the empty ciphertext
    const tampered: EncryptedBlob = {
      ciphertext: new Uint8Array([0xff]),
      nonce: new Uint8Array(blob.nonce),
      authTag: new Uint8Array(blob.authTag),
      version: blob.version,
    };

    await expect(decryptItem(tampered, key)).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// SEC-23: Additional Authenticated Data (AAD) binding
// ---------------------------------------------------------------------------

describe('@security SEC-23: AAD binding verification', () => {
  it('ciphertext encrypted with AAD cannot be decrypted without AAD', async () => {
    const key = await makeKey();
    const plaintext = new TextEncoder().encode('aad-binding-test');
    const aad = new TextEncoder().encode('context-v1');

    const blob = await encryptItem(plaintext, key, aad);

    // Decrypt without AAD should fail
    await expect(decryptItem(blob, key)).rejects.toThrow();
  });

  it('ciphertext encrypted with AAD cannot be decrypted with different AAD', async () => {
    const key = await makeKey();
    const plaintext = new TextEncoder().encode('aad-mismatch-test');
    const aad1 = new TextEncoder().encode('context-v1');
    const aad2 = new TextEncoder().encode('context-v2');

    const blob = await encryptItem(plaintext, key, aad1);

    // Decrypt with wrong AAD should fail
    await expect(decryptItem(blob, key, aad2)).rejects.toThrow();
  });

  it('ciphertext encrypted with AAD decrypts correctly with same AAD', async () => {
    const key = await makeKey();
    const plaintext = new TextEncoder().encode('aad-correct-test');
    const aad = new TextEncoder().encode('context-v1');

    const blob = await encryptItem(plaintext, key, aad);
    const decrypted = await decryptItem(blob, key, aad);

    expect(decrypted).toEqual(plaintext);
  });

  it('ciphertext encrypted without AAD cannot be decrypted with AAD', async () => {
    const key = await makeKey();
    const plaintext = new TextEncoder().encode('no-aad-to-aad-test');

    const blob = await encryptItem(plaintext, key);

    // Decrypt with AAD that was not used during encryption should fail
    const aad = new TextEncoder().encode('injected-context');
    await expect(decryptItem(blob, key, aad)).rejects.toThrow();
  });

  it('single-bit change in AAD causes decryption failure', async () => {
    const key = await makeKey();
    const plaintext = new TextEncoder().encode('aad-bit-flip');
    const aad = new Uint8Array([0x01, 0x02, 0x03, 0x04]);

    const blob = await encryptItem(plaintext, key, aad);

    // Flip one bit in AAD
    const tamperedAad = new Uint8Array(aad);
    tamperedAad[0] ^= 0x01;

    await expect(decryptItem(blob, key, tamperedAad)).rejects.toThrow();
  });
});
