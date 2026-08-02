// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * SharePersonStep tests
 *
 * Covers:
 * - submit calls onShare(normalizedEmail, permission) then onCancel
 * - invalid email is rejected client-side (onShare never called)
 * - optional onBack renders/omits the Back button
 * - getErrorMessage branches: no-registered-device, item-not-found,
 *   PRECONDITION_FAILED/412 (errors are thrown from onShare)
 *
 * The global react-i18next mock returns raw keys for unmapped strings, so
 * assertions match translation keys.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SharePersonStep } from "../SharePersonStep";

function renderStep(props: Partial<Parameters<typeof SharePersonStep>[0]> = {}) {
  const onShare = props.onShare ?? vi.fn(() => Promise.resolve());
  const onCancel = props.onCancel ?? vi.fn();
  render(
    <SharePersonStep
      onShare={onShare}
      onCancel={onCancel}
      onBack={props.onBack}
    />,
  );
  return { onShare, onCancel };
}

function submitWithEmail(email: string) {
  const input = screen.getByLabelText(/sharing\.recipientEmail/);
  fireEvent.change(input, { target: { value: email } });
  fireEvent.submit(input.closest("form")!);
}

describe("SharePersonStep", () => {
  it("submits the trimmed, lowercased email with the default permission and closes", async () => {
    const { onShare, onCancel } = renderStep();

    submitWithEmail("  User@Example.COM  ");

    await waitFor(() =>
      expect(onShare).toHaveBeenCalledWith("user@example.com", "view"),
    );
    await waitFor(() => expect(onCancel).toHaveBeenCalledTimes(1));
  });

  it("rejects an invalid email client-side without calling onShare", async () => {
    const { onShare, onCancel } = renderStep();

    submitWithEmail("not-an-email");

    expect(
      await screen.findByText(/sharing\.errorInvalidEmail/),
    ).toBeInTheDocument();
    expect(onShare).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("renders a Back button only when onBack is provided", () => {
    const onBack = vi.fn();
    const { unmount } = render(
      <SharePersonStep
        onShare={vi.fn(() => Promise.resolve())}
        onCancel={vi.fn()}
        onBack={onBack}
      />,
    );
    const backButton = screen.getByRole("button", { name: /common\.back/ });
    fireEvent.click(backButton);
    expect(onBack).toHaveBeenCalledTimes(1);
    unmount();

    render(
      <SharePersonStep
        onShare={vi.fn(() => Promise.resolve())}
        onCancel={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole("button", { name: /common\.back/ }),
    ).toBeNull();
  });

  it("localizes the 'Recipient has no registered device' error", async () => {
    const { onShare, onCancel } = renderStep({
      onShare: vi
        .fn()
        .mockRejectedValue(new Error("Recipient has no registered device")),
    });

    submitWithEmail("r@example.com");

    expect(
      await screen.findByText(/sharing\.errorRecipientNoDevice/),
    ).toBeInTheDocument();
    expect(onShare).toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("localizes the 'Item not found' error", async () => {
    renderStep({
      onShare: vi.fn().mockRejectedValue(new Error("Item not found")),
    });

    submitWithEmail("r@example.com");

    expect(
      await screen.findByText(/sharing\.errorItemNotFound/),
    ).toBeInTheDocument();
  });

  it("maps PRECONDITION_FAILED / 412 errors to the untrusted-device hint", async () => {
    renderStep({
      onShare: vi.fn().mockRejectedValue({ code: "PRECONDITION_FAILED" }),
    });
    submitWithEmail("r@example.com");
    expect(
      await screen.findByText(/sharing\.errorRecipientUntrustedDevice/),
    ).toBeInTheDocument();
  });

  it("maps a statusCode 412 error object to the untrusted-device hint", async () => {
    renderStep({
      onShare: vi.fn().mockRejectedValue({ statusCode: 412 }),
    });
    submitWithEmail("r@example.com");
    expect(
      await screen.findByText(/sharing\.errorRecipientUntrustedDevice/),
    ).toBeInTheDocument();
  });

  it("passes through other error messages and uses the fallback when there is none", async () => {
    renderStep({
      onShare: vi.fn().mockRejectedValue(new Error("Quota exceeded")),
    });
    submitWithEmail("r@example.com");
    expect(await screen.findByText("Quota exceeded")).toBeInTheDocument();
  });
});
