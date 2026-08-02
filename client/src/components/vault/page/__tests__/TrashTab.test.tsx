// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * TrashTab tests — pass-through render of TrashView with vaultId and
 * onRestoreItem forwarded.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TrashTab } from "../TrashTab";

vi.mock("@/components/vault/TrashView", () => ({
  TrashView: ({
    vaultId,
    onRestoreItem,
  }: {
    vaultId: string;
    onRestoreItem: () => void;
  }) => (
    <button
      data-testid="trash-view"
      data-vault-id={vaultId}
      onClick={() => onRestoreItem()}
    />
  ),
}));

describe("TrashTab", () => {
  it("renders TrashView with the vaultId forwarded", () => {
    render(<TrashTab vaultId="vault-42" onRestoreItem={() => {}} />);
    expect(screen.getByTestId("trash-view")).toHaveAttribute(
      "data-vault-id",
      "vault-42",
    );
  });

  it("forwards onRestoreItem", () => {
    const onRestoreItem = vi.fn();
    render(<TrashTab vaultId="vault-42" onRestoreItem={onRestoreItem} />);
    fireEvent.click(screen.getByTestId("trash-view"));
    expect(onRestoreItem).toHaveBeenCalledTimes(1);
  });
});
