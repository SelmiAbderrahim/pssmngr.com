// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { describe, it, expect } from "vitest";
import { authClient } from "../auth-client";

describe("auth-client passkey plugin", () => {
  it("exposes signIn.passkey as a function", () => {
    expect(typeof authClient.signIn.passkey).toBe("function");
  });

  it("exposes passkey.addPasskey as a function", () => {
    expect(typeof authClient.passkey.addPasskey).toBe("function");
  });

  it("exposes passkey.listPasskeys as a function", () => {
    expect(typeof authClient.passkey.listPasskeys).toBe("function");
  });

  it("exposes passkey.deletePasskey as a function", () => {
    expect(typeof authClient.passkey.deletePasskey).toBe("function");
  });
});
