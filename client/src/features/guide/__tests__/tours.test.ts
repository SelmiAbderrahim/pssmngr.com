// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors

import { describe, expect, it } from "vitest";
import { GUIDE_TOURS, findTour, sortToursForRoute } from "../tours";

describe("GUIDE_TOURS registry", () => {
  it("has exactly six tours", () => {
    expect(GUIDE_TOURS).toHaveLength(6);
  });

  it("tour ids are unique", () => {
    const ids = GUIDE_TOURS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every tour has ≥ 1 step and every step has a target + i18n keys", () => {
    for (const tour of GUIDE_TOURS) {
      expect(tour.steps.length).toBeGreaterThan(0);
      for (const step of tour.steps) {
        expect(step.target).toBeTruthy();
        expect(step.titleKey.startsWith("guide:")).toBe(true);
        expect(step.bodyKey.startsWith("guide:")).toBe(true);
      }
    }
  });

  it("opens settings steps on the tab containing their target", () => {
    expect(
      findTour("security-checkup")?.steps.map((step) => step.route),
    ).toEqual([
      "/dashboard/watchtower",
      "/dashboard/settings?tab=security",
      "/dashboard/settings?tab=security",
    ]);
    expect(
      findTour("protect-your-account")?.steps.map((step) => step.route),
    ).toEqual([
      "/dashboard/settings?tab=data",
      "/dashboard/settings?tab=security",
      "/dashboard/settings?tab=data",
    ]);
  });
});

describe("findTour", () => {
  it("returns null for null id", () => {
    expect(findTour(null)).toBeNull();
  });
  it("returns null for unknown id", () => {
    expect(findTour("does-not-exist")).toBeNull();
  });
  it("finds a real tour", () => {
    expect(findTour("first-run")?.id).toBe("first-run");
  });
});

describe("sortToursForRoute", () => {
  it("puts current-route tours first", () => {
    const sorted = sortToursForRoute("/dashboard/vault", []);
    expect(sorted[0]!.routePrefix).toBe("/dashboard/vault");
  });
  it("sinks completed tours to the bottom", () => {
    const sorted = sortToursForRoute("/dashboard/vault", ["vault-basics"]);
    expect(sorted[sorted.length - 1]!.id).toBe("vault-basics");
  });
  it("does not mutate GUIDE_TOURS", () => {
    const before = GUIDE_TOURS.map((t) => t.id).join(",");
    sortToursForRoute("/dashboard/settings", ["first-run"]);
    expect(GUIDE_TOURS.map((t) => t.id).join(",")).toBe(before);
  });
});
