// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const setEnabled = vi.fn();
let mockState = {
  enabled: true,
  saving: false,
  error: null as string | null,
  panelOpen: false,
  activeTourId: null,
  stepIndex: 0,
};

vi.mock("../GuideProvider", () => ({
  useGuide: () => ({ state: mockState, dispatch: vi.fn(), setEnabled }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

import { GuideMeToggle } from "../components/GuideMeToggle";

describe("GuideMeToggle", () => {
  it("shows the label and description", () => {
    mockState = { ...mockState, enabled: true, saving: false, error: null };
    render(<GuideMeToggle />);
    expect(screen.getByText("toggle.label")).toBeInTheDocument();
    expect(screen.getByText("toggle.description")).toBeInTheDocument();
  });

  it("reflects state.enabled on the switch", () => {
    mockState = { ...mockState, enabled: false };
    render(<GuideMeToggle />);
    expect(screen.getByRole("switch")).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("dispatches setEnabled on toggle", () => {
    setEnabled.mockReset();
    mockState = { ...mockState, enabled: false, saving: false };
    render(<GuideMeToggle />);
    fireEvent.click(screen.getByRole("switch"));
    expect(setEnabled).toHaveBeenCalledWith(true);
  });

  it("shows an error message when state.error is set", () => {
    mockState = { ...mockState, error: "boom" };
    render(<GuideMeToggle />);
    expect(screen.getByRole("alert")).toHaveTextContent("boom");
  });

  it("disables the switch while saving", () => {
    mockState = { ...mockState, saving: true };
    render(<GuideMeToggle />);
    expect(screen.getByRole("switch")).toBeDisabled();
  });
});
