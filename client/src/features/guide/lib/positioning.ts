// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Tooltip / spotlight geometry for the guided tour overlay.
 * Logical `start` / `end` placements stay RTL-safe.
 */

import type { TourPlacement } from "../types";

export interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

export type ResolvedPlacement = "top" | "bottom" | "left" | "right";

export const SPOTLIGHT_PADDING = 6;
export const TOOLTIP_GAP = 14;
export const VIEWPORT_MARGIN = 12;

export const computeSpotlightRect = (
  target: Rect,
  padding = SPOTLIGHT_PADDING,
): Rect => ({
  top: target.top - padding,
  left: target.left - padding,
  width: target.width + padding * 2,
  height: target.height + padding * 2,
});

const fits = (
  placement: ResolvedPlacement,
  target: Rect,
  tooltip: Size,
  viewport: Size,
): boolean => {
  switch (placement) {
    case "top":
      return target.top - TOOLTIP_GAP - tooltip.height >= VIEWPORT_MARGIN;
    case "bottom":
      return (
        target.top + target.height + TOOLTIP_GAP + tooltip.height <=
        viewport.height - VIEWPORT_MARGIN
      );
    case "left":
      return target.left - TOOLTIP_GAP - tooltip.width >= VIEWPORT_MARGIN;
    case "right":
      return (
        target.left + target.width + TOOLTIP_GAP + tooltip.width <=
        viewport.width - VIEWPORT_MARGIN
      );
  }
};

const OPPOSITE: Record<ResolvedPlacement, ResolvedPlacement> = {
  top: "bottom",
  bottom: "top",
  left: "right",
  right: "left",
};

/**
 * Map a logical placement to a physical one, then flip to the opposite side
 * when the tooltip would overflow the viewport (falling back to `bottom`
 * when neither side fits — the position is clamped afterwards anyway).
 */
export const resolvePlacement = (
  placement: TourPlacement,
  rtl: boolean,
  target: Rect,
  tooltip: Size,
  viewport: Size,
): ResolvedPlacement => {
  let physical: ResolvedPlacement;
  if (placement === "start") physical = rtl ? "right" : "left";
  else if (placement === "end") physical = rtl ? "left" : "right";
  else if (placement === "auto") physical = "bottom";
  else physical = placement;

  if (fits(physical, target, tooltip, viewport)) return physical;
  if (fits(OPPOSITE[physical], target, tooltip, viewport))
    return OPPOSITE[physical];
  return "bottom";
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), Math.max(min, max));

export const computeTooltipPosition = (
  target: Rect,
  tooltip: Size,
  placement: ResolvedPlacement,
  viewport: Size,
): { top: number; left: number } => {
  const centerX = target.left + target.width / 2;
  const centerY = target.top + target.height / 2;

  let top: number;
  let left: number;
  switch (placement) {
    case "top":
      top = target.top - TOOLTIP_GAP - tooltip.height;
      left = centerX - tooltip.width / 2;
      break;
    case "bottom":
      top = target.top + target.height + TOOLTIP_GAP;
      left = centerX - tooltip.width / 2;
      break;
    case "left":
      top = centerY - tooltip.height / 2;
      left = target.left - TOOLTIP_GAP - tooltip.width;
      break;
    case "right":
      top = centerY - tooltip.height / 2;
      left = target.left + target.width + TOOLTIP_GAP;
      break;
  }

  return {
    top: clamp(top, VIEWPORT_MARGIN, viewport.height - tooltip.height - VIEWPORT_MARGIN),
    left: clamp(left, VIEWPORT_MARGIN, viewport.width - tooltip.width - VIEWPORT_MARGIN),
  };
};

const ARROW_SIZE = 8;
const ARROW_EDGE_INSET = 16;

/**
 * Position of the rotated-square arrow on the tooltip, pointing at the target
 * center, clamped so it never escapes the tooltip's edge.
 */
export const computeArrowPosition = (
  target: Rect,
  tooltipPos: { top: number; left: number },
  tooltip: Size,
  placement: ResolvedPlacement,
): { top: number; left: number } => {
  const centerX = target.left + target.width / 2;
  const centerY = target.top + target.height / 2;

  if (placement === "top" || placement === "bottom") {
    const left = clamp(
      centerX - tooltipPos.left - ARROW_SIZE / 2,
      ARROW_EDGE_INSET,
      tooltip.width - ARROW_EDGE_INSET - ARROW_SIZE,
    );
    const top =
      placement === "top" ? tooltip.height - ARROW_SIZE / 2 : -ARROW_SIZE / 2;
    return { top, left };
  }

  const top = clamp(
    centerY - tooltipPos.top - ARROW_SIZE / 2,
    ARROW_EDGE_INSET,
    tooltip.height - ARROW_EDGE_INSET - ARROW_SIZE,
  );
  const left =
    placement === "left" ? tooltip.width - ARROW_SIZE / 2 : -ARROW_SIZE / 2;
  return { top, left };
};
