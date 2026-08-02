// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors

export { GuideProvider, useGuide, guideReducer } from "./GuideProvider";
export { GuideWidget } from "./components/GuideWidget";
export { GuideMeToggle } from "./components/GuideMeToggle";
export { GUIDE_TOURS, findTour, sortToursForRoute } from "./tours";
export type {
  TourDefinition,
  TourStep,
  TourPlacement,
  GuideState,
} from "./types";
