// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors

import { describe, expect, it } from "vitest";
import {
  SPOTLIGHT_PADDING,
  TOOLTIP_GAP,
  VIEWPORT_MARGIN,
  computeArrowPosition,
  computeSpotlightRect,
  computeTooltipPosition,
  resolvePlacement,
} from "../lib/positioning";

const target = { top: 200, left: 200, width: 100, height: 40 };
const tooltip = { width: 320, height: 160 };
const viewport = { width: 1024, height: 768 };

describe("computeSpotlightRect", () => {
  it("pads all sides by SPOTLIGHT_PADDING", () => {
    const s = computeSpotlightRect(target);
    expect(s).toEqual({
      top: target.top - SPOTLIGHT_PADDING,
      left: target.left - SPOTLIGHT_PADDING,
      width: target.width + SPOTLIGHT_PADDING * 2,
      height: target.height + SPOTLIGHT_PADDING * 2,
    });
  });

  it("honours a custom padding", () => {
    expect(computeSpotlightRect(target, 10).top).toBe(190);
  });
});

describe("resolvePlacement", () => {
  it("maps 'start' → 'left' in LTR, 'right' in RTL (given room)", () => {
    // Target far enough right that 'left' fits (500 - 14 - 320 = 166 > 12).
    const roomy = { top: 200, left: 500, width: 40, height: 40 };
    expect(resolvePlacement("start", false, roomy, tooltip, viewport)).toBe(
      "left",
    );
    expect(resolvePlacement("start", true, roomy, tooltip, viewport)).toBe(
      "right",
    );
  });

  it("maps 'end' → 'right' in LTR, 'left' in RTL (given room)", () => {
    // Target far enough left that 'right' fits: 500 + 40 + 14 + 320 = 874 < 1012.
    const roomy = { top: 200, left: 500, width: 40, height: 40 };
    expect(resolvePlacement("end", false, roomy, tooltip, viewport)).toBe(
      "right",
    );
    expect(resolvePlacement("end", true, roomy, tooltip, viewport)).toBe(
      "left",
    );
  });

  it("'auto' → 'bottom' when it fits", () => {
    expect(resolvePlacement("auto", false, target, tooltip, viewport)).toBe(
      "bottom",
    );
  });

  it("flips to opposite when preferred doesn't fit", () => {
    // top preferred but the target is only 12px from the top → flip to bottom
    const flushTop = { ...target, top: 4 };
    expect(resolvePlacement("top", false, flushTop, tooltip, viewport)).toBe(
      "bottom",
    );
  });

  it("falls back to 'bottom' when neither side fits", () => {
    const tinyViewport = { width: 100, height: 100 };
    const bigTooltip = { width: 400, height: 400 };
    expect(
      resolvePlacement("top", false, target, bigTooltip, tinyViewport),
    ).toBe("bottom");
  });
});

describe("computeTooltipPosition", () => {
  it("clamps to viewport margins", () => {
    const flushLeft = { top: 300, left: 0, width: 20, height: 20 };
    const pos = computeTooltipPosition(flushLeft, tooltip, "bottom", viewport);
    expect(pos.left).toBeGreaterThanOrEqual(VIEWPORT_MARGIN);
  });

  it("places above the target for 'top'", () => {
    const pos = computeTooltipPosition(target, tooltip, "top", viewport);
    expect(pos.top).toBeLessThan(target.top);
  });

  it("places below the target for 'bottom' respecting TOOLTIP_GAP", () => {
    const pos = computeTooltipPosition(target, tooltip, "bottom", viewport);
    expect(pos.top).toBeGreaterThanOrEqual(
      target.top + target.height + TOOLTIP_GAP,
    );
  });

  it("places right of target for 'right'", () => {
    const pos = computeTooltipPosition(target, tooltip, "right", viewport);
    expect(pos.left).toBeGreaterThan(target.left + target.width);
  });

  it("places left of target for 'left'", () => {
    const pos = computeTooltipPosition(target, tooltip, "left", viewport);
    expect(pos.left).toBeLessThan(target.left);
  });
});

describe("computeArrowPosition", () => {
  it("returns coords for top/bottom placement", () => {
    const tp = computeTooltipPosition(target, tooltip, "bottom", viewport);
    const arrow = computeArrowPosition(target, tp, tooltip, "bottom");
    expect(arrow.top).toBeLessThan(0);
    expect(arrow.left).toBeGreaterThan(0);
  });

  it("returns coords for left/right placement", () => {
    const tp = computeTooltipPosition(target, tooltip, "right", viewport);
    const arrow = computeArrowPosition(target, tp, tooltip, "right");
    expect(arrow.left).toBeLessThan(0);
    expect(arrow.top).toBeGreaterThan(0);
  });

  it("clamps the arrow inside the tooltip edges", () => {
    const farLeft = { top: 200, left: -500, width: 20, height: 20 };
    const tp = computeTooltipPosition(farLeft, tooltip, "bottom", viewport);
    const arrow = computeArrowPosition(farLeft, tp, tooltip, "bottom");
    expect(arrow.left).toBeGreaterThanOrEqual(0);
    expect(arrow.left).toBeLessThanOrEqual(tooltip.width);
  });
});
