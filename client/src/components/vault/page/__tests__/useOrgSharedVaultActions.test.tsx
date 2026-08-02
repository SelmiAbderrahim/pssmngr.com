// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * useOrgSharedVaultActions tests
 *
 * Covers:
 * - setup happy path (setup → import personal items → auto-wrap → setOrgVault)
 * - import failure is swallowed (setup still succeeds)
 * - auto-wrap pending members surfaces the pending message
 * - grant outcomes: granted / pending / none
 * - errors routed through orgVaultErrorMessage (Error message + 412 hint)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useOrgSharedVaultActions } from "../useOrgSharedVaultActions";
import type { TFunction } from "i18next";

const { mockSetup, mockAutoWrap, mockImport } = vi.hoisted(() => ({
  mockSetup: vi.fn(),
  mockAutoWrap: vi.fn(),
  mockImport: vi.fn(),
}));

vi.mock("@/services/org-shared-vault", () => ({
  setupOrgSharedVault: mockSetup,
  autoWrapPendingMembers: mockAutoWrap,
  importPersonalItemsIntoSharedVault: mockImport,
}));

const VAULT = {
  id: "pv-1",
  name: "Personal",
  kdfSalt: "salt",
  encryptedVerificationBlob: "blob",
};

const KEY = new Uint8Array(32).fill(3);
const ACCESS = { vaultId: "sv-1", key: KEY, permission: "manage" as const };

const READY_ORG_VAULT = {
  kind: "ready" as const,
  canManage: true,
  access: ACCESS,
};

// The test t() returns the key so assertions are locale-independent.
const t = ((key: string) => key) as unknown as TFunction;

const setOrgVault = vi.fn();
const setError = vi.fn();

function makeArgs(
  overrides: Partial<Parameters<typeof useOrgSharedVaultActions>[0]> = {},
): Parameters<typeof useOrgSharedVaultActions>[0] {
  return {
    userId: "u-1",
    vault: VAULT,
    activeWorkspaceName: "Acme",
    orgVault: { kind: "none", canManage: true },
    setOrgVault,
    setError,
    t,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSetup.mockResolvedValue(ACCESS);
  mockImport.mockResolvedValue(2);
  mockAutoWrap.mockResolvedValue({ granted: 0, pending: 0 });
});

describe("useOrgSharedVaultActions — handleSetupSharedVault", () => {
  it("sets up the shared vault, imports personal items, and marks it ready", async () => {
    const { result } = renderHook(() => useOrgSharedVaultActions(makeArgs()));

    await act(async () => {
      await result.current.handleSetupSharedVault();
    });

    expect(mockSetup).toHaveBeenCalledWith("u-1", "Acme");
    expect(mockImport).toHaveBeenCalledWith("pv-1", "sv-1", KEY);
    expect(mockAutoWrap).toHaveBeenCalledWith("sv-1", KEY);
    expect(setOrgVault).toHaveBeenCalledWith({
      kind: "ready",
      canManage: true,
      access: ACCESS,
    });
    expect(result.current.orgGrantMessage).toBeNull();
    expect(result.current.orgSetupBusy).toBe(false);
    // only the initial setError(null) reset — no error surfaced
    expect(setError.mock.calls.every(([v]) => v === null)).toBe(true);
  });

  it("does nothing without a userId", async () => {
    const { result } = renderHook(() =>
      useOrgSharedVaultActions(makeArgs({ userId: undefined })),
    );

    await act(async () => {
      await result.current.handleSetupSharedVault();
    });

    expect(mockSetup).not.toHaveBeenCalled();
  });

  it("skips the personal import when there is no personal vault", async () => {
    const { result } = renderHook(() =>
      useOrgSharedVaultActions(makeArgs({ vault: null })),
    );

    await act(async () => {
      await result.current.handleSetupSharedVault();
    });

    expect(mockImport).not.toHaveBeenCalled();
    expect(setOrgVault).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "ready" }),
    );
  });

  it("swallows an import failure and still completes setup", async () => {
    mockImport.mockRejectedValue(new Error("import exploded"));
    const { result } = renderHook(() => useOrgSharedVaultActions(makeArgs()));

    await act(async () => {
      await result.current.handleSetupSharedVault();
    });

    expect(setOrgVault).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "ready", access: ACCESS }),
    );
    expect(setError.mock.calls.every(([v]) => v === null)).toBe(true);
  });

  it("surfaces the pending-members message when auto-wrap leaves members pending", async () => {
    mockAutoWrap.mockResolvedValue({ granted: 1, pending: 2 });
    const { result } = renderHook(() => useOrgSharedVaultActions(makeArgs()));

    await act(async () => {
      await result.current.handleSetupSharedVault();
    });

    expect(result.current.orgGrantMessage).toBe("vault.org.pendingMembers");
    expect(setOrgVault).toHaveBeenCalled();
  });

  it("reports a setup failure via orgVaultErrorMessage (Error message)", async () => {
    mockSetup.mockRejectedValue(new Error("setup boom"));
    const { result } = renderHook(() => useOrgSharedVaultActions(makeArgs()));

    await act(async () => {
      await result.current.handleSetupSharedVault();
    });

    expect(setError).toHaveBeenLastCalledWith("setup boom");
    expect(setOrgVault).not.toHaveBeenCalled();
    expect(result.current.orgSetupBusy).toBe(false);
  });

  it("maps a 412 PRECONDITION_FAILED setup error to the untrusted-device hint", async () => {
    mockSetup.mockRejectedValue({ code: "PRECONDITION_FAILED" });
    const { result } = renderHook(() => useOrgSharedVaultActions(makeArgs()));

    await act(async () => {
      await result.current.handleSetupSharedVault();
    });

    expect(setError).toHaveBeenLastCalledWith(
      "sharing.errorRecipientUntrustedDevice",
    );
  });
});

describe("useOrgSharedVaultActions — handleGrantPendingMembers", () => {
  it("is a no-op when the org vault is not ready", async () => {
    const { result } = renderHook(() =>
      useOrgSharedVaultActions(makeArgs({ orgVault: { kind: "pending" } })),
    );

    await act(async () => {
      await result.current.handleGrantPendingMembers();
    });

    expect(mockAutoWrap).not.toHaveBeenCalled();
  });

  it("reports granted members", async () => {
    mockAutoWrap.mockResolvedValue({ granted: 3, pending: 0 });
    const { result } = renderHook(() =>
      useOrgSharedVaultActions(makeArgs({ orgVault: READY_ORG_VAULT })),
    );

    await act(async () => {
      await result.current.handleGrantPendingMembers();
    });

    expect(mockAutoWrap).toHaveBeenCalledWith("sv-1", KEY);
    expect(result.current.orgGrantMessage).toBe("vault.org.grantedMembers");
  });

  it("reports still-pending members when nobody could be granted", async () => {
    mockAutoWrap.mockResolvedValue({ granted: 0, pending: 2 });
    const { result } = renderHook(() =>
      useOrgSharedVaultActions(makeArgs({ orgVault: READY_ORG_VAULT })),
    );

    await act(async () => {
      await result.current.handleGrantPendingMembers();
    });

    expect(result.current.orgGrantMessage).toBe("vault.org.pendingMembers");
  });

  it("reports that everyone already has access when nothing is granted or pending", async () => {
    mockAutoWrap.mockResolvedValue({ granted: 0, pending: 0 });
    const { result } = renderHook(() =>
      useOrgSharedVaultActions(makeArgs({ orgVault: READY_ORG_VAULT })),
    );

    await act(async () => {
      await result.current.handleGrantPendingMembers();
    });

    expect(result.current.orgGrantMessage).toBe("vault.org.noPendingMembers");
  });

  it("routes a grant failure through orgVaultErrorMessage", async () => {
    mockAutoWrap.mockRejectedValue(new Error("wrap failed"));
    const { result } = renderHook(() =>
      useOrgSharedVaultActions(makeArgs({ orgVault: READY_ORG_VAULT })),
    );

    await act(async () => {
      await result.current.handleGrantPendingMembers();
    });

    expect(setError).toHaveBeenLastCalledWith("wrap failed");
    expect(result.current.orgGrantMessage).toBeNull();
    expect(result.current.orgSetupBusy).toBe(false);
  });
});
