// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Anchor-integrity test — THE load-bearing test of the guided-tour system.
 *
 * For every `target` referenced by GUIDE_TOURS, grep the whole client source
 * tree for a matching `data-tour="<target>"`. Any tour referencing a missing
 * anchor hard-fails the suite: the tours can never lose their anchors.
 */

import { execSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { GUIDE_TOURS } from "../tours";

const CLIENT_SRC = path.resolve(__dirname, "..", "..", "..");

const allTargets = Array.from(
  new Set(GUIDE_TOURS.flatMap((tour) => tour.steps.map((step) => step.target))),
);

const anchorExists = (target: string): boolean => {
  try {
    execSync(
      `grep -rn --include="*.tsx" --include="*.ts" 'data-tour="${target}"' ${CLIENT_SRC}`,
      { stdio: ["ignore", "pipe", "ignore"] },
    );
    return true;
  } catch {
    // grep exits non-zero when no match. `dynamicAnchor` (below) covers the
    // legitimate case where the tour uses a variable-driven anchor.
    return dynamicallyReferenced(target);
  }
};

const DYNAMIC_ANCHORS = new Set<string>([
  "nav-vault",
  "nav-security",
  "nav-people",
  "nav-settings",
]);

const dynamicallyReferenced = (target: string): boolean => {
  if (!DYNAMIC_ANCHORS.has(target)) return false;
  try {
    execSync(
      `grep -rn --include="*.ts" 'tour: "${target}"' ${CLIENT_SRC}`,
      { stdio: ["ignore", "pipe", "ignore"] },
    );
    return true;
  } catch {
    return false;
  }
};

describe("guided-tour anchor integrity", () => {
  it.each(allTargets)("anchor %s exists in the codebase", (target) => {
    expect(anchorExists(target)).toBe(true);
  });
});
