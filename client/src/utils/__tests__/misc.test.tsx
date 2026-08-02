// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { renderHook, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  clear: vi.fn(),
  invalidate: vi.fn(),
  lock: vi.fn(),
  navigate: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ clear: mocks.clear }),
}));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
  useRouter: () => ({ invalidate: mocks.invalidate }),
}));
vi.mock("@/lib/auth", () => ({ signOut: mocks.signOut }));
vi.mock("@/services/vault-crypto", () => ({
  vaultCrypto: { lock: mocks.lock },
}));

import { useSignOut } from "../misc";

describe("useSignOut", () => {
  beforeEach(() => vi.clearAllMocks());

  it("clears account-scoped memory before signing out", async () => {
    mocks.signOut.mockResolvedValue(undefined);
    const { result } = renderHook(() => useSignOut());

    await act(async () => result.current());

    expect(mocks.lock).toHaveBeenCalledOnce();
    expect(mocks.clear).toHaveBeenCalledOnce();
    expect(mocks.signOut).toHaveBeenCalledOnce();
    expect(mocks.lock.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.signOut.mock.invocationCallOrder[0]!,
    );
    expect(mocks.navigate).toHaveBeenCalledWith({ to: "/login" });
  });
});
