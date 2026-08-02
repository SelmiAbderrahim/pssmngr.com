// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors

import { describe, expect, it, vi } from "vitest";
import { uint8ToBase64 } from "@/lib/vault-crypto";

const mocks = vi.hoisted(() => ({
  vaultKey: new Uint8Array(),
  senderPrivateKey: new Uint8Array(),
  senderSigningPrivateKey: new Uint8Array(),
  recipientPrivateKey: new Uint8Array(),
  useRecipientKey: false,
  query: vi.fn(),
  unwrapKey: vi.fn(),
  wrapKeyForRecipient: vi.fn(),
  unwrapKeyFromEnvelope: vi.fn(),
  decryptItem: vi.fn(),
  fetchMyDevicesWithEscrow: vi.fn(),
  decryptEscrowBlob: vi.fn(),
}));

vi.mock("@pssmngr/crypto", () => ({
  unwrapKey: mocks.unwrapKey,
  wrapKeyForRecipient: mocks.wrapKeyForRecipient,
  unwrapKeyFromEnvelope: mocks.unwrapKeyFromEnvelope,
  decryptItem: mocks.decryptItem,
}));

vi.mock("@/lib/vault-keys", () => ({
  getVaultKey: () => new Uint8Array(mocks.vaultKey),
}));

vi.mock("../keypair-manager", () => ({
  ensureDeviceSigningKey: vi.fn().mockResolvedValue(undefined),
  getDecryptedPrivateKey: vi.fn(async () =>
    new Uint8Array(
      mocks.useRecipientKey
        ? mocks.recipientPrivateKey
        : mocks.senderPrivateKey,
    ),
  ),
  getDecryptedSigningKey: vi.fn(async () =>
    new Uint8Array(mocks.senderSigningPrivateKey),
  ),
  fetchMyDevicesWithEscrow: mocks.fetchMyDevicesWithEscrow,
  decryptEscrowBlob: mocks.decryptEscrowBlob,
}));

vi.mock("@/lib/api/trpc", () => ({ trpcQuery: mocks.query }));

import {
  decryptReceivedShare,
  prepareSharePayload,
} from "../sharing-crypto";

describe("person-to-person sharing crypto", () => {
  it("unwraps and decrypts an accepted item after verifying the sender", async () => {
    const senderPrivateKey = new Uint8Array(32).fill(1);
    const recipientPublicKey = new Uint8Array(32).fill(2);
    const recipientPrivateKey = new Uint8Array(32).fill(3);
    const signingPrivateKey = new Uint8Array(64).fill(4);
    const signingPublicKey = new Uint8Array(32).fill(5);
    const vaultKey = new Uint8Array(32).fill(6);
    const dataKey = new Uint8Array(32).fill(7);
    mocks.vaultKey = new Uint8Array(vaultKey);
    mocks.senderPrivateKey = senderPrivateKey;
    mocks.senderSigningPrivateKey = signingPrivateKey;
    mocks.recipientPrivateKey = recipientPrivateKey;
    mocks.useRecipientKey = false;
    mocks.unwrapKey.mockResolvedValue(new Uint8Array(dataKey));
    mocks.wrapKeyForRecipient.mockResolvedValue({
      ephemeralPublicKey: new Uint8Array(32).fill(8),
      wrappedDataKey: new Uint8Array(32).fill(9),
      nonce: new Uint8Array(24).fill(10),
      authTag: new Uint8Array(16).fill(11),
      signature: new Uint8Array(64).fill(12),
    });

    mocks.query.mockImplementation(
      async (_router: string, procedure: string) => {
        if (procedure === "lookupRecipientByEmail") {
          return {
            userId: "recipient-1",
            publicKey: uint8ToBase64(recipientPublicKey),
          };
        }
        throw new Error(`Unexpected query: ${procedure}`);
      },
    );

    const share = await prepareSharePayload(
      "recipient@example.test",
      uint8ToBase64(new Uint8Array(32).fill(13)),
      uint8ToBase64(new Uint8Array(24).fill(14)),
      uint8ToBase64(new Uint8Array(16).fill(15)),
    );

    const plaintext = { title: "Shared login", username: "alice" };
    mocks.unwrapKeyFromEnvelope
      .mockRejectedValueOnce(new Error("wrong recipient device"))
      .mockResolvedValue(new Uint8Array(dataKey));
    mocks.fetchMyDevicesWithEscrow.mockResolvedValue([
      {
        id: "recipient-device",
        escrowedPrivateKey: "opaque-escrow",
      },
    ]);
    mocks.decryptEscrowBlob.mockResolvedValue(
      new Uint8Array(recipientPrivateKey),
    );
    mocks.decryptItem.mockResolvedValue(
      new TextEncoder().encode(JSON.stringify(plaintext)),
    );

    mocks.useRecipientKey = true;
    mocks.query.mockResolvedValue({
      id: "share-1",
      recipientUserId: "recipient-1",
      wrappedKey: share.wrappedKey,
      wrappedKeyNonce: share.wrappedKeyNonce,
      wrappedKeyAuthTag: share.wrappedKeyAuthTag,
      senderSignature: share.senderSignature,
      permission: "view",
      item: {
        id: "item-1",
        itemType: "login",
        ciphertext: uint8ToBase64(new Uint8Array(32).fill(16)),
        nonce: uint8ToBase64(new Uint8Array(24).fill(17)),
        authTag: uint8ToBase64(new Uint8Array(16).fill(18)),
        version: 1,
        createdAt: "2026-08-02T00:00:00.000Z",
        updatedAt: "2026-08-02T00:00:00.000Z",
      },
      senderDevices: [
        {
          publicKey: null,
          signingPublicKey: uint8ToBase64(signingPublicKey),
        },
      ],
    });

    await expect(decryptReceivedShare("share-1")).resolves.toMatchObject({
      permission: "view",
      decrypted: plaintext,
    });
    expect(mocks.unwrapKeyFromEnvelope).toHaveBeenCalledTimes(2);
    expect(mocks.decryptEscrowBlob).toHaveBeenCalledOnce();
    expect(mocks.decryptItem).toHaveBeenCalledOnce();
  });
});
