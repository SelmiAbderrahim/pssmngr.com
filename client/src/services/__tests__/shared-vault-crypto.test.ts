// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { describe, it, expect, vi, beforeEach } from "vitest";

// The client test env mocks libsodium (no real ECDH/Ed25519), so we mock the
// crypto primitive and assert the *candidate-trying loop* added to
// unwrapSharedVaultKey: the granter's correct signing key may not be first.
// Keys are real base64 so the production base64ToUint8 round-trips them.
// A plain function (not vi.fn) is used for the primitive — a rejecting vi.fn
// leaves the rejected promise in `mock.results`, which the harness flags as an
// unhandled rejection; a manual counter records call count instead.
const CORRECT_KEY = Buffer.from("correct-signer-pubkey").toString("base64");
const WRONG_1 = Buffer.from("wrong-signer-1").toString("base64");
const WRONG_2 = Buffer.from("wrong-signer-2").toString("base64");

const { state } = vi.hoisted(() => ({
  state: { calls: 0, lastPrivFirstByte: -1 as number },
}));

vi.mock("@pssmngr/crypto", () => ({
  unwrapVaultKeyForMember: async (
    _env: unknown,
    _priv: Uint8Array,
    sigKey: Uint8Array,
  ) => {
    state.calls += 1;
    state.lastPrivFirstByte = (_priv as Uint8Array)[0] ?? -1;
    const correct = Buffer.from("correct-signer-pubkey").toString("base64");
    if (Buffer.from(sigKey).toString("base64") === correct)
      return new Uint8Array([1, 2, 3, 4]);
    throw new Error("Share envelope signature verification failed");
  },
  wrapVaultKeyForMember: () => undefined,
  generateSharedVaultKey: () => undefined,
}));
vi.mock("@/services/keypair-manager", () => ({
  getDecryptedPrivateKey: async () => new Uint8Array(32),
  getDecryptedSigningKey: () => undefined,
  ensureDeviceSigningKey: () => undefined,
}));

import { unwrapSharedVaultKey } from "@/services/shared-vault-crypto";

const envelope = {
  wrappedKey: Buffer.from("wk").toString("base64"),
  wrappedKeyNonce: Buffer.from("nonce").toString("base64"),
  wrappedKeyAuthTag: Buffer.from("tag").toString("base64"),
  ephemeralPublicKey: Buffer.from("eph").toString("base64"),
  senderSignature: Buffer.from("sig").toString("base64"),
};

describe("unwrapSharedVaultKey", () => {
  beforeEach(() => {
    state.calls = 0;
  });

  it("unwraps with the legacy singular signing key", async () => {
    const key = await unwrapSharedVaultKey({
      ...envelope,
      senderSigningPublicKey: CORRECT_KEY,
    });
    expect(Array.from(key)).toEqual([1, 2, 3, 4]);
  });

  it("finds the correct key when it is not first in the candidate list", async () => {
    const key = await unwrapSharedVaultKey({
      ...envelope,
      senderSigningPublicKeys: [WRONG_1, WRONG_2, CORRECT_KEY], // real signer last
    });
    expect(Array.from(key)).toEqual([1, 2, 3, 4]);
    expect(state.calls).toBe(3); // tried all three until one verified
  });

  it("throws when no candidate verifies", async () => {
    await expect(
      unwrapSharedVaultKey({
        ...envelope,
        senderSigningPublicKeys: [WRONG_1, WRONG_2],
      }),
    ).rejects.toThrow(/signature verification failed/);
  });

  it("throws when no signing key is provided", async () => {
    await expect(
      unwrapSharedVaultKey({ ...envelope, senderSigningPublicKeys: [] }),
    ).rejects.toThrow(/missing granter signing key/);
    expect(state.calls).toBe(0);
  });

  it("uses the private-key override instead of the stored device key", async () => {
    const override = new Uint8Array(32).fill(7);
    const key = await unwrapSharedVaultKey(
      { ...envelope, senderSigningPublicKey: CORRECT_KEY },
      override,
    );
    expect(Array.from(key)).toEqual([1, 2, 3, 4]);
    expect(state.lastPrivFirstByte).toBe(7); // override reached the primitive
    // caller owns the override's lifetime — it must NOT be zeroed
    expect(override[0]).toBe(7);
  });
});
