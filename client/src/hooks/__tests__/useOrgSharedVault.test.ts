// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * useOrgSharedVault — resolve policy tests
 *
 * The vault page renders a destructive "Couldn't check your shared vault
 * access." banner from `orgResolveError`. These tests pin the policy that
 * keeps that banner out of normal operation:
 *
 *  - transient failures retry silently (error only after 3 consecutive fails)
 *  - "vault must be unlocked" failures re-open the unlock prompt, never error
 *  - an already-ready state survives a failed re-check
 *  - locked / personal workspaces never resolve
 *  - workspace switches discard stale in-flight results
 */
import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { useOrgSharedVault } from "../useOrgSharedVault";
import type { OrgVaultState } from "@/services/org-shared-vault";

const mockResolve = vi.fn();
const mockAutoWrap = vi.fn();

vi.mock("@/services/org-shared-vault", () => ({
  resolveOrgSharedVault: (...args: unknown[]) => mockResolve(...args),
  autoWrapPendingMembers: (...args: unknown[]) => mockAutoWrap(...args),
}));

const READY: OrgVaultState = {
  kind: "ready",
  canManage: false,
  access: { vaultId: "sv1", key: new Uint8Array(32), permission: "edit" },
};

type Props = {
  activeWorkspaceId: string | null;
  isPersonalWorkspace: boolean;
  isUnlocked: boolean;
  onUnlockRequired?: () => void;
};

const defaultProps: Props = {
  activeWorkspaceId: "org1",
  isPersonalWorkspace: false,
  isUnlocked: true,
};

function render(props: Partial<Props> = {}) {
  return renderHook((p: Props) => useOrgSharedVault(p), {
    initialProps: { ...defaultProps, ...props },
  });
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("useOrgSharedVault", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockResolve.mockReset();
    mockAutoWrap.mockReset().mockResolvedValue({ granted: 0, pending: 0 });
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("resolves to ready with no error", async () => {
    mockResolve.mockResolvedValue(READY);
    const { result } = render();
    await flush();
    expect(result.current.orgVault).toEqual(READY);
    expect(result.current.orgResolveError).toBeNull();
  });

  it("auto-wraps pending members when ready and canManage", async () => {
    const managed = { ...READY, canManage: true };
    mockResolve.mockResolvedValue(managed);
    const { result } = render();
    await flush();
    expect(result.current.orgVault).toEqual(managed);
    expect(mockAutoWrap).toHaveBeenCalledWith("sv1", managed.access.key);
  });

  it("retries silently after a transient failure — no error surfaces", async () => {
    mockResolve
      .mockRejectedValueOnce(new Error("Failed to fetch"))
      .mockResolvedValue(READY);
    const { result } = render();
    await flush();
    // first attempt failed; still silent
    expect(result.current.orgResolveError).toBeNull();
    expect(result.current.orgVault).toBeNull();
    // quick retry (~1s) succeeds
    await advance(1_000);
    expect(result.current.orgVault).toEqual(READY);
    expect(result.current.orgResolveError).toBeNull();
  });

  it("surfaces the error only after 3 consecutive failures", async () => {
    mockResolve.mockRejectedValue(new Error("boom"));
    const { result } = render();
    await flush();
    expect(result.current.orgResolveError).toBeNull();
    await advance(1_000); // failure #2
    expect(result.current.orgResolveError).toBeNull();
    await advance(3_000); // failure #3 → error
    expect(result.current.orgResolveError).toBe("boom");
    expect(result.current.orgVault).toBeNull();
    expect(mockResolve).toHaveBeenCalledTimes(3);
  });

  it("recovers from the error state via the 20s re-check", async () => {
    mockResolve.mockRejectedValue(new Error("boom"));
    const { result } = render();
    await flush();
    await advance(1_000);
    await advance(3_000);
    expect(result.current.orgResolveError).toBe("boom");
    mockResolve.mockResolvedValue(READY);
    await advance(20_000);
    expect(result.current.orgVault).toEqual(READY);
    expect(result.current.orgResolveError).toBeNull();
  });

  it("calls onUnlockRequired on a lock error instead of setting an error", async () => {
    const onUnlockRequired = vi.fn();
    mockResolve.mockRejectedValue(
      new Error("Vault must be unlocked to access device private key"),
    );
    const { result } = render({ onUnlockRequired });
    await flush();
    expect(onUnlockRequired).toHaveBeenCalledTimes(1);
    expect(result.current.orgResolveError).toBeNull();
    // no quick-retry storm while locked
    await advance(10_000);
    expect(mockResolve).toHaveBeenCalledTimes(1);
  });

  it("keeps the ready state when a later re-check fails", async () => {
    mockResolve.mockResolvedValue(READY);
    const { result } = render();
    await flush();
    expect(result.current.orgVault).toEqual(READY);

    mockResolve.mockRejectedValue(new Error("boom"));
    await act(async () => {
      await result.current.runOrgResolve();
    });
    expect(result.current.orgVault).toEqual(READY);
    expect(result.current.orgResolveError).toBeNull();
  });

  it("does not resolve while locked or in a personal workspace", async () => {
    mockResolve.mockResolvedValue(READY);
    const locked = render({ isUnlocked: false });
    await flush();
    expect(mockResolve).not.toHaveBeenCalled();
    expect(locked.result.current.orgVault).toBeNull();

    const personal = render({ isPersonalWorkspace: true });
    await flush();
    expect(mockResolve).not.toHaveBeenCalled();
    expect(personal.result.current.orgVault).toBeNull();
  });

  it("clears state when the vault locks", async () => {
    mockResolve.mockResolvedValue(READY);
    const { result, rerender } = render();
    await flush();
    expect(result.current.orgVault).toEqual(READY);
    rerender({ ...defaultProps, isUnlocked: false });
    await flush();
    expect(result.current.orgVault).toBeNull();
    expect(result.current.orgResolveError).toBeNull();
  });

  it("discards a stale in-flight failure after a workspace switch", async () => {
    let rejectFirst!: (e: Error) => void;
    mockResolve.mockImplementationOnce(
      () => new Promise((_, reject) => { rejectFirst = reject; }),
    );
    const { result, rerender } = render();
    await flush();

    mockResolve.mockResolvedValue(READY);
    rerender({ ...defaultProps, activeWorkspaceId: "org2" });
    await flush();
    expect(result.current.orgVault).toEqual(READY);

    // stale rejection from org1 must not disturb org2's state
    act(() => rejectFirst(new Error("stale")));
    await flush();
    await advance(10_000);
    expect(result.current.orgVault).toEqual(READY);
    expect(result.current.orgResolveError).toBeNull();
  });
});
