// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("WebSessionStore", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("getSessionToken always returns null (cookie path unchanged)", async () => {
    const { WebSessionStore } = await import("../sessionStore");
    const store = new WebSessionStore();
    expect(await store.getSessionToken()).toBeNull();
  });

  it("setSessionToken is a no-op on the cookie", async () => {
    const { WebSessionStore } = await import("../sessionStore");
    const store = new WebSessionStore();
    await store.setSessionToken("not-a-real-token");
    expect(await store.getSessionToken()).toBeNull();
  });

  it("clear() leaves no JavaScript-readable session", async () => {
    const { WebSessionStore } = await import("../sessionStore");
    const store = new WebSessionStore();
    await store.clear();
    expect(await store.getSessionToken()).toBeNull();
  });
});
