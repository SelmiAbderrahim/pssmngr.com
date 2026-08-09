// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * ActiveDialog state-machine test.
 *
 * For each kind, exactly its dialog renders; switching to another kind
 * unmounts the previous one. Verified via mocked children.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { VaultDialogs } from "../VaultDialogs";
import type { ActiveDialog } from "../types";

vi.mock("@/components/vault/CreateItemDialog", () => ({
  CreateItemDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="d-create" /> : null,
}));
vi.mock("@/components/vault/QRScannerDialog", () => ({
  QRScannerDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="d-qr" /> : null,
}));
vi.mock("@/components/vault/TOTPPreviewDialog", () => ({
  TOTPPreviewDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="d-totp" /> : null,
}));
vi.mock("@/components/vault/ShareFlow", () => ({
  ShareFlow: ({ open }: { open: boolean }) =>
    open ? <div data-testid="d-share" /> : null,
}));
vi.mock("@/components/vault/MasterPasswordPrompt", () => ({
  MasterPasswordPrompt: ({ open }: { open: boolean }) =>
    open ? <div data-testid="d-unlock" /> : null,
}));

const vault = {
  id: "v1",
  name: "V",
  kdfSalt: "s",
  encryptedVerificationBlob: null,
};
const decItem = {
  id: "share-me",
  itemType: "login" as const,
  isFavorite: false,
  createdAt: "",
  updatedAt: "",
  decrypted: { title: "Shareable" },
};

function renderWith(dialog: ActiveDialog) {
  return render(
    <VaultDialogs
      dialog={dialog}
      setDialog={() => {}}
      canMutateItems
      vault={vault as never}
      serverItems={[]}
      decryptedItems={[decItem as never]}
      onCreateItem={async () => {}}
      getExistingItems={async () => []}
      onQRResult={() => {}}
      onTOTPConfirm={async () => {}}
      onShareItem={async () => {}}
      onUnlock={() => {}}
      onRecovery={() => {}}
      decryptionFailed={false}
      t={(_k, f) => f}
    />,
  );
}

describe("VaultDialogs (state machine)", () => {
  const cases: Array<[ActiveDialog, string | null]> = [
    [{ kind: "none" }, null],
    [{ kind: "createItem" }, "d-create"],
    [{ kind: "qrScanner" }, "d-qr"],
    [
      {
        kind: "totpPreview",
        uri: {
          type: "totp",
          issuer: "x",
          account: "y",
          secret: "s",
          algorithm: "SHA1",
          digits: 6,
          period: 30,
        },
      } as ActiveDialog,
      "d-totp",
    ],
    [{ kind: "share", itemId: "share-me" }, "d-share"],
    [{ kind: "unlock" }, "d-unlock"],
  ];

  for (const [dialog, expected] of cases) {
    it(`kind=${dialog.kind}: exactly its dialog renders`, () => {
      renderWith(dialog);
      for (const id of ["d-create", "d-qr", "d-totp", "d-share", "d-unlock"]) {
        if (id === expected) {
          expect(screen.getByTestId(id)).toBeInTheDocument();
        } else {
          expect(screen.queryByTestId(id)).toBeNull();
        }
      }
    });
  }

  it("switching kind unmounts the previous dialog", () => {
    const { rerender } = renderWith({ kind: "createItem" });
    expect(screen.getByTestId("d-create")).toBeInTheDocument();
    rerender(
      <VaultDialogs
        dialog={{ kind: "qrScanner" }}
        setDialog={() => {}}
        canMutateItems
        vault={vault as never}
        serverItems={[]}
        decryptedItems={[decItem as never]}
        onCreateItem={async () => {}}
        getExistingItems={async () => []}
        onQRResult={() => {}}
        onTOTPConfirm={async () => {}}
        onShareItem={async () => {}}
        onUnlock={() => {}}
        onRecovery={() => {}}
        decryptionFailed={false}
        t={(_k, f) => f}
      />,
    );
    expect(screen.queryByTestId("d-create")).toBeNull();
    expect(screen.getByTestId("d-qr")).toBeInTheDocument();
  });
});
