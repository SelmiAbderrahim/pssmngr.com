// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Server-mirror tests for persistent unlock.
 *
 * The grant window must be mirrored to `device.persistentUnlockExpiresAt`
 * (timestamp only — never key material) so server-side revocation is real:
 *   - enabling persistence → setPersistentUnlockExpiry(future date)
 *   - turning the setting off / lock-and-forget → setPersistentUnlockExpiry(null)
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/vault-keys", () => {
  const store: { key: Uint8Array | null } = { key: null };
  return {
    getVaultKey: () => (store.key ? new Uint8Array(store.key) : null),
    setVaultKey: (k: Uint8Array) => {
      store.key = k;
    },
    clearVaultKey: () => {
      store.key = null;
    },
    hasVaultKey: () => store.key !== null,
  };
});

vi.mock("@/lib/vault-crypto", () => ({
  deriveVaultKey: vi.fn(),
  uint8ToBase64: vi.fn(() => ""),
  base64ToUint8: vi.fn(() => new Uint8Array(0)),
}));

const enablePersistenceMock = vi.fn(async () => undefined);
const clearPersistenceMock = vi.fn(async () => undefined);
vi.mock("@/lib/persistent-unlock", () => ({
  enablePersistence: (...args: unknown[]) => enablePersistenceMock(...args),
  clearPersistence: (...args: unknown[]) => clearPersistenceMock(...args),
}));

const getDeviceIdMock = vi.fn(async () => "dev-42");
vi.mock("@/lib/device-keys", () => ({
  getSecretKey: vi.fn(async () => new Uint8Array(16)),
  getDeviceId: (...args: unknown[]) => getDeviceIdMock(...args),
}));

const trpcMutationMock = vi.fn(async () => ({ success: true }));
vi.mock("@/lib/api/trpc", () => ({
  trpcMutation: (...args: unknown[]) => trpcMutationMock(...args),
  trpcQuery: vi.fn(),
}));

import {
  vaultCrypto,
  setPersistentUnlockDays,
} from "../vault-crypto";

async function expectExpirySync(expected: (expiresAt: unknown) => void) {
  await vi.waitFor(() => {
    const call = trpcMutationMock.mock.calls.find(
      (c) => c[0] === "device" && c[1] === "setPersistentUnlockExpiry",
    );
    expect(call).toBeTruthy();
    const input = call![2] as { deviceId: string; expiresAt: unknown };
    expect(input.deviceId).toBe("dev-42");
    expected(input.expiresAt);
  });
}

describe("persistent-unlock server expiry mirror", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear(); // default preference: 30 days
    vaultCrypto.lock();
  });

  it("setKey enables persistence AND mirrors a future expiry to the server", async () => {
    vaultCrypto.setKey(new Uint8Array(32).fill(1));
    await vi.waitFor(() => expect(enablePersistenceMock).toHaveBeenCalled());
    await expectExpirySync((expiresAt) => {
      expect(expiresAt).toBeInstanceOf(Date);
      const ms = (expiresAt as Date).getTime() - Date.now();
      // ~30 days out (default preference)
      expect(ms).toBeGreaterThan(29 * 86_400_000);
      expect(ms).toBeLessThanOrEqual(30 * 86_400_000);
    });
  });

  it("never sends key material in the mirror payload", async () => {
    vaultCrypto.setKey(new Uint8Array(32).fill(9));
    await expectExpirySync(() => undefined);
    for (const call of trpcMutationMock.mock.calls) {
      const payload = JSON.stringify(call[2] ?? {});
      expect(payload).not.toMatch(/key|password|secret/i);
    }
  });

  it("turning the setting off nulls the server column", async () => {
    await setPersistentUnlockDays(0);
    expect(clearPersistenceMock).toHaveBeenCalled();
    await expectExpirySync((expiresAt) => expect(expiresAt).toBeNull());
  });

  it("lock-and-forget nulls the server column", async () => {
    vaultCrypto.lock({ forget: true });
    await vi.waitFor(() => expect(clearPersistenceMock).toHaveBeenCalled());
    await expectExpirySync((expiresAt) => expect(expiresAt).toBeNull());
  });

  it("skips the mirror silently when the device is not enrolled", async () => {
    getDeviceIdMock.mockResolvedValue(null as never);
    vaultCrypto.setKey(new Uint8Array(32).fill(1));
    await vi.waitFor(() => expect(enablePersistenceMock).toHaveBeenCalled());
    // Give the void'd sync a tick, then confirm no mutation went out.
    await new Promise((r) => setTimeout(r, 10));
    expect(trpcMutationMock).not.toHaveBeenCalled();
  });

  it("swallows network errors (best-effort, never blocks unlock)", async () => {
    trpcMutationMock.mockRejectedValue(new Error("offline"));
    expect(() => vaultCrypto.setKey(new Uint8Array(32).fill(1))).not.toThrow();
    await vi.waitFor(() => expect(enablePersistenceMock).toHaveBeenCalled());
  });
});
