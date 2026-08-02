// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * R4: `enabled === false` renders NOTHING — no launcher, no observers.
 */

import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../GuideProvider", () => ({
  useGuide: () => mockGuideState(),
  selectActiveTour: () => null,
}));

vi.mock("@/providers/AuthProvider", () => ({
  useAuthState: () => mockAuthState(),
}));

// Nested lazy stubs so importing the widget doesn't pull in the real children.
vi.mock("../components/GuideLauncher", () => ({
  GuideLauncher: () => <div data-testid="launcher" />,
}));
vi.mock("../components/GuidePanel", () => ({
  GuidePanel: () => <div data-testid="panel" />,
}));
vi.mock("../components/TourOverlay", () => ({
  TourOverlay: () => <div data-testid="overlay" />,
}));

let mockGuideState: () => any;
let mockAuthState: () => any;

import { GuideWidget } from "../components/GuideWidget";

describe("GuideWidget", () => {
  it("renders nothing when unauthenticated", () => {
    mockAuthState = () => ({ status: "unauthenticated" });
    mockGuideState = () => ({ state: { enabled: true } });
    const { container } = render(<GuideWidget />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when enabled=false (R4)", () => {
    mockAuthState = () => ({ status: "authenticated" });
    mockGuideState = () => ({ state: { enabled: false } });
    const { container } = render(<GuideWidget />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders launcher/panel/overlay when authenticated + enabled", () => {
    mockAuthState = () => ({ status: "authenticated" });
    mockGuideState = () => ({ state: { enabled: true } });
    const { getByTestId } = render(<GuideWidget />);
    expect(getByTestId("launcher")).toBeInTheDocument();
    expect(getByTestId("panel")).toBeInTheDocument();
    expect(getByTestId("overlay")).toBeInTheDocument();
  });
});
