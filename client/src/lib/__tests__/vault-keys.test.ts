// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { describe, it, expect, beforeEach } from "vitest";
import {
  setVaultKey,
  getVaultKey,
  clearVaultKey,
  hasVaultKey,
} from "../vault-keys";

describe("vault-keys", () => {
  beforeEach(() => {
    clearVaultKey();
  });

  // ── Initial State ──────────────────────────────────────────────

  it("starts with no key", () => {
    expect(getVaultKey()).toBeNull();
    expect(hasVaultKey()).toBe(false);
  });

  // ── setVaultKey / getVaultKey ─────────────────────────────────

  it("stores and retrieves a key", () => {
    const key = new Uint8Array([1, 2, 3, 4, 5]);
    setVaultKey(key);

    const retrieved = getVaultKey();
    expect(retrieved).toEqual(key);
    expect(hasVaultKey()).toBe(true);
  });

  it("replaces an existing key", () => {
    const key1 = new Uint8Array([1, 2, 3]);
    const key2 = new Uint8Array([4, 5, 6]);

    setVaultKey(key1);
    setVaultKey(key2);

    expect(getVaultKey()).toEqual(key2);
  });

  it("zeros previous key when replacing", () => {
    const key1 = new Uint8Array([10, 20, 30]);
    setVaultKey(key1);

    const key2 = new Uint8Array([40, 50, 60]);
    setVaultKey(key2);

    // key1 should be zeroed
    expect(key1[0]).toBe(0);
    expect(key1[1]).toBe(0);
    expect(key1[2]).toBe(0);
  });

  // ── clearVaultKey ─────────────────────────────────────────────

  it("clears the stored key", () => {
    setVaultKey(new Uint8Array([1, 2, 3]));
    clearVaultKey();

    expect(getVaultKey()).toBeNull();
    expect(hasVaultKey()).toBe(false);
  });

  it("zeros the key bytes on clear", () => {
    const key = new Uint8Array([99, 88, 77, 66]);
    setVaultKey(key);
    clearVaultKey();

    // Original array should be zeroed
    expect(key[0]).toBe(0);
    expect(key[1]).toBe(0);
    expect(key[2]).toBe(0);
    expect(key[3]).toBe(0);
  });

  it("clearVaultKey is safe to call when already empty", () => {
    expect(() => clearVaultKey()).not.toThrow();
    expect(getVaultKey()).toBeNull();
  });

  it("clearVaultKey is idempotent", () => {
    setVaultKey(new Uint8Array([1]));
    clearVaultKey();
    clearVaultKey();
    clearVaultKey();

    expect(getVaultKey()).toBeNull();
    expect(hasVaultKey()).toBe(false);
  });

  // ── hasVaultKey ───────────────────────────────────────────────

  it("returns false before any key is set", () => {
    expect(hasVaultKey()).toBe(false);
  });

  it("returns true after key is set", () => {
    setVaultKey(new Uint8Array(32));
    expect(hasVaultKey()).toBe(true);
  });

  it("returns false after key is cleared", () => {
    setVaultKey(new Uint8Array(32));
    clearVaultKey();
    expect(hasVaultKey()).toBe(false);
  });

  // ── Defensive Copy (prevents in-place zeroing race) ───────────

  it("getVaultKey returns a copy, not the original reference", () => {
    const key = new Uint8Array([1, 2, 3, 4, 5]);
    setVaultKey(key);

    const retrieved = getVaultKey();
    expect(retrieved).not.toBe(key); // different reference
    expect(retrieved).toEqual(key); // same content
  });

  it("mutating returned key does not affect stored key", () => {
    setVaultKey(new Uint8Array([10, 20, 30]));

    const copy = getVaultKey()!;
    copy[0] = 255;
    copy[1] = 255;
    copy[2] = 255;

    const fresh = getVaultKey()!;
    expect(fresh[0]).toBe(10);
    expect(fresh[1]).toBe(20);
    expect(fresh[2]).toBe(30);
  });

  it("clearVaultKey does not affect previously returned copies", () => {
    setVaultKey(new Uint8Array([42, 43, 44]));

    const copy = getVaultKey()!;
    expect(copy[0]).toBe(42);

    clearVaultKey();

    // copy should still hold original data
    expect(copy[0]).toBe(42);
    expect(copy[1]).toBe(43);
    expect(copy[2]).toBe(44);
  });

  it("concurrent getVaultKey calls return independent copies", () => {
    setVaultKey(new Uint8Array([1, 2, 3]));

    const copy1 = getVaultKey()!;
    const copy2 = getVaultKey()!;

    expect(copy1).not.toBe(copy2); // different references
    expect(copy1).toEqual(copy2); // same content

    // Mutating one does not affect the other
    copy1[0] = 255;
    expect(copy2[0]).toBe(1);
  });
});
