// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * R4 regression test: `restoreVaultKeyIfPossible` is the seam the auth gate
 * awaits before dispatching `ready`. When a valid wrap exists AND verifies
 * against the sentinel, it MUST call `setKey` before returning so
 * WorkspaceKeyedOutlet children mount already-unlocked.
 *
 * Also covers the server-side revocation check: a grant
 * revoked from another session (`device.persistentUnlockExpiresAt` null or
 * past) must clear the local wrap and fall through to the unlock gate.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tryRestoreMock = vi.fn();
const clearPersistenceMock = vi.fn();

vi.mock("@/lib/persistent-unlock", () => ({
  tryRestore: tryRestoreMock,
  clearPersistence: clearPersistenceMock,
}));

const setKeyMock = vi.fn();
const isUnlockedMock = vi.fn();
const verifyMock = vi.fn();

vi.mock("@/services/vault-crypto", () => ({
  vaultCrypto: {
    setKey: setKeyMock,
    isUnlocked: isUnlockedMock,
    verifyVaultKeyWithKey: verifyMock,
  },
}));

const getDeviceIdMock = vi.fn();
vi.mock("@/lib/device-keys", () => ({
  getDeviceId: getDeviceIdMock,
}));

const trpcQueryMock = vi.fn();
vi.mock("@/lib/api/trpc", () => ({
  trpcQuery: trpcQueryMock,
}));

beforeEach(() => {
  tryRestoreMock.mockReset();
  clearPersistenceMock.mockReset();
  setKeyMock.mockReset();
  isUnlockedMock.mockReset();
  verifyMock.mockReset();
  getDeviceIdMock.mockReset();
  trpcQueryMock.mockReset();
  // Default: enrolled device, live server grant far in the future.
  getDeviceIdMock.mockResolvedValue("dev-1");
  trpcQueryMock.mockResolvedValue({
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
  });
});

afterEach(() => {
  vi.resetModules();
});

async function load() {
  return import("../persistent-unlock-bootstrap");
}

describe("restoreVaultKeyIfPossible (R4 ordering)", () => {
  it("returns true and calls setKey BEFORE resolving when wrap verifies", async () => {
    const restored = new Uint8Array(32).fill(9);
    tryRestoreMock.mockResolvedValue(restored);
    isUnlockedMock.mockReturnValue(false);
    verifyMock.mockResolvedValue(true);

    const { restoreVaultKeyIfPossible } = await load();
    const call_order: string[] = [];
    verifyMock.mockImplementation(async () => {
      call_order.push("verify");
      return true;
    });
    setKeyMock.mockImplementation(() => {
      call_order.push("setKey");
    });

    const ok = await restoreVaultKeyIfPossible("blob");
    expect(ok).toBe(true);
    expect(call_order).toEqual(["verify", "setKey"]);
    expect(setKeyMock).toHaveBeenCalledWith(restored);
  });

  it("does NOT setKey and clears persistence on sentinel mismatch (fail closed)", async () => {
    tryRestoreMock.mockResolvedValue(new Uint8Array(32));
    isUnlockedMock.mockReturnValue(false);
    verifyMock.mockResolvedValue(false);

    const { restoreVaultKeyIfPossible } = await load();
    const ok = await restoreVaultKeyIfPossible("blob");
    expect(ok).toBe(false);
    expect(setKeyMock).not.toHaveBeenCalled();
    expect(clearPersistenceMock).toHaveBeenCalled();
  });

  it("returns false with no side effects when no wrap exists", async () => {
    tryRestoreMock.mockResolvedValue(null);
    isUnlockedMock.mockReturnValue(false);
    const { restoreVaultKeyIfPossible } = await load();
    const ok = await restoreVaultKeyIfPossible("blob");
    expect(ok).toBe(false);
    expect(setKeyMock).not.toHaveBeenCalled();
    expect(clearPersistenceMock).not.toHaveBeenCalled();
  });

  it("returns true without touching anything if already unlocked", async () => {
    isUnlockedMock.mockReturnValue(true);
    const { restoreVaultKeyIfPossible } = await load();
    const ok = await restoreVaultKeyIfPossible("blob");
    expect(ok).toBe(true);
    expect(tryRestoreMock).not.toHaveBeenCalled();
    expect(setKeyMock).not.toHaveBeenCalled();
  });

  it("returns false when no verification blob (nothing to verify against)", async () => {
    const { restoreVaultKeyIfPossible } = await load();
    expect(await restoreVaultKeyIfPossible(null)).toBe(false);
    expect(await restoreVaultKeyIfPossible(undefined)).toBe(false);
    expect(await restoreVaultKeyIfPossible("")).toBe(false);
    expect(tryRestoreMock).not.toHaveBeenCalled();
  });
});

describe("restoreVaultKeyIfPossible server revocation check", () => {
  const restored = () => new Uint8Array(32).fill(7);

  beforeEach(() => {
    tryRestoreMock.mockResolvedValue(restored());
    isUnlockedMock.mockReturnValue(false);
    verifyMock.mockResolvedValue(true);
  });

  it("clears persistence and returns false when the server column is null (revoked)", async () => {
    trpcQueryMock.mockResolvedValue({ expiresAt: null });
    const { restoreVaultKeyIfPossible } = await load();
    const ok = await restoreVaultKeyIfPossible("blob");
    expect(ok).toBe(false);
    expect(clearPersistenceMock).toHaveBeenCalled();
    expect(setKeyMock).not.toHaveBeenCalled();
    expect(trpcQueryMock).toHaveBeenCalledWith(
      "device",
      "getPersistentUnlockExpiry",
      { deviceId: "dev-1" },
    );
  });

  it("clears persistence and returns false when the server expiry is in the past", async () => {
    trpcQueryMock.mockResolvedValue({
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    });
    const { restoreVaultKeyIfPossible } = await load();
    const ok = await restoreVaultKeyIfPossible("blob");
    expect(ok).toBe(false);
    expect(clearPersistenceMock).toHaveBeenCalled();
    expect(setKeyMock).not.toHaveBeenCalled();
  });

  it("restores with a live future server expiry", async () => {
    const { restoreVaultKeyIfPossible } = await load();
    const ok = await restoreVaultKeyIfPossible("blob");
    expect(ok).toBe(true);
    expect(setKeyMock).toHaveBeenCalled();
    expect(clearPersistenceMock).not.toHaveBeenCalled();
  });

  it("fails open on network error (offline-capable; local expiry still bounds the grant)", async () => {
    trpcQueryMock.mockRejectedValue(new Error("network down"));
    const { restoreVaultKeyIfPossible } = await load();
    const ok = await restoreVaultKeyIfPossible("blob");
    expect(ok).toBe(true);
    expect(setKeyMock).toHaveBeenCalled();
    expect(clearPersistenceMock).not.toHaveBeenCalled();
  });

  it("fails open when the device is not enrolled (no deviceId)", async () => {
    getDeviceIdMock.mockResolvedValue(null);
    const { restoreVaultKeyIfPossible } = await load();
    const ok = await restoreVaultKeyIfPossible("blob");
    expect(ok).toBe(true);
    expect(trpcQueryMock).not.toHaveBeenCalled();
    expect(setKeyMock).toHaveBeenCalled();
  });
});
