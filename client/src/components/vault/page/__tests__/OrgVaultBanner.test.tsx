// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * OrgVaultBanner tests — all branches of the pure banner switch:
 * early-null (personal workspace / locked), resolve-error alert,
 * none+canManage setup card, none+member alert, pending alert,
 * ready+canManage grant card, busy spinner, and grant-message override.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OrgVaultBanner } from "../OrgVaultBanner";

type Props = React.ComponentProps<typeof OrgVaultBanner>;

function makeProps(overrides: Partial<Props> = {}): Props {
  return {
    isPersonalWorkspace: false,
    isUnlocked: true,
    orgVault: null,
    orgResolveError: null,
    orgSetupBusy: false,
    orgGrantMessage: null,
    onRunOrgResolve: vi.fn(),
    onSetupSharedVault: vi.fn(),
    onGrantPendingMembers: vi.fn(),
    ...overrides,
  };
}

const readyAccess = {} as never;

describe("OrgVaultBanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Early null ───────────────────────────────────────────────────

  it("renders nothing in a personal workspace", () => {
    const { container } = render(
      <OrgVaultBanner
        {...makeProps({
          isPersonalWorkspace: true,
          orgVault: { kind: "pending" },
        })}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing while the vault is locked", () => {
    const { container } = render(
      <OrgVaultBanner
        {...makeProps({ isUnlocked: false, orgVault: { kind: "pending" } })}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when there is no org vault state and no error", () => {
    const { container } = render(
      <OrgVaultBanner
        {...makeProps({ orgVault: null, orgResolveError: null })}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  // ── Resolve error ────────────────────────────────────────────────

  it("shows the resolve-error alert with a retry button", () => {
    const props = makeProps({
      orgVault: null,
      orgResolveError: new Error("boom"),
    });
    render(<OrgVaultBanner {...props} />);
    expect(screen.getByText("vault.org.resolveError")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /vault\.org\.retry/ }));
    expect(props.onRunOrgResolve).toHaveBeenCalledTimes(1);
  });

  // ── kind: none ───────────────────────────────────────────────────

  it("shows the setup card for managers when no shared vault exists", () => {
    const props = makeProps({
      orgVault: { kind: "none", canManage: true },
    });
    render(<OrgVaultBanner {...props} />);
    expect(screen.getByText("vault.org.setupTitle")).toBeInTheDocument();
    expect(screen.getByText("vault.org.setupDesc")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: /vault\.org\.setupButton/ }),
    );
    expect(props.onSetupSharedVault).toHaveBeenCalledTimes(1);
  });

  it("shows the member alert (no setup card) when the viewer cannot manage", () => {
    render(
      <OrgVaultBanner
        {...makeProps({ orgVault: { kind: "none", canManage: false } })}
      />,
    );
    expect(screen.getByText("vault.org.noneMember")).toBeInTheDocument();
    expect(screen.queryByText("vault.org.setupTitle")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  // ── kind: pending ────────────────────────────────────────────────

  it("shows the pending alert with a check-again button", () => {
    const props = makeProps({ orgVault: { kind: "pending" } });
    render(<OrgVaultBanner {...props} />);
    expect(screen.getByText("vault.org.pending")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: /vault\.org\.checkAgain/ }),
    );
    expect(props.onRunOrgResolve).toHaveBeenCalledTimes(1);
  });

  // ── kind: ready ──────────────────────────────────────────────────

  it("shows the grant card with the default description for managers", () => {
    const props = makeProps({
      orgVault: { kind: "ready", canManage: true, access: readyAccess },
    });
    render(<OrgVaultBanner {...props} />);
    expect(screen.getByText("vault.org.grantTitle")).toBeInTheDocument();
    expect(screen.getByText("vault.org.grantDesc")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: /vault\.org\.grantButton/ }),
    );
    expect(props.onGrantPendingMembers).toHaveBeenCalledTimes(1);
  });

  it("shows no grant card for ready non-managers", () => {
    render(
      <OrgVaultBanner
        {...makeProps({
          orgVault: { kind: "ready", canManage: false, access: readyAccess },
        })}
      />,
    );
    expect(screen.queryByText("vault.org.grantTitle")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("overrides the grant description with orgGrantMessage", () => {
    render(
      <OrgVaultBanner
        {...makeProps({
          orgVault: { kind: "ready", canManage: true, access: readyAccess },
          orgGrantMessage: "Granted access to 2 members.",
        })}
      />,
    );
    expect(
      screen.getByText("Granted access to 2 members."),
    ).toBeInTheDocument();
    expect(screen.queryByText("vault.org.grantDesc")).toBeNull();
  });

  // ── Busy spinner ─────────────────────────────────────────────────

  it("disables the setup button and shows a spinner while busy", () => {
    render(
      <OrgVaultBanner
        {...makeProps({
          orgVault: { kind: "none", canManage: true },
          orgSetupBusy: true,
        })}
      />,
    );
    const btn = screen.getByRole("button", {
      name: /vault\.org\.setupButton/,
    });
    expect(btn).toBeDisabled();
    expect(btn.querySelector(".animate-spin")).not.toBeNull();
  });

  it("disables the grant button and shows a spinner while busy", () => {
    render(
      <OrgVaultBanner
        {...makeProps({
          orgVault: { kind: "ready", canManage: true, access: readyAccess },
          orgSetupBusy: true,
        })}
      />,
    );
    const btn = screen.getByRole("button", {
      name: /vault\.org\.grantButton/,
    });
    expect(btn).toBeDisabled();
    expect(btn.querySelector(".animate-spin")).not.toBeNull();
  });
});
