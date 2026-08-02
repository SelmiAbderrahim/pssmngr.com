// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * autoWrapPendingMembers — role-driven auto-grant.
 *
 * For every org member who has enrolled a device but isn't yet in the shared
 * vault, wrap the shared key and grant access. The permission comes from the
 * server (role-derived); when a legacy server omits it, the client falls back
 * to the same role→permission mirror. Members without a device key are counted
 * as still-pending, never wrapped.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  trpcQuery: vi.fn(),
  trpcMutation: vi.fn(),
  wrapSharedVaultKeyForMember: vi.fn(),
}));

vi.mock("@/lib/api/trpc", () => ({
  trpcQuery: mocks.trpcQuery,
  trpcMutation: mocks.trpcMutation,
}));
vi.mock("@/services/shared-vault-crypto", () => ({
  wrapSharedVaultKeyForMember: mocks.wrapSharedVaultKeyForMember,
  createSharedVaultKey: vi.fn(),
  wrapSharedVaultKeyForSelf: vi.fn(),
  unwrapSharedVaultKey: vi.fn(),
  cacheSharedVaultKey: vi.fn(),
}));
vi.mock("@/services/keypair-manager", () => ({
  enrollDevice: vi.fn(),
  ensureDeviceSigningKey: vi.fn(),
  getDecryptedPrivateKey: vi.fn(),
  fetchMyDevicesWithEscrow: vi.fn(),
  decryptEscrowBlob: vi.fn(),
  adoptEscrowedDevice: vi.fn(),
  backfillEscrowIfNeeded: vi.fn(),
}));
vi.mock("@/lib/vault-keys", () => ({ getVaultKey: vi.fn() }));
vi.mock("@/services/vault-crypto", () => ({ vaultCrypto: {} }));

import { autoWrapPendingMembers } from "@/services/org-shared-vault";

const WRAPPED = {
  wrappedKey: "wk",
  wrappedKeyNonce: "n",
  wrappedKeyAuthTag: "at",
  ephemeralPublicKey: "epk",
  senderSignature: "sig",
};

describe("autoWrapPendingMembers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.wrapSharedVaultKeyForMember.mockResolvedValue(WRAPPED);
    mocks.trpcMutation.mockResolvedValue({ id: "vm", userId: "x" });
  });

  it("grants each device-enrolled member with the server-provided role permission; skips members with no device", async () => {
    mocks.trpcQuery.mockResolvedValue([
      { userId: "m1", role: "member", permission: "view", publicKey: "pk1" },
      { userId: "a1", role: "admin", permission: "manage", publicKey: "pk2" },
      { userId: "a2", role: "admin", permission: null, publicKey: "pk3" }, // legacy: no server permission
      { userId: "n1", role: "member", permission: null, publicKey: null }, // no device yet
    ]);

    const key = new Uint8Array(32);
    const result = await autoWrapPendingMembers("vault-1", key);

    expect(result).toEqual({ granted: 3, pending: 1 });

    // Wrapped only for members with a device public key.
    expect(mocks.wrapSharedVaultKeyForMember).toHaveBeenCalledTimes(3);
    expect(mocks.wrapSharedVaultKeyForMember).toHaveBeenCalledWith(key, "pk1");
    expect(mocks.wrapSharedVaultKeyForMember).toHaveBeenCalledWith(key, "pk2");
    expect(mocks.wrapSharedVaultKeyForMember).toHaveBeenCalledWith(key, "pk3");

    const grantedPerms = mocks.trpcMutation.mock.calls.map(
      ([, proc, input]: any[]) => [input.member.userId, input.member.permission],
    );
    // Server-provided permissions are forwarded as-is...
    expect(grantedPerms).toContainEqual(["m1", "view"]);
    expect(grantedPerms).toContainEqual(["a1", "manage"]);
    // ...and a missing server permission falls back to the role mirror (admin→manage).
    expect(grantedPerms).toContainEqual(["a2", "manage"]);
    // n1 (no device) was never granted.
    expect(grantedPerms.some(([id]: any[]) => id === "n1")).toBe(false);
  });

  it("counts a wrap failure as pending rather than throwing", async () => {
    mocks.trpcQuery.mockResolvedValue([
      { userId: "m1", role: "member", permission: "view", publicKey: "pk1" },
    ]);
    mocks.wrapSharedVaultKeyForMember.mockRejectedValueOnce(new Error("boom"));

    const result = await autoWrapPendingMembers("vault-1", new Uint8Array(32));
    expect(result).toEqual({ granted: 0, pending: 1 });
  });
});
