// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * SharingTab tests — pass-through render of SharingCenter with the
 * onShareAccepted callback forwarded.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SharingTab } from "../SharingTab";

vi.mock("@/components/vault/SharingCenter", () => ({
  SharingCenter: ({ onShareAccepted }: { onShareAccepted?: () => void }) => (
    <button
      data-testid="sharing-center"
      data-has-callback={onShareAccepted ? "yes" : "no"}
      onClick={() => onShareAccepted?.()}
    />
  ),
}));

describe("SharingTab", () => {
  it("renders SharingCenter and forwards onShareAccepted", () => {
    const onShareAccepted = vi.fn();
    render(<SharingTab onShareAccepted={onShareAccepted} />);
    const center = screen.getByTestId("sharing-center");
    expect(center).toHaveAttribute("data-has-callback", "yes");
    fireEvent.click(center);
    expect(onShareAccepted).toHaveBeenCalledTimes(1);
  });

  it("renders without a callback (optional prop)", () => {
    render(<SharingTab />);
    const center = screen.getByTestId("sharing-center");
    expect(center).toHaveAttribute("data-has-callback", "no");
    // Clicking must not throw when the callback is absent
    fireEvent.click(center);
  });
});
