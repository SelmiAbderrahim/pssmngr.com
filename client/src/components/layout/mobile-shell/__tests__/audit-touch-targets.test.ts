// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import path from "node:path";
import { describe, expect, it } from "vitest";

import { auditTouchTargets } from "../../../../../scripts/audit-touch-targets";

describe("audit-touch-targets", () => {
  it("has an empty golden output", () => {
    const root = path.resolve(process.cwd(), "src/components/layout/mobile-shell");
    expect(auditTouchTargets(root)).toEqual([]);
  });
});

