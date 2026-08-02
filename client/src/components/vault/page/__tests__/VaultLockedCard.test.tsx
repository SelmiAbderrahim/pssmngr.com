// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * VaultLockedCard tests — decryptionFailed message branch, unlock
 * button wiring, and the NoVaultCard export.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { VaultLockedCard, NoVaultCard } from "../VaultLockedCard";

describe("VaultLockedCard", () => {
  it("renders the locked message without the decryption-failed warning", () => {
    render(<VaultLockedCard decryptionFailed={false} onUnlock={() => {}} />);
    expect(screen.getByText("vault.locked")).toBeInTheDocument();
    expect(screen.getByText("vault.lockedDescription")).toBeInTheDocument();
    expect(screen.queryByText("vault.decryptionFailed")).toBeNull();
  });

  it("shows the decryption-failed warning when decryptionFailed is true", () => {
    render(<VaultLockedCard decryptionFailed onUnlock={() => {}} />);
    expect(screen.getByText("vault.decryptionFailed")).toBeInTheDocument();
    expect(screen.getByText("vault.locked")).toBeInTheDocument();
  });

  it("calls onUnlock when the unlock button is clicked", () => {
    const onUnlock = vi.fn();
    render(<VaultLockedCard decryptionFailed={false} onUnlock={onUnlock} />);
    fireEvent.click(screen.getByRole("button", { name: /vault\.unlock/ }));
    expect(onUnlock).toHaveBeenCalledTimes(1);
  });
});

describe("NoVaultCard", () => {
  it("renders the no-vault message with no actions", () => {
    render(<NoVaultCard />);
    expect(screen.getByText("vault.noVault")).toBeInTheDocument();
    expect(screen.getByText("vault.noVaultDescription")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
