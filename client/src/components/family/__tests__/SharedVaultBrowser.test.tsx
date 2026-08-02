// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * SharedVaultBrowser Component Tests
 *
 * Covers:
 * - Loading skeleton state
 * - Empty state (organizer vs non-organizer)
 * - Vault list rendering with names, dates, member counts
 * - Vault click triggers onVaultSelect
 * - Create button visibility based on organizer role
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SharedVaultBrowser } from "../SharedVaultBrowser";
import type { SharedVault } from "@/types/family";

function makeVault(overrides: Partial<SharedVault> = {}): SharedVault {
  return {
    id: "vault-1",
    name: "Streaming Services",
    memberCount: 3,
    createdAt: "2025-03-01T00:00:00Z",
    ...overrides,
  };
}

describe("SharedVaultBrowser", () => {
  const onCreateClick = vi.fn();
  const onVaultSelect = vi.fn();

  const baseProps = {
    vaults: [] as SharedVault[],
    isOrganizer: true,
    isLoading: false,
    onCreateClick,
    onVaultSelect,
  };

  beforeEach(() => vi.clearAllMocks());

  // ── Loading ────────────────────────────────────────────────────────

  it("renders loading skeleton when isLoading", () => {
    render(<SharedVaultBrowser {...baseProps} isLoading />);
    expect(screen.queryByText("family.sharedVaults.title")).not.toBeInTheDocument();
  });

  // ── Empty state ───────────────────────────────────────────────────

  it("shows empty state message", () => {
    render(<SharedVaultBrowser {...baseProps} vaults={[]} />);
    expect(screen.getByText("family.sharedVaults.empty")).toBeInTheDocument();
  });

  it("shows create button in empty state for organizer", () => {
    render(<SharedVaultBrowser {...baseProps} vaults={[]} isOrganizer />);
    const createBtn = screen.getByText("family.sharedVaults.createFirst");
    fireEvent.click(createBtn);
    expect(onCreateClick).toHaveBeenCalledOnce();
  });

  it("hides create button in empty state for non-organizer", () => {
    render(<SharedVaultBrowser {...baseProps} vaults={[]} isOrganizer={false} />);
    expect(screen.queryByText("family.sharedVaults.createFirst")).not.toBeInTheDocument();
  });

  // ── Vault list ────────────────────────────────────────────────────

  it("renders vault names", () => {
    const vaults = [
      makeVault({ id: "v1", name: "Streaming" }),
      makeVault({ id: "v2", name: "Work Tools" }),
    ];
    render(<SharedVaultBrowser {...baseProps} vaults={vaults} />);
    expect(screen.getByText("Streaming")).toBeInTheDocument();
    expect(screen.getByText("Work Tools")).toBeInTheDocument();
  });

  it("renders member count badges", () => {
    const vaults = [makeVault({ memberCount: 5 })];
    render(<SharedVaultBrowser {...baseProps} vaults={vaults} />);
    expect(screen.getByText("family.sharedVaults.memberCount")).toBeInTheDocument();
  });

  it("renders permission and empty onboarding copy", () => {
    render(<SharedVaultBrowser {...baseProps} vaults={[makeVault({ permission: "manage" })]} />);
    expect(screen.getByText("family.sharedVaults.permissions.manage")).toBeInTheDocument();
  });

  it("calls onVaultSelect with vault id when clicked", () => {
    const vaults = [makeVault({ id: "v-123", name: "My Vault" })];
    render(<SharedVaultBrowser {...baseProps} vaults={vaults} />);
    fireEvent.click(screen.getByText("My Vault"));
    expect(onVaultSelect).toHaveBeenCalledWith("v-123");
  });

  // ── Header create button ──────────────────────────────────────────

  it("shows create button in header for organizer", () => {
    render(<SharedVaultBrowser {...baseProps} vaults={[makeVault()]} />);
    expect(screen.getByText("family.sharedVaults.create")).toBeInTheDocument();
  });

  it("hides create button in header for non-organizer", () => {
    render(<SharedVaultBrowser {...baseProps} vaults={[makeVault()]} isOrganizer={false} />);
    expect(screen.queryByText("family.sharedVaults.create")).not.toBeInTheDocument();
  });

  it("shows title", () => {
    render(<SharedVaultBrowser {...baseProps} vaults={[makeVault()]} />);
    expect(screen.getByText("family.sharedVaults.title")).toBeInTheDocument();
  });
});
