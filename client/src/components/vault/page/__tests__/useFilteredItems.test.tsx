// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Behavior-parity fixtures for the list-composition logic that used to
 * live inline in vault.tsx. Every case preserves the original semantics.
 */

import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useFilteredItems } from "../useFilteredItems";
import type { DecryptedVaultItem } from "@/components/vault/VaultItemCard";

function item(
  id: string,
  overrides: Partial<DecryptedVaultItem> & {
    decrypted?: Record<string, unknown>;
  } = {},
): DecryptedVaultItem {
  const nowIdx = Number(id.replace(/[^0-9]/g, "")) || 0;
  return {
    id,
    itemType: "login",
    isFavorite: false,
    createdAt: new Date(2026, 0, 1 + nowIdx).toISOString(),
    updatedAt: new Date(2026, 0, 10 + nowIdx).toISOString(),
    decrypted: { title: id, ...(overrides.decrypted ?? {}) },
    ...overrides,
  } as DecryptedVaultItem;
}

const fixture: DecryptedVaultItem[] = [
  item("login-1", { decrypted: { title: "GitHub", username: "alice" } }),
  item("login-2", { decrypted: { title: "GitLab", username: "bob" }, isFavorite: true }),
  item("card-1", { itemType: "card", decrypted: { title: "Visa 1234", name: "Visa" } }),
  item("card-2", { itemType: "card", decrypted: { title: "MC 9876" } }),
  item("note-1", { itemType: "note", decrypted: { title: "Meeting", content: "notes" } }),
  item("note-2", { itemType: "note", decrypted: { title: "Recipe", notes: "cake" } }),
  item("id-1", { itemType: "identity", decrypted: { title: "Passport", fullName: "Alice Smith" } }),
  item("id-2", { itemType: "identity", decrypted: { title: "Driver's License" } }),
  item("totp-1", { itemType: "totp", decrypted: { title: "GitHub 2FA", issuer: "GitHub" } }),
  item("passkey-1", { itemType: "passkey", decrypted: { title: "Yubikey" } }),
  item("file-1", { itemType: "file", decrypted: { title: "resume.pdf" } }),
  item("trashed-1", { decrypted: { title: "Old Login" }, isFavorite: false }),
];

describe("useFilteredItems (parity fixtures)", () => {
  it("returns everything, favorites first, sorted by modified desc by default", () => {
    const { result } = renderHook(() =>
      useFilteredItems({
        decryptedItems: fixture,
        filter: "all",
        sort: "modified",
        q: "",
        searchIndexReady: false,
        searchIndex: () => [],
      }),
    );
    expect(result.current[0]?.isFavorite).toBe(true);
    // Every non-favorite that follows must have updatedAt <= the previous one
    for (let i = 2; i < result.current.length; i++) {
      const prev = new Date(result.current[i - 1]!.updatedAt).getTime();
      const curr = new Date(result.current[i]!.updatedAt).getTime();
      expect(curr).toBeLessThanOrEqual(prev);
    }
    expect(result.current).toHaveLength(fixture.length);
  });

  it("filters by type", () => {
    const { result } = renderHook(() =>
      useFilteredItems({
        decryptedItems: fixture,
        filter: "card",
        sort: "name",
        q: "",
        searchIndexReady: false,
        searchIndex: () => [],
      }),
    );
    expect(result.current.map((i) => i.id).sort()).toEqual(["card-1", "card-2"]);
  });

  it("naive search filters across title/username/name/content/notes/fullName", () => {
    for (const [q, expected] of [
      ["github", ["login-1", "totp-1"]],
      ["alice", ["login-1", "id-1"]],
      ["cake", ["note-2"]],
    ] as const) {
      const { result } = renderHook(() =>
        useFilteredItems({
          decryptedItems: fixture,
          filter: "all",
          sort: "name",
          q,
          searchIndexReady: false,
          searchIndex: () => [],
        }),
      );
      expect(result.current.map((i) => i.id).sort()).toEqual([...expected].sort());
    }
  });

  it("uses the search index when ready", () => {
    const { result } = renderHook(() =>
      useFilteredItems({
        decryptedItems: fixture,
        filter: "all",
        sort: "name",
        q: "anything",
        searchIndexReady: true,
        searchIndex: () => ["card-1", "note-1"],
      }),
    );
    expect(result.current.map((i) => i.id).sort()).toEqual(["card-1", "note-1"]);
  });

  it("sort=name uses localeCompare on title/name", () => {
    const { result } = renderHook(() =>
      useFilteredItems({
        decryptedItems: fixture.filter((i) => i.itemType === "card"),
        filter: "all",
        sort: "name",
        q: "",
        searchIndexReady: false,
        searchIndex: () => [],
      }),
    );
    expect(result.current[0]?.id).toBe("card-2"); // "MC 9876" < "Visa 1234"
  });

  it("sort=created descends by createdAt", () => {
    const { result } = renderHook(() =>
      useFilteredItems({
        decryptedItems: [item("a", { createdAt: "2026-01-01" }), item("b", { createdAt: "2026-06-01" })],
        filter: "all",
        sort: "created",
        q: "",
        searchIndexReady: false,
        searchIndex: () => [],
      }),
    );
    expect(result.current[0]?.id).toBe("b");
  });
});
