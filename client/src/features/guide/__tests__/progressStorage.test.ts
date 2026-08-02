// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearResume,
  hasSeenNudge,
  isCompleted,
  loadProgress,
  markCompleted,
  markNudgeSeen,
  saveResume,
} from "../lib/progressStorage";

// The global test setup stubs window.localStorage as a set of vi.fn() with no
// backing store. Restore an in-memory impl here so persistence round-trips.
function installMemoryStorage(): { store: Map<string, string> } {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  } as unknown as Storage);
  return { store };
}

describe("progressStorage", () => {
  beforeEach(() => {
    installMemoryStorage();
  });

  it("returns empty progress when nothing is stored", () => {
    expect(loadProgress()).toEqual({ completed: [], resume: null });
  });

  it("markCompleted appends without duplicates", () => {
    markCompleted("first-run");
    markCompleted("first-run");
    expect(loadProgress().completed).toEqual(["first-run"]);
  });

  it("markCompleted clears matching resume", () => {
    saveResume({ tourId: "first-run", stepIndex: 2 });
    markCompleted("first-run");
    expect(loadProgress().resume).toBeNull();
  });

  it("markCompleted keeps a non-matching resume", () => {
    saveResume({ tourId: "vault-basics", stepIndex: 1 });
    markCompleted("first-run");
    expect(loadProgress().resume?.tourId).toBe("vault-basics");
  });

  it("isCompleted reflects markCompleted", () => {
    expect(isCompleted("sharing")).toBe(false);
    markCompleted("sharing");
    expect(isCompleted("sharing")).toBe(true);
  });

  it("saveResume then clearResume round-trips", () => {
    saveResume({ tourId: "workspaces", stepIndex: 1 });
    expect(loadProgress().resume).toEqual({
      tourId: "workspaces",
      stepIndex: 1,
    });
    clearResume();
    expect(loadProgress().resume).toBeNull();
  });

  it("nudge-seen round-trips", () => {
    expect(hasSeenNudge()).toBe(false);
    markNudgeSeen();
    expect(hasSeenNudge()).toBe(true);
  });

  it("handles corrupted JSON gracefully", () => {
    window.localStorage.setItem("guide:progress", "not json");
    expect(loadProgress()).toEqual({ completed: [], resume: null });
  });

  it("filters non-string completed ids", () => {
    window.localStorage.setItem(
      "guide:progress",
      JSON.stringify({ completed: [1, "ok", null], resume: null }),
    );
    expect(loadProgress().completed).toEqual(["ok"]);
  });

  it("coerces resume stepIndex to a number", () => {
    window.localStorage.setItem(
      "guide:progress",
      JSON.stringify({ completed: [], resume: { tourId: "x", stepIndex: "3" } }),
    );
    expect(loadProgress().resume?.stepIndex).toBe(3);
  });

  it("degrades to session-only on setItem quota-throw", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => {},
      clear: () => {},
    } as unknown as Storage);
    expect(() => markCompleted("first-run")).not.toThrow();
    expect(() => markNudgeSeen()).not.toThrow();
  });

  it("degrades on getItem throw", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
    } as unknown as Storage);
    expect(loadProgress()).toEqual({ completed: [], resume: null });
    expect(hasSeenNudge()).toBe(false);
  });
});
