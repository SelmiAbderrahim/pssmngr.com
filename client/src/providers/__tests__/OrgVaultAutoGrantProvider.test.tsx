// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * OrgVaultAutoGrantProvider — background auto-grant orchestration.
 *
 * Runs only for a manager of a non-personal workspace with an unlocked vault:
 *  - vault ready → wrap pending members, expose the still-pending count;
 *  - no vault + other members → set it up, import, and grant;
 *  - non-manager / personal / locked → do nothing.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const state = vi.hoisted(() => ({
  ws: {
    activeWorkspaceId: "org1" as string | null,
    activeWorkspace: {
      name: "Team",
      isPersonal: false,
      memberCount: 3,
      role: "owner",
      isDefault: false,
    } as any,
    isAdminOrOwner: true,
  },
  crypto: { isUnlocked: true },
  auth: { user: { id: "u1" } as { id: string } | null },
}));

const services = vi.hoisted(() => ({
  resolveOrgSharedVault: vi.fn(),
  autoWrapPendingMembers: vi.fn(),
  setupImportAndGrantOrgSharedVault: vi.fn(),
}));

vi.mock("@/providers/WorkspaceContext", () => ({
  useWorkspaceContext: () => state.ws,
}));
vi.mock("@/hooks/useVaultCrypto", () => ({
  useVaultCrypto: () => state.crypto,
}));
vi.mock("@/providers/AuthProvider", () => ({
  useAuthState: () => state.auth,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (_k: string, d: string) => d }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
vi.mock("@/services/org-shared-vault", () => ({
  resolveOrgSharedVault: services.resolveOrgSharedVault,
  autoWrapPendingMembers: services.autoWrapPendingMembers,
  setupImportAndGrantOrgSharedVault: services.setupImportAndGrantOrgSharedVault,
}));

import {
  OrgVaultAutoGrantProvider,
  usePendingVaultAccess,
} from "@/providers/OrgVaultAutoGrantProvider";

function Probe() {
  const { pendingAccessCount } = usePendingVaultAccess();
  return <div data-testid="count">{pendingAccessCount}</div>;
}

function renderProvider() {
  return render(
    <OrgVaultAutoGrantProvider>
      <Probe />
    </OrgVaultAutoGrantProvider>,
  );
}

describe("OrgVaultAutoGrantProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset to the "manager, unlocked, team workspace" baseline.
    state.ws = {
      activeWorkspaceId: "org1",
      activeWorkspace: {
        name: "Team",
        isPersonal: false,
        memberCount: 3,
        role: "owner",
        isDefault: false,
      },
      isAdminOrOwner: true,
    };
    state.crypto = { isUnlocked: true };
    state.auth = { user: { id: "u1" } };
  });

  it("wraps pending members when the vault is ready and exposes the pending count", async () => {
    services.resolveOrgSharedVault.mockResolvedValue({
      kind: "ready",
      canManage: true,
      access: { vaultId: "v1", key: new Uint8Array(32), permission: "manage" },
    });
    services.autoWrapPendingMembers.mockResolvedValue({ granted: 2, pending: 1 });

    renderProvider();

    await waitFor(() =>
      expect(services.autoWrapPendingMembers).toHaveBeenCalledWith(
        "v1",
        expect.any(Uint8Array),
      ),
    );
    await waitFor(() =>
      expect(screen.getByTestId("count").textContent).toBe("1"),
    );
    expect(services.setupImportAndGrantOrgSharedVault).not.toHaveBeenCalled();
  });

  it("sets up + imports + grants when there is no vault yet but the org has members", async () => {
    services.resolveOrgSharedVault.mockResolvedValue({
      kind: "none",
      canManage: true,
    });
    services.setupImportAndGrantOrgSharedVault.mockResolvedValue({
      access: { vaultId: "v-new", key: new Uint8Array(32), permission: "manage" },
      granted: 2,
      pending: 0,
    });

    renderProvider();

    await waitFor(() =>
      expect(services.setupImportAndGrantOrgSharedVault).toHaveBeenCalledWith(
        "u1",
        "Team",
      ),
    );
  });

  it("does nothing for a non-manager", async () => {
    state.ws.isAdminOrOwner = false;
    renderProvider();
    // Give any effect a chance to (not) fire.
    await new Promise((r) => setTimeout(r, 0));
    expect(services.resolveOrgSharedVault).not.toHaveBeenCalled();
    expect(screen.getByTestId("count").textContent).toBe("0");
  });

  it("does nothing on a personal workspace", async () => {
    state.ws.activeWorkspace = {
      name: "My Organization",
      isPersonal: true,
      memberCount: 1,
      role: "owner",
      isDefault: true,
    };
    renderProvider();
    await new Promise((r) => setTimeout(r, 0));
    expect(services.resolveOrgSharedVault).not.toHaveBeenCalled();
  });

  it("does nothing while the vault is locked", async () => {
    state.crypto = { isUnlocked: false };
    renderProvider();
    await new Promise((r) => setTimeout(r, 0));
    expect(services.resolveOrgSharedVault).not.toHaveBeenCalled();
  });
});
