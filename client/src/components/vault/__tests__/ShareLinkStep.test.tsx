// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * ShareLinkStep tests
 *
 * Covers:
 * - configure → result step transition with the generated link
 * - SECURITY: the link decryption key appears ONLY in the URL #fragment and
 *   never anywhere in the sharing.createEphemeralLink transport payload
 * - optional passphrase path (passed to crypto, flagged in payload, reminder)
 * - copy button routes through copySensitiveText (30s clipboard wipe)
 * - create failure surfaces the error and stays on the configure step
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ShareLinkStep } from "../ShareLinkStep";
import { encryptForEphemeralShare } from "@pssmngr/crypto";
import { copySensitiveText } from "@/lib/clipboard";

const { mockTrpcMutation } = vi.hoisted(() => ({ mockTrpcMutation: vi.fn() }));

vi.mock("@/lib/api/trpc", () => ({
  trpcQuery: vi.fn(),
  trpcMutation: mockTrpcMutation,
}));

vi.mock("@/lib/clipboard", () => ({
  copySensitiveText: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/lib/config", () => ({
  config: { siteUrl: "https://example.test/" },
}));

// vi.mock also intercepts the component's dynamic import of @pssmngr/crypto.
vi.mock("@pssmngr/crypto", () => ({
  encryptForEphemeralShare: vi.fn(async () => ({
    encryptedBlob: "BLOB",
    nonce: "N",
    authTag: "A",
    linkKey: "SECRETFRAGMENTKEY",
    passphraseSalt: null,
  })),
}));

const ITEM_DATA = '{"password":"hunter2"}';

function renderStep(props: Partial<Parameters<typeof ShareLinkStep>[0]> = {}) {
  const onCancel = props.onCancel ?? vi.fn();
  render(
    <ShareLinkStep
      itemTitle="GitHub"
      itemData={ITEM_DATA}
      onCancel={onCancel}
      onBack={props.onBack}
    />,
  );
  return { onCancel };
}

function submitConfigureForm() {
  const form = screen
    .getByLabelText(/ephemeral\.maxAccesses/)
    .closest("form")!;
  fireEvent.submit(form);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(encryptForEphemeralShare).mockResolvedValue({
    encryptedBlob: "BLOB",
    nonce: "N",
    authTag: "A",
    linkKey: "SECRETFRAGMENTKEY",
    passphraseSalt: null,
  } as never);
  mockTrpcMutation.mockResolvedValue({
    id: "link-1",
    expiresAt: "2026-12-31T00:00:00Z",
  });
});

describe("ShareLinkStep", () => {
  it("transitions configure → result and shows the generated link", async () => {
    renderStep();

    submitConfigureForm();

    const linkInput = (await screen.findByDisplayValue(
      /#SECRETFRAGMENTKEY$/,
    )) as HTMLInputElement;
    const origin = window.location.origin.replace(/\/$/, "");
    expect(linkInput.value).toBe(`${origin}/share/link-1#SECRETFRAGMENTKEY`);
    // configure form is gone
    expect(screen.queryByLabelText(/ephemeral\.maxAccesses/)).toBeNull();
    // no passphrase → no passphrase reminder
    expect(screen.queryByText(/ephemeral\.passphraseReminder/)).toBeNull();
  });

  it("never sends the link key to the transport — it lives only in the URL fragment", async () => {
    renderStep();

    submitConfigureForm();
    await waitFor(() => expect(mockTrpcMutation).toHaveBeenCalledTimes(1));

    const call = mockTrpcMutation.mock.calls[0]!;
    expect(call[0]).toBe("sharing");
    expect(call[1]).toBe("createEphemeralLink");
    // Exact payload: only the encrypted blob + metadata, no key material.
    expect(call[2]).toEqual({
      encryptedBlob: "BLOB",
      nonce: "N",
      authTag: "A",
      hasPassphrase: false,
      passphraseSalt: null,
      expiresIn: "24h",
      maxAccesses: 1,
      ipRestriction: null,
      label: "GitHub",
    });
    // Deep sweep across every argument of every transport call.
    expect(JSON.stringify(mockTrpcMutation.mock.calls)).not.toContain(
      "SECRETFRAGMENTKEY",
    );
    // ...while the generated link carries it in the fragment.
    await screen.findByDisplayValue(/#SECRETFRAGMENTKEY$/);
  });

  it("passes the optional passphrase to the crypto layer and flags the payload", async () => {
    vi.mocked(encryptForEphemeralShare).mockResolvedValue({
      encryptedBlob: "BLOB",
      nonce: "N",
      authTag: "A",
      linkKey: "SECRETFRAGMENTKEY",
      passphraseSalt: "PSALT",
    } as never);
    renderStep();

    fireEvent.change(screen.getByLabelText(/^ephemeral\.passphrase$/), {
      target: { value: "open sesame" },
    });
    submitConfigureForm();

    await waitFor(() => expect(mockTrpcMutation).toHaveBeenCalledTimes(1));
    expect(encryptForEphemeralShare).toHaveBeenCalledWith(
      ITEM_DATA,
      "open sesame",
    );
    expect(mockTrpcMutation.mock.calls[0]![2]).toMatchObject({
      hasPassphrase: true,
      passphraseSalt: "PSALT",
    });
    // The passphrase itself must not travel to the server either.
    expect(JSON.stringify(mockTrpcMutation.mock.calls)).not.toContain(
      "open sesame",
    );
    // Result step shows the share-the-passphrase-separately reminder.
    expect(
      await screen.findByText(/ephemeral\.passphraseReminder/),
    ).toBeInTheDocument();
  });

  it("encrypts without a passphrase when the field is empty", async () => {
    renderStep();
    submitConfigureForm();
    await waitFor(() => expect(mockTrpcMutation).toHaveBeenCalledTimes(1));
    expect(encryptForEphemeralShare).toHaveBeenCalledWith(
      ITEM_DATA,
      undefined,
    );
  });

  it("copies the link via copySensitiveText (clipboard auto-wipe path)", async () => {
    renderStep();
    submitConfigureForm();
    const linkInput = (await screen.findByDisplayValue(
      /#SECRETFRAGMENTKEY$/,
    )) as HTMLInputElement;

    const buttons = screen.getAllByRole("button");
    // The icon-only copy button sits next to the link input.
    const copyButton = buttons.find(
      (b) => b !== screen.getByRole("button", { name: /common\.done/ }),
    )!;
    fireEvent.click(copyButton);

    await waitFor(() =>
      expect(copySensitiveText).toHaveBeenCalledWith(linkInput.value),
    );
  });

  it("shows the error and stays on configure when link creation fails", async () => {
    mockTrpcMutation.mockRejectedValue(new Error("server exploded"));
    renderStep();

    submitConfigureForm();

    expect(await screen.findByText("server exploded")).toBeInTheDocument();
    // Still on the configure step.
    expect(screen.getByLabelText(/ephemeral\.maxAccesses/)).toBeInTheDocument();
    expect(screen.queryByDisplayValue(/#SECRETFRAGMENTKEY$/)).toBeNull();
  });

  it("renders a Back button only when onBack is provided", () => {
    const onBack = vi.fn();
    const { unmount } = render(
      <ShareLinkStep
        itemTitle="GitHub"
        itemData={ITEM_DATA}
        onCancel={vi.fn()}
        onBack={onBack}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /common\.back/ }));
    expect(onBack).toHaveBeenCalledTimes(1);
    unmount();

    render(
      <ShareLinkStep itemTitle="GitHub" itemData={ITEM_DATA} onCancel={vi.fn()} />,
    );
    expect(screen.queryByRole("button", { name: /common\.back/ })).toBeNull();
  });
});
