// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { describe, expect, it } from "vitest";
import {
  areExactDuplicateItems,
  findExactVaultDuplicates,
} from "../vault-duplicates";

const login = (
  data: Record<string, unknown>,
  itemType: "login" | "note" = "login",
) => ({ itemType, data });

describe("vault duplicate matching", () => {
  it("matches exact content regardless of property order and empty optional fields", () => {
    expect(
      areExactDuplicateItems(
        login({ title: "GitHub", username: "octocat", notes: "" }),
        login({ username: "octocat", title: "GitHub" }),
      ),
    ).toBe(true);
  });

  it("keeps non-empty values, case, whitespace, arrays, and item type exact", () => {
    const original = login({
      title: "GitHub",
      password: "Secret ",
      transports: ["internal", "hybrid"],
    });

    expect(
      areExactDuplicateItems(
        original,
        login({ ...original.data, title: "github" }),
      ),
    ).toBe(false);
    expect(
      areExactDuplicateItems(
        original,
        login({ ...original.data, password: "Secret" }),
      ),
    ).toBe(false);
    expect(
      areExactDuplicateItems(
        original,
        login({ ...original.data, transports: ["hybrid", "internal"] }),
      ),
    ).toBe(false);
    expect(areExactDuplicateItems(original, login(original.data, "note"))).toBe(
      false,
    );
  });

  it("returns every matching decrypted vault item", () => {
    const existing = [
      {
        id: "same",
        itemType: "login" as const,
        isFavorite: false,
        createdAt: "",
        updatedAt: "",
        decrypted: { username: "octocat", title: "GitHub" },
      },
      {
        id: "different",
        itemType: "login" as const,
        isFavorite: false,
        createdAt: "",
        updatedAt: "",
        decrypted: { username: "work", title: "GitHub" },
      },
    ];

    expect(
      findExactVaultDuplicates(
        login({ title: "GitHub", username: "octocat" }),
        existing,
      ).map((item) => item.id),
    ).toEqual(["same"]);
  });
});
