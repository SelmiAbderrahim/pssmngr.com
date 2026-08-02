// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  generateTOTP,
  verifyTOTP,
  getRemainingSeconds,
  base32Decode,
  base32Encode,
  parseOTPAuthURI,
  parseOTPAuthToFields,
} from '../totp-engine';

// RFC 6238 Appendix B test secrets (ASCII-encoded)
const SECRET_SHA1 = new TextEncoder().encode('12345678901234567890');
const SECRET_SHA256 = new TextEncoder().encode('12345678901234567890123456789012');
const SECRET_SHA512 = new TextEncoder().encode(
  '1234567890123456789012345678901234567890123456789012345678901234',
);

// RFC 6238 Appendix B test vectors (8-digit codes, 30-second period)
const RFC_VECTORS: Array<{
  time: number;
  sha1: string;
  sha256: string;
  sha512: string;
}> = [
  { time: 59, sha1: '94287082', sha256: '46119246', sha512: '90693936' },
  { time: 1111111109, sha1: '07081804', sha256: '68084774', sha512: '25091201' },
  { time: 1111111111, sha1: '14050471', sha256: '67062674', sha512: '99943326' },
  { time: 1234567890, sha1: '89005924', sha256: '91819424', sha512: '93441116' },
  { time: 2000000000, sha1: '69279037', sha256: '90698825', sha512: '38618901' },
  { time: 20000000000, sha1: '65353130', sha256: '77737706', sha512: '47863826' },
];

describe('totp-engine', () => {
  describe('generateTOTP — RFC 6238 Appendix B vectors', () => {
    for (const vec of RFC_VECTORS) {
      it(`SHA1 at t=${vec.time}`, async () => {
        const code = await generateTOTP(
          { secret: SECRET_SHA1, algorithm: 'SHA1', digits: 8, period: 30 },
          vec.time,
        );
        expect(code).toBe(vec.sha1);
      });

      it(`SHA256 at t=${vec.time}`, async () => {
        const code = await generateTOTP(
          { secret: SECRET_SHA256, algorithm: 'SHA256', digits: 8, period: 30 },
          vec.time,
        );
        expect(code).toBe(vec.sha256);
      });

      it(`SHA512 at t=${vec.time}`, async () => {
        const code = await generateTOTP(
          { secret: SECRET_SHA512, algorithm: 'SHA512', digits: 8, period: 30 },
          vec.time,
        );
        expect(code).toBe(vec.sha512);
      });
    }
  });

  describe('generateTOTP — 6-digit mode', () => {
    it('produces 6-digit codes', async () => {
      const code = await generateTOTP(
        { secret: SECRET_SHA1, algorithm: 'SHA1', digits: 6, period: 30 },
        59,
      );
      expect(code).toHaveLength(6);
      expect(code).toBe('287082'); // last 6 digits of 94287082
    });

    it('zero-pads short codes', async () => {
      // Use a timestamp that produces a code starting with 0
      const code = await generateTOTP(
        { secret: SECRET_SHA1, algorithm: 'SHA1', digits: 6, period: 30 },
        1111111109,
      );
      expect(code).toHaveLength(6);
      expect(code).toBe('081804'); // last 6 of 07081804
    });
  });

  describe('generateTOTP — defaults', () => {
    it('uses SHA1, 6 digits, 30s period by default', async () => {
      const code = await generateTOTP({ secret: SECRET_SHA1 }, 59);
      expect(code).toHaveLength(6);
      expect(code).toBe('287082');
    });
  });

  describe('generateTOTP — period configuration', () => {
    it('uses custom period', async () => {
      const code60 = await generateTOTP(
        { secret: SECRET_SHA1, digits: 8, period: 60 },
        59,
      );
      // t=59 with period=60: counter=0
      const code30 = await generateTOTP(
        { secret: SECRET_SHA1, digits: 8, period: 30 },
        59,
      );
      // t=59 with period=30: counter=1
      // Different counters should produce different codes
      expect(code60).not.toBe(code30);
    });

    it('same counter produces same code regardless of exact time', async () => {
      const code1 = await generateTOTP(
        { secret: SECRET_SHA1, digits: 8, period: 30 },
        60,
      );
      const code2 = await generateTOTP(
        { secret: SECRET_SHA1, digits: 8, period: 30 },
        89,
      );
      // Both fall in counter=2 (60/30=2, 89/30=2)
      expect(code1).toBe(code2);
    });
  });

  describe('verifyTOTP — clock skew tolerance', () => {
    it('accepts code from current time step', async () => {
      const code = await generateTOTP(
        { secret: SECRET_SHA1, digits: 6, period: 30 },
        1000,
      );
      const valid = await verifyTOTP(
        { secret: SECRET_SHA1, digits: 6, period: 30 },
        code,
        1000,
      );
      expect(valid).toBe(true);
    });

    it('accepts code from previous time step (T-1)', async () => {
      // Generate code for T-1
      const code = await generateTOTP(
        { secret: SECRET_SHA1, digits: 6, period: 30 },
        970, // counter = 32
      );
      // Verify at T (30 seconds later)
      const valid = await verifyTOTP(
        { secret: SECRET_SHA1, digits: 6, period: 30 },
        code,
        1000, // counter = 33
      );
      expect(valid).toBe(true);
    });

    it('accepts code from next time step (T+1)', async () => {
      // Generate code for T+1
      const code = await generateTOTP(
        { secret: SECRET_SHA1, digits: 6, period: 30 },
        1030, // counter = 34
      );
      // Verify at T (30 seconds earlier)
      const valid = await verifyTOTP(
        { secret: SECRET_SHA1, digits: 6, period: 30 },
        code,
        1000, // counter = 33
      );
      expect(valid).toBe(true);
    });

    it('rejects code from T-2 (outside skew window)', async () => {
      const code = await generateTOTP(
        { secret: SECRET_SHA1, digits: 6, period: 30 },
        940, // counter = 31
      );
      const valid = await verifyTOTP(
        { secret: SECRET_SHA1, digits: 6, period: 30 },
        code,
        1000, // counter = 33
      );
      expect(valid).toBe(false);
    });

    it('rejects completely wrong code', async () => {
      const valid = await verifyTOTP(
        { secret: SECRET_SHA1, digits: 6, period: 30 },
        '000000',
        59,
      );
      expect(valid).toBe(false);
    });
  });

  describe('getRemainingSeconds', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('returns value between 1 and period', () => {
      const remaining = getRemainingSeconds(30);
      expect(remaining).toBeGreaterThanOrEqual(1);
      expect(remaining).toBeLessThanOrEqual(30);
    });

    it('defaults to 30-second period', () => {
      const remaining = getRemainingSeconds();
      expect(remaining).toBeGreaterThanOrEqual(1);
      expect(remaining).toBeLessThanOrEqual(30);
    });

    it('returns exact remaining seconds at a known timestamp', () => {
      // t=1000s → 1000 % 30 = 10 elapsed → 20 remaining
      vi.spyOn(Date, 'now').mockReturnValue(1000 * 1000);
      expect(getRemainingSeconds(30)).toBe(20);
    });

    it('returns period when exactly on a boundary', () => {
      // t=990s → 990 % 30 = 0 elapsed → 30 remaining
      vi.spyOn(Date, 'now').mockReturnValue(990 * 1000);
      expect(getRemainingSeconds(30)).toBe(30);
    });

    it('returns 1 just before a boundary', () => {
      // t=989s → 989 % 30 = 29 elapsed → 1 remaining
      vi.spyOn(Date, 'now').mockReturnValue(989 * 1000);
      expect(getRemainingSeconds(30)).toBe(1);
    });

    it('works with custom period', () => {
      // t=1000s → 1000 % 60 = 40 elapsed → 20 remaining
      vi.spyOn(Date, 'now').mockReturnValue(1000 * 1000);
      expect(getRemainingSeconds(60)).toBe(20);
    });
  });

  describe('base32Decode', () => {
    it('decodes standard Base32', () => {
      const decoded = base32Decode('JBSWY3DPEE');
      expect(new TextDecoder().decode(decoded)).toBe('Hello!');
    });

    it('handles lowercase input', () => {
      const decoded = base32Decode('jbswy3dpee');
      expect(new TextDecoder().decode(decoded)).toBe('Hello!');
    });

    it('handles padding', () => {
      const decoded = base32Decode('JBSWY3DPEE======');
      expect(new TextDecoder().decode(decoded)).toBe('Hello!');
    });

    it('handles spaces', () => {
      const decoded = base32Decode('JBSW Y3DP EE');
      expect(new TextDecoder().decode(decoded)).toBe('Hello!');
    });

    it('returns empty array for empty input', () => {
      expect(base32Decode('')).toEqual(new Uint8Array(0));
    });

    it('throws on invalid characters', () => {
      expect(() => base32Decode('ABC!@#')).toThrow('Invalid Base32 character');
    });
  });

  describe('base32Encode', () => {
    it('encodes to standard Base32', () => {
      const encoded = base32Encode(new TextEncoder().encode('Hello!'));
      expect(encoded).toBe('JBSWY3DPEE');
    });

    it('returns empty string for empty input', () => {
      expect(base32Encode(new Uint8Array(0))).toBe('');
    });

    it('roundtrips with decode', () => {
      const original = new Uint8Array([0, 1, 2, 255, 128, 64]);
      const encoded = base32Encode(original);
      const decoded = base32Decode(encoded);
      expect(decoded).toEqual(original);
    });

    it('roundtrips single byte', () => {
      for (const byte of [0, 1, 127, 128, 255]) {
        const original = new Uint8Array([byte]);
        const decoded = base32Decode(base32Encode(original));
        expect(decoded).toEqual(original);
      }
    });
  });

  describe('parseOTPAuthURI', () => {
    it('parses a standard otpauth URI', () => {
      const uri = 'otpauth://totp/Example:user@example.com?secret=JBSWY3DPEE&issuer=Example';
      const { config, label, issuer } = parseOTPAuthURI(uri);

      expect(label).toBe('Example:user@example.com');
      expect(issuer).toBe('Example');
      expect(config.algorithm).toBe('SHA1');
      expect(config.digits).toBe(6);
      expect(config.period).toBe(30);
      expect(new TextDecoder().decode(config.secret)).toBe('Hello!');
    });

    it('parses URI with all parameters', () => {
      const uri = 'otpauth://totp/Test?secret=JBSWY3DPEE&algorithm=SHA256&digits=8&period=60&issuer=TestCo';
      const { config, label, issuer } = parseOTPAuthURI(uri);

      expect(label).toBe('Test');
      expect(issuer).toBe('TestCo');
      expect(config.algorithm).toBe('SHA256');
      expect(config.digits).toBe(8);
      expect(config.period).toBe(60);
    });

    it('throws for non-otpauth protocol', () => {
      expect(() => parseOTPAuthURI('https://example.com')).toThrow('must start with otpauth://');
    });

    it('throws for non-totp type', () => {
      expect(() => parseOTPAuthURI('otpauth://hotp/Test?secret=JBSWY3DPEE')).toThrow(
        'only totp type is supported',
      );
    });

    it('throws for missing secret', () => {
      expect(() => parseOTPAuthURI('otpauth://totp/Test')).toThrow('missing secret');
    });

    it('throws for invalid algorithm', () => {
      expect(() =>
        parseOTPAuthURI('otpauth://totp/Test?secret=JBSWY3DPEE&algorithm=MD5'),
      ).toThrow('unsupported algorithm');
    });

    it('throws for invalid digits', () => {
      expect(() =>
        parseOTPAuthURI('otpauth://totp/Test?secret=JBSWY3DPEE&digits=4'),
      ).toThrow('digits must be 6 or 8');
    });

    it('throws for zero period', () => {
      expect(() =>
        parseOTPAuthURI('otpauth://totp/Test?secret=JBSWY3DPEE&period=0'),
      ).toThrow('period must be a positive number');
    });

    it('throws for negative period', () => {
      expect(() =>
        parseOTPAuthURI('otpauth://totp/Test?secret=JBSWY3DPEE&period=-30'),
      ).toThrow('period must be a positive number');
    });

    it('handles URI-encoded label with colon', () => {
      const uri = 'otpauth://totp/My%20Corp%3Auser%40mail.com?secret=JBSWY3DPEE&issuer=My%20Corp';
      const { label, issuer } = parseOTPAuthURI(uri);
      expect(label).toBe('My Corp:user@mail.com');
      expect(issuer).toBe('My Corp');
    });
  });

  describe('parseOTPAuthToFields', () => {
    it('parses standard URI with issuer:account label', () => {
      const result = parseOTPAuthToFields(
        'otpauth://totp/GitHub:user@example.com?secret=JBSWY3DPEE&issuer=GitHub',
      );

      expect(result.type).toBe('totp');
      expect(result.issuer).toBe('GitHub');
      expect(result.account).toBe('user@example.com');
      expect(result.secret).toBe('JBSWY3DPEE');
      expect(result.algorithm).toBe('SHA1');
      expect(result.digits).toBe(6);
      expect(result.period).toBe(30);
    });

    it('extracts issuer from label when issuer param is missing', () => {
      const result = parseOTPAuthToFields(
        'otpauth://totp/Acme:john@acme.org?secret=JBSWY3DPEE',
      );

      expect(result.issuer).toBe('Acme');
      expect(result.account).toBe('john@acme.org');
    });

    it('prefers issuer param over label prefix', () => {
      const result = parseOTPAuthToFields(
        'otpauth://totp/OldName:user@test.com?secret=JBSWY3DPEE&issuer=NewName',
      );

      expect(result.issuer).toBe('NewName');
      expect(result.account).toBe('user@test.com');
    });

    it('handles label without issuer prefix', () => {
      const result = parseOTPAuthToFields(
        'otpauth://totp/user@example.com?secret=JBSWY3DPEE&issuer=MyService',
      );

      expect(result.issuer).toBe('MyService');
      expect(result.account).toBe('user@example.com');
    });

    it('handles label without issuer prefix and no issuer param', () => {
      const result = parseOTPAuthToFields(
        'otpauth://totp/user@example.com?secret=JBSWY3DPEE',
      );

      expect(result.issuer).toBe('');
      expect(result.account).toBe('user@example.com');
    });

    it('applies defaults for missing optional parameters', () => {
      const result = parseOTPAuthToFields(
        'otpauth://totp/Test?secret=JBSWY3DPEE',
      );

      expect(result.algorithm).toBe('SHA1');
      expect(result.digits).toBe(6);
      expect(result.period).toBe(30);
    });

    it('parses URI with all parameters specified', () => {
      const result = parseOTPAuthToFields(
        'otpauth://totp/Test?secret=JBSWY3DPEE&algorithm=SHA256&digits=8&period=60&issuer=Corp',
      );

      expect(result.algorithm).toBe('SHA256');
      expect(result.digits).toBe(8);
      expect(result.period).toBe(60);
      expect(result.issuer).toBe('Corp');
    });

    it('parses hotp URIs', () => {
      const result = parseOTPAuthToFields(
        'otpauth://hotp/Service:user@test.com?secret=JBSWY3DPEE&issuer=Service',
      );

      expect(result.type).toBe('hotp');
      expect(result.issuer).toBe('Service');
      expect(result.account).toBe('user@test.com');
    });

    it('handles URL-encoded labels', () => {
      const result = parseOTPAuthToFields(
        'otpauth://totp/My%20Company:user%40example.com?secret=JBSWY3DPEE',
      );

      expect(result.issuer).toBe('My Company');
      expect(result.account).toBe('user@example.com');
    });

    it('handles SHA512 algorithm', () => {
      const result = parseOTPAuthToFields(
        'otpauth://totp/Test?secret=JBSWY3DPEE&algorithm=sha512',
      );

      expect(result.algorithm).toBe('SHA512');
    });

    it('preserves original secret string (Base32)', () => {
      const secret = 'JBSWY3DPEHPK3PXP';
      const result = parseOTPAuthToFields(
        `otpauth://totp/Test?secret=${secret}`,
      );

      expect(result.secret).toBe(secret);
    });

    it('rejects non-otpauth protocol', () => {
      expect(() => parseOTPAuthToFields('https://example.com')).toThrow(
        'must start with otpauth://',
      );
    });

    it('rejects invalid type', () => {
      expect(() =>
        parseOTPAuthToFields('otpauth://unknown/Test?secret=JBSWY3DPEE'),
      ).toThrow('type must be totp or hotp');
    });

    it('rejects missing secret', () => {
      expect(() => parseOTPAuthToFields('otpauth://totp/Test')).toThrow(
        'missing secret',
      );
    });

    it('rejects invalid Base32 secret', () => {
      expect(() =>
        parseOTPAuthToFields('otpauth://totp/Test?secret=!!!INVALID!!!'),
      ).toThrow();
    });

    it('rejects unsupported algorithm', () => {
      expect(() =>
        parseOTPAuthToFields(
          'otpauth://totp/Test?secret=JBSWY3DPEE&algorithm=MD5',
        ),
      ).toThrow('unsupported algorithm');
    });

    it('rejects invalid digit count', () => {
      expect(() =>
        parseOTPAuthToFields(
          'otpauth://totp/Test?secret=JBSWY3DPEE&digits=4',
        ),
      ).toThrow('digits must be 6 or 8');
    });

    it('rejects non-positive period', () => {
      expect(() =>
        parseOTPAuthToFields(
          'otpauth://totp/Test?secret=JBSWY3DPEE&period=0',
        ),
      ).toThrow('period must be a positive number');
    });

    it('rejects negative period', () => {
      expect(() =>
        parseOTPAuthToFields(
          'otpauth://totp/Test?secret=JBSWY3DPEE&period=-30',
        ),
      ).toThrow('period must be a positive number');
    });
  });

  describe('security — no seed logging', () => {
    it('source code does not contain console.log/warn/error statements', () => {
      const source = readFileSync(
        resolve(__dirname, '../totp-engine.ts'),
        'utf-8',
      );
      // No console calls that could leak TOTP secrets
      expect(source).not.toMatch(/console\.(log|warn|info|debug|error|trace)\s*\(/);
    });

    it('source code does not log secrets or seeds explicitly', () => {
      const source = readFileSync(
        resolve(__dirname, '../totp-engine.ts'),
        'utf-8',
      );
      // No logging-related keywords near sensitive data
      expect(source).not.toMatch(/log.*secret/i);
      expect(source).not.toMatch(/log.*seed/i);
      expect(source).not.toMatch(/log.*key/i);
      expect(source).not.toMatch(/print.*secret/i);
    });
  });
});
