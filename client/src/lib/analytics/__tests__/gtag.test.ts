// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { describe, expect, it } from "vitest";
import { analyticsPathname } from "../gtag";

describe("analyticsPathname", () => {
  it.each([
    ["/dashboard/settings/billing?status=success&organization_id=org_1", "/dashboard/settings/billing"],
    ["/invitation?token=secret#accept", "/invitation"],
    ["/features#capacity", "/features"],
    ["?token=secret", "/"],
    ["/", "/"],
  ])("removes non-path URL state from %s", (input, expected) => {
    expect(analyticsPathname(input)).toBe(expected);
  });
});
