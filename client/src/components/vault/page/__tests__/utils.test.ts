// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors

import { describe, it, expect } from "vitest";
import {
  isCreateType,
  orgVaultErrorMessage,
  SHARED_PERMISSION_LEVEL,
  sharedVaultPermissionForOrgRole,
} from "../utils";

describe("isCreateType", () => {
  it("accepts the four supported item types", () => {
    for (const v of ["login", "note", "card", "identity"]) {
      expect(isCreateType(v)).toBe(true);
    }
  });
  it("rejects everything else", () => {
    for (const v of ["totp", "passkey", "file", "", null, undefined, 42]) {
      expect(isCreateType(v)).toBe(false);
    }
  });
});

describe("orgVaultErrorMessage", () => {
  const t = (k: string, f: string) => f;

  it("returns the untrusted-device hint on PRECONDITION_FAILED", () => {
    const msg = orgVaultErrorMessage(
      { code: "PRECONDITION_FAILED" },
      t,
      "fallback",
    );
    expect(msg).toContain("trust one of their devices");
  });

  it("returns the untrusted-device hint on 412", () => {
    const msg = orgVaultErrorMessage({ statusCode: 412 }, t, "fallback");
    expect(msg).toContain("trust one of their devices");
  });

  it("returns the Error message when present", () => {
    expect(orgVaultErrorMessage(new Error("boom"), t, "fallback")).toBe("boom");
  });

  it("returns the fallback when nothing else fits", () => {
    expect(orgVaultErrorMessage({}, t, "fallback")).toBe("fallback");
  });
});

describe("SHARED_PERMISSION_LEVEL", () => {
  it("orders permissions view < edit < share < manage", () => {
    expect(SHARED_PERMISSION_LEVEL.view).toBeLessThan(
      SHARED_PERMISSION_LEVEL.edit,
    );
    expect(SHARED_PERMISSION_LEVEL.edit).toBeLessThan(
      SHARED_PERMISSION_LEVEL.share,
    );
    expect(SHARED_PERMISSION_LEVEL.share).toBeLessThan(
      SHARED_PERMISSION_LEVEL.manage,
    );
  });
});

describe("sharedVaultPermissionForOrgRole (client mirror)", () => {
  it("maps member → view (read-only)", () => {
    expect(sharedVaultPermissionForOrgRole("member")).toBe("view");
  });
  it("maps admin and owner → manage (read/write + can grant)", () => {
    expect(sharedVaultPermissionForOrgRole("admin")).toBe("manage");
    expect(sharedVaultPermissionForOrgRole("owner")).toBe("manage");
  });
  it("treats any non-member role as manage (never accidental read-only)", () => {
    expect(sharedVaultPermissionForOrgRole("something-else")).toBe("manage");
  });
});
