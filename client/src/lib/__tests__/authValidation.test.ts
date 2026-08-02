// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { describe, expect, it } from "vitest";
import type { TFunction } from "i18next";

import { createPasswordSchema } from "../authValidation";

const t = ((key: string) => key) as TFunction;

describe("createPasswordSchema", () => {
  it("accepts the same special characters shown as valid by the strength meter", () => {
    expect(createPasswordSchema(t).safeParse("Strong1-password").success).toBe(
      true,
    );
  });
});
