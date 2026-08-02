// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Reducer tests — ports the RTK slice.test.ts + selectors.test.ts to the
 * useReducer shape. Same state contract, same rules.
 */

import { describe, expect, it } from "vitest";
import {
  guideReducer,
  selectActiveStepTarget,
  selectActiveTour,
} from "../GuideProvider";
import type { GuideState } from "../types";

const initial: GuideState = {
  enabled: true,
  saving: false,
  error: null,
  panelOpen: false,
  activeTourId: null,
  stepIndex: 0,
};

describe("guideReducer", () => {
  it("openPanel opens the panel and clears error", () => {
    const next = guideReducer(
      { ...initial, error: "x" },
      { type: "openPanel" },
    );
    expect(next.panelOpen).toBe(true);
    expect(next.error).toBeNull();
  });

  it("closePanel closes the panel", () => {
    const next = guideReducer(
      { ...initial, panelOpen: true },
      { type: "closePanel" },
    );
    expect(next.panelOpen).toBe(false);
  });

  it("startTour sets tour + step, closes panel", () => {
    const next = guideReducer(
      { ...initial, panelOpen: true },
      { type: "startTour", tourId: "first-run" },
    );
    expect(next).toMatchObject({
      panelOpen: false,
      activeTourId: "first-run",
      stepIndex: 0,
    });
  });

  it("startTour honours explicit stepIndex (resume)", () => {
    const next = guideReducer(initial, {
      type: "startTour",
      tourId: "first-run",
      stepIndex: 2,
    });
    expect(next.stepIndex).toBe(2);
  });

  it("nextStep advances by one", () => {
    const next = guideReducer(
      { ...initial, stepIndex: 1 },
      { type: "nextStep" },
    );
    expect(next.stepIndex).toBe(2);
  });

  it("prevStep decrements but never below zero", () => {
    expect(
      guideReducer({ ...initial, stepIndex: 3 }, { type: "prevStep" }).stepIndex,
    ).toBe(2);
    expect(
      guideReducer({ ...initial, stepIndex: 0 }, { type: "prevStep" }).stepIndex,
    ).toBe(0);
  });

  it("endTour clears active tour and resets step", () => {
    const next = guideReducer(
      { ...initial, activeTourId: "vault-basics", stepIndex: 3 },
      { type: "endTour" },
    );
    expect(next.activeTourId).toBeNull();
    expect(next.stepIndex).toBe(0);
  });

  it("hydrateEnabled sets enabled from server", () => {
    expect(
      guideReducer(initial, { type: "hydrateEnabled", value: false }).enabled,
    ).toBe(false);
  });

  it("setEnabled.pending optimistically enables and clears error", () => {
    const next = guideReducer(
      { ...initial, error: "bad" },
      { type: "setEnabled.pending", value: true },
    );
    expect(next).toMatchObject({ enabled: true, saving: true, error: null });
  });

  it("setEnabled.pending with value=false tears down any active tour", () => {
    const next = guideReducer(
      {
        ...initial,
        panelOpen: true,
        activeTourId: "first-run",
        stepIndex: 2,
      },
      { type: "setEnabled.pending", value: false },
    );
    expect(next).toMatchObject({
      enabled: false,
      panelOpen: false,
      activeTourId: null,
      stepIndex: 0,
    });
  });

  it("setEnabled.fulfilled clears saving and sets enabled", () => {
    const next = guideReducer(
      { ...initial, saving: true, enabled: false },
      { type: "setEnabled.fulfilled", value: true },
    );
    expect(next).toMatchObject({ saving: false, enabled: true });
  });

  it("setEnabled.rejected rolls back and stores error", () => {
    const next = guideReducer(
      { ...initial, saving: true, enabled: false },
      { type: "setEnabled.rejected", prev: true, error: "boom" },
    );
    expect(next).toMatchObject({
      saving: false,
      enabled: true,
      error: "boom",
    });
  });
});

describe("guide selectors", () => {
  it("selectActiveTour returns null when no tour is active", () => {
    expect(selectActiveTour(initial)).toBeNull();
  });

  it("selectActiveTour finds the tour", () => {
    const s = { ...initial, activeTourId: "first-run" };
    expect(selectActiveTour(s)?.id).toBe("first-run");
  });

  it("selectActiveStepTarget returns null with no tour", () => {
    expect(selectActiveStepTarget(initial)).toBeNull();
  });

  it("selectActiveStepTarget returns the step target", () => {
    const s = { ...initial, activeTourId: "first-run", stepIndex: 1 };
    expect(selectActiveStepTarget(s)).toBe("vault-search");
  });

  it("selectActiveStepTarget clamps stepIndex to the tour length", () => {
    const s = { ...initial, activeTourId: "vault-basics", stepIndex: 99 };
    // vault-basics is 3 steps → last target is 'vault-share'
    expect(selectActiveStepTarget(s)).toBe("vault-share");
  });
});
