// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * TOTP Engine — RFC 6238 compliant
 *
 * Generates Time-Based One-Time Passwords using Web Crypto API.
 * Supports SHA-1, SHA-256, SHA-512 with 6 or 8 digit codes.
 */

export interface TOTPConfig {
  secret: Uint8Array;
  algorithm: 'SHA1' | 'SHA256' | 'SHA512';
  digits: 6 | 8;
  period: number;
}

const DEFAULTS: Omit<TOTPConfig, 'secret'> = {
  algorithm: 'SHA1',
  digits: 6,
  period: 30,
};

/** Map our algorithm names to Web Crypto API names */
const ALGO_MAP: Record<TOTPConfig['algorithm'], string> = {
  SHA1: 'SHA-1',
  SHA256: 'SHA-256',
  SHA512: 'SHA-512',
};

/**
 * Compute HMAC using Web Crypto API.
 */
async function hmac(
  algorithm: TOTPConfig['algorithm'],
  key: Uint8Array,
  message: Uint8Array,
): Promise<Uint8Array> {
  const hashName = ALGO_MAP[algorithm];
  if (!hashName) throw new Error(`Unsupported algorithm: ${algorithm}`);
  // Copy into fresh Uint8Array views so the byte ranges are exact and the
  // backing buffers are owned by this call (avoids passing a shared/offset
  // ArrayBuffer that some Web Crypto implementations reject).
  const keyData = new Uint8Array(key.byteLength);
  keyData.set(key);
  const messageData = new Uint8Array(message.byteLength);
  messageData.set(message);
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: hashName },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  return new Uint8Array(signature);
}

/**
 * Convert a counter value to an 8-byte big-endian buffer.
 */
function counterToBytes(counter: number): Uint8Array {
  const buf = new Uint8Array(8);
  let value = counter;
  for (let i = 7; i >= 0; i--) {
    buf[i] = value & 0xff;
    value = Math.floor(value / 256);
  }
  return buf;
}

/**
 * RFC 4226 dynamic truncation.
 */
function dynamicTruncate(hmacResult: Uint8Array): number {
  const lastByte = hmacResult[hmacResult.length - 1] ?? 0;
  const offset = lastByte & 0x0f;
  return (
    (((hmacResult[offset] ?? 0) & 0x7f) << 24) |
    (((hmacResult[offset + 1] ?? 0) & 0xff) << 16) |
    (((hmacResult[offset + 2] ?? 0) & 0xff) << 8) |
    ((hmacResult[offset + 3] ?? 0) & 0xff)
  );
}

/**
 * Generate a TOTP code per RFC 6238.
 *
 * @param config - TOTP configuration (secret is required, rest have defaults)
 * @param timestamp - Unix timestamp in seconds (defaults to now)
 * @returns The TOTP code as a zero-padded string
 */
export async function generateTOTP(
  config: Partial<TOTPConfig> & Pick<TOTPConfig, 'secret'>,
  timestamp?: number,
): Promise<string> {
  const { secret, algorithm, digits, period } = { ...DEFAULTS, ...config };
  const time = timestamp ?? Math.floor(Date.now() / 1000);
  const counter = Math.floor(time / period);

  const counterBytes = counterToBytes(counter);
  const hmacResult = await hmac(algorithm, secret, counterBytes);
  const code = dynamicTruncate(hmacResult) % 10 ** digits;

  return code.toString().padStart(digits, '0');
}

/**
 * Verify a TOTP code with clock skew tolerance.
 * Accepts codes from T-1, T, and T+1 time steps.
 *
 * @returns true if the code matches any of the 3 time windows
 */
export async function verifyTOTP(
  config: Partial<TOTPConfig> & Pick<TOTPConfig, 'secret'>,
  code: string,
  timestamp?: number,
): Promise<boolean> {
  const { period } = { ...DEFAULTS, ...config };
  const time = timestamp ?? Math.floor(Date.now() / 1000);

  for (const offset of [-1, 0, 1]) {
    const adjusted = time + offset * period;
    const expected = await generateTOTP(config, adjusted);
    if (expected === code) return true;
  }
  return false;
}

/**
 * Seconds remaining until the current TOTP code expires.
 */
export function getRemainingSeconds(period: number = 30): number {
  const now = Math.floor(Date.now() / 1000);
  return period - (now % period);
}

// --- Base32 codec (RFC 4648) ---

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Decode a Base32-encoded string to Uint8Array.
 * Handles padding and case-insensitive input.
 */
export function base32Decode(input: string): Uint8Array {
  const cleaned = input.replace(/[\s=-]/g, '').toUpperCase();
  if (cleaned.length === 0) return new Uint8Array(0);

  let bits = 0;
  let value = 0;
  let index = 0;
  const output = new Uint8Array(Math.ceil((cleaned.length * 5) / 8));

  for (const char of cleaned) {
    const charIndex = BASE32_ALPHABET.indexOf(char);
    if (charIndex === -1) throw new Error(`Invalid Base32 character: ${char}`);
    value = (value << 5) | charIndex;
    bits += 5;
    if (bits >= 8) {
      output[index++] = (value >>> (bits - 8)) & 0xff;
      bits -= 8;
    }
  }

  return output.slice(0, index);
}

/**
 * Encode a Uint8Array to Base32 string.
 */
export function base32Encode(data: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let result = '';

  for (const byte of data) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      result += BASE32_ALPHABET[(value >>> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }

  if (bits > 0) {
    result += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f];
  }

  return result;
}

/** Parsed otpauth:// URI fields for display and storage. */
export interface OTPAuthURI {
  type: 'totp' | 'hotp';
  issuer: string;
  account: string;
  secret: string;
  algorithm: string;
  digits: number;
  period: number;
}

/**
 * Parse an otpauth:// URI into structured fields for display/storage.
 * Supports both totp and hotp types. Extracts issuer and account from label.
 */
export function parseOTPAuthToFields(uri: string): OTPAuthURI {
  const url = new URL(uri);
  if (url.protocol !== 'otpauth:') {
    throw new Error('Invalid OTP URI: must start with otpauth://');
  }

  const type = url.host as OTPAuthURI['type'];
  if (type !== 'totp' && type !== 'hotp') {
    throw new Error('Invalid OTP URI: type must be totp or hotp');
  }

  const label = decodeURIComponent(url.pathname.slice(1));
  const secretParam = url.searchParams.get('secret');
  if (!secretParam) throw new Error('Invalid OTP URI: missing secret');

  // Validate base32
  base32Decode(secretParam);

  // Extract issuer and account from label ("Issuer:account" or just "account")
  const issuerParam = url.searchParams.get('issuer') || '';
  let issuer = issuerParam;
  let account = label;

  const colonIndex = label.indexOf(':');
  if (colonIndex !== -1) {
    if (!issuer) issuer = label.slice(0, colonIndex).trim();
    account = label.slice(colonIndex + 1).trim();
  }

  const algorithm = url.searchParams.get('algorithm')?.toUpperCase() || 'SHA1';
  if (!['SHA1', 'SHA256', 'SHA512'].includes(algorithm)) {
    throw new Error(`Invalid OTP URI: unsupported algorithm ${algorithm}`);
  }

  const digitsParam = url.searchParams.get('digits');
  const digits = digitsParam ? parseInt(digitsParam, 10) : 6;
  if (digits !== 6 && digits !== 8) {
    throw new Error('Invalid OTP URI: digits must be 6 or 8');
  }

  const periodParam = url.searchParams.get('period');
  const period = periodParam ? parseInt(periodParam, 10) : 30;
  if (period <= 0 || !Number.isFinite(period)) {
    throw new Error('Invalid OTP URI: period must be a positive number');
  }

  return { type, issuer, account, secret: secretParam, algorithm, digits, period };
}

/**
 * Parse an otpauth:// URI into TOTP configuration.
 * Format: otpauth://totp/Label?secret=BASE32&algorithm=SHA1&digits=6&period=30
 */
export function parseOTPAuthURI(uri: string): {
  config: Partial<TOTPConfig> & Pick<TOTPConfig, 'secret'>;
  label: string;
  issuer?: string;
} {
  const url = new URL(uri);
  if (url.protocol !== 'otpauth:') {
    throw new Error('Invalid OTP URI: must start with otpauth://');
  }
  if (url.host !== 'totp') {
    throw new Error('Invalid OTP URI: only totp type is supported');
  }

  const label = decodeURIComponent(url.pathname.slice(1));
  const secretParam = url.searchParams.get('secret');
  if (!secretParam) throw new Error('Invalid OTP URI: missing secret');

  const algorithm = (url.searchParams.get('algorithm')?.toUpperCase() || 'SHA1') as TOTPConfig['algorithm'];
  if (!['SHA1', 'SHA256', 'SHA512'].includes(algorithm)) {
    throw new Error(`Invalid OTP URI: unsupported algorithm ${algorithm}`);
  }

  const digitsParam = url.searchParams.get('digits');
  const digits = digitsParam ? (parseInt(digitsParam, 10) as TOTPConfig['digits']) : 6;
  if (digits !== 6 && digits !== 8) {
    throw new Error(`Invalid OTP URI: digits must be 6 or 8`);
  }

  const periodParam = url.searchParams.get('period');
  const period = periodParam ? parseInt(periodParam, 10) : 30;
  if (period <= 0 || !Number.isFinite(period)) {
    throw new Error('Invalid OTP URI: period must be a positive number');
  }

  const issuer = url.searchParams.get('issuer') || undefined;

  return {
    config: {
      secret: base32Decode(secretParam),
      algorithm,
      digits,
      period,
    },
    label,
    issuer,
  };
}
