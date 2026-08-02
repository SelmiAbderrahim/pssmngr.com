// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { useVaultCrypto } from "../useVaultCrypto";

const mockSubscribe = vi.fn();
const mockUnlock = vi.fn();
const mockLock = vi.fn();
const mockIsUnlocked = vi.fn();
const mockResetAutoLock = vi.fn();
const mockEncryptItem = vi.fn();
const mockDecryptItem = vi.fn();

vi.mock("@/services/vault-crypto", () => ({
  vaultCrypto: {
    subscribe: (...args: unknown[]) => mockSubscribe(...args),
    unlock: (...args: unknown[]) => mockUnlock(...args),
    lock: (...args: unknown[]) => mockLock(...args),
    isUnlocked: () => mockIsUnlocked(),
    resetAutoLock: () => mockResetAutoLock(),
    encryptItem: (...args: unknown[]) => mockEncryptItem(...args),
    decryptItem: (...args: unknown[]) => mockDecryptItem(...args),
  },
}));

const ACTIVITY_EVENTS = ["mousedown", "keydown", "scroll", "touchstart"];

describe("useVaultCrypto", () => {
  beforeEach(() => {
    mockIsUnlocked.mockReturnValue(false);
    mockSubscribe.mockReturnValue(vi.fn());
    mockUnlock.mockResolvedValue(undefined);
    mockEncryptItem.mockResolvedValue({
      ciphertext: "ct",
      nonce: "n",
      authTag: "at",
      wrappedDataKey: "wdk",
      wrappedDataKeyNonce: "wdkn",
      wrappedDataKeyAuthTag: "wdkat",
    });
    mockDecryptItem.mockResolvedValue({ username: "alice" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns initial state from vaultCrypto", () => {
    mockIsUnlocked.mockReturnValue(false);
    const { result } = renderHook(() => useVaultCrypto());
    expect(result.current.isUnlocked).toBe(false);
    expect(result.current.isUnlocking).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("returns isUnlocked true when vault is already unlocked", () => {
    mockIsUnlocked.mockReturnValue(true);
    const { result } = renderHook(() => useVaultCrypto());
    expect(result.current.isUnlocked).toBe(true);
  });

  it("subscribes to vault state changes on mount", () => {
    renderHook(() => useVaultCrypto());
    expect(mockSubscribe).toHaveBeenCalledTimes(1);
    expect(mockSubscribe).toHaveBeenCalledWith(expect.any(Function));
  });

  it("unsubscribes on unmount", () => {
    const unsubscribe = vi.fn();
    mockSubscribe.mockReturnValue(unsubscribe);
    const { unmount } = renderHook(() => useVaultCrypto());
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("unlock success sets isUnlocking then clears it", async () => {
    const { result } = renderHook(() => useVaultCrypto());
    expect(result.current.isUnlocking).toBe(false);

    await act(async () => {
      await result.current.unlock("password", new Uint8Array([1, 2, 3]));
    });

    expect(mockUnlock).toHaveBeenCalledWith(
      "password",
      new Uint8Array([1, 2, 3]),
      undefined
    );
    expect(result.current.isUnlocking).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("unlock with secretKey passes it through", async () => {
    const { result } = renderHook(() => useVaultCrypto());
    const salt = new Uint8Array([1]);
    const secretKey = new Uint8Array([9, 8, 7]);

    await act(async () => {
      await result.current.unlock("pass", salt, secretKey);
    });

    expect(mockUnlock).toHaveBeenCalledWith("pass", salt, secretKey);
  });

  it("unlock failure sets error and re-throws", async () => {
    mockUnlock.mockRejectedValue(new Error("Wrong password"));
    const { result } = renderHook(() => useVaultCrypto());

    let caught: unknown;
    await act(async () => {
      try {
        await result.current.unlock("bad", new Uint8Array([1]));
      } catch (err) {
        caught = err;
      }
    });

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe("Wrong password");
    expect(result.current.isUnlocking).toBe(false);
    expect(result.current.error).toBe("Wrong password");
  });

  it("unlock failure with non-Error sets generic message", async () => {
    mockUnlock.mockRejectedValue("string error");
    const { result } = renderHook(() => useVaultCrypto());

    let caught: unknown;
    await act(async () => {
      try {
        await result.current.unlock("bad", new Uint8Array([1]));
      } catch (err) {
        caught = err;
      }
    });

    expect(caught).toBe("string error");
    expect(result.current.error).toBe("Failed to unlock vault");
  });

  it("lock calls vaultCrypto.lock", () => {
    const { result } = renderHook(() => useVaultCrypto());
    act(() => {
      result.current.lock();
    });
    expect(mockLock).toHaveBeenCalledTimes(1);
  });

  it("registers activity event listeners when unlocked", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    mockIsUnlocked.mockReturnValue(true);
    renderHook(() => useVaultCrypto());

    for (const event of ACTIVITY_EVENTS) {
      expect(addSpy).toHaveBeenCalledWith(event, expect.any(Function), {
        passive: true,
      });
    }
    addSpy.mockRestore();
  });

  it("does not register activity events when locked", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    mockIsUnlocked.mockReturnValue(false);
    renderHook(() => useVaultCrypto());

    for (const event of ACTIVITY_EVENTS) {
      const calls = addSpy.mock.calls.filter(([e]) => e === event);
      expect(calls).toHaveLength(0);
    }
    addSpy.mockRestore();
  });

  it("cleans up activity event listeners on unmount when unlocked", () => {
    const removeSpy = vi.spyOn(window, "removeEventListener");
    mockIsUnlocked.mockReturnValue(true);
    const { unmount } = renderHook(() => useVaultCrypto());
    unmount();

    for (const event of ACTIVITY_EVENTS) {
      expect(removeSpy).toHaveBeenCalledWith(event, expect.any(Function));
    }
    removeSpy.mockRestore();
  });

  it("activity events call resetAutoLock", () => {
    mockIsUnlocked.mockReturnValue(true);
    renderHook(() => useVaultCrypto());

    act(() => {
      window.dispatchEvent(new Event("mousedown"));
    });

    expect(mockResetAutoLock).toHaveBeenCalled();
  });

  it("encryptItem delegates to vaultCrypto.encryptItem", async () => {
    const plaintext = { username: "alice", password: "secret" };
    const { result } = renderHook(() => useVaultCrypto());

    let encrypted: unknown;
    await act(async () => {
      encrypted = await result.current.encryptItem(plaintext);
    });

    expect(mockEncryptItem).toHaveBeenCalledWith(plaintext);
    expect(encrypted).toEqual({
      ciphertext: "ct",
      nonce: "n",
      authTag: "at",
      wrappedDataKey: "wdk",
      wrappedDataKeyNonce: "wdkn",
      wrappedDataKeyAuthTag: "wdkat",
    });
  });

  it("decryptItem delegates to vaultCrypto.decryptItem", async () => {
    const payload = {
      ciphertext: "ct",
      nonce: "n",
      authTag: "at",
      wrappedDataKey: "wdk",
      wrappedDataKeyNonce: "wdkn",
      wrappedDataKeyAuthTag: "wdkat",
    };
    const { result } = renderHook(() => useVaultCrypto());

    let decrypted: unknown;
    await act(async () => {
      decrypted = await result.current.decryptItem(payload);
    });

    expect(mockDecryptItem).toHaveBeenCalledWith(payload);
    expect(decrypted).toEqual({ username: "alice" });
  });
});
