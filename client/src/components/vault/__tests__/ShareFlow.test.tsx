// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * ShareFlow tests
 *
 * Covers:
 * - Mode picker renders both options
 * - Selecting "person" mounts SharePersonStep; onShare(email, permission)
 *   flows through with a plausible email + selected permission
 * - Selecting "link" mounts ShareLinkStep; the generated link contains
 *   the decryption key in the URL fragment, and no mocked transport
 *   call carries the key
 * - Back returns to picker
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ShareFlow } from "../ShareFlow";

const { mockTrpcMutation } = vi.hoisted(() => ({ mockTrpcMutation: vi.fn() }));

vi.mock("@/lib/api/trpc", () => ({
  trpcQuery: vi.fn(),
  trpcMutation: mockTrpcMutation,
}));

vi.mock("@/lib/clipboard", () => ({
  copySensitiveText: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/lib/config", () => ({
  config: { siteUrl: "https://example.test" },
}));

vi.mock("@pssmngr/crypto", () => ({
  encryptForEphemeralShare: vi.fn(async () => ({
    encryptedBlob: "BLOB",
    nonce: "N",
    authTag: "A",
    linkKey: "SECRETFRAGMENTKEY",
    passphraseSalt: null,
  })),
}));

describe("ShareFlow", () => {
  beforeEach(() => {
    mockTrpcMutation.mockReset();
  });

  it("shows both mode options in the picker", () => {
    render(
      <ShareFlow
        open
        onOpenChange={() => {}}
        itemId="i-1"
        itemTitle="GitHub"
        itemData=""
        onShare={async () => {}}
      />,
    );
    expect(screen.getByTestId("share-mode-person")).toBeInTheDocument();
    expect(screen.getByTestId("share-mode-link")).toBeInTheDocument();
  });

  it("person mode calls onShare with email + permission", async () => {
    const onShare = vi.fn(() => Promise.resolve());
    render(
      <ShareFlow
        open
        onOpenChange={() => {}}
        itemId="i-1"
        itemTitle="GitHub"
        itemData=""
        onShare={onShare}
      />,
    );
    fireEvent.click(screen.getByTestId("share-mode-person"));
    const email = screen.getByLabelText(/sharing.recipientEmail|Recipient email/i);
    fireEvent.change(email, { target: { value: "recipient@example.com" } });
    // Submit form via native submit event on the form itself.
    const form = email.closest("form")!;
    fireEvent.submit(form);
    await waitFor(() =>
      expect(onShare).toHaveBeenCalledWith("recipient@example.com", "view"),
    );
  });

  it("link mode: key stays in URL fragment, never in the transport call", async () => {
    render(
      <ShareFlow
        open
        onOpenChange={() => {}}
        itemId="i-1"
        itemTitle="GitHub"
        itemData='{"password":"p"}'
        onShare={async () => {}}
      />,
    );
    mockTrpcMutation.mockResolvedValueOnce({
      id: "share-id",
      expiresAt: "2026-12-31",
    });
    fireEvent.click(screen.getByTestId("share-mode-link"));
    // The submit button reads t("ephemeral.createLink"); test mock returns the KEY.
    const form = screen.getByLabelText(/ephemeral.expiry|Link expires after/i).closest("form")!;
    fireEvent.submit(form);

    await waitFor(() => expect(mockTrpcMutation).toHaveBeenCalled());
    const call = mockTrpcMutation.mock.calls[0];
    // Router + procedure
    expect(call[0]).toBe("sharing");
    expect(call[1]).toBe("createEphemeralLink");
    // Payload must NOT include the raw decryption key
    const payloadStr = JSON.stringify(call[2]);
    expect(payloadStr).not.toContain("SECRETFRAGMENTKEY");

    // Generated link should include the key in the URL fragment
    const linkInput = (await screen.findByDisplayValue(/#SECRETFRAGMENTKEY$/)) as HTMLInputElement;
    expect(linkInput.value).toContain("/share/share-id#SECRETFRAGMENTKEY");
  });

  it("back button returns to picker from person step", () => {
    render(
      <ShareFlow
        open
        onOpenChange={() => {}}
        itemId="i-1"
        itemTitle="GitHub"
        itemData=""
        onShare={async () => {}}
      />,
    );
    fireEvent.click(screen.getByTestId("share-mode-person"));
    expect(screen.queryByTestId("share-mode-person")).toBeNull();
    // Button reads common.back — test mock returns the key.
    fireEvent.click(screen.getByRole("button", { name: /common\.back|^Back$/ }));
    expect(screen.getByTestId("share-mode-person")).toBeInTheDocument();
  });
});
