// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * VaultHeader tests — showActions / showQRAction gates, lastSyncedAt
 * label rendering, and the data-tour="vault-add-item" anchor.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { VaultHeader } from "../VaultHeader";

vi.mock("@/components/offline", () => ({
  LastSyncedLabel: ({ dataUpdatedAt }: { dataUpdatedAt: number }) => (
    <div data-testid="last-synced" data-updated-at={dataUpdatedAt} />
  ),
}));

type Props = React.ComponentProps<typeof VaultHeader>;

function makeProps(overrides: Partial<Props> = {}): Props {
  return {
    lastSyncedAt: null,
    showActions: true,
    showQRAction: true,
    onScanQR: vi.fn(),
    onAdd: vi.fn(),
    ...overrides,
  };
}

describe("VaultHeader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the title and description", () => {
    render(<VaultHeader {...makeProps()} />);
    expect(screen.getByText("pages.vault.title")).toBeInTheDocument();
    expect(screen.getByText("pages.vault.description")).toBeInTheDocument();
  });

  it("hides all action buttons when showActions is false", () => {
    render(<VaultHeader {...makeProps({ showActions: false })} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByText("vault.addItem")).toBeNull();
    expect(screen.queryByText("totp.scanQR")).toBeNull();
  });

  it("renders the add button with the vault-add-item tour anchor and wires onAdd", () => {
    const props = makeProps({ showQRAction: false });
    const { container } = render(<VaultHeader {...props} />);
    const addBtn = container.querySelector('[data-tour="vault-add-item"]');
    expect(addBtn).toBeInTheDocument();
    expect(addBtn).toHaveTextContent("vault.addItem");
    fireEvent.click(addBtn as HTMLElement);
    expect(props.onAdd).toHaveBeenCalledTimes(1);
  });

  it("hides the QR button when showQRAction is false", () => {
    render(<VaultHeader {...makeProps({ showQRAction: false })} />);
    expect(screen.queryByText("totp.scanQR")).toBeNull();
    expect(screen.getByText("vault.addItem")).toBeInTheDocument();
  });

  it("shows the QR button when showQRAction is true and wires onScanQR", () => {
    const props = makeProps({ showQRAction: true });
    render(<VaultHeader {...props} />);
    fireEvent.click(screen.getByText("totp.scanQR"));
    expect(props.onScanQR).toHaveBeenCalledTimes(1);
    expect(props.onAdd).not.toHaveBeenCalled();
  });

  it("omits the last-synced label when lastSyncedAt is null", () => {
    render(<VaultHeader {...makeProps({ lastSyncedAt: null })} />);
    expect(screen.queryByTestId("last-synced")).toBeNull();
  });

  it("renders the last-synced label when lastSyncedAt is set", () => {
    render(<VaultHeader {...makeProps({ lastSyncedAt: 1720000000000 })} />);
    expect(screen.getByTestId("last-synced")).toHaveAttribute(
      "data-updated-at",
      "1720000000000",
    );
  });

});
