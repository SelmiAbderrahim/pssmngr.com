// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Escrow recovery + rewrap fallback in resolveOrgSharedVault.
 *
 * The stored shared-vault envelope is bound to ONE device X25519 key. When
 * this browser can't unwrap it (lost IndexedDB / re-enrolled device), the
 * resolve path must: try every escrowed device key, adopt the one that works,
 * and only if ALL deterministic attempts fail flag the membership for re-wrap
 * and land in "pending" — never the destructive error banner.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  trpcQuery: vi.fn(),
  trpcMutation: vi.fn(),
  unwrapSharedVaultKey: vi.fn(),
  wrapSharedVaultKeyForSelf: vi.fn(),
  cacheSharedVaultKey: vi.fn(),
  fetchMyDevicesWithEscrow: vi.fn(),
  decryptEscrowBlob: vi.fn(),
  adoptEscrowedDevice: vi.fn(),
  backfillEscrowIfNeeded: vi.fn(),
  getDecryptedPrivateKey: vi.fn(),
  ensureDeviceSigningKey: vi.fn(),
  enrollDevice: vi.fn(),
  getVaultKey: vi.fn(),
}));

vi.mock("@/lib/api/trpc", () => ({
  trpcQuery: mocks.trpcQuery,
  trpcMutation: mocks.trpcMutation,
}));
vi.mock("@/services/shared-vault-crypto", () => ({
  unwrapSharedVaultKey: mocks.unwrapSharedVaultKey,
  cacheSharedVaultKey: mocks.cacheSharedVaultKey,
  createSharedVaultKey: vi.fn(),
  wrapSharedVaultKeyForMember: vi.fn(),
  wrapSharedVaultKeyForSelf: mocks.wrapSharedVaultKeyForSelf,
}));
vi.mock("@/services/keypair-manager", () => ({
  fetchMyDevicesWithEscrow: mocks.fetchMyDevicesWithEscrow,
  decryptEscrowBlob: mocks.decryptEscrowBlob,
  adoptEscrowedDevice: mocks.adoptEscrowedDevice,
  backfillEscrowIfNeeded: mocks.backfillEscrowIfNeeded,
  getDecryptedPrivateKey: mocks.getDecryptedPrivateKey,
  ensureDeviceSigningKey: mocks.ensureDeviceSigningKey,
  enrollDevice: mocks.enrollDevice,
}));
vi.mock("@/lib/vault-keys", () => ({ getVaultKey: mocks.getVaultKey }));
vi.mock("@/services/vault-crypto", () => ({ vaultCrypto: {} }));

import { resolveOrgSharedVault } from "@/services/org-shared-vault";

const WRAPPED = {
  wrappedKey: "wk",
  wrappedKeyNonce: "n",
  wrappedKeyAuthTag: "at",
  ephemeralPublicKey: "epk",
  senderSignature: "sig",
  senderSigningPublicKeys: ["spk"],
};

const MEMBER_RESPONSE = {
  exists: true,
  canManage: false,
  vaultId: "vault-1",
  member: true,
  permission: "edit",
  wrappedKey: WRAPPED,
};

function escrowDevice(id: string, blob: string | null) {
  return {
    id,
    deviceName: "Chrome",
    deviceType: "browser",
    publicKey: "pk",
    signingPublicKey: "spk",
    escrowedPrivateKey: blob,
    escrowedSigningPrivateKey: null,
    trusted: false,
    lastSeen: null,
  };
}

describe("resolveOrgSharedVault escrow recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getVaultKey.mockReturnValue(new Uint8Array(32).fill(1));
    mocks.trpcQuery.mockResolvedValue(MEMBER_RESPONSE);
    mocks.backfillEscrowIfNeeded.mockResolvedValue(undefined);
  });

  it("returns ready when the local device key unwraps", async () => {
    mocks.unwrapSharedVaultKey.mockResolvedValue(new Uint8Array([1]));

    const state = await resolveOrgSharedVault("org-1");

    expect(state.kind).toBe("ready");
    expect(mocks.fetchMyDevicesWithEscrow).not.toHaveBeenCalled();
    expect(mocks.backfillEscrowIfNeeded).toHaveBeenCalled();
  });

  it("recovers via an escrowed device key and adopts that identity", async () => {
    const recovered = new Uint8Array([4, 2]);
    mocks.unwrapSharedVaultKey
      .mockRejectedValueOnce(new Error("No encrypted device key found"))
      // first escrow candidate is the wrong recipient, second works
      .mockRejectedValueOnce(new Error("decryption error"))
      .mockResolvedValueOnce(recovered);
    mocks.fetchMyDevicesWithEscrow.mockResolvedValue([
      escrowDevice("dev-a", '{"a":1}'),
      escrowDevice("dev-b", '{"b":2}'),
      escrowDevice("dev-no-escrow", null),
    ]);
    mocks.decryptEscrowBlob.mockResolvedValue(new Uint8Array(32).fill(9));

    const state = await resolveOrgSharedVault("org-1");

    expect(state.kind).toBe("ready");
    expect(mocks.adoptEscrowedDevice).toHaveBeenCalledTimes(1);
    expect(mocks.adoptEscrowedDevice.mock.calls[0][0].id).toBe("dev-b");
    expect(mocks.cacheSharedVaultKey).toHaveBeenCalledWith("vault-1", recovered);
    expect(mocks.trpcMutation).not.toHaveBeenCalled(); // no rewrap request
  });

  it("flags rewrap and returns pending when every escrow candidate fails", async () => {
    mocks.unwrapSharedVaultKey.mockRejectedValue(new Error("decryption error"));
    mocks.fetchMyDevicesWithEscrow.mockResolvedValue([
      escrowDevice("dev-a", '{"a":1}'),
    ]);
    mocks.decryptEscrowBlob.mockResolvedValue(new Uint8Array(32).fill(9));
    mocks.getDecryptedPrivateKey.mockResolvedValue(new Uint8Array(32)); // enrolled
    mocks.ensureDeviceSigningKey.mockResolvedValue(undefined);
    mocks.trpcMutation.mockResolvedValue({ success: true });

    const state = await resolveOrgSharedVault("org-1");

    expect(state).toEqual({
      kind: "pending",
      canManage: false,
      vaultId: "vault-1",
    });
    expect(mocks.trpcMutation).toHaveBeenCalledWith("sharedVault", "requestRewrap", {
      vaultId: "vault-1",
    });
  });

  it("rethrows transient escrow-fetch failures without flagging rewrap", async () => {
    mocks.unwrapSharedVaultKey.mockRejectedValue(new Error("decryption error"));
    mocks.fetchMyDevicesWithEscrow.mockRejectedValue(new Error("network down"));

    await expect(resolveOrgSharedVault("org-1")).rejects.toThrow("network down");
    expect(mocks.trpcMutation).not.toHaveBeenCalled();
  });

  it("rethrows vault-locked errors without attempting recovery", async () => {
    mocks.unwrapSharedVaultKey.mockRejectedValue(
      new Error("Vault must be unlocked to access device private key"),
    );

    await expect(resolveOrgSharedVault("org-1")).rejects.toThrow(/must be unlocked/);
    expect(mocks.fetchMyDevicesWithEscrow).not.toHaveBeenCalled();
    expect(mocks.trpcMutation).not.toHaveBeenCalled();
  });
});

describe("resolveOrgSharedVault needsRewrap self-heal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getVaultKey.mockReturnValue(new Uint8Array(32).fill(1));
    mocks.trpcQuery.mockResolvedValue({ ...MEMBER_RESPONSE, needsRewrap: true });
    mocks.backfillEscrowIfNeeded.mockResolvedValue(undefined);
  });

  it("clears a stale flag by re-wrapping for self when the envelope unwraps", async () => {
    const key = new Uint8Array([7]);
    mocks.unwrapSharedVaultKey.mockResolvedValue(key);
    mocks.wrapSharedVaultKeyForSelf.mockResolvedValue(WRAPPED);
    mocks.trpcMutation.mockResolvedValue({ id: "vm-1" });

    const state = await resolveOrgSharedVault("org-1", "user-1");

    expect(state.kind).toBe("ready");
    expect(mocks.trpcMutation).toHaveBeenCalledWith("sharedVault", "addMember", {
      vaultId: "vault-1",
      member: { userId: "user-1", permission: "manage", ...WRAPPED },
    });
    expect(mocks.cacheSharedVaultKey).toHaveBeenCalledWith("vault-1", key);
  });

  it("still returns ready when the self re-wrap call fails", async () => {
    mocks.unwrapSharedVaultKey.mockResolvedValue(new Uint8Array([7]));
    mocks.wrapSharedVaultKeyForSelf.mockResolvedValue(WRAPPED);
    mocks.trpcMutation.mockRejectedValue(new Error("FORBIDDEN"));

    const state = await resolveOrgSharedVault("org-1", "user-1");

    expect(state.kind).toBe("ready");
  });

  it("does not re-request a rewrap for an already-flagged membership", async () => {
    mocks.unwrapSharedVaultKey.mockRejectedValue(new Error("decryption error"));
    mocks.fetchMyDevicesWithEscrow.mockResolvedValue([]);
    mocks.getDecryptedPrivateKey.mockResolvedValue(new Uint8Array(32));
    mocks.ensureDeviceSigningKey.mockResolvedValue(undefined);

    const state = await resolveOrgSharedVault("org-1", "user-1");

    expect(state).toEqual({ kind: "pending", canManage: false, vaultId: "vault-1" });
    expect(mocks.trpcMutation).not.toHaveBeenCalled();
  });
});
