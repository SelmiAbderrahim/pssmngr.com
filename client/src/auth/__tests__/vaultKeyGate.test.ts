// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { beforeEach, describe, expect, it, vi } from "vitest";

const lockMock = vi.fn();
const isUnlockedMock = vi.fn();

vi.mock("@/services/vault-crypto", () => ({
  vaultCrypto: {
    lock: lockMock,
    isUnlocked: isUnlockedMock,
  },
}));

const hasVaultKeyMock = vi.fn();
const clearVaultKeyMock = vi.fn();

vi.mock("@/lib/vault-keys", () => ({
  hasVaultKey: hasVaultKeyMock,
  clearVaultKey: clearVaultKeyMock,
}));

const isPersistentUnlockEnabledMock = vi.fn();

vi.mock("@/lib/persistent-unlock", () => ({
  isEnabled: isPersistentUnlockEnabledMock,
}));

describe("vaultKeyGate", () => {
  beforeEach(() => {
    vi.resetModules();
    lockMock.mockReset();
    isUnlockedMock.mockReset();
    hasVaultKeyMock.mockReset();
    clearVaultKeyMock.mockReset();
  });

  it("isUnlocked() delegates to vault-crypto", async () => {
    isUnlockedMock.mockReturnValue(true);
    const { isUnlocked } = await import("../vaultKeyGate");
    expect(isUnlocked()).toBe(true);
  });

  it("lock() drops the in-memory key and zeroes vault-keys store", async () => {
    const { lock } = await import("../vaultKeyGate");
    lock();
    expect(lockMock).toHaveBeenCalled();
    expect(clearVaultKeyMock).toHaveBeenCalled();
  });

  it("unlock() returns already-unlocked when vault is open", async () => {
    isUnlockedMock.mockReturnValue(true);
    const { unlock } = await import("../vaultKeyGate");
    const r = await unlock();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.via).toBe("already-unlocked");
  });

  it("uses the master-password prompt", async () => {
    // unlock() calls isUnlocked() twice on this path: once at the top
    // and once after the password prompt resolves. Mock those two
    // values; the prompt is responsible for triggering the real
    // vault-crypto.unlock() that flips isUnlocked from false → true.
    isUnlockedMock
      .mockReturnValueOnce(false) // initial check
      .mockReturnValue(true); // after password derive
    const { unlock, registerMasterPasswordPrompt } =
      await import("../vaultKeyGate");
    registerMasterPasswordPrompt(async () => "correct-master");
    const r = await unlock();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.via).toBe("password");
  });

  it("requireUnlocked throws VAULT_LOCKED when user cancels", async () => {
    isUnlockedMock.mockReturnValue(false);
    const { requireUnlocked, registerMasterPasswordPrompt } = await import(
      "../vaultKeyGate"
    );
    registerMasterPasswordPrompt(async () => null);
    await expect(requireUnlocked()).rejects.toMatchObject({ code: "VAULT_LOCKED" });
  });

  it("isKeyPersistedAnywhere() reflects the real persistent-unlock state", async () => {
    isPersistentUnlockEnabledMock.mockResolvedValueOnce(false);
    const { isKeyPersistedAnywhere } = await import("../vaultKeyGate");
    expect(await isKeyPersistedAnywhere()).toBe(false);
    isPersistentUnlockEnabledMock.mockResolvedValueOnce(true);
    expect(await isKeyPersistedAnywhere()).toBe(true);
  });

  it("assertLocked() throws if vault-keys still holds material", async () => {
    hasVaultKeyMock.mockReturnValue(true);
    const { assertLocked } = await import("../vaultKeyGate");
    expect(() => assertLocked()).toThrow(/invariant violated/);
  });

  it("does not write the key to localStorage on unlock", async () => {
    isUnlockedMock.mockReturnValueOnce(false).mockReturnValue(true);
    const { unlock, registerMasterPasswordPrompt } = await import("../vaultKeyGate");
    registerMasterPasswordPrompt(async () => "correct-master");
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");
    await unlock();
    expect(setItemSpy).not.toHaveBeenCalled();
    setItemSpy.mockRestore();
  });
});
