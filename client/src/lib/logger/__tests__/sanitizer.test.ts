// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  sanitize,
  hashUserId,
  hashUserIdSync,
  REDACTION_PATTERNS,
  SENSITIVE_KEYS
} from '../sanitizer';

// Mock crypto methods that are used by hashUserIdSync
vi.mock('crypto', () => ({
  randomUUID: vi.fn(() => 'test-uuid'),
  subtle: {
    digest: vi.fn().mockResolvedValue({
      data: new ArrayBuffer(8),
    algorithm: 'SHA-256'
    })
  }
}));

describe('hashUserIdSync', () => {
  it('should return consistent hash for same input', () => {
    const hash1 = hashUserIdSync('user123');
    const hash2 = hashUserIdSync('user123');
    expect(hash1).toBe(hash2);
  });

  it('should return different hashes for different inputs', () => {
    const hash1 = hashUserIdSync('user123');
    const hash2 = hashUserIdSync('user456');
    expect(hash1).not.toBe(hash2);
  });

  it('should prefix with user_', () => {
    const hash = hashUserIdSync('test');
    expect(hash).toMatch(/^user_[0-9a-f]+$/);
  });

  it('should return 16-character hex string', () => {
    const hash = hashUserIdSync('anyuser');
    expect(hash.length).toBe(21); // "user_" + 16 chars
  });
});

describe('hashUserId', () => {
  it('should return a string prefixed with user_', async () => {
    const hash = await hashUserId('user123');
    expect(hash).toMatch(/^user_/);
  });

  it('should return consistent result for same input via crypto.subtle', async () => {
    // crypto.subtle is available in jsdom, so this exercises the main branch
    const hash1 = await hashUserId('user123');
    const hash2 = await hashUserId('user123');
    expect(hash1).toBe(hash2);
  });

  it('should return different hashes for different inputs', async () => {
    const hash1 = await hashUserId('userA');
    const hash2 = await hashUserId('userB');
    expect(hash1).not.toBe(hash2);
  });

  it('should fall back to sync hash when crypto is not available', async () => {
    const originalCrypto = globalThis.crypto;
    // @ts-expect-error — intentionally removing crypto to test fallback
    delete globalThis.crypto;
    try {
      const hash = await hashUserId('fallback-user');
      expect(hash).toMatch(/^user_[0-9a-f]+$/);
    } finally {
      globalThis.crypto = originalCrypto;
    }
  });
});

describe('sanitize', () => {
  it('should return null/undefined as-is', () => {
    expect(sanitize(null)).toBeNull();
    expect(sanitize(undefined)).toBeUndefined();
  });

  it('should redact email patterns in strings', () => {
    const result = sanitize('Contact user@example.com for help');
    expect(result).toBe('Contact [REDACTED:email] for help');
  });

  it('should redact phone patterns in strings', () => {
    const result = sanitize('Call 555-867-5309 now');
    expect(result).toBe('Call [REDACTED:phone] now');
  });

  it('should redact credit card patterns in strings', () => {
    const result = sanitize('Card 1234-5678-9012-3456');
    expect(result).toBe('Card [REDACTED:credit_card]');
  });

  it('should redact SSN patterns in strings', () => {
    const result = sanitize('SSN: 123-45-6789');
    expect(result).toBe('SSN: [REDACTED:ssn]');
  });

  it('should redact JWT tokens in strings', () => {
    const result = sanitize(
      'Token: eyJa.Yg.Yw',
    );
    expect(result).toBe('Token: [REDACTED:jwt]');
  });

  it('should redact IPv4 addresses in strings', () => {
    const result = sanitize('Server at 192.168.1.1');
    expect(result).toBe('Server at [REDACTED:ip]');
  });

  it('should return numbers unchanged', () => {
    expect(sanitize(42)).toBe(42);
    expect(sanitize(3.14)).toBe(3.14);
  });

  it('should return booleans unchanged', () => {
    expect(sanitize(true)).toBe(true);
    expect(sanitize(false)).toBe(false);
  });

  it('should redact sensitive keys in objects', () => {
    const result = sanitize({ password: 'secret123', username: 'alice' }) as Record<string, unknown>;
    expect(result.password).toBe('[REDACTED]');
    expect(result.username).toBe('alice');
  });

  it('should redact all known sensitive key variants', () => {
    const input = {
      token: 'tok123',
      access_token: 'acc123',
      apiKey: 'key123',
      email: 'a@b.com',
      ssn: '000-00-0000',
      cvv: '123',
      jwt: 'eyJ...',
      sessionid: 'sess_abc',
    };
    const result = sanitize(input) as Record<string, unknown>;
    for (const key of Object.keys(input)) {
      expect(result[key]).toBe('[REDACTED]');
    }
  });

  it('should recursively sanitize nested objects', () => {
    const result = sanitize({ outer: { password: 'secret' } }) as Record<string, unknown>;
    expect((result.outer as Record<string, unknown>).password).toBe('[REDACTED]');
  });

  it('should sanitize arrays recursively', () => {
    const result = sanitize(['user@test.com', 'safe']) as string[];
    expect(result[0]).toBe('[REDACTED:email]');
    expect(result[1]).toBe('safe');
  });

  it('should sanitize Error objects', () => {
    const err = new Error('Failed for user@test.com');
    const result = sanitize(err) as { name: string; message: string; stack?: string };
    expect(result.name).toBe('Error');
    expect(result.message).toBe('Failed for [REDACTED:email]');
  });

  it('should handle Error with undefined stack', () => {
    const err = new Error('test');
    Object.defineProperty(err, 'stack', { value: undefined });
    const result = sanitize(err) as { stack?: string };
    expect(result.stack).toBeUndefined();
  });

  it('should return [MAX_DEPTH_EXCEEDED] when depth exceeds 10', () => {
    // Build a deeply nested object — 12 wrapping levels so the innermost
    // recursive call is at depth=11, which is > 10 and returns the sentinel.
    let deep: Record<string, unknown> = { value: 'leaf' };
    for (let i = 0; i < 12; i++) {
      deep = { nested: deep };
    }
    const result = sanitize(deep) as Record<string, unknown>;
    // Drill down through the sanitized output until we reach the sentinel
    let current: unknown = result;
    while (
      current !== null &&
      typeof current === 'object' &&
      'nested' in (current as Record<string, unknown>)
    ) {
      current = (current as Record<string, unknown>).nested;
    }
    expect(current).toBe('[MAX_DEPTH_EXCEEDED]');
  });

  it('should return [UNSUPPORTED_TYPE] for functions', () => {
    const result = sanitize(() => 'hello');
    expect(result).toBe('[UNSUPPORTED_TYPE]');
  });

  it('should return [UNSUPPORTED_TYPE] for symbols', () => {
    const result = sanitize(Symbol('test'));
    expect(result).toBe('[UNSUPPORTED_TYPE]');
  });

  it('should redact string values inside objects via redactString', () => {
    const result = sanitize({ message: 'email is user@example.com' }) as Record<string, unknown>;
    expect(result.message).toBe('email is [REDACTED:email]');
  });
});

describe('SENSITIVE_KEYS', () => {
  it('should contain expected sensitive key names', () => {
    expect(SENSITIVE_KEYS.has('password')).toBe(true);
    expect(SENSITIVE_KEYS.has('token')).toBe(true);
    expect(SENSITIVE_KEYS.has('email')).toBe(true);
    expect(SENSITIVE_KEYS.has('cvv')).toBe(true);
  });
});

describe('REDACTION_PATTERNS', () => {
  it('should contain all expected pattern names', () => {
    const names = REDACTION_PATTERNS.map((p) => p.name);
    expect(names).toContain('email');
    expect(names).toContain('phone');
    expect(names).toContain('creditCard');
    expect(names).toContain('ssn');
    expect(names).toContain('jwt');
    expect(names).toContain('ipv4');
  });
});
