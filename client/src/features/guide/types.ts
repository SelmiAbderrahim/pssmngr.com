// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Guided-tour type definitions.
 */

export type TourPlacement = "top" | "bottom" | "start" | "end" | "auto";

export type AdvanceTrigger = "click" | "input";

export interface TourStep {
  /** Route the step lives on (pathname + search). Omit to stay on the current page. */
  route?: string;
  /** Value of the `data-tour` attribute on the highlighted element. */
  target: string;
  titleKey: string;
  bodyKey: string;
  placement: TourPlacement;
  /** Auto-advance when the user performs this action on the target. */
  advanceOn?: AdvanceTrigger;
}

export interface TourDefinition {
  id: string;
  titleKey: string;
  descriptionKey: string;
  /** Pathname prefix used to surface tours relevant to the current page. */
  routePrefix: string;
  steps: TourStep[];
}

export type TargetStatus = "searching" | "found" | "missing";

export interface GuideState {
  enabled: boolean;
  saving: boolean;
  error: string | null;
  panelOpen: boolean;
  activeTourId: string | null;
  stepIndex: number;
}

export interface LauncherPosition {
  /** Pixels from the top of the viewport. */
  y: number;
  /** Logical inline side — `end` renders on the right in LTR, left in RTL. */
  side: "start" | "end";
}

export interface TourResume {
  tourId: string;
  stepIndex: number;
}

export interface TourProgress {
  completed: string[];
  resume: TourResume | null;
}
