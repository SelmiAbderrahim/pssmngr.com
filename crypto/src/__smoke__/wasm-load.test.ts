// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { expect, test } from 'vitest';

test('argon2 WASM loads', async () => {
  const argon2 = await import('argon2-browser');
  expect(argon2).toBeDefined();
  expect(argon2.hash).toBeTypeOf('function');
});

test('libsodium WASM loads', async () => {
  const sodium = await import('libsodium-wrappers-sumo');
  await sodium.ready;
  expect(sodium.crypto_aead_xchacha20poly1305_ietf_keygen).toBeTypeOf('function');
});
