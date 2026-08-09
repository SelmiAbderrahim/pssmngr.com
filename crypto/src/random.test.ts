// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { describe, it, expect } from 'vitest';
import {
  generateRandomBytes,
  generateUUID,
  secureRandom,
  generateNonce,
  generateSalt,
  generateId,
} from './random';

describe('generateRandomBytes', () => {
  it('returns Uint8Array of requested length', () => {
    const bytes = generateRandomBytes(32);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBe(32);
  });

  it('returns different values on each call', () => {
    const a = generateRandomBytes(32);
    const b = generateRandomBytes(32);
    expect(a).not.toEqual(b);
  });

  it('handles length 0', () => {
    const bytes = generateRandomBytes(0);
    expect(bytes.length).toBe(0);
  });
});

describe('generateNonce', () => {
  it('default returns 24 bytes', () => {
    const nonce = generateNonce();
    expect(nonce).toBeInstanceOf(Uint8Array);
    expect(nonce.length).toBe(24);
  });

  it('custom length works', () => {
    const nonce = generateNonce(12);
    expect(nonce.length).toBe(12);
  });

  it('uniqueness: 1000 nonces are all different', () => {
    const set = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const nonce = generateNonce();
      const hex = Array.from(nonce, (b) => b.toString(16).padStart(2, '0')).join('');
      set.add(hex);
    }
    expect(set.size).toBe(1000);
  });
});

describe('generateSalt', () => {
  it('default returns 16 bytes', () => {
    const salt = generateSalt();
    expect(salt).toBeInstanceOf(Uint8Array);
    expect(salt.length).toBe(16);
  });

  it('custom length works', () => {
    const salt = generateSalt(32);
    expect(salt.length).toBe(32);
  });

  it('returns different values on each call', () => {
    const a = generateSalt();
    const b = generateSalt();
    expect(a).not.toEqual(b);
  });
});

describe('generateId', () => {
  it('returns 32-char hex string by default', () => {
    const id = generateId();
    expect(id.length).toBe(32);
    expect(id).toMatch(/^[0-9a-f]{32}$/);
  });

  it('custom byte length produces correct hex length', () => {
    const id = generateId(8);
    expect(id.length).toBe(16);
    expect(id).toMatch(/^[0-9a-f]{16}$/);
  });

  it('uniqueness over 1000 calls', () => {
    const set = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      set.add(generateId());
    }
    expect(set.size).toBe(1000);
  });
});

describe('generateUUID', () => {
  it('returns valid UUID v4 format', () => {
    const uuid = generateUUID();
    expect(uuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('returns different values on each call', () => {
    const a = generateUUID();
    const b = generateUUID();
    expect(a).not.toBe(b);
  });

  it('version nibble is always 4', () => {
    for (let i = 0; i < 100; i++) {
      const uuid = generateUUID();
      // 13th character (0-indexed: position 14 in full string with dashes)
      expect(uuid[14]).toBe('4');
    }
  });

  it('variant bits are correct (8, 9, a, or b)', () => {
    for (let i = 0; i < 100; i++) {
      const uuid = generateUUID();
      // 19th position in the full string
      expect('89ab').toContain(uuid[19]);
    }
  });
});

describe('secureRandom', () => {
  it('returns value in range [0, max)', () => {
    for (let i = 0; i < 100; i++) {
      const val = secureRandom(10);
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThan(10);
    }
  });

  it('returns 0 for max=1', () => {
    for (let i = 0; i < 10; i++) {
      expect(secureRandom(1)).toBe(0);
    }
  });

  it('throws for max <= 0', () => {
    expect(() => secureRandom(0)).toThrow('max must be positive');
    expect(() => secureRandom(-1)).toThrow('max must be positive');
    expect(() => secureRandom(-100)).toThrow('max must be positive');
  });
});
