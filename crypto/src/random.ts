// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
export function generateRandomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

export function generateUUID(): string {
  const bytes = generateRandomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function secureRandom(max: number): number {
  if (max <= 0) throw new Error('max must be positive');
  if (max === 1) return 0;
  const limit = Math.floor(0x100000000 / max) * max;
  let value: number;
  do {
    const bytes = generateRandomBytes(4);
    value = new DataView(bytes.buffer).getUint32(0);
  } while (value >= limit);
  return value % max;
}

export function generateNonce(bytes: number = 24): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(bytes));
}

export function generateSalt(bytes: number = 16): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(bytes));
}

export function generateId(bytes: number = 16): string {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(buf, b => b.toString(16).padStart(2, '0')).join('');
}
